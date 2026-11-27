// --- DIGITAL RECEIPT ANIMATION (WITH KITCHEN AUTO-PRINT) ---
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

    // AUTO-PRINT KITCHEN TICKETS AND PAID SALES INVOICES
    if (sourceAreaId === 'kitchenTicketArea' || sourceAreaId === 'customerReceiptArea') {
        setTimeout(() => {
            triggerPhysicalPrint();
        }, 400);
    }
}

// --- DUAL-PRINTER ROUTING ENGINE (FRONT DESK vs. KITCHEN) ---
const FRONT_DESK_PRINTER_NAME = "FrontDesk_Printer";
const KITCHEN_PRINTER_NAME    = "Kitchen_Printer";

async function triggerPhysicalPrint() {
    // 1. Identify which receipt area AND which physical printer to target
    let areaId = "customerReceiptArea";
    let targetPrinterName = FRONT_DESK_PRINTER_NAME; // Default to Front Desk

    if (currentPrintType === 'print-zread') {
        areaId = "zReadingArea";
        targetPrinterName = FRONT_DESK_PRINTER_NAME;
    } else if (currentPrintType === 'print-xread') {
        areaId = "xReadingArea";
        targetPrinterName = FRONT_DESK_PRINTER_NAME;
    } else if (currentPrintType === 'print-ticket') {
        areaId = "kitchenTicketArea";
        targetPrinterName = KITCHEN_PRINTER_NAME; // <-- Routes Kitchen Orders to Kitchen!
    }

    const targetEl = document.getElementById(areaId);
    if (!targetEl) return showToast("Nothing to print!");

    // 2. WINDOWS PC WITH QZ TRAY: Automatic Silent Dual-Printer Routing
    if (typeof qz !== "undefined") {
        try {
            if (!qz.websocket.isActive()) {
                await qz.websocket.connect();
            }
            const printer = await qz.printers.find(targetPrinterName);
            const config = qz.configs.create(printer, {
                margins: { top: 0, right: 0, bottom: 0, left: 0 }
            });

            // Capture the exact receipt styling as a sharp image for 80mm thermal output
            const paper = document.getElementById("animatedReceiptPaper");
            const renderNode = (paper && paper.innerHTML.trim() !== "") ? paper : targetEl;
            const canvas = await html2canvas(renderNode, { scale: 2, backgroundColor: "#ffffff" });
            const base64Image = canvas.toDataURL("image/png").split(",")[1];

            await qz.print(config, [{
                type: 'pixel',
                format: 'image',
                flavor: 'base64',
                data: base64Image
            }]);

            showToast(`Printed to ${targetPrinterName}!`);
            return;
        } catch (qzErr) {
            console.warn("QZ Tray not connected or printer name not found, falling back:", qzErr);
        }
    }

    // 3. FALLBACK FOR DESKTOP (Single Default Printer via window.print)
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
                  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    if (!isIOS) {
        document.body.classList.add(currentPrintType); 
        window.print(); 
        document.body.classList.remove(currentPrintType);
        return;
    }

    // 4. IPAD / IPHONE: Render crisp receipt image & open iOS Share Sheet
    const paper = document.getElementById("animatedReceiptPaper");
    const iosTarget = (paper && paper.innerHTML.trim() !== "") ? paper : targetEl;

    try {
        if (typeof html2canvas === "function") {
            showToast(`Preparing ${currentPrintType === 'print-ticket' ? 'Kitchen Ticket' : 'Receipt'}...`);
            const canvas = await html2canvas(iosTarget, { scale: 2, backgroundColor: "#ffffff" });
            canvas.toBlob(async (blob) => {
                const file = new File([blob], "hilom-print.png", { type: "image/png" });
                if (navigator.canShare && navigator.canShare({ files: [file] })) {
                    await navigator.share({ files: [file], title: targetPrinterName });
                }
            }, "image/png");
            return;
        }
    } catch (err) {
        console.error("iOS receipt capture error:", err);
    }
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

// ==========================================
// --- CART & KITCHEN MODIFIER LOGIC ---
// ==========================================
let activeModifierItemName = null;
let posTableElapsedTimer = null;

function addToCart(itemName, price) {
    if (cart[itemName]) {
        cart[itemName].qty += 1;
    } else {
        cart[itemName] = { qty: 1, price: Number(price) || 0, note: "" };
    }
    renderCart();
}

function updateCartQty(itemName, change) {
    if (cart[itemName]) {
        cart[itemName].qty += change;
        if (cart[itemName].qty <= 0) delete cart[itemName];
        renderCart();
    }
}

async function clearCart(skipConfirm = false) {
    if (!skipConfirm && Object.keys(cart).length > 0) {
        const confirmed = window.hilomConfirm
            ? await hilomConfirm("Clear all items from the current order?")
            : confirm("Clear all items from the current order?");
        if (!confirmed) return;
    }
    cart = {};
    const tableInput = document.getElementById("tableNoInput");
    if (tableInput) tableInput.value = "";
    renderCart();
}

function openModifierModal(itemName) {
    if (!cart[itemName]) return;
    activeModifierItemName = itemName;
    const titleEl = document.getElementById("modItemName");
    const inputEl = document.getElementById("modifierInput");
    if (titleEl) titleEl.innerText = `Note: ${itemName}`;
    if (inputEl) inputEl.value = cart[itemName].note || "";
    document.getElementById("modifierModal").classList.remove("hidden");
    if (inputEl) setTimeout(() => inputEl.focus(), 50);
}

function addQuickMod(modText) {
    const inputEl = document.getElementById("modifierInput");
    if (!inputEl) return;
    const current = inputEl.value.trim();
    if (!current) {
        inputEl.value = modText;
    } else if (!current.toLowerCase().includes(modText.toLowerCase())) {
        inputEl.value = `${current}, ${modText}`;
    }
    inputEl.focus();
}

function clearModifierInput() {
    const inputEl = document.getElementById("modifierInput");
    if (inputEl) {
        inputEl.value = "";
        inputEl.focus();
    }
}

function confirmModifierNote() {
    if (!activeModifierItemName || !cart[activeModifierItemName]) return closeModifierModal();
    const inputEl = document.getElementById("modifierInput");
    const rawNote = inputEl ? inputEl.value.trim() : "";
    const cleanNote = typeof sanitizeHTML === "function" ? sanitizeHTML(rawNote) : rawNote.replace(/[<>]/g, "");
    cart[activeModifierItemName].note = cleanNote;
    renderCart();
    closeModifierModal();
    showToast(cleanNote ? "Kitchen note saved." : "Kitchen note cleared.");
}

function closeModifierModal() {
    const modal = document.getElementById("modifierModal");
    if (modal) modal.classList.add("hidden");
    activeModifierItemName = null;
}

window.confirmAddToCart = confirmModifierNote;

function renderCart() {
    const container = document.getElementById("cartItemsContainer");
    const countBadge = document.getElementById("cartItemCountBadge");
    if (!container) return;

    cartTotalRaw = 0;
    let totalUnits = 0;
    container.innerHTML = "";

    const entries = Object.entries(cart);
    if (entries.length === 0) {
        container.innerHTML = "<p style='color:#888; text-align:center; padding: 12px 0;'>Cart is empty</p>";
        document.getElementById("cartTotal").innerText = "Total: ₱0.00";
        if (countBadge) countBadge.innerText = "0 items";
        return;
    }

    for (let [itemName, data] of entries) {
        const lineTotal = data.price * data.qty;
        cartTotalRaw += lineTotal;
        totalUnits += data.qty;

        const encoded = encodeURIComponent(itemName);
        const safeName = typeof escapeMenuHTML === "function" ? escapeMenuHTML(itemName) : itemName;
        const safeNote = data.note ? (typeof escapeMenuHTML === "function" ? escapeMenuHTML(data.note) : data.note) : "";
        const noteHTML = safeNote
            ? `<div style="margin-top: 4px;"><span style="background: #fff3cd; color: #856404; border: 1px solid #ffeeba; font-size: 11px; padding: 2px 6px; border-radius: 4px; font-weight: 600; display: inline-block;">📝 ${safeNote}</span></div>`
            : "";

        container.innerHTML += `
            <div class="cart-item" style="align-items: flex-start; gap: 8px;">
                <div style="flex: 1; min-width: 0;">
                    <div class="cart-item-title">${safeName}</div>
                    <small style="color: #666;">₱${data.price.toFixed(2)} &times; ${data.qty} = <strong style="color: #2b4227;">₱${lineTotal.toFixed(2)}</strong></small>
                    ${noteHTML}
                </div>
                <div class="cart-controls" style="display: flex; align-items: center; gap: 4px; flex-shrink: 0;">
                    <button type="button" onclick="openModifierModal(decodeURIComponent('${encoded}'))" title="Add kitchen note" style="background: ${safeNote ? "#fff3cd" : "#f4f6f4"}; color: #8c5d3a; border: 1px solid #d4a373; padding: 5px 7px; font-size: 12px;">📝</button>
                    <button type="button" onclick="updateCartQty(decodeURIComponent('${encoded}'), -1)">-</button>
                    <span style="min-width: 22px; text-align: center; font-weight: bold;">${data.qty}</span>
                    <button type="button" onclick="updateCartQty(decodeURIComponent('${encoded}'), 1)">+</button>
                </div>
            </div>`;
    }

    document.getElementById("cartTotal").innerText = `Total: ₱${cartTotalRaw.toFixed(2)}`;
    if (countBadge) countBadge.innerText = `${totalUnits} ${totalUnits === 1 ? "item" : "items"}`;
}

// --- SEND TO KITCHEN (SUPPORTS ADDITIONAL ORDERS, MERGING & MODIFIER NOTES) ---
async function sendToKitchen() {
    if (Object.keys(cart).length === 0) return showToast("Cart is empty!");
    const tableNoRaw = document.getElementById("tableNoInput").value.trim();
    if (!tableNoRaw) return showToast("Please enter a Table Number or tap Takeout / Walk-In.");
    const tableNo = tableNoRaw.toUpperCase(); 
    let checkoutTime = new Date(); 
    
    let totalNeeds = {}; 
    let newItemsPayload = {};

    for (let [itemName, cartData] of Object.entries(cart)) {
        const menuData = dynamicMenuRecipes[itemName]; 
        if (!menuData) continue;
        
        newItemsPayload[itemName] = { 
            qty: cartData.qty, 
            basePrice: cartData.price, 
            note: cartData.note || "",
            totalCost: 0, 
            deductionsString: "", 
            rawDeductions: [] 
        };
        
        for (const ingredient of menuData.recipe) {
            const qtyNeeded = ingredient.deduct * cartData.qty;
            if (!totalNeeds[ingredient.name]) {
                totalNeeds[ingredient.name] = { needed: 0, cost: 0, id: null, currentQty: 0 };
            }
            totalNeeds[ingredient.name].needed += qtyNeeded;
            newItemsPayload[itemName].rawDeductions.push({ name: ingredient.name, qty: qtyNeeded });
        }
    }

    const promises = Object.keys(totalNeeds).map(name => db.collection("inventory").where("name", "==", name).get());
    const snapshots = await Promise.all(promises);
    
    let missingStockMessages = [];
    snapshots.forEach(snap => {
        if (!snap.empty) {
            const doc = snap.docs[0]; 
            const data = doc.data();
            totalNeeds[data.name].id = doc.id; 
            totalNeeds[data.name].currentQty = data.quantity; 
            totalNeeds[data.name].cost = data.cost || 0;
        }
    });

    for (let [name, data] of Object.entries(totalNeeds)) {
        if (!data.id) missingStockMessages.push(`${name} missing from DB`);
        else if (data.currentQty < data.needed) missingStockMessages.push(`${name} (Need ${data.needed})`);
    }

    if (missingStockMessages.length > 0) {
        return showToast(`Send paused! Missing stock: ${missingStockMessages.join(", ")}`);
    }

    const batch = db.batch();
    const receiptItems = document.getElementById("ticketItems"); 
    receiptItems.innerHTML = "";

    for (let [itemName, payload] of Object.entries(newItemsPayload)) {
        let usedIngredients = []; 
        let calculatedCost = 0;
        for (let ing of payload.rawDeductions) {
            const ingCost = totalNeeds[ing.name].cost * ing.qty;
            calculatedCost += ingCost; 
            usedIngredients.push(`${ing.name} (${ing.qty})`);
        }
        payload.totalCost = calculatedCost; 
        payload.deductionsString = usedIngredients.join(", ");
        const noteLine = payload.note
            ? `<div style="font-size: 12px; font-weight: bold; padding-left: 16px; margin-bottom: 6px;">&rarr; NOTE: ${escapeMenuHTML(payload.note).toUpperCase()}</div>`
            : "";
        receiptItems.innerHTML += `<div class="receipt-item"><span><b>${payload.qty}x</b> ${escapeMenuHTML(itemName).toUpperCase()}</span></div>${noteLine}`;
    }

    for (let [name, data] of Object.entries(totalNeeds)) {
        const docRef = db.collection("inventory").doc(data.id);
        batch.update(docRef, { quantity: firebase.firestore.FieldValue.increment(-data.needed) });
    }

    let existingTableId = null;
    let existingTableData = null;
    for (let [id, data] of Object.entries(activeTablesData)) {
        if (!data.chargedToFolio && data.tableNo.toUpperCase() === tableNo) {
            existingTableId = id;
            existingTableData = data;
            break;
        }
    }

    if (existingTableId && existingTableData) {
        let mergedItems = JSON.parse(JSON.stringify(existingTableData.items || {}));
        
        for (let [itemName, newPayload] of Object.entries(newItemsPayload)) {
            if (mergedItems[itemName]) {
                mergedItems[itemName].qty += newPayload.qty;
                mergedItems[itemName].totalCost += newPayload.totalCost;
                if (newPayload.note) {
                    const prevNote = mergedItems[itemName].note || "";
                    mergedItems[itemName].note = prevNote
                        ? (prevNote.includes(newPayload.note) ? prevNote : `${prevNote} | ${newPayload.note}`)
                        : newPayload.note;
                }
                
                let combinedMap = {};
                (mergedItems[itemName].rawDeductions || []).forEach(d => {
                    combinedMap[d.name] = (combinedMap[d.name] || 0) + d.qty;
                });
                newPayload.rawDeductions.forEach(d => {
                    combinedMap[d.name] = (combinedMap[d.name] || 0) + d.qty;
                });
                
                mergedItems[itemName].rawDeductions = Object.entries(combinedMap).map(([n, q]) => ({ name: n, qty: q }));
                mergedItems[itemName].deductionsString = mergedItems[itemName].rawDeductions.map(d => `${d.name} (${d.qty})`).join(", ");
            } else {
                mergedItems[itemName] = newPayload;
            }
        }

        const updatedSubtotal = (existingTableData.subtotal || 0) + cartTotalRaw;
        const existingTableRef = db.collection("active_tables").doc(existingTableId);
        
        batch.update(existingTableRef, {
            items: mergedItems,
            subtotal: updatedSubtotal,
            served: false,
            lastUpdated: checkoutTime
        });

        try {
            await batch.commit();
            showToast(`Additional order added to ${tableNo}!`);
            document.getElementById("ticketTableNo").innerText = `${tableNo} (ADD-ON)`; 
            document.getElementById("ticketTime").innerText = checkoutTime.toLocaleTimeString();
            showDigitalReceipt('kitchenTicketArea'); 
            clearCart(true);
        } catch(err) { 
            showToast("Network error updating order."); 
            console.error(err); 
        }

    } else {
        const newTableRef = db.collection("active_tables").doc();
        batch.set(newTableRef, { 
            tableNo: tableNo, 
            subtotal: cartTotalRaw, 
            items: newItemsPayload, 
            timestamp: checkoutTime 
        });

        try {
            await batch.commit();
            showToast(`${tableNo} Sent to Kitchen!`);
            document.getElementById("ticketTableNo").innerText = `${tableNo}`; 
            document.getElementById("ticketTime").innerText = checkoutTime.toLocaleTimeString();
            showDigitalReceipt('kitchenTicketArea'); 
            clearCart(true);
        } catch(err) { 
            showToast("Network error saving order."); 
            console.error(err); 
        }
    }
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
        tableItemsPayload[itemName] = { qty: cartData.qty, basePrice: cartData.price, note: cartData.note || "", totalCost: 0, deductionsString: "", rawDeductions: [] };
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

    const newTableRef = db.collection("active_tables").doc();
    batch.set(newTableRef, { tableNo: tableNo, subtotal: cartTotalRaw, items: tableItemsPayload, timestamp: checkoutTime, skipKitchen: true });

    try {
        await batch.commit();
        activeTablesData[newTableRef.id] = { tableNo: tableNo, subtotal: cartTotalRaw, items: tableItemsPayload, timestamp: { toDate: () => checkoutTime }, skipKitchen: true };
        clearCart(true);
        openBillingModal(newTableRef.id);
    } catch(err) { showToast("Error during direct checkout."); console.error(err); }
}

// --- VISUAL MAP & ACTIVE TABLES ---
function formatElapsedMins(ts) {
    if (!ts) return "Now";
    const d = typeof ts.toDate === "function" ? ts.toDate() : new Date(ts);
    const mins = Math.max(0, Math.floor((Date.now() - d.getTime()) / 60000));
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    return `${hrs}h ${mins % 60}m`;
}

function loadActiveTables() {
    db.collection("active_tables").orderBy("timestamp", "asc").onSnapshot((snapshot) => {
        activeTablesData = {};
        snapshot.forEach(doc => { activeTablesData[doc.id] = doc.data(); });
        renderTableMap();
        if(typeof renderKitchenBoard === "function") renderKitchenBoard();
    });

    if (!posTableElapsedTimer) {
        posTableElapsedTimer = setInterval(() => {
            if (Object.keys(activeTablesData || {}).length > 0) {
                renderTableMap();
            }
        }, 30000);
    }
}

function renderTableMap() {
    const container = document.getElementById("activeTablesContainer"); 
    if (!container) return;

    const countBadge = document.getElementById("activeTablesCountBadge");
    container.innerHTML = "";
    const standardTables = ["T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8", "T9"];
    let mapHTML = '<div class="table-map-grid">';
    let usedStandardIds = [];
    let openCount = 0;

    standardTables.forEach(tableName => {
        let activeId = null; let activeData = null;
        for (let [id, data] of Object.entries(activeTablesData)) {
            if (!data.chargedToFolio && data.tableNo === tableName) {
                activeId = id; activeData = data; usedStandardIds.push(id); break;
            }
        }

        if (activeId) {
            openCount++;
            const elapsed = formatElapsedMins(activeData.timestamp);
            const statusPill = activeData.served
                ? `<span style="background: #e8f5e9; color: #2e7d32; font-size: 9px; padding: 1px 5px; border-radius: 8px; font-weight: bold;">✓ Ready</span>`
                : `<span style="background: #fff3cd; color: #8c5d3a; font-size: 9px; padding: 1px 5px; border-radius: 8px; font-weight: bold;">🍳 ${elapsed}</span>`;

            mapHTML += `
                <div class="map-table occupied" onclick="openBillingModal('${activeId}')" style="height: auto; min-height: 68px; padding: 6px 4px; gap: 2px;">
                    <div style="font-weight: bold; color: #8c5d3a; font-size: 13px;">${tableName}</div>
                    <div style="font-size: 12px; color: #bd4b4b; font-weight: bold;">₱${(activeData.subtotal || 0).toFixed(2)}</div>
                    ${statusPill}
                </div>`;
        } else {
            mapHTML += `
                <div class="map-table empty" onclick="selectTableForOrder('${tableName}')" style="min-height: 68px;">
                    <div style="font-weight: bold;">${tableName}</div>
                    <div style="font-size: 11px;">Available</div>
                </div>`;
        }
    });
    mapHTML += '</div>';

    let customHTML = "";
    for (let [id, data] of Object.entries(activeTablesData)) {
        if (data.chargedToFolio) continue;
        if (!usedStandardIds.includes(id)) {
            openCount++;
            const elapsed = formatElapsedMins(data.timestamp);
            const itemCount = Object.values(data.items || {}).reduce((sum, i) => sum + (Number(i.qty) || 0), 0);
            const statusTag = data.served
                ? `<span style="background: #e8f5e9; color: #2e7d32; padding: 2px 6px; border-radius: 8px; font-size: 10px; font-weight: bold;">✓ Ready</span>`
                : `<span style="background: #fff3cd; color: #8c5d3a; padding: 2px 6px; border-radius: 8px; font-size: 10px; font-weight: bold;">🍳 ${elapsed}</span>`;

            customHTML += `
                <div class="table-item" style="padding: 10px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; font-weight: bold; color: #2b4227; margin-bottom: 5px;">
                        <span>${escapeMenuHTML(data.tableNo)}</span>
                        ${statusTag}
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <span style="font-weight: bold; color: #bd4b4b;">₱${(data.subtotal || 0).toFixed(2)}</span>
                        <small style="color: #666;">${itemCount} ${itemCount === 1 ? "item" : "items"}</small>
                    </div>
                    <button class="save-btn" style="width: 100%; font-size:12px; padding: 6px;" onclick="openBillingModal('${id}')">Open Bill</button>
                </div>`;
        }
    }

    if (countBadge) countBadge.innerText = `${openCount} open`;
    if (customHTML) { mapHTML += `<h3 style="font-size:14px; margin-top:0; border-bottom: none; color: #8c5d3a;">Takeout / Custom Tables</h3>` + customHTML; }
    container.innerHTML = mapHTML;
}

function selectTableForOrder(tableName) {
    document.getElementById("tableNoInput").value = tableName;
    showToast(`${tableName} selected.`);
}

// --- VOID TABLES ---
async function voidActiveTable(tableId) {
    const confirmed = window.hilomConfirm
        ? await hilomConfirm("Void this entire table? Ingredients will be restored to inventory.")
        : confirm("Void this entire table? Ingredients will be restored to inventory.");
    if (!confirmed) return;
    const tableData = activeTablesData[tableId];
    if (!tableData) return;
    
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

    const voidedSummary = Object.entries(tableData.items || {}).map(([n, d]) => `${d.qty}x ${n}`).join(", ");
    const actorName = typeof window.getAuditActor === "function" ? window.getAuditActor() : "Staff";
    const authorizerName = window.lastPinAuthorizer || "Manager PIN";
    const auditRef = db.collection("audit_logs").doc();
    batch.set(auditRef, {
        category: "TRANSACTION",
        action: "VOID_ORDER",
        tableNo: tableData.tableNo,
        amount: Number(tableData.subtotal) || 0,
        performedBy: actorName,
        authorizedBy: authorizerName,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        details: `Voided open table (${voidedSummary || Object.keys(tableData.items || {}).length + " items"}). Inventory restored.`
    });

    batch.delete(db.collection("active_tables").doc(tableId));

    if (tableData.isRoomFolio && tableData.roomId) {
        batch.update(db.collection("rooms").doc(tableData.roomId), {
            status: "AVAILABLE", activeTableId: null, currentGuestName: null
        });
    }
    
    try { 
        await batch.commit(); 
        showToast("Table voided and recorded in Audit Log."); 
    } catch(e) { 
        showToast("Error voiding table."); 
        console.error(e); 
    }
}

function voidActiveTableModal() { if(activeBillingTableId) { voidActiveTable(activeBillingTableId).then(() => { closeBillingModal(); }); } }

// --- BILLING MODAL & MATH ---
let discountAuthorizedBy = null;

function openBillingModal(tableId) {
    activeBillingTableId = tableId;
    discountAuthorizedBy = null;
    const data = activeTablesData[tableId];
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

function closeBillingModal() { 
    document.getElementById("billingModal").classList.add("hidden"); 
    activeBillingTableId = null; 
}

function addMoreToActiveTable() {
    if (!activeBillingTableId || !activeTablesData[activeBillingTableId]) return;
    const tableName = activeTablesData[activeBillingTableId].tableNo;
    closeBillingModal();
    document.getElementById("tableNoInput").value = tableName;
    showToast(`Adding items to ${tableName}. Select menu items and click Send to Kitchen.`);
}

async function toggleDiscountInputs() {
    const checkEl = document.getElementById("discountCheck");
    const isSenior = checkEl.checked;
    if (isSenior) {
        if (!discountAuthorizedBy) {
            const isAuth = await requestAdminPin();
            if (!isAuth) {
                checkEl.checked = false;
                document.getElementById("seniorDetailsRow").classList.add("hidden");
                showToast("Manager PIN required for Senior/PWD discount.");
                updateBillingTotal();
                return;
            }
            discountAuthorizedBy = window.lastPinAuthorizer || "Manager PIN";
            showToast(`Discount authorized by ${discountAuthorizedBy}`);
        }
        document.getElementById("seniorDetailsRow").classList.remove("hidden");
    } else {
        document.getElementById("seniorDetailsRow").classList.add("hidden");
        document.getElementById("seniorNameInput").value = "";
        document.getElementById("seniorIdInput").value = "";
        if (!document.getElementById("freeBreakfastCheck").checked) {
            discountAuthorizedBy = null;
        }
    }
    updateBillingTotal();
}

async function toggleFreeBreakfast() {
    const checkEl = document.getElementById("freeBreakfastCheck");
    const isFreeBF = checkEl.checked;
    if (isFreeBF) {
        if (!discountAuthorizedBy) {
            const isAuth = await requestAdminPin();
            if (!isAuth) {
                checkEl.checked = false;
                showToast("Manager PIN required for Complimentary Breakfast.");
                updateBillingTotal();
                return;
            }
            discountAuthorizedBy = window.lastPinAuthorizer || "Manager PIN";
            showToast(`Complimentary waiver authorized by ${discountAuthorizedBy}`);
        }
    } else {
        if (!document.getElementById("discountCheck").checked) {
            discountAuthorizedBy = null;
        }
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

    const bName = sanitizeHTML(document.getElementById("buyerNameInput").value.trim());
    const bTin = sanitizeHTML(document.getElementById("buyerTinInput").value.trim());
    const bAddress = sanitizeHTML(document.getElementById("buyerAddressInput").value.trim());

    document.getElementById("receiptHeaderTitle").innerHTML = "BILLING STATEMENT<br><span style='font-size:12px; font-weight:normal;'>THIS IS NOT AN OFFICIAL RECEIPT</span>";
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

// --- PROCESS PAYMENT (BIR COMPLIANT TRANSACTION) ---
async function processPayment() {
    if(!activeBillingTableId) return;
    const data = activeTablesData[activeBillingTableId]; 
    const isSenior = document.getElementById("discountCheck").checked;
    const isFreeBF = document.getElementById("freeBreakfastCheck").checked;
    const method = document.getElementById("paymentMethod").value;
    const payTime = new Date();

    // Defense-in-depth: Re-verify Manager authorization if any discount/waiver is active
    if ((isSenior || isFreeBF) && !discountAuthorizedBy) {
        const isAuth = await requestAdminPin();
        if (!isAuth) {
            return showToast("Payment paused: Manager PIN required to apply discounts.");
        }
        discountAuthorizedBy = window.lastPinAuthorizer || "Manager PIN";
    }

    const bName = sanitizeHTML(document.getElementById("buyerNameInput").value.trim());
    const bTin = sanitizeHTML(document.getElementById("buyerTinInput").value.trim());
    const bAddress = sanitizeHTML(document.getElementById("buyerAddressInput").value.trim());

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

    // Prepare database references
    const configRef = db.collection('config').doc('system');
    const newSaleRef = db.collection("sales").doc();
    const tableRef = db.collection("active_tables").doc(activeBillingTableId);
    
    try {
        // EXECUTE ATOMIC TRANSACTION
        const finalInvString = await db.runTransaction(async (transaction) => {
            // 1. Read the current counter (Locks the document)
            const configDoc = await transaction.get(configRef);
            let invNum = configDoc.exists ? (configDoc.data().invoiceCount || 1) : 1;
            let currentGT = configDoc.exists ? (configDoc.data().grandTotal || 0) : 0;
            let invString = "INV-" + String(invNum).padStart(6, '0');

            // 2. Write the new sale securely using the guaranteed number
            transaction.set(newSaleRef, {
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
                discountAuthorizedBy: (isSenior || isFreeBF) ? (discountAuthorizedBy || "Manager PIN") : null,
                seniorDetails: isSenior ? { name: sanitizeHTML(document.getElementById('seniorNameInput').value), id: sanitizeHTML(document.getElementById('seniorIdInput').value) } : null,
                buyerDetails: (bName || bTin || bAddress) ? { name: bName, tin: bTin, address: bAddress } : null
            });

            if (totalDiscount > 0) {
                const discAuditRef = db.collection("audit_logs").doc();
                const actorName = typeof window.getAuditActor === "function" ? window.getAuditActor() : "Staff";
                transaction.set(discAuditRef, {
                    category: "TRANSACTION",
                    action: "DISCOUNT_APPLIED",
                    tableNo: `${invString} (${data.tableNo})`,
                    amount: Number(totalDiscount) || 0,
                    performedBy: actorName,
                    authorizedBy: discountAuthorizedBy || "Manager PIN",
                    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                    details: `${invString}: ${isSenior ? "Senior/PWD (20%)" : ""}${isSenior && isFreeBF ? " + " : ""}${isFreeBF ? "Complimentary Breakfast" : ""} (-₱${totalDiscount.toFixed(2)} off ₱${subtotal.toFixed(2)})`
                });
            }

            // 3. Update the master counter and grand total
transaction.set(configRef, { 
    invoiceCount: invNum + 1, 
    grandTotal: currentGT + finalTotal 
}, { merge: true });
            // 4. Delete the active table
            transaction.delete(tableRef);

            // 5. Release room if checking out from a Room Folio
            if (data.isRoomFolio && data.roomId) {
                const roomRef = db.collection("rooms").doc(data.roomId);
                transaction.update(roomRef, {
                    status: "AVAILABLE", activeTableId: null, currentGuestName: null
                });
            }

            return invString; // Pass the final invoice number to the UI
        });

        // TRANSACTION SUCCESSFUL: Update Receipt UI
        document.getElementById("receiptHeaderTitle").innerText = "SALES INVOICE";
        document.getElementById("receiptInvoiceNo").innerText = finalInvString;
        document.getElementById("receiptTableNo").innerText = `${data.tableNo}`;
        document.getElementById("receiptTime").innerText = payTime.toLocaleString();
        
        if(bName || bTin || bAddress) {
            document.getElementById("receiptBuyerInfo").classList.remove("hidden");
            document.getElementById("receiptBuyerName").innerText = bName || "-";
            document.getElementById("receiptBuyerTin").innerText = bTin || "-";
            document.getElementById("receiptBuyerAddress").innerText = bAddress || "-";
        } else { document.getElementById("receiptBuyerInfo").classList.add("hidden"); }

        const receiptItems = document.getElementById("receiptItems"); receiptItems.innerHTML = "";
        for (let [itemName, itemData] of Object.entries(data.items)) {
            let itemPrice = itemData.basePrice * itemData.qty; 
            receiptItems.innerHTML += `<div class="receipt-item" style="display:flex; justify-content:space-between; margin-bottom:5px;"><span>${itemData.qty}x ${itemName}</span><span>₱${itemPrice.toFixed(2)}</span></div>`;
        }

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

        closeBillingModal(); 
        showToast("Invoice Generated & Saved!");
        showDigitalReceipt('customerReceiptArea');

    } catch(err) {
        console.error("Transaction failed: ", err); 
        showToast("Network error: Could not secure invoice number. Please try again."); 
    }
}

// ==========================================
// --- MENU BUILDER & POS MENU (UNIFIED) ---
// ==========================================
let menuInventoryMap = {};
let menuInventoryList = [];
let menuInventoryListener = null;

function escapeMenuHTML(val) {
    return String(val ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

let activePosCategory = "ALL";

window.POS_CATEGORY_THEMES = {
    "Meals":      { bg: "linear-gradient(135deg, #557a46, #3b592f)", tabBg: "#e8f5e9", tabText: "#2b4227", tabBorder: "#a5d6a7" },
    "Entrées":    { bg: "linear-gradient(135deg, #a66838, #7d4a23)", tabBg: "#fff3e0", tabText: "#8c5d3a", tabBorder: "#ffcc80" },
    "Entrees":    { bg: "linear-gradient(135deg, #a66838, #7d4a23)", tabBg: "#fff3e0", tabText: "#8c5d3a", tabBorder: "#ffcc80" },
    "Drinks":     { bg: "linear-gradient(135deg, #2b7a78, #1f5c5a)", tabBg: "#e0f2f1", tabText: "#00695c", tabBorder: "#80cbc4" },
    "Beverages":  { bg: "linear-gradient(135deg, #2b7a78, #1f5c5a)", tabBg: "#e0f2f1", tabText: "#00695c", tabBorder: "#80cbc4" },
    "Coffee":     { bg: "linear-gradient(135deg, #6d4c41, #4e342e)", tabBg: "#efebe9", tabText: "#4e342e", tabBorder: "#bcaaa4" },
    "Bar":        { bg: "linear-gradient(135deg, #6a1b9a, #4a148c)", tabBg: "#f3e5f5", tabText: "#6a1b9a", tabBorder: "#ce93d8" },
    "Desserts":   { bg: "linear-gradient(135deg, #ad1457, #880e4f)", tabBg: "#fce4ec", tabText: "#ad1457", tabBorder: "#f48fb1" },
    "Pastries":   { bg: "linear-gradient(135deg, #c77c2e, #9c5b19)", tabBg: "#fff8e1", tabText: "#9c5b19", tabBorder: "#ffe082" },
    "Add-ons":    { bg: "linear-gradient(135deg, #4a6fa5, #35527d)", tabBg: "#e3f2fd", tabText: "#1565c0", tabBorder: "#90caf9" },
    "Snacks":     { bg: "linear-gradient(135deg, #d87a2c, #b05c18)", tabBg: "#fff3e0", tabText: "#bf360c", tabBorder: "#ffab91" }
};

const POS_FALLBACK_THEMES = [
    { bg: "linear-gradient(135deg, #4b7bec, #3867d6)", tabBg: "#e8eaf6", tabText: "#283593", tabBorder: "#9fa8da" },
    { bg: "linear-gradient(135deg, #20bf6b, #0fb9b1)", tabBg: "#e0f7fa", tabText: "#006064", tabBorder: "#80deea" },
    { bg: "linear-gradient(135deg, #8854d0, #6c3cb9)", tabBg: "#ede7f6", tabText: "#4527a0", tabBorder: "#b39ddb" },
    { bg: "linear-gradient(135deg, #b36b39, #8c4f24)", tabBg: "#fbe9e7", tabText: "#8c4f24", tabBorder: "#ffab91" }
];

function getPosCategoryTheme(catName) {
    if (window.POS_CATEGORY_THEMES && window.POS_CATEGORY_THEMES[catName]) {
        return window.POS_CATEGORY_THEMES[catName];
    }
    let hash = 0;
    const str = String(catName || "Meals");
    for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) % 997;
    return POS_FALLBACK_THEMES[Math.abs(hash) % POS_FALLBACK_THEMES.length];
}

function setPosCategory(catName) {
    activePosCategory = catName;
    renderPosCategoryTabs();
    renderPosMenuGrid();
}

function renderPosCategoryTabs() {
    const tabsEl = document.getElementById("posCategoryTabs");
    if (!tabsEl) return;

    const allCats = new Set(Array.isArray(menuCategories) ? menuCategories : []);
    Object.values(dynamicMenuDocs || {}).forEach((item) => {
        if (item.category) allCats.add(item.category);
    });

    const catArray = Array.from(allCats);
    if (activePosCategory !== "ALL" && !allCats.has(activePosCategory)) {
        activePosCategory = "ALL";
    }

    const isAllActive = activePosCategory === "ALL";
    let html = `
        <button type="button" onclick="setPosCategory('ALL')" style="padding: 7px 14px; border-radius: 20px; font-size: 12px; cursor: pointer; background: ${isAllActive ? "#2b4227" : "#eef2ee"}; color: ${isAllActive ? "#fff" : "#2b4227"}; border: 1.5px solid ${isAllActive ? "#2b4227" : "#c8dac8"};">
            All (${Object.keys(dynamicMenuDocs || {}).length})
        </button>`;

    catArray.forEach((cat) => {
        const count = Object.values(dynamicMenuDocs || {}).filter((i) => (i.category || "Meals") === cat).length;
        const theme = getPosCategoryTheme(cat);
        const isActive = activePosCategory === cat;
        const encoded = encodeURIComponent(cat);
        html += `
            <button type="button" onclick="setPosCategory(decodeURIComponent('${encoded}'))" style="padding: 7px 14px; border-radius: 20px; font-size: 12px; cursor: pointer; background: ${isActive ? theme.tabText : theme.tabBg}; color: ${isActive ? "#fff" : theme.tabText}; border: 1.5px solid ${isActive ? theme.tabText : theme.tabBorder};">
                ${escapeMenuHTML(cat)} (${count})
            </button>`;
    });

    tabsEl.innerHTML = html;
}

function getItemIngredientStockStatus(recipe) {
    if (!Array.isArray(recipe) || recipe.length === 0 || Object.keys(menuInventoryMap || {}).length === 0) {
        return "OK";
    }
    let hasLow = false;
    for (const ing of recipe) {
        const inv = menuInventoryMap[ing.name];
        const need = Number(ing.deduct) || 0;
        if (need <= 0) continue;
        if (!inv || inv.quantity < need) return "OUT";
        if (inv.quantity < need * 3) hasLow = true;
    }
    return hasLow ? "LOW" : "OK";
}

function renderPosMenuGrid() {
    const container = document.getElementById("menuGridContainer");
    if (!container) return;

    const searchEl = document.getElementById("posMenuSearch");
    const searchTerm = searchEl ? searchEl.value.trim().toLowerCase() : "";

    const allItems = Object.values(dynamicMenuDocs || {});
    const filtered = allItems.filter((item) => {
        const cat = item.category || "Meals";
        const matchCat = activePosCategory === "ALL" || cat === activePosCategory;
        const matchSearch = !searchTerm || (item.name || "").toLowerCase().includes(searchTerm) || cat.toLowerCase().includes(searchTerm);
        return matchCat && matchSearch;
    });

    container.innerHTML = "";
    if (filtered.length === 0) {
        container.innerHTML = `<p style="color:#888; text-align:center; padding: 30px 10px;">${allItems.length === 0 ? "No menu items yet. Add items in Menu Builder." : "No matching menu items found."}</p>`;
        return;
    }

    let categories = {};
    filtered.forEach((item) => {
        const cat = item.category || "Meals";
        if (!categories[cat]) categories[cat] = [];
        categories[cat].push(item);
    });

    for (const [cat, items] of Object.entries(categories)) {
        items.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
        const theme = getPosCategoryTheme(cat);
        let catHTML = `<h3 style="color: ${theme.tabText}; border-bottom-color: ${theme.tabBorder};">${escapeMenuHTML(cat)}</h3><div class="menu-grid">`;

        items.forEach((item) => {
            const encodedName = encodeURIComponent(item.name || "");
            const priceVal = Number(item.price) || 0;
            const stockStatus = getItemIngredientStockStatus(item.recipe);

            if (!item.available) {
                catHTML += `
                    <div class="menu-item-container">
                        <button class="order-btn" onclick="showToast(decodeURIComponent('${encodedName}') + ' is currently Sold Out (86).')" style="background: #b0b7b0; opacity: 0.65; cursor: not-allowed; box-shadow: none;">
                            <span style="text-decoration: line-through;">${escapeMenuHTML(item.name)}</span><br>
                            <small style="background: #bd4b4b; color: white; padding: 2px 6px; border-radius: 4px; font-weight: bold; display: inline-block; margin-top: 4px;">SOLD OUT</small>
                        </button>
                    </div>`;
            } else {
                let stockBadge = "";
                if (stockStatus === "OUT") {
                    stockBadge = `<br><small style="background: rgba(189,75,75,0.92); color: white; padding: 1px 6px; border-radius: 4px; font-size: 10px; display: inline-block; margin-top: 4px;">⚠️ No Stock</small>`;
                } else if (stockStatus === "LOW") {
                    stockBadge = `<br><small style="background: rgba(255,243,205,0.95); color: #856404; padding: 1px 6px; border-radius: 4px; font-size: 10px; display: inline-block; margin-top: 4px;">Low Stock</small>`;
                }

                catHTML += `
                    <div class="menu-item-container">
                        <button class="order-btn" onclick="addToCart(decodeURIComponent('${encodedName}'), ${priceVal})" style="background: ${theme.bg};">
                            ${escapeMenuHTML(item.name)}<br><small>₱${priceVal.toFixed(2)}</small>${stockBadge}
                        </button>
                        <div class="menu-actions no-print">
                            <button class="action-circle" style="background:#d4a373;" onclick="editMenuItem('${item.id}')">✎</button>
                            <button class="action-circle" style="background:#bd4b4b;" onclick="deleteMenuItem('${item.id}')">✕</button>
                        </div>
                    </div>`;
            }
        });

        catHTML += `</div>`;
        container.innerHTML += catHTML;
    }
}

function loadMenuInventory() {
    if (menuInventoryListener !== null) return;
    menuInventoryListener = db.collection("inventory").orderBy("name").onSnapshot((snapshot) => {
        menuInventoryMap = {};
        menuInventoryList = [];
        snapshot.forEach((doc) => {
            const d = doc.data();
            const entry = {
                id: doc.id,
                name: d.name || "",
                unit: d.unit || "pcs",
                cost: Number(d.cost) || 0,
                quantity: Number(d.quantity) || 0
            };
            menuInventoryMap[entry.name] = entry;
            menuInventoryList.push(entry);
        });
        renderPosMenuGrid();
        renderAdminMenuBoard();
        refreshOpenIngredientSelects();
        calculateMenuMargin();
    }, (err) => {
        console.warn("Menu inventory sync error:", err);
    });
}

function loadMenu() {
    loadMenuInventory();
    db.collection("menu").orderBy("category").onSnapshot((snapshot) => {
        dynamicMenuRecipes = {};
        dynamicMenuDocs = {};

        snapshot.forEach((doc) => {
            const item = doc.data();
            const isAvailable = item.available !== false;
            dynamicMenuRecipes[item.name] = {
                recipe: item.recipe || [],
                price: Number(item.price) || 0,
                available: isAvailable
            };
            dynamicMenuDocs[doc.id] = { id: doc.id, ...item, available: isAvailable };
        });

        renderPosCategoryTabs();
        renderPosMenuGrid();
        renderAdminMenuBoard();
    });
}

function loadAdminMenuBoard() {
    loadMenuInventory();
    renderAdminMenuBoard();
}

function computeRecipeCost(recipe) {
    if (!Array.isArray(recipe) || recipe.length === 0) return { cost: 0, missing: [] };
    let total = 0;
    let missing = [];
    recipe.forEach((ing) => {
        const inv = menuInventoryMap[ing.name];
        const qty = Number(ing.deduct) || 0;
        if (inv) {
            total += inv.cost * qty;
        } else if (ing.name) {
            missing.push(ing.name);
        }
    });
    return { cost: total, missing };
}

function renderAdminMenuBoard() {
    const adminGrid = document.getElementById("adminMenuGridContainer");
    if (!adminGrid) return;

    const allItems = Object.values(dynamicMenuDocs || {});
    const searchEl = document.getElementById("menuSearchInput");
    const catFilterEl = document.getElementById("menuAdminCatFilter");
    const searchTerm = searchEl ? searchEl.value.trim().toLowerCase() : "";
    const activeCat = catFilterEl ? catFilterEl.value : "ALL";

    // Update Summary Metrics
    let availCount = 0;
    let soldOutCount = 0;
    let noRecipeCount = 0;
    allItems.forEach((item) => {
        if (item.available !== false) availCount++;
        else soldOutCount++;
        if (!item.recipe || item.recipe.length === 0) noRecipeCount++;
    });

    const mTotal = document.getElementById("menuMetricTotal");
    const mAvail = document.getElementById("menuMetricAvailable");
    const mSold = document.getElementById("menuMetricSoldOut");
    const mNoRec = document.getElementById("menuMetricNoRecipe");
    if (mTotal) mTotal.innerText = allItems.length;
    if (mAvail) mAvail.innerText = availCount;
    if (mSold) mSold.innerText = soldOutCount;
    if (mNoRec) mNoRec.innerText = noRecipeCount;

    const filtered = allItems.filter((item) => {
        const cat = item.category || "Uncategorized";
        const matchesCat = activeCat === "ALL" || cat === activeCat;
        const matchesSearch = !searchTerm || (item.name || "").toLowerCase().includes(searchTerm);
        return matchesCat && matchesSearch;
    });

    adminGrid.innerHTML = "";
    if (filtered.length === 0) {
        adminGrid.innerHTML = `<p style="color:#888; text-align:center; padding: 20px;">${allItems.length === 0 ? "No menu items yet. Click '+ Add Menu Item' to create one!" : "No menu items match your search or category filter."}</p>`;
        return;
    }

    let categories = {};
    filtered.forEach((item) => {
        const cat = item.category || "Uncategorized";
        if (!categories[cat]) categories[cat] = [];
        categories[cat].push(item);
    });

    for (const [category, items] of Object.entries(categories)) {
        items.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));

        let catHTML = `
            <h4 style="width: 100%; border-bottom: 2px solid #e0e5e0; padding-bottom: 6px; margin-top: 22px; margin-bottom: 14px; color: #2b4227; font-size: 15px; letter-spacing: 0.5px; text-transform: uppercase;">
                ${escapeMenuHTML(category)} <span style="font-size: 12px; color: #888; font-weight: normal;">(${items.length})</span>
            </h4>
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 14px; margin-bottom: 20px;">
        `;

        items.forEach((item) => {
            const isAvail = item.available !== false;
            const price = Number(item.price) || 0;
            const recipe = Array.isArray(item.recipe) ? item.recipe : [];
            const { cost, missing } = computeRecipeCost(recipe);

            let metaBadgeHTML = "";
            if (recipe.length === 0) {
                metaBadgeHTML = `<div style="font-size: 11px; color: #8c5d3a; background: #fff3cd; border: 1px solid #ffeeba; padding: 3px 8px; border-radius: 4px; margin-top: 8px; display: inline-block;">No recipe linked</div>`;
            } else {
                const marginPct = price > 0 ? ((price - cost) / price) * 100 : 0;
                const marginColor = marginPct >= 50 ? "#2e7d32" : (marginPct >= 25 ? "#8c5d3a" : "#bd4b4b");
                const marginBg = marginPct >= 50 ? "#e8f5e9" : (marginPct >= 25 ? "#fff3cd" : "#ffebee");
                const missingWarn = missing.length > 0 ? ` • ⚠️ ${missing.length} missing` : "";
                metaBadgeHTML = `
                    <div style="font-size: 11px; color: ${marginColor}; background: ${marginBg}; padding: 4px 8px; border-radius: 4px; margin-top: 8px; display: inline-block; font-weight: 600;">
                        ${recipe.length} ing • Cost ₱${cost.toFixed(2)} (${marginPct.toFixed(0)}%)${missingWarn}
                    </div>`;
            }

            const cardBorder = isAvail ? "#e0e5e0" : "#f5c6cb";
            const cardBg = isAvail ? "#ffffff" : "#fffafa";
            const toggleBg = isAvail ? "#e8f5e9" : "#ffebee";
            const toggleColor = isAvail ? "#2e7d32" : "#bd4b4b";
            const toggleBorder = isAvail ? "#c8e6c9" : "#f5c6cb";
            const toggleLabel = isAvail ? "🟢 Available" : "🔴 Sold Out (86)";

            catHTML += `
                <div style="background: ${cardBg}; border: 1.5px solid ${cardBorder}; border-radius: 10px; overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 2px 6px rgba(0,0,0,0.03);">
                    <div style="padding: 10px 12px 0 12px; display: flex; justify-content: flex-end;">
                        <button onclick="toggleMenuAvailability('${item.id}', ${isAvail})" title="Click to toggle Available / Sold Out" style="background: ${toggleBg}; color: ${toggleColor}; border: 1px solid ${toggleBorder}; padding: 3px 9px; border-radius: 12px; font-size: 11px; font-weight: bold; cursor: pointer;">
                            ${toggleLabel}
                        </button>
                    </div>
                    <div style="padding: 10px 14px 14px 14px; text-align: center; flex-grow: 1; display: flex; flex-direction: column; justify-content: center; align-items: center;">
                        <div style="font-weight: 700; color: ${isAvail ? "#222" : "#888"}; text-decoration: ${isAvail ? "none" : "line-through"}; margin-bottom: 4px; font-size: 15px; line-height: 1.3;">${escapeMenuHTML(item.name)}</div>
                        <div style="color: #557a46; font-size: 16px; font-weight: bold;">₱${price.toFixed(2)}</div>
                        ${metaBadgeHTML}
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; border-top: 1px solid #eee; background: #fcfbf8;">
                        <button onclick="editMenuItem('${item.id}')" style="padding: 10px 0; background: transparent; color: #4a6fa5; border: none; border-right: 1px solid #eee; cursor: pointer; font-size: 13px; font-weight: bold; border-radius: 0;">✏️ Edit</button>
                        <button onclick="deleteMenuItem('${item.id}')" style="padding: 10px 0; background: transparent; color: #bd4b4b; border: none; cursor: pointer; font-size: 13px; font-weight: bold; border-radius: 0;">🗑️ Delete</button>
                    </div>
                </div>
            `;
        });

        catHTML += `</div>`;
        adminGrid.innerHTML += catHTML;
    }
}

// --- MODAL CONTROLS ---
function openMenuModal() {
    resetMenuForm();
    const titleEl = document.getElementById("menuModalTitle");
    if (titleEl) titleEl.innerText = "Create New Menu Item";
    document.getElementById("menuItemModal").classList.remove("hidden");
    setTimeout(() => document.getElementById("newMenuName").focus(), 50);
}

function closeMenuModal() {
    const modal = document.getElementById("menuItemModal");
    if (modal) modal.classList.add("hidden");
    resetMenuForm();
}

function openCategoryModal() {
    document.getElementById("categoryModal").classList.remove("hidden");
    setTimeout(() => document.getElementById("newCategoryName").focus(), 50);
}

function closeCategoryModal() {
    const modal = document.getElementById("categoryModal");
    if (modal) modal.classList.add("hidden");
}

// --- INVENTORY INGREDIENT DROPDOWN & LIVE MARGIN CALCULATOR ---
function buildInventoryOptionsHTML(selectedName = "") {
    let options = `<option value="">-- Select Inventory Ingredient --</option>`;
    let foundSelected = false;

    menuInventoryList.forEach((inv) => {
        const isSel = inv.name === selectedName;
        if (isSel) foundSelected = true;
        options += `<option value="${escapeMenuHTML(inv.name)}" ${isSel ? "selected" : ""}>${escapeMenuHTML(inv.name)} (${escapeMenuHTML(inv.unit)}) — ₱${inv.cost.toFixed(4)}/${escapeMenuHTML(inv.unit)}</option>`;
    });

    if (selectedName && !foundSelected) {
        options += `<option value="${escapeMenuHTML(selectedName)}" selected>⚠️ ${escapeMenuHTML(selectedName)} (Not in Inventory)</option>`;
    }
    return options;
}

function addIngredientRow(selectedName = "", qtyVal = "") {
    const container = document.getElementById("ingredientInputs");
    if (!container) return;

    const inv = menuInventoryMap[selectedName];
    const unitText = inv ? inv.unit : (selectedName ? "unit" : "—");

    const row = document.createElement("div");
    row.className = "ingredient-row";
    row.style.cssText = "display: grid; grid-template-columns: 1fr 85px 44px 36px; gap: 8px; align-items: center; margin-bottom: 8px;";
    row.innerHTML = `
        <select class="ing-name" onchange="updateIngredientRowMeta(this)" style="width: 100%; margin: 0; padding: 9px; box-sizing: border-box;">
            ${buildInventoryOptionsHTML(selectedName)}
        </select>
        <input type="number" class="ing-qty" placeholder="Qty" min="0" step="any" value="${qtyVal !== "" && qtyVal !== undefined ? qtyVal : ""}" oninput="calculateMenuMargin()" style="width: 100%; margin: 0; padding: 9px; box-sizing: border-box;">
        <span class="ing-unit-badge" style="font-size: 12px; font-weight: bold; color: #557a46; background: #e8f5e9; padding: 6px 4px; border-radius: 4px; text-align: center;">${escapeMenuHTML(unitText)}</span>
        <button type="button" onclick="removeIngredientRow(this)" title="Remove ingredient" style="background: #ffebee; color: #bd4b4b; border: 1px solid #f5c6cb; padding: 8px 0; border-radius: 6px; font-size: 13px; cursor: pointer; margin: 0;">✕</button>
    `;
    container.appendChild(row);
    calculateMenuMargin();
}

function updateIngredientRowMeta(selectEl) {
    const row = selectEl.closest(".ingredient-row");
    if (!row) return;
    const inv = menuInventoryMap[selectEl.value];
    const unitBadge = row.querySelector(".ing-unit-badge");
    if (unitBadge) unitBadge.innerText = inv ? inv.unit : "—";
    calculateMenuMargin();
}

function removeIngredientRow(btnEl) {
    const row = btnEl.closest(".ingredient-row");
    if (row) row.remove();
    calculateMenuMargin();
}

function refreshOpenIngredientSelects() {
    const modal = document.getElementById("menuItemModal");
    if (!modal || modal.classList.contains("hidden")) return;
    document.querySelectorAll("#ingredientInputs .ing-name").forEach((sel) => {
        const currentVal = sel.value;
        sel.innerHTML = buildInventoryOptionsHTML(currentVal);
        updateIngredientRowMeta(sel);
    });
}

function calculateMenuMargin() {
    const priceEl = document.getElementById("menuPrice");
    const costEl = document.getElementById("menuCalcCost");
    const profitEl = document.getElementById("menuCalcProfit");
    const marginEl = document.getElementById("menuCalcMargin");
    if (!priceEl || !costEl || !profitEl || !marginEl) return;

    const sellingPrice = parseFloat(priceEl.value) || 0;
    let totalCost = 0;

    document.querySelectorAll("#ingredientInputs .ingredient-row").forEach((row) => {
        const name = row.querySelector(".ing-name")?.value || "";
        const qty = parseFloat(row.querySelector(".ing-qty")?.value) || 0;
        const inv = menuInventoryMap[name];
        if (inv && qty > 0) {
            totalCost += inv.cost * qty;
        }
    });

    const grossProfit = sellingPrice - totalCost;
    const marginPct = sellingPrice > 0 ? (grossProfit / sellingPrice) * 100 : 0;

    costEl.innerText = `₱${totalCost.toFixed(2)}`;
    profitEl.innerText = `₱${grossProfit.toFixed(2)}`;
    profitEl.style.color = grossProfit >= 0 ? "#2b4227" : "#bd4b4b";

    marginEl.innerText = `${marginPct.toFixed(1)}%`;
    marginEl.style.color = marginPct >= 50 ? "#2e7d32" : (marginPct >= 25 ? "#8c5d3a" : "#bd4b4b");
}

// --- UNIFIED EDIT / SAVE / DELETE / SOLD OUT TOGGLE ---
function editMenuItem(id) {
    const docData = dynamicMenuDocs[id];
    if (!docData) return showToast("Menu item not found.");

    editingMenuId = id;
    document.getElementById("newMenuName").value = docData.name || "";
    document.getElementById("menuPrice").value = docData.price ?? 0;

    const catSelect = document.getElementById("menuCategory");
    if (catSelect) {
        const hasCat = Array.from(catSelect.options).some((o) => o.value === docData.category);
        if (hasCat) catSelect.value = docData.category;
    }

    const availCheck = document.getElementById("menuAvailableCheck");
    if (availCheck) availCheck.checked = docData.available !== false;

    const container = document.getElementById("ingredientInputs");
    container.innerHTML = "";
    const recipe = Array.isArray(docData.recipe) ? docData.recipe : [];
    if (recipe.length > 0) {
        recipe.forEach((ing) => addIngredientRow(ing.name, ing.deduct));
    } else {
        addIngredientRow();
    }

    const titleEl = document.getElementById("menuModalTitle");
    if (titleEl) titleEl.innerText = `Edit Menu Item: ${docData.name || ""}`;

    const saveBtn = document.getElementById("saveMenuBtn");
    if (saveBtn) {
        saveBtn.innerText = "💾 Update Menu Item";
        saveBtn.style.backgroundColor = "#4a6fa5";
    }

    calculateMenuMargin();
    document.getElementById("menuItemModal").classList.remove("hidden");
    setTimeout(() => document.getElementById("newMenuName").focus(), 50);
}

function resetMenuForm() {
    editingMenuId = null;
    const nameEl = document.getElementById("newMenuName");
    const priceEl = document.getElementById("menuPrice");
    const availCheck = document.getElementById("menuAvailableCheck");
    const container = document.getElementById("ingredientInputs");
    const saveBtn = document.getElementById("saveMenuBtn");

    if (nameEl) nameEl.value = "";
    if (priceEl) priceEl.value = "";
    if (availCheck) availCheck.checked = true;
    if (container) {
        container.innerHTML = "";
        addIngredientRow();
    }
    if (saveBtn) {
        saveBtn.innerText = "💾 Save Menu Item";
        saveBtn.style.backgroundColor = "";
    }
    calculateMenuMargin();
}

async function saveMenuItem() {
    const rawName = document.getElementById("newMenuName").value.trim();
    const name = typeof sanitizeHTML === "function" ? sanitizeHTML(rawName) : rawName.replace(/[<>]/g, "");
    const price = parseFloat(document.getElementById("menuPrice").value);
    const category = document.getElementById("menuCategory").value || "Meals";
    const availCheck = document.getElementById("menuAvailableCheck");
    const available = availCheck ? availCheck.checked : true;

    if (!name) return showToast("Menu Name is required.");
    if (isNaN(price) || price < 0) return showToast("Please enter a valid selling price.");

    let recipe = [];
    document.querySelectorAll("#ingredientInputs .ingredient-row").forEach((row) => {
        const n = (row.querySelector(".ing-name")?.value || "").trim();
        const q = parseFloat(row.querySelector(".ing-qty")?.value);
        if (n && !isNaN(q) && q > 0) {
            recipe.push({ name: n, deduct: q });
        }
    });

    const payload = { name, price, category, recipe, available };

    try {
        if (editingMenuId) {
            const oldItem = dynamicMenuDocs[editingMenuId] || {};
            payload.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
            await db.collection("menu").doc(editingMenuId).update(payload);

            if (typeof window.recordAuditEvent === "function") {
                window.recordAuditEvent({
                    category: "SECURITY",
                    action: "EDIT_MENU",
                    tableNo: "Menu Builder",
                    amount: price,
                    details: `Updated menu "${name}" (${category}): ₱${(Number(oldItem.price) || 0).toFixed(2)} → ₱${price.toFixed(2)}, ${recipe.length} ingredient(s), Status: ${available ? "Available" : "Sold Out"}.`
                });
            }
            showToast(`"${name}" updated!`);
        } else {
            payload.timestamp = firebase.firestore.FieldValue.serverTimestamp();
            await db.collection("menu").add(payload);
            showToast(`"${name}" added to menu!`);
        }
        closeMenuModal();
    } catch (err) {
        console.error("Error saving menu item:", err);
        showToast("Failed to save menu item.");
    }
}

async function toggleMenuAvailability(id, currentAvailable) {
    const item = dynamicMenuDocs[id];
    const newStatus = !currentAvailable;
    try {
        await db.collection("menu").doc(id).update({ available: newStatus });
        if (typeof window.recordAuditEvent === "function") {
            window.recordAuditEvent({
                category: "TRANSACTION",
                action: newStatus ? "MENU_RESTOCKED" : "MENU_SOLD_OUT",
                tableNo: "Menu Builder",
                amount: item ? (Number(item.price) || 0) : 0,
                details: `Marked "${item ? item.name : id}" as ${newStatus ? "Available" : "Sold Out (86)"} on POS.`
            });
        }
        showToast(`${item ? item.name : "Item"} marked ${newStatus ? "Available" : "Sold Out (86)"}.`);
    } catch (err) {
        console.error("Error toggling availability:", err);
        showToast("Failed to update availability.");
    }
}

async function deleteMenuItem(id) {
    const itemInfo = dynamicMenuDocs[id];
    const confirmed = window.hilomConfirm
        ? await hilomConfirm(`Permanently delete "${itemInfo ? itemInfo.name : "this menu item"}"?`)
        : confirm("Delete menu item?");
    if (confirmed) {
        try {
            await db.collection("menu").doc(id).delete();
            if (editingMenuId === id) closeMenuModal();
            if (typeof window.recordAuditEvent === "function") {
                window.recordAuditEvent({
                    category: "SECURITY",
                    action: "DELETE_MENU",
                    tableNo: "Menu Builder",
                    amount: itemInfo ? (Number(itemInfo.price) || 0) : 0,
                    details: `Deleted menu item: ${itemInfo ? itemInfo.name : id}`
                });
            }
            showToast("Menu item deleted.");
        } catch (err) {
            console.error("Error deleting menu item:", err);
            showToast("Failed to delete menu item.");
        }
    }
}

// Keep legacy aliases pointing to the unified functions
window.editMenu = editMenuItem;
window.deleteMenu = deleteMenuItem;
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

    const splitAuditRef = db.collection("audit_logs").doc();
    const splitActor = typeof window.getAuditActor === "function" ? window.getAuditActor() : "Staff";
    batch.set(splitAuditRef, {
        category: "TRANSACTION",
        action: "BILL_SPLIT",
        tableNo: `${originalData.tableNo} → ${newTableName}`,
        amount: Number(newSubtotal) || 0,
        performedBy: splitActor,
        authorizedBy: splitActor,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        details: `Split ₱${newSubtotal.toFixed(2)} (${Object.keys(newTableItems).length} item type/s) off ${originalData.tableNo}. Remaining: ₱${originalNewSubtotal.toFixed(2)}.`
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
        const filterDropdown = document.getElementById("menuAdminCatFilter");

        if (listDiv) listDiv.innerHTML = "";
        if (selectDropdown) selectDropdown.innerHTML = "";

        const prevFilter = filterDropdown ? filterDropdown.value : "ALL";
        if (filterDropdown) filterDropdown.innerHTML = `<option value="ALL">All Categories</option>`;

        if (doc.exists && doc.data().list) {
            menuCategories = doc.data().list;
        } else {
            menuCategories = ["Meals", "Drinks", "Add-ons"];
            db.collection("settings").doc("categories").set({ list: menuCategories });
        }

        menuCategories.forEach((cat) => {
            const safeCat = escapeMenuHTML(cat);
            const encodedCat = encodeURIComponent(cat);
            if (listDiv) {
                listDiv.innerHTML += `
                    <span style="background: #e9ece9; border: 1px solid #c8dac8; padding: 6px 12px; border-radius: 20px; font-size: 13px; color: #2b4227; font-weight: bold; display: inline-flex; align-items: center; gap: 8px; margin: 0 8px 8px 0;">
                        ${safeCat}
                        <button onclick="deleteCategory(decodeURIComponent('${encodedCat}'))" style="background:none; border:none; color:#bd4b4b; cursor:pointer; padding:0; font-size:14px; font-weight:bold;">✕</button>
                    </span>`;
            }
            if (selectDropdown) {
                selectDropdown.innerHTML += `<option value="${safeCat}">${safeCat}</option>`;
            }
            if (filterDropdown) {
                filterDropdown.innerHTML += `<option value="${safeCat}">${safeCat}</option>`;
            }
        });

        if (filterDropdown) {
            const hasPrev = Array.from(filterDropdown.options).some((o) => o.value === prevFilter);
            filterDropdown.value = hasPrev ? prevFilter : "ALL";
        }
    if (typeof renderPosCategoryTabs === "function") renderPosCategoryTabs();
    });
}

function addCategory() {
    const catName = sanitizeHTML(document.getElementById("newCategoryName").value.trim());
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

async function deleteCategory(catName) {
    if (menuCategories.length <= 1) return showToast("You must have at least one category.");
    const confirmed = window.hilomConfirm
        ? await hilomConfirm(`Are you sure you want to delete the '${catName}' category?`)
        : confirm(`Are you sure you want to delete the '${catName}' category?`);
    if (!confirmed) return;
    
    let updatedList = menuCategories.filter(c => c !== catName);
    db.collection("settings").doc("categories").update({ list: updatedList }).then(() => {
        if (typeof window.recordAuditEvent === "function") {
            window.recordAuditEvent({
                category: "SECURITY",
                action: "DELETE_CATEGORY",
                tableNo: "Menu Builder",
                amount: 0,
                details: `Removed menu category: ${catName}`
            });
        }
        showToast("Category removed!");
    });
}

// ==========================================
// --- SECURITY & ROLE AUTHORIZATION ---
// ==========================================
let pinResolvePromise = null;

function requestAdminPin() {
    return new Promise((resolve) => {
        const pinInput = document.getElementById("adminPin");
        if (pinInput) pinInput.value = "";
        
        document.getElementById("pinModal").classList.remove("hidden");
        if (pinInput) setTimeout(() => pinInput.focus(), 100);
        
        pinResolvePromise = resolve; 
    });
}

// --- SECURE THE TABLE VOID BUTTON ---
async function secureVoidActiveTableModal() { 
    if (activeBillingTableId) { 
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
    if (!board) return;
    board.innerHTML = ""; 

    const kitchenOrders = Object.entries(activeTablesData).filter(([_, d]) => !d.skipKitchen);
    if (kitchenOrders.length === 0) {
        board.innerHTML = `
            <div style="grid-column: 1 / -1; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 55vh; opacity: 0.5;">
                <span style="font-size: 64px; margin-bottom: 16px; filter: grayscale(1);">🍽️</span>
                <h3 style="color: #888; font-size: 24px; margin: 0; font-weight: normal; border: none;">No active orders</h3>
                <p style="color: #666; font-size: 14px; margin-top: 8px;">Waiting for new tickets from the POS...</p>
            </div>`;
        return;
    }

    for (let [tableId, data] of kitchenOrders) {
        let timeString = "Just now";
        let urgencyClass = "";
        
        if (data.timestamp) {
            const orderTime = typeof data.timestamp.toDate === "function" ? data.timestamp.toDate() : new Date(data.timestamp);
            timeString = orderTime.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            const minsElapsed = Math.floor((Date.now() - orderTime.getTime()) / 60000);
            if (!data.served) {
                if (minsElapsed >= 20) urgencyClass = "urgent";
                else if (minsElapsed >= 10) urgencyClass = "warning";
            }
        }

        let itemsHTML = "";
        for (let [itemName, itemData] of Object.entries(data.items || {})) {
            const modHTML = itemData.note
                ? `<div class="kds-modifier">📝 ${escapeMenuHTML(itemData.note)}</div>`
                : "";
            itemsHTML += `
                <div class="kds-item">
                    <div class="kds-item-main">
                        <span class="kds-qty">${itemData.qty}x</span>
                        <span>${escapeMenuHTML(itemName)}</span>
                    </div>
                    ${modHTML}
                </div>`;
        }

        const folioBadge = data.chargedToFolio
            ? `<span style="background: #4a6fa5; color: white; font-size: 10px; padding: 2px 6px; border-radius: 4px; margin-left: 8px; vertical-align: middle;">ROOM FOLIO</span>`
            : "";

        let servedClass = data.served ? "served" : urgencyClass;
        let btnText = data.served ? "Undo" : "✔️ Mark as Served";
        let btnColor = data.served ? "#8c5d3a" : "#557a46";

        board.innerHTML += `
            <div class="kds-card ${servedClass}" id="kds-${tableId}">
                <div class="kds-header">
                    <span><strong>${escapeMenuHTML(data.tableNo)}</strong>${folioBadge}</span>
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

async function clearKitchenOrder(tableId) {
    const confirmed = window.hilomConfirm
        ? await hilomConfirm("Clear this order from the kitchen queue?")
        : confirm("Clear this order from the kitchen queue?");
    if (!confirmed) return;
    try {
        const tData = activeTablesData[tableId] || {};
        const itemsSummary = Object.entries(tData.items || {}).map(([n, d]) => `${d.qty}x ${n}`).join(", ");
        await db.collection("active_tables").doc(tableId).delete();
        if (typeof window.recordAuditEvent === "function") {
            window.recordAuditEvent({
                category: "TRANSACTION",
                action: tData.chargedToFolio ? "KITCHEN_FOLIO_COMPLETED" : "KITCHEN_ORDER_CLEARED",
                tableNo: tData.tableNo || tableId,
                amount: tData.chargedToFolio ? 0 : (Number(tData.subtotal) || 0),
                details: tData.chargedToFolio
                    ? `Cleared completed Room Folio kitchen ticket (${itemsSummary || "items"}).`
                    : `Cleared unpaid active order directly from Kitchen KDS (${itemsSummary || "items"}).`
            });
        }
        showToast("Order cleared from queue.");
    } catch (err) {
        showToast("Error clearing order.");
        console.error(err);
    }
}

// --- CHARGE POS CART DIRECTLY TO A GUEST'S ROOM FOLIO (WITH OPTIONAL KITCHEN TICKET) ---
async function chargeToRoomFolio() {
    if (Object.keys(cart).length === 0) return showToast("Cart is empty!");

    const occSnap = await db.collection("rooms").where("status", "==", "OCCUPIED").get();
    if (occSnap.empty) {
        return alert("There are currently no occupied rooms checked in.");
    }

    const occupiedRooms = [];
    occSnap.forEach(doc => occupiedRooms.push({ id: doc.id, ...doc.data() }));
    occupiedRooms.sort((a, b) => String(a.roomNumber || a.id).localeCompare(String(b.roomNumber || b.id), undefined, { numeric: true }));

    const roomOptions = occupiedRooms.map(r => ({
        value: r.id,
        label: `Room ${r.roomNumber || r.id} — ${r.currentGuestName || "Guest"} (${r.roomType || ""})`
    }));

    const roomId = window.hilomPrompt
        ? await hilomPrompt("Select Occupied Room to charge this order to:", roomOptions[0].value, roomOptions)
        : prompt("Enter the Room Number to charge this order to:");
    if (!roomId) return;

    const sendKitchen = window.hilomConfirm
        ? await hilomConfirm("Send this order to the Kitchen KDS & print a Kitchen Ticket?\n\n(Click Cancel for bar/counter items like bottled water that don't need kitchen prep.)")
        : confirm("Send this order to the Kitchen KDS & print a Kitchen Ticket?");

    try {
        const roomDoc = await db.collection("rooms").doc(roomId.trim()).get();
        if (!roomDoc.exists || roomDoc.data().status !== "OCCUPIED" || !roomDoc.data().currentFolioId) {
            return alert(`Room ${roomId} is not currently occupied.`);
        }

        let totalNeeds = {};
        let kdsItemsPayload = {};
        for (let [itemName, cartData] of Object.entries(cart)) {
            const menuData = dynamicMenuRecipes[itemName];
            kdsItemsPayload[itemName] = {
                qty: cartData.qty,
                basePrice: cartData.price,
                note: cartData.note || "",
                totalCost: 0,
                rawDeductions: []
            };
            if (!menuData) continue;
            for (const ingredient of menuData.recipe) {
                const qtyNeeded = ingredient.deduct * cartData.qty;
                if (!totalNeeds[ingredient.name]) totalNeeds[ingredient.name] = { needed: 0, id: null, currentQty: 0 };
                totalNeeds[ingredient.name].needed += qtyNeeded;
                kdsItemsPayload[itemName].rawDeductions.push({ name: ingredient.name, qty: qtyNeeded });
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

        const orderTime = new Date();
        const batch = db.batch();
        for (let [name, data] of Object.entries(totalNeeds)) {
            const docRef = db.collection("inventory").doc(data.id);
            batch.update(docRef, { quantity: firebase.firestore.FieldValue.increment(-data.needed) });
        }

        const folioRef = db.collection("folios").doc(roomDoc.data().currentFolioId);
        let itemsSummaryArr = [];
        for (let [itemName, data] of Object.entries(cart)) {
            itemsSummaryArr.push(`${data.qty}x ${itemName}${data.note ? ` [${data.note}]` : ""}`);
        }
        
        batch.update(folioRef, {
            posOrders: firebase.firestore.FieldValue.arrayUnion({
                itemsSummary: itemsSummaryArr.join(", "),
                amount: cartTotalRaw,
                timestamp: orderTime.toISOString()
            }),
            posChargesTotal: firebase.firestore.FieldValue.increment(cartTotalRaw),
            grandTotal: firebase.firestore.FieldValue.increment(cartTotalRaw)
        });

        if (sendKitchen) {
            const kdsTicketRef = db.collection("active_tables").doc();
            batch.set(kdsTicketRef, {
                tableNo: `ROOM ${roomId.trim()}`,
                subtotal: cartTotalRaw,
                items: kdsItemsPayload,
                timestamp: orderTime,
                chargedToFolio: true
            });

            const ticketItemsEl = document.getElementById("ticketItems");
            if (ticketItemsEl) {
                ticketItemsEl.innerHTML = "";
                for (let [itemName, payload] of Object.entries(kdsItemsPayload)) {
                    const noteLine = payload.note
                        ? `<div style="font-size: 12px; font-weight: bold; padding-left: 16px; margin-bottom: 6px;">&rarr; NOTE: ${escapeMenuHTML(payload.note).toUpperCase()}</div>`
                        : "";
                    ticketItemsEl.innerHTML += `<div class="receipt-item"><span><b>${payload.qty}x</b> ${escapeMenuHTML(itemName).toUpperCase()}</span></div>${noteLine}`;
                }
            }
        }

        await batch.commit();

        if (sendKitchen) {
            document.getElementById("ticketTableNo").innerText = `ROOM ${roomId.trim()} (FOLIO)`;
            document.getElementById("ticketTime").innerText = orderTime.toLocaleTimeString();
            showDigitalReceipt('kitchenTicketArea');
            showToast(`₱${cartTotalRaw.toFixed(2)} charged to Room ${roomId} & sent to Kitchen!`);
        } else {
            showToast(`₱${cartTotalRaw.toFixed(2)} charged to Room ${roomId}!`);
        }

        clearCart(true);
        
    } catch(err) { 
        console.error(err); 
        showToast("Error routing charge to room."); 
    }
}

function toggleMobileMenu() {
    const sidebar = document.querySelector('.sidebar');
    sidebar.classList.toggle('active');
}

// Auto-close the menu when a nav button is clicked on mobile
document.querySelectorAll('.sidebar .nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        if (window.innerWidth <= 1024) {
            document.querySelector('.sidebar').classList.remove('active');
        }
    });
});