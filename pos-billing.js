// --- DIGITAL RECEIPT ANIMATION ---
function showDigitalReceipt(sourceAreaId) {
    if(sourceAreaId === 'customerReceiptArea') currentPrintType = 'print-receipt';
    else if(sourceAreaId === 'zReadingArea') currentPrintType = 'print-zread';
    else if(sourceAreaId === 'xReadingArea') currentPrintType = 'print-xread';
    else currentPrintType = 'print-ticket';
    
    const sourceContent = document.getElementById(sourceAreaId).innerHTML;
    const paper = document.getElementById("animatedReceiptPaper");
    const actions = document.getElementById("animatedReceiptActions");
    const modal = document.getElementById("digitalReceiptModal");

    paper.classList.remove("animate-slide-out", "animate-tear-off");
    paper.innerHTML = sourceContent;
    actions.style.opacity = "0";
    modal.classList.remove("hidden");

    setTimeout(() => { paper.classList.add("animate-slide-out"); }, 50);
    setTimeout(() => { actions.style.opacity = "1"; }, 1500);
}

function triggerPhysicalPrint() {
    document.body.classList.add(currentPrintType); 
    window.print(); 
    document.body.classList.remove(currentPrintType);
}

function tearReceipt() {
    const paper = document.getElementById("animatedReceiptPaper");
    const actions = document.getElementById("animatedReceiptActions");
    actions.style.opacity = "0";
    paper.classList.remove("animate-slide-out");
    paper.classList.add("animate-tear-off");
    
    setTimeout(() => { 
        document.getElementById("digitalReceiptModal").classList.add("hidden"); 
        
        // FIX: Clear the copied HTML so duplicate IDs don't hijack the next bill!
        paper.innerHTML = ""; 
        
    }, 800); 
}

// --- CART LOGIC ---
function addToCart(itemName, price) {
    if (cart[itemName]) cart[itemName].qty += 1; else cart[itemName] = { qty: 1, price: price }; renderCart();
}
function updateCartQty(itemName, change) {
    if (cart[itemName]) { cart[itemName].qty += change; if (cart[itemName].qty <= 0) delete cart[itemName]; renderCart(); }
}
function clearCart() { cart = {}; document.getElementById('tableNoInput').value = ""; renderCart(); }

function renderCart() {
    const container = document.getElementById("cartItemsContainer");
    cartTotalRaw = 0; container.innerHTML = "";
    if (Object.keys(cart).length === 0) {
        container.innerHTML = "<p style='color:#888; text-align:center;'>Cart is empty</p>"; document.getElementById("cartTotal").innerText = "Total: ₱0.00"; return;
    }
    for (let [itemName, data] of Object.entries(cart)) {
        cartTotalRaw += (data.price * data.qty);
        container.innerHTML += `<div class="cart-item"><div><div class="cart-item-title">${itemName}</div><small>₱${data.price.toFixed(2)}</small></div><div class="cart-controls"><button onclick="updateCartQty('${itemName}', -1)">-</button><span style="margin: 0 10px; font-weight: bold;">${data.qty}</span><button onclick="updateCartQty('${itemName}', 1)">+</button></div></div>`;
    }
    document.getElementById("cartTotal").innerText = `Total: ₱${cartTotalRaw.toFixed(2)}`;
}

// --- SEND TO KITCHEN ---
async function sendToKitchen() {
    if (Object.keys(cart).length === 0) return showToast("Cart is empty!");
    const tableNoRaw = document.getElementById("tableNoInput").value.trim();
    if (!tableNoRaw) return showToast("Please enter a Table Number.");
    const tableNo = tableNoRaw.toUpperCase(); let checkoutTime = new Date(); 
    
    let totalNeeds = {}; let tableItemsPayload = {};
    for (let [itemName, cartData] of Object.entries(cart)) {
        const menuData = dynamicMenuRecipes[itemName]; if (!menuData) continue;
        tableItemsPayload[itemName] = { qty: cartData.qty, basePrice: cartData.price, totalCost: 0, deductionsString: "", rawDeductions: [] };
        for (const ingredient of menuData.recipe) {
            const qtyNeeded = ingredient.deduct * cartData.qty;
            if (!totalNeeds[ingredient.name]) totalNeeds[ingredient.name] = { needed: 0, cost: 0, id: null, currentQty: 0 };
            totalNeeds[ingredient.name].needed += qtyNeeded;
            tableItemsPayload[itemName].rawDeductions.push({ name: ingredient.name, qty: qtyNeeded });
        }
    }

    const promises = Object.keys(totalNeeds).map(name => db.collection("inventory").where("name", "==", name).get());
    const snapshots = await Promise.all(promises);
    
    let missingStockMessages = [];
    snapshots.forEach(snap => {
        if (!snap.empty) {
            const doc = snap.docs[0]; const data = doc.data();
            totalNeeds[data.name].id = doc.id; totalNeeds[data.name].currentQty = data.quantity; totalNeeds[data.name].cost = data.cost || 0;
        }
    });

    for (let [name, data] of Object.entries(totalNeeds)) {
        if (!data.id) missingStockMessages.push(`${name} missing from DB`);
        else if (data.currentQty < data.needed) missingStockMessages.push(`${name} (Need ${data.needed})`);
    }

    if (missingStockMessages.length > 0) return showToast(`Send paused! Missing stock: ${missingStockMessages.join(", ")}`);

    const batch = db.batch();
    const receiptItems = document.getElementById("ticketItems"); receiptItems.innerHTML = "";

    for (let [itemName, payload] of Object.entries(tableItemsPayload)) {
        let usedIngredients = []; let calculatedCost = 0;
        for (let ing of payload.rawDeductions) {
            const ingCost = totalNeeds[ing.name].cost * ing.qty;
            calculatedCost += ingCost; usedIngredients.push(`${ing.name} (${ing.qty})`);
        }
        payload.totalCost = calculatedCost; payload.deductionsString = usedIngredients.join(", ");
        receiptItems.innerHTML += `<div class="receipt-item"><span><b>${payload.qty}x</b> ${itemName.toUpperCase()}</span></div>`;
    }

    for (let [name, data] of Object.entries(totalNeeds)) {
        const docRef = db.collection("inventory").doc(data.id);
        batch.update(docRef, { quantity: firebase.firestore.FieldValue.increment(-data.needed) });
    }

    const newTableRef = db.collection("active_tables").doc();
    batch.set(newTableRef, { tableNo: tableNo, subtotal: cartTotalRaw, items: tableItemsPayload, timestamp: checkoutTime });

    try {
        await batch.commit();
        showToast(`${tableNo} Sent to Kitchen!`);
        document.getElementById("ticketTableNo").innerText = `${tableNo}`; 
        document.getElementById("ticketTime").innerText = checkoutTime.toLocaleTimeString();
        showDigitalReceipt('kitchenTicketArea'); clearCart();
    } catch(err) { showToast("Network error saving order."); console.error(err); }
}

// --- DIRECT CHECKOUT (SKIP KITCHEN) ---
async function directCheckout() {
    if (Object.keys(cart).length === 0) return showToast("Cart is empty!");
    const tableNoRaw = document.getElementById("tableNoInput").value.trim();
    const tableNo = tableNoRaw ? tableNoRaw.toUpperCase() : "WALK-IN"; 
    let checkoutTime = new Date(); 
    
    let totalNeeds = {}; let tableItemsPayload = {};
    for (let [itemName, cartData] of Object.entries(cart)) {
        const menuData = dynamicMenuRecipes[itemName]; if (!menuData) continue;
        tableItemsPayload[itemName] = { qty: cartData.qty, basePrice: cartData.price, totalCost: 0, deductionsString: "", rawDeductions: [] };
        for (const ingredient of menuData.recipe) {
            const qtyNeeded = ingredient.deduct * cartData.qty;
            if (!totalNeeds[ingredient.name]) totalNeeds[ingredient.name] = { needed: 0, cost: 0, id: null, currentQty: 0 };
            totalNeeds[ingredient.name].needed += qtyNeeded;
            tableItemsPayload[itemName].rawDeductions.push({ name: ingredient.name, qty: qtyNeeded });
        }
    }

    const promises = Object.keys(totalNeeds).map(name => db.collection("inventory").where("name", "==", name).get());
    const snapshots = await Promise.all(promises);
    
    let missingStockMessages = [];
    snapshots.forEach(snap => {
        if (!snap.empty) {
            const doc = snap.docs[0]; const data = doc.data();
            totalNeeds[data.name].id = doc.id; totalNeeds[data.name].currentQty = data.quantity; totalNeeds[data.name].cost = data.cost || 0;
        }
    });

    for (let [name, data] of Object.entries(totalNeeds)) {
        if (!data.id) missingStockMessages.push(`${name} missing from DB`);
        else if (data.currentQty < data.needed) missingStockMessages.push(`${name} (Need ${data.needed})`);
    }

    if (missingStockMessages.length > 0) return showToast(`Checkout paused! Missing stock: ${missingStockMessages.join(", ")}`);

    const batch = db.batch();

    for (let [itemName, payload] of Object.entries(tableItemsPayload)) {
        let calculatedCost = 0;
        for (let ing of payload.rawDeductions) {
            calculatedCost += (totalNeeds[ing.name].cost * ing.qty);
        }
        payload.totalCost = calculatedCost; 
    }

    for (let [name, data] of Object.entries(totalNeeds)) {
        const docRef = db.collection("inventory").doc(data.id);
        batch.update(docRef, { quantity: firebase.firestore.FieldValue.increment(-data.needed) });
    }

    // Create table but tag it to skip the kitchen
    const newTableRef = db.collection("active_tables").doc();
    batch.set(newTableRef, { tableNo: tableNo, subtotal: cartTotalRaw, items: tableItemsPayload, timestamp: checkoutTime, skipKitchen: true });

    try {
        await batch.commit();
        // Manually inject locally so the modal opens instantly without waiting for the server sync
        activeTablesData[newTableRef.id] = { tableNo: tableNo, subtotal: cartTotalRaw, items: tableItemsPayload, timestamp: { toDate: () => checkoutTime }, skipKitchen: true };
        
        clearCart();
        openBillingModal(newTableRef.id);
    } catch(err) { showToast("Error during direct checkout."); console.error(err); }
}

// --- VISUAL MAP & ACTIVE TABLES ---
function loadActiveTables() {
    db.collection("active_tables").orderBy("timestamp", "asc").onSnapshot((snapshot) => {
        activeTablesData = {};
        snapshot.forEach(doc => { activeTablesData[doc.id] = doc.data(); });
        renderTableMap();
        if(typeof renderKitchenBoard === "function") renderKitchenBoard();
    });
}

function renderTableMap() {
    const container = document.getElementById("activeTablesContainer"); 
    if (!container) return; // <--- Safely exits if we are on the kitchen screen!
    
    container.innerHTML = "";
    const standardTables = ["T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8", "T9"];
    let mapHTML = '<div class="table-map-grid">';
    let usedStandardIds = [];

    standardTables.forEach(tableName => {
        let activeId = null; let activeData = null;
        for (let [id, data] of Object.entries(activeTablesData)) {
            if (data.tableNo === tableName) { activeId = id; activeData = data; usedStandardIds.push(id); break; }
        }

        if (activeId) {
            mapHTML += `<div class="map-table occupied" onclick="openBillingModal('${activeId}')"><div style="font-weight: bold; color: #8c5d3a;">${tableName}</div><div style="font-size: 13px; color: #bd4b4b;">₱${activeData.subtotal.toFixed(2)}</div></div>`;
        } else {
            mapHTML += `<div class="map-table empty" onclick="selectTableForOrder('${tableName}')"><div style="font-weight: bold;">${tableName}</div><div style="font-size: 11px;">Available</div></div>`;
        }
    });
    mapHTML += '</div>';

    let customHTML = "";
    for (let [id, data] of Object.entries(activeTablesData)) {
        if (!usedStandardIds.includes(id)) {
            let time = data.timestamp ? data.timestamp.toDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : "";
            customHTML += `<div class="table-item" style="padding: 10px;"><div style="display: flex; justify-content: space-between; font-weight: bold; color: #2b4227; margin-bottom: 5px;"><span>${data.tableNo}</span><span style="color:#666; font-size:11px; font-weight:normal;">${time}</span></div><div style="font-weight: bold; margin-bottom: 8px;">₱${(data.subtotal || 0).toFixed(2)}</div><button class="save-btn" style="width: 100%; font-size:12px; padding: 6px;" onclick="openBillingModal('${id}')">Open Bill</button></div>`;
        }
    }
    
    if(customHTML) { mapHTML += `<h3 style="font-size:14px; margin-top:0; border-bottom: none; color: #8c5d3a;">Takeout / Custom Tables</h3>` + customHTML; }
    container.innerHTML = mapHTML;
}

function selectTableForOrder(tableName) { document.getElementById("tableNoInput").value = tableName; showToast(`${tableName} selected.`); }

// --- VOID TABLES ---
async function voidActiveTable(tableId) {
    if (!confirm("Void this entire table? Ingredients will be restored to inventory.")) return;
    const tableData = activeTablesData[tableId];
    
    let restoreTotals = {};
    for (let [itemName, itemData] of Object.entries(tableData.items)) {
        for (let ing of itemData.rawDeductions) {
            if(!restoreTotals[ing.name]) restoreTotals[ing.name] = 0;
            restoreTotals[ing.name] += ing.qty;
        }
    }
    
    const promises = Object.keys(restoreTotals).map(name => db.collection("inventory").where("name", "==", name).get());
    const snapshots = await Promise.all(promises);
    
    const batch = db.batch();
    snapshots.forEach(snap => {
        if(!snap.empty) {
            const doc = snap.docs[0]; const name = doc.data().name;
            batch.update(doc.ref, { quantity: firebase.firestore.FieldValue.increment(restoreTotals[name]) });
        }
    });
    batch.delete(db.collection("active_tables").doc(tableId));

    // NEW: Release the Room if voiding a Room Folio
    if (tableData.isRoomFolio && tableData.roomId) {
        batch.update(db.collection("rooms").doc(tableData.roomId), {
            status: "AVAILABLE", activeTableId: null, currentGuestName: null
        });
    }
    
    try { await batch.commit(); showToast("Table voided and inventory restored."); } 
    catch(e) { showToast("Error voiding table."); console.error(e); }
}

function voidActiveTableModal() { if(activeBillingTableId) { voidActiveTable(activeBillingTableId).then(() => { closeBillingModal(); }); } }

// --- BILLING MODAL & MATH ---
function openBillingModal(tableId) {
    activeBillingTableId = tableId; const data = activeTablesData[tableId];
    document.getElementById("billingTableNo").innerText = `${data.tableNo}`;
    document.getElementById("discountCheck").checked = false; document.getElementById("freeBreakfastCheck").checked = false;
    document.getElementById("paymentMethod").value = "Cash"; document.getElementById("amountTendered").value = "";
    
    // Clear Buyer Inputs
    document.getElementById("buyerNameInput").value = "";
    document.getElementById("buyerTinInput").value = "";
    document.getElementById("buyerAddressInput").value = "";
    
    toggleDiscountInputs(); // Reset SC inputs
    togglePaymentInputs();
    
    const itemsList = document.getElementById("billingItemsList"); itemsList.innerHTML = "";
    for (let [itemName, itemData] of Object.entries(data.items)) {
        itemsList.innerHTML += `<div class="bill-row"><span>${itemData.qty}x ${itemName}</span><span>₱${(itemData.basePrice * itemData.qty).toFixed(2)}</span></div>`;
    }
    updateBillingTotal(); document.getElementById("billingModal").classList.remove("hidden");
}

function closeBillingModal() { document.getElementById("billingModal").classList.add("hidden"); activeBillingTableId = null; }

function toggleDiscountInputs() {
    const isSenior = document.getElementById("discountCheck").checked;
    if(isSenior) { document.getElementById("seniorDetailsRow").classList.remove("hidden"); } 
    else { 
        document.getElementById("seniorDetailsRow").classList.add("hidden");
        document.getElementById("seniorNameInput").value = ""; document.getElementById("seniorIdInput").value = "";
    }
    updateBillingTotal();
}

function updateBillingTotal() {
    if(!activeBillingTableId) return;
    const data = activeTablesData[activeBillingTableId]; 
    const isSenior = document.getElementById("discountCheck").checked;
    const isFreeBF = document.getElementById("freeBreakfastCheck").checked;
    
    const subtotal = data.subtotal; let totalDiscount = 0; let bfDiscountAmount = 0;

    if (isFreeBF) {
        for (let [itemName, itemData] of Object.entries(data.items)) {
            let cat = "Meals";
            for (let id in dynamicMenuDocs) { if (dynamicMenuDocs[id].name === itemName) { cat = dynamicMenuDocs[id].category; break; } }
            if (cat === "Meals") bfDiscountAmount += (itemData.basePrice * itemData.qty);
        }
        totalDiscount += bfDiscountAmount;
    }
    
    if (isSenior) { 
        // Strict BIR Formula: Strip 12% VAT, compute 20% on remaining net
        const remainingGross = subtotal - bfDiscountAmount;
        const netOfVat = remainingGross / 1.12;
        totalDiscount += (netOfVat * 0.20); 
    }
    
    document.getElementById("billingSubtotal").innerText = `₱${subtotal.toFixed(2)}`;
    document.getElementById("billingFinalTotal").innerText = `₱${(subtotal - totalDiscount).toFixed(2)}`;
    
    const discountDisplay = document.getElementById("discountDisplayRow");
    if (totalDiscount > 0) { 
        discountDisplay.classList.remove("hidden"); document.getElementById("billingDiscountAmount").innerText = `-₱${totalDiscount.toFixed(2)}`; 
    } else { discountDisplay.classList.add("hidden"); }
    calculateChange();
}

function togglePaymentInputs() {
    const method = document.getElementById("paymentMethod").value;
    const cashRow = document.getElementById("cashInputRow");
    const changeRow = document.getElementById("changeRow");
    
    if (method === "Cash") {
        cashRow.classList.remove("hidden");
        changeRow.classList.remove("hidden");
        // Force display override
        cashRow.style.cssText = "display: flex !important; justify-content: space-between; margin-top: 10px;";
        changeRow.style.cssText = "display: flex !important; justify-content: space-between; margin-top: 10px; color: #557a46; font-weight: bold; border-top: 1px dashed #ccc; padding-top: 10px;";
    } else {
        cashRow.classList.add("hidden");
        changeRow.classList.add("hidden");
        cashRow.style.display = "none";
        changeRow.style.display = "none";
    }
}

function calculateChange() {
    const method = document.getElementById("paymentMethod").value; if (method !== "Cash") return;
    const finalTotalRaw = document.getElementById("billingFinalTotal").innerText.replace("₱", "");
    const finalTotal = parseFloat(finalTotalRaw) || 0; const tendered = parseFloat(document.getElementById("amountTendered").value) || 0;
    const change = tendered - finalTotal;
    document.getElementById("changeDueAmount").innerText = `₱${change > 0 ? change.toFixed(2) : "0.00"}`;
}

// --- PRINT PRE-BILL ---
function printPreBill() {
    if(!activeBillingTableId) return;
    const data = activeTablesData[activeBillingTableId]; 
    const isSenior = document.getElementById("discountCheck").checked;
    const isFreeBF = document.getElementById("freeBreakfastCheck").checked;
    const method = document.getElementById("paymentMethod").value;
    const printTime = new Date();

    const bName = document.getElementById("buyerNameInput").value.trim();
    const bTin = document.getElementById("buyerTinInput").value.trim();
    const bAddress = document.getElementById("buyerAddressInput").value.trim();

    document.getElementById("receiptHeaderTitle").innerText = "BILLING STATEMENT";
    document.getElementById("receiptInvoiceNo").innerText = ""; 
    document.getElementById("receiptTableNo").innerText = `${data.tableNo}`;
    document.getElementById("receiptTime").innerText = printTime.toLocaleString();

    if(bName || bTin || bAddress) {
        document.getElementById("receiptBuyerInfo").classList.remove("hidden");
        document.getElementById("receiptBuyerName").innerText = bName || "-";
        document.getElementById("receiptBuyerTin").innerText = bTin || "-";
        document.getElementById("receiptBuyerAddress").innerText = bAddress || "-";
    } else {
        document.getElementById("receiptBuyerInfo").classList.add("hidden");
    }
    
    const receiptItems = document.getElementById("receiptItems"); receiptItems.innerHTML = "";
    let bfDiscountAmount = 0;

    for (let [itemName, itemData] of Object.entries(data.items)) {
        let cat = "Meals";
        for (let id in dynamicMenuDocs) { if (dynamicMenuDocs[id].name === itemName) { cat = dynamicMenuDocs[id].category; break; } }
        if (isFreeBF && cat === "Meals") bfDiscountAmount += (itemData.basePrice * itemData.qty);
        receiptItems.innerHTML += `<div class="receipt-item" style="display:flex; justify-content:space-between; margin-bottom:5px;"><span>${itemData.qty}x ${itemName}</span><span>₱${(itemData.basePrice * itemData.qty).toFixed(2)}</span></div>`;
    }

    const subtotal = data.subtotal; 
    const remainingGross = subtotal - bfDiscountAmount;
    let scDiscount = 0; let vatableSales = remainingGross / 1.12; let vatAmount = remainingGross - vatableSales; let vatExemptSales = 0;

    if (isSenior) {
        vatExemptSales = remainingGross / 1.12;
        scDiscount = vatExemptSales * 0.20;
        vatableSales = 0; vatAmount = 0;
    }

    let totalDiscount = bfDiscountAmount + scDiscount;
    const finalTotal = subtotal - totalDiscount;

    document.getElementById("receiptSubtotal").innerText = `₱${subtotal.toFixed(2)}`;
    if (totalDiscount > 0) {
        document.getElementById("receiptDiscountRow").classList.remove("hidden");
        let discLabel = "Discount:";
        if (isFreeBF && isSenior) discLabel = "Free BF + Senior:";
        else if (isFreeBF) discLabel = "Free Breakfast:";
        else if (isSenior) discLabel = "Senior/PWD (20%):";
        document.getElementById("receiptDiscountLabel").innerText = discLabel;
        document.getElementById("receiptDiscountAmount").innerText = `-₱${totalDiscount.toFixed(2)}`;
    } else { document.getElementById("receiptDiscountRow").classList.add("hidden"); }
    
    document.getElementById("receiptFinalTotal").innerText = `₱${finalTotal.toFixed(2)}`;
    
    const paymentSection = document.getElementById("receiptPaymentSection");
    paymentSection.classList.remove("hidden");
    paymentSection.style.display = "block";
    
    document.getElementById("receiptPayMethod").innerText = method;
    const tenderedRow = document.getElementById("receiptTenderedRow");
    const changeRow = document.getElementById("receiptChangeRow");

    if (method === "Cash") {
        const tenderedVal = document.getElementById("amountTendered").value;
        let tendered = tenderedVal ? parseFloat(tenderedVal) : 0;
        let change = tendered > finalTotal ? tendered - finalTotal : 0;
        
        tenderedRow.classList.remove("hidden");
        changeRow.classList.remove("hidden");
        tenderedRow.style.display = "flex";
        changeRow.style.display = "flex";
        document.getElementById("receiptTenderedAmount").innerText = `₱${tendered.toFixed(2)}`;
        document.getElementById("receiptChangeAmount").innerText = `₱${change.toFixed(2)}`;
    } else {
        tenderedRow.classList.add("hidden");
        changeRow.classList.add("hidden");
        tenderedRow.style.display = "none";
        changeRow.style.display = "none";
    }
    
    document.getElementById("receiptVatSales").innerText = `₱${vatableSales.toFixed(2)}`;
    document.getElementById("receiptVatAmount").innerText = `₱${vatAmount.toFixed(2)}`;
    document.getElementById("receiptVatExempt").innerText = `₱${vatExemptSales.toFixed(2)}`;
    document.getElementById("receiptSeniorInfo").classList.add("hidden");

    showDigitalReceipt('customerReceiptArea'); closeBillingModal();
}

// --- PROCESS PAYMENT (BIR COMPLIANT) ---
async function processPayment() {
    if(!activeBillingTableId) return;
    const data = activeTablesData[activeBillingTableId]; 
    const isSenior = document.getElementById("discountCheck").checked;
    const isFreeBF = document.getElementById("freeBreakfastCheck").checked;
    const method = document.getElementById("paymentMethod").value;
    const payTime = new Date();

    const bName = document.getElementById("buyerNameInput").value.trim();
    const bTin = document.getElementById("buyerTinInput").value.trim();
    const bAddress = document.getElementById("buyerAddressInput").value.trim();

    let bfDiscountAmount = 0; let totalCostForSale = 0;
    for (let [itemName, itemData] of Object.entries(data.items)) {
        let cat = "Meals";
        for (let id in dynamicMenuDocs) { if (dynamicMenuDocs[id].name === itemName) { cat = dynamicMenuDocs[id].category; break; } }
        if (isFreeBF && cat === "Meals") { bfDiscountAmount += (itemData.basePrice * itemData.qty); } 
        totalCostForSale += itemData.totalCost;
    }

    const subtotal = data.subtotal; 
    const remainingGross = subtotal - bfDiscountAmount;
    let scDiscount = 0; let vatableSales = remainingGross / 1.12; let vatAmount = remainingGross - vatableSales; let vatExemptSales = 0;

    if (isSenior) {
        vatExemptSales = remainingGross / 1.12;
        scDiscount = vatExemptSales * 0.20;
        vatableSales = 0; vatAmount = 0;
    }

    let totalDiscount = bfDiscountAmount + scDiscount;
    const finalTotal = subtotal - totalDiscount;

    let tendered = 0; let change = 0;
    if (method === "Cash") {
        const tenderedVal = document.getElementById("amountTendered").value;
        tendered = tenderedVal ? parseFloat(tenderedVal) : 0;
        if (tendered < finalTotal) {
            return showToast(`Insufficient funds! Please tender at least ₱${finalTotal.toFixed(2)}`);
        }
        change = tendered - finalTotal;
    }

    const configRef = db.collection('config').doc('system');
    const configDoc = await configRef.get();
    let invNum = configDoc.exists ? (configDoc.data().invoiceCount || 1) : 1;
    let currentGT = configDoc.exists ? (configDoc.data().grandTotal || 0) : 0;
    let invString = "INV-" + String(invNum).padStart(6, '0');

    document.getElementById("receiptHeaderTitle").innerText = "SALES INVOICE";
    document.getElementById("receiptInvoiceNo").innerText = invString;
    document.getElementById("receiptTableNo").innerText = `${data.tableNo}`;
    document.getElementById("receiptTime").innerText = payTime.toLocaleString();
    
    if(bName || bTin || bAddress) {
        document.getElementById("receiptBuyerInfo").classList.remove("hidden");
        document.getElementById("receiptBuyerName").innerText = bName || "-";
        document.getElementById("receiptBuyerTin").innerText = bTin || "-";
        document.getElementById("receiptBuyerAddress").innerText = bAddress || "-";
    } else { document.getElementById("receiptBuyerInfo").classList.add("hidden"); }

    const receiptItems = document.getElementById("receiptItems"); receiptItems.innerHTML = "";
    const batch = db.batch(); 

    for (let [itemName, itemData] of Object.entries(data.items)) {
        let itemPrice = itemData.basePrice * itemData.qty; 
        receiptItems.innerHTML += `<div class="receipt-item" style="display:flex; justify-content:space-between; margin-bottom:5px;"><span>${itemData.qty}x ${itemName}</span><span>₱${itemPrice.toFixed(2)}</span></div>`;
    }

    const newSaleRef = db.collection("sales").doc();
    batch.set(newSaleRef, {
        invoiceNo: invString,
        tableNo: data.tableNo,
        items: data.items,
        grossAmount: subtotal,
        discountAmount: totalDiscount,
        netAmount: finalTotal,
        totalCost: totalCostForSale,
        paymentMethod: method,
        cashTendered: method === "Cash" ? tendered : finalTotal,
        changeDue: method === "Cash" ? change : 0,
        status: 'COMPLETED',
        archived: false,
        timestamp: payTime,
        seniorDetails: isSenior ? { name: document.getElementById('seniorNameInput').value, id: document.getElementById('seniorIdInput').value } : null,
        buyerDetails: (bName || bTin || bAddress) ? { name: bName, tin: bTin, address: bAddress } : null
    });
    
    batch.update(configRef, { invoiceCount: invNum + 1, grandTotal: currentGT + finalTotal });

    document.getElementById("receiptSubtotal").innerText = `₱${subtotal.toFixed(2)}`;
    if (totalDiscount > 0) {
        document.getElementById("receiptDiscountRow").classList.remove("hidden");
        let discLabel = "Discount:";
        if (isFreeBF && isSenior) discLabel = "Free BF + Senior:";
        else if (isFreeBF) discLabel = "Free Breakfast:";
        else if (isSenior) discLabel = "Senior/PWD (20%):";
        document.getElementById("receiptDiscountLabel").innerText = discLabel;
        document.getElementById("receiptDiscountAmount").innerText = `-₱${totalDiscount.toFixed(2)}`;
    } else { document.getElementById("receiptDiscountRow").classList.add("hidden"); }
    
    document.getElementById("receiptFinalTotal").innerText = `₱${finalTotal.toFixed(2)}`;

    const paymentSection = document.getElementById("receiptPaymentSection");
    paymentSection.classList.remove("hidden");
    paymentSection.style.display = "block";
    
    document.getElementById("receiptPayMethod").innerText = method;
    const tenderedRow = document.getElementById("receiptTenderedRow");
    const changeRow = document.getElementById("receiptChangeRow");

    if (method === "Cash") {
        tenderedRow.classList.remove("hidden");
        changeRow.classList.remove("hidden");
        tenderedRow.style.display = "flex";
        changeRow.style.display = "flex";
        document.getElementById("receiptTenderedAmount").innerText = `₱${tendered.toFixed(2)}`;
        document.getElementById("receiptChangeAmount").innerText = `₱${change.toFixed(2)}`;
    } else {
        tenderedRow.classList.add("hidden");
        changeRow.classList.add("hidden");
        tenderedRow.style.display = "none";
        changeRow.style.display = "none";
    }

    document.getElementById("receiptVatSales").innerText = `₱${vatableSales.toFixed(2)}`;
    document.getElementById("receiptVatAmount").innerText = `₱${vatAmount.toFixed(2)}`;
    document.getElementById("receiptVatExempt").innerText = `₱${vatExemptSales.toFixed(2)}`;
    if(isSenior) {
        document.getElementById("receiptSeniorInfo").classList.remove("hidden");
        document.getElementById("receiptScName").innerText = document.getElementById("seniorNameInput").value;
        document.getElementById("receiptScId").innerText = document.getElementById("seniorIdInput").value;
    } else { document.getElementById("receiptSeniorInfo").classList.add("hidden"); }

    const tableRef = db.collection("active_tables").doc(activeBillingTableId);
    batch.delete(tableRef);

    // NEW: Release the Room if checking out from a Room Folio
    if (data.isRoomFolio && data.roomId) {
        batch.update(db.collection("rooms").doc(data.roomId), {
            status: "AVAILABLE", activeTableId: null, currentGuestName: null
        });
    }

    try {
        await batch.commit();
        closeBillingModal(); showToast("Invoice Generated & Saved!");
        showDigitalReceipt('customerReceiptArea');
    } catch(err) { console.error(err); showToast("Error processing payment."); }
}

// --- MENU BUILDER LOGIC (STRICTLY FOOD & BEVERAGE) ---
function loadMenu() {
    db.collection("menu").orderBy("category").onSnapshot((snapshot) => {
        const container = document.getElementById("menuGridContainer"); container.innerHTML = ""; 
        dynamicMenuRecipes = {}; dynamicMenuDocs = {}; let categories = {};
        snapshot.forEach((doc) => {
            const item = doc.data(); const cat = item.category || "Meals"; 
            dynamicMenuRecipes[item.name] = { recipe: item.recipe || [], price: item.price || 0 }; dynamicMenuDocs[doc.id] = { id: doc.id, ...item };
            if(!categories[cat]) categories[cat] = []; categories[cat].push(doc);
        });
        for (let cat in categories) {
            let catHTML = `<h3>${cat}</h3><div class="menu-grid">`;
            categories[cat].forEach(doc => {
                const item = doc.data();
                catHTML += `<div class="menu-item-container"><button class="order-btn" onclick="addToCart('${item.name}', ${item.price || 0})"> ${item.name}<br><small>₱${(item.price||0).toFixed(2)}</small></button><div class="menu-actions no-print"><button class="action-circle" style="background:#d4a373;" onclick="editMenu('${doc.id}')">✎</button><button class="action-circle" style="background:#bd4b4b;" onclick="deleteMenu('${doc.id}')">✕</button></div></div>`;
            });
            catHTML += `</div>`; container.innerHTML += catHTML;
        }
    });
}

function addIngredientRow() { document.getElementById("ingredientInputs").innerHTML += `<div class="ingredient-row"><input type="text" class="ing-name" placeholder="Ingredient Needed" style="flex: 1;"><input type="number" class="ing-qty" placeholder="Qty" style="width: 80px;"></div>`; }
function editMenu(id) {
    switchView('menuManageView', document.querySelectorAll('.nav-btn')[2]); 
    const docData = dynamicMenuDocs[id]; editingMenuId = id;
    document.getElementById("newMenuName").value = docData.name; document.getElementById("menuPrice").value = docData.price || 0; document.getElementById("menuCategory").value = docData.category || "Meals";
    const container = document.getElementById("ingredientInputs"); container.innerHTML = ""; 
    docData.recipe.forEach(ing => { container.innerHTML += `<div class="ingredient-row"><input type="text" class="ing-name" value="${ing.name}" style="flex: 1;"><input type="number" class="ing-qty" value="${ing.deduct}" style="width: 80px;"></div>`; });
    document.getElementById("menuFormTitle").innerText = "Edit Menu Item"; document.getElementById("cancelEditBtn").classList.remove("hidden");
}
function resetMenuForm() {
    editingMenuId = null; document.getElementById("newMenuName").value = ""; document.getElementById("menuPrice").value = ""; document.getElementById("menuFormTitle").innerText = "Create New Menu Item"; document.getElementById("cancelEditBtn").classList.add("hidden");
    document.getElementById("ingredientInputs").innerHTML = `<div class="ingredient-row"><input type="text" class="ing-name" placeholder="Ingredient Needed" style="flex: 1;"><input type="number" class="ing-qty" placeholder="Qty" style="width: 80px;"></div>`;
}
function saveMenuItem() {
    const name = document.getElementById("newMenuName").value.trim(), price = parseFloat(document.getElementById("menuPrice").value) || 0, category = document.getElementById("menuCategory").value;
    let recipe = []; document.querySelectorAll(".ingredient-row").forEach(row => { const n = row.querySelector(".ing-name").value.trim(), q = row.querySelector(".ing-qty").value; if(n && q) recipe.push({name: n, deduct: parseInt(q)}); });
    if(!name) return showToast("Menu Name is required.");
    const payload = {name, price, category, recipe};
    if(editingMenuId) db.collection("menu").doc(editingMenuId).update(payload).then(resetMenuForm); else { payload.timestamp = firebase.firestore.FieldValue.serverTimestamp(); db.collection("menu").add(payload).then(resetMenuForm); }
    showToast("Menu Item Saved");
}
function deleteMenu(id) { if(confirm("Delete menu item?")) db.collection("menu").doc(id).delete(); }

// ==========================================
// --- SPLIT BILL LOGIC (SENIOR/PWD SAFE) ---
// ==========================================
let splitCart = {};

function openSplitModal() {
    if(!activeBillingTableId) return;
    const data = activeTablesData[activeBillingTableId];
    splitCart = {};
    
    const list = document.getElementById("splitItemsList");
    list.innerHTML = "";
    
    let itemIndex = 0;
    for (let [itemName, itemData] of Object.entries(data.items)) {
        // Only allow splitting if there's quantity to split
        if(itemData.qty > 0) {
            splitCart[itemName] = { 
                maxQty: itemData.qty, 
                splitQty: 0, 
                basePrice: itemData.basePrice,
                totalCost: itemData.totalCost, 
                rawDeductions: itemData.rawDeductions 
            };
            
            let safeId = "split-qty-" + itemIndex;
            let encodedName = encodeURIComponent(itemName);
            
            list.innerHTML += `
                <div class="cart-item" style="border-bottom: 1px dashed #eee;">
                    <div><div class="cart-item-title">${itemName}</div><small style="color:#666;">Max available: ${itemData.qty}</small></div>
                    <div class="cart-controls">
                        <button onclick="updateSplitQty('${encodedName}', -1, '${safeId}')" style="background:#e0e5e0;">-</button>
                        <span id="${safeId}" style="margin: 0 15px; font-weight: bold; font-size: 16px;">0</span>
                        <button onclick="updateSplitQty('${encodedName}', 1, '${safeId}')" style="background:#d1ebd1; color:#2b4227;">+</button>
                    </div>
                </div>
            `;
            itemIndex++;
        }
    }
    
    document.getElementById("splitModal").classList.remove("hidden");
}

function updateSplitQty(encodedName, change, elementId) {
    let itemName = decodeURIComponent(encodedName);
    let item = splitCart[itemName];
    let newQty = item.splitQty + change;
    
    if(newQty >= 0 && newQty <= item.maxQty) {
        item.splitQty = newQty;
        document.getElementById(elementId).innerText = newQty;
    }
}

function closeSplitModal() {
    document.getElementById("splitModal").classList.add("hidden");
    splitCart = {};
}

async function confirmSplitBill() {
    if(!activeBillingTableId) return;
    const originalData = activeTablesData[activeBillingTableId];
    
    let newTableItems = {}; let newSubtotal = 0;
    let originalRemainingItems = {}; let originalNewSubtotal = 0;
    
    let hasSplitItems = false; let completelyMoved = true;

    for (let [itemName, splitData] of Object.entries(splitCart)) {
        if (splitData.splitQty > 0) {
            hasSplitItems = true;
            if (splitData.splitQty < splitData.maxQty) completelyMoved = false;
            
            // Prorate ingredient costs and deductions exactly based on split ratio
            let ratio = splitData.splitQty / splitData.maxQty;
            let splitCost = originalData.items[itemName].totalCost * ratio;
            
            let splitDeductions = originalData.items[itemName].rawDeductions.map(d => ({ name: d.name, qty: d.qty * ratio }));
            let dedString = splitDeductions.map(d => `${d.name} (${d.qty})`).join(", ");

            newTableItems[itemName] = {
                qty: splitData.splitQty, basePrice: splitData.basePrice, totalCost: splitCost,
                rawDeductions: splitDeductions, deductionsString: dedString
            };
            newSubtotal += (splitData.basePrice * splitData.splitQty);
        } else {
            completelyMoved = false;
        }
        
        // Keep the un-split items on the original table
        let remainingQty = splitData.maxQty - splitData.splitQty;
        if (remainingQty > 0) {
            let ratio = remainingQty / splitData.maxQty;
            let remCost = originalData.items[itemName].totalCost * ratio;
            
            let remDeductions = originalData.items[itemName].rawDeductions.map(d => ({ name: d.name, qty: d.qty * ratio }));
            let remString = remDeductions.map(d => `${d.name} (${d.qty})`).join(", ");

            originalRemainingItems[itemName] = {
                qty: remainingQty, basePrice: splitData.basePrice, totalCost: remCost,
                rawDeductions: remDeductions, deductionsString: remString
            };
            originalNewSubtotal += (splitData.basePrice * remainingQty);
        }
    }

    if (!hasSplitItems) return showToast("No items selected to split.");
    if (completelyMoved) return showToast("You selected all items! Just checkout this table normally.");

    const batch = db.batch();
    
    // 1. Update original table to remove the split items
    const origTableRef = db.collection("active_tables").doc(activeBillingTableId);
    batch.update(origTableRef, { items: originalRemainingItems, subtotal: originalNewSubtotal });

    // 2. Create the new independent table for the Senior
    const newTableRef = db.collection("active_tables").doc();
    let newTableName = originalData.tableNo.includes("(Split)") ? originalData.tableNo + "+" : originalData.tableNo + " (Split)";

    batch.set(newTableRef, {
        tableNo: newTableName,
        items: newTableItems, subtotal: newSubtotal, timestamp: new Date()
    });

    try {
        await batch.commit();
        closeSplitModal(); closeBillingModal();
        showToast("Bill successfully split! Check active tables.");
    } catch(e) { showToast("Error splitting bill."); console.error(e); }
}

// ==========================================
// --- CUSTOM MENU CATEGORIES LOGIC ---
// ==========================================
let menuCategories = [];

function loadCategories() {
    db.collection("settings").doc("categories").onSnapshot((doc) => {
        const listDiv = document.getElementById("categoryList");
        const selectDropdown = document.getElementById("menuCategory");
        listDiv.innerHTML = "";
        selectDropdown.innerHTML = "";
        
        if (doc.exists && doc.data().list) {
            menuCategories = doc.data().list;
        } else {
            // Default categories if none exist yet
            menuCategories = ["Meals", "Drinks", "Add-ons"]; 
            db.collection("settings").doc("categories").set({ list: menuCategories });
        }
        
        menuCategories.forEach(cat => {
            // Build the visual badge list
            listDiv.innerHTML += `
                <span style="background: #e9ece9; border: 1px solid #c8dac8; padding: 6px 12px; border-radius: 20px; font-size: 13px; color: #2b4227; font-weight: bold; display: flex; align-items: center; gap: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                    ${cat} 
                    <button onclick="deleteCategory('${cat}')" style="background:none; border:none; color:#bd4b4b; cursor:pointer; padding:0; font-size:14px; font-weight:bold; transition: transform 0.2s;">✕</button>
                </span>`;
            // Populate the dropdown menu
            selectDropdown.innerHTML += `<option value="${cat}">${cat}</option>`;
        });
    });
}

function addCategory() {
    const catName = document.getElementById("newCategoryName").value.trim();
    if(!catName) return showToast("Enter a category name.");
    if(menuCategories.includes(catName)) return showToast("Category already exists!");
    
    let updatedList = [...menuCategories, catName];
    db.collection("settings").doc("categories").update({ list: updatedList }).then(() => {
        document.getElementById("newCategoryName").value = "";
        showToast("Category added successfully!");
    }).catch(err => {
        // Fallback if the document didn't exist
        db.collection("settings").doc("categories").set({ list: updatedList });
        document.getElementById("newCategoryName").value = "";
    });
}

function deleteCategory(catName) {
    if(menuCategories.length <= 1) return showToast("You must have at least one category.");
    if(!confirm(`Are you sure you want to delete the '${catName}' category?`)) return;
    
    let updatedList = menuCategories.filter(c => c !== catName);
    db.collection("settings").doc("categories").update({ list: updatedList }).then(() => {
        showToast("Category removed!");
    });
}

// ==========================================
// --- SECURITY & ROLE AUTHORIZATION ---
// ==========================================
let currentPinInput = "";
let pinResolvePromise = null;

function requestAdminPin() {
    return new Promise((resolve) => {
        currentPinInput = "";
        document.getElementById("pinDisplay").innerText = "";
        document.getElementById("pinModal").classList.remove("hidden");
        pinResolvePromise = resolve; // Store the resolve function to call it later
    });
}

function enterPin(num) {
    if (currentPinInput.length < 4) {
        currentPinInput += num;
        document.getElementById("pinDisplay").innerText = "•".repeat(currentPinInput.length);
    }
}

function clearPin() {
    currentPinInput = "";
    document.getElementById("pinDisplay").innerText = "";
}

function closePinModal() {
    document.getElementById("pinModal").classList.add("hidden");
    if (pinResolvePromise) {
        pinResolvePromise(false); // Resolve as failed/cancelled
        pinResolvePromise = null;
    }
}

function submitPin() {
    if (currentPinInput === ADMIN_PIN) {
        document.getElementById("pinModal").classList.add("hidden");
        if (pinResolvePromise) {
            pinResolvePromise(true); // Authorized!
            pinResolvePromise = null;
        }
    } else {
        showToast("Incorrect Manager PIN");
        clearPin();
    }
}

// --- SECURE THE TABLE VOID BUTTON ---
async function secureVoidActiveTableModal() { 
    if(activeBillingTableId) { 
        const isAuthorized = await requestAdminPin();
        if (!isAuthorized) return showToast("Void cancelled.");
        
        voidActiveTable(activeBillingTableId).then(() => { 
            closeBillingModal(); 
        }); 
    } 
}

// ==========================================
// --- KITCHEN DISPLAY SYSTEM (KDS) ---
// ==========================================
function renderKitchenBoard() {
    const board = document.getElementById("kitchenBoard");
    board.innerHTML = ""; 

    if (Object.keys(activeTablesData).length === 0) {
        board.innerHTML = '<p style="color: #666;">No active orders...</p>';
        return;
    }

    for (let [tableId, data] of Object.entries(activeTablesData)) {
        if (data.skipKitchen) continue;
        let timeString = "Just now";
        
        if (data.timestamp) {
            const orderTime = data.timestamp.toDate();
            timeString = orderTime.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        }

        let itemsHTML = "";
        for (let [itemName, itemData] of Object.entries(data.items)) {
            let modHTML = ""; 
            itemsHTML += `<div class="kds-item"><b>${itemData.qty}x</b> ${itemName} ${modHTML}</div>`;
        }

        let servedClass = data.served ? "served" : "";
        let btnText = data.served ? "Undo" : "✔️ Mark as Served";
        let btnColor = data.served ? "#8c5d3a" : "#557a46";

        board.innerHTML += `
            <div class="kds-card ${servedClass}" id="kds-${tableId}">
                <div class="kds-header">
                    <span>${data.tableNo}</span>
                    <span class="kds-time">${timeString}</span>
                </div>
                <div class="kds-body">${itemsHTML}</div>
                <div class="kds-footer" style="display: flex; gap: 5px;">
                    <button class="save-btn" style="flex: 1.5; background: ${btnColor}; padding: 8px;" onclick="toggleServeStatus('${tableId}', ${data.served || false})">${btnText}</button>
                    <button class="delete-btn" style="flex: 1; padding: 8px; font-size: 13px;" onclick="clearKitchenOrder('${tableId}')">🗑️ Clear</button>
                </div>
            </div>
        `;
    }
}

function toggleServeStatus(tableId, currentStatus) {
    db.collection("active_tables").doc(tableId).update({ served: !currentStatus })
        .catch(err => { 
            showToast("Error updating KDS."); 
            console.error(err); 
        });
}

// Function to completely remove/clear a finished order from the database queue
async function clearKitchenOrder(tableId) {
    if (!confirm("Clear this order from the kitchen queue?")) return;
    try {
        await db.collection("active_tables").doc(tableId).delete();
        showToast("Order cleared from queue.");
    } catch (err) {
        showToast("Error clearing order.");
        console.error(err);
    }
}

// --- CHARGE POS CART DIRECTLY TO A GUEST'S ROOM FOLIO ---
async function chargeToRoomFolio() {
    if (Object.keys(cart).length === 0) return showToast("Cart is empty!");
    
    const roomId = prompt("Enter the Room Number to charge this order to (e.g., 101):");
    if (!roomId) return;

    try {
        // 1. Verify Room exists and is occupied
        const roomDoc = await db.collection("rooms").doc(roomId).get();
        if (!roomDoc.exists || roomDoc.data().status !== "OCCUPIED" || !roomDoc.data().currentFolioId) {
            return showToast(`Room ${roomId} is not currently occupied.`);
        }

        // 2. Validate and deduct inventory for the food ordered
        let totalNeeds = {}; 
        for (let [itemName, cartData] of Object.entries(cart)) {
            const menuData = dynamicMenuRecipes[itemName]; if (!menuData) continue;
            for (const ingredient of menuData.recipe) {
                const qtyNeeded = ingredient.deduct * cartData.qty;
                if (!totalNeeds[ingredient.name]) totalNeeds[ingredient.name] = { needed: 0, id: null, currentQty: 0 };
                totalNeeds[ingredient.name].needed += qtyNeeded;
            }
        }

        const promises = Object.keys(totalNeeds).map(name => db.collection("inventory").where("name", "==", name).get());
        const snapshots = await Promise.all(promises);
        
        let missingStockMessages = [];
        snapshots.forEach(snap => {
            if (!snap.empty) {
                const doc = snap.docs[0]; const data = doc.data();
                totalNeeds[data.name].id = doc.id; totalNeeds[data.name].currentQty = data.quantity;
            }
        });

        for (let [name, data] of Object.entries(totalNeeds)) {
            if (!data.id) missingStockMessages.push(`${name} missing from DB`);
            else if (data.currentQty < data.needed) missingStockMessages.push(`${name} (Need ${data.needed})`);
        }

        if (missingStockMessages.length > 0) return showToast(`Charge paused! Missing stock: ${missingStockMessages.join(", ")}`);

        const batch = db.batch();
        for (let [name, data] of Object.entries(totalNeeds)) {
            const docRef = db.collection("inventory").doc(data.id);
            batch.update(docRef, { quantity: firebase.firestore.FieldValue.increment(-data.needed) });
        }

        // 3. Append charge to the Guest's Room Folio Ledger
        const folioRef = db.collection("folios").doc(roomDoc.data().currentFolioId);
        
        let itemsSummaryArr = [];
        for (let [itemName, data] of Object.entries(cart)) {
            itemsSummaryArr.push(`${data.qty}x ${itemName}`);
        }
        
        batch.update(folioRef, {
            posOrders: firebase.firestore.FieldValue.arrayUnion({
                itemsSummary: itemsSummaryArr.join(", "),
                amount: cartTotalRaw,
                timestamp: new Date().toISOString()
            }),
            posChargesTotal: firebase.firestore.FieldValue.increment(cartTotalRaw),
            grandTotal: firebase.firestore.FieldValue.increment(cartTotalRaw)
        });

        await batch.commit();
        showToast(`₱${cartTotalRaw.toFixed(2)} successfully charged to Room ${roomId}!`);
        clearCart();
        
    } catch(err) { 
        console.error(err); 
        showToast("Error routing charge to room."); 
    }
}
