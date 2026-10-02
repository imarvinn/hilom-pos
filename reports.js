// --- SALES & EXPENSES TAB SWITCHER ---
function switchSalesTab(tabName) {
    const salesCard = document.getElementById("salesCard");
    const expensesCard = document.getElementById("expensesCard");
    const btnSales = document.getElementById("tabSales");
    const btnExpenses = document.getElementById("tabExpenses");

    if (tabName === 'sales') {
        salesCard.classList.remove("hidden");
        expensesCard.classList.add("hidden");
        btnSales.style.backgroundColor = "#557a46";
        btnSales.style.color = "white";
        btnExpenses.style.backgroundColor = "#e0e5e0";
        btnExpenses.style.color = "#333";
    } else {
        salesCard.classList.add("hidden");
        expensesCard.classList.remove("hidden");
        btnExpenses.style.backgroundColor = "#8c5d3a"; 
        btnExpenses.style.color = "white";
        btnSales.style.backgroundColor = "#e0e5e0";
        btnSales.style.color = "#333";
    }
}

// --- SALES, EXPENSES & NET PROFIT LOGIC WITH PAGINATION ---
let unsubSales = null; let unsubExpenses = null;
let currentSalesPage = 1; const salesPerPage = 10;
let currentExpPage = 1; const expPerPage = 10;

function filterSales() {
    if(unsubSales) unsubSales(); if(unsubExpenses) unsubExpenses();
    const dateStr = document.getElementById("dateFilter").value;
    
    let query = db.collection("sales");
    if (dateStr) {
        const start = new Date(dateStr); start.setHours(0,0,0,0); const end = new Date(dateStr); end.setHours(23,59,59,999);
        query = query.where("timestamp", ">=", start).where("timestamp", "<=", end);
    } else { query = query.where("archived", "==", false); }

    unsubSales = query.onSnapshot((snapshot) => {
        let totalRev = 0, totalCost = 0; currentSalesData = [];
        snapshot.forEach(doc => currentSalesData.push({ id: doc.id, ...doc.data() }));
        currentSalesData.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));

        currentSalesData.forEach((sale) => { 
            if(sale.status !== 'VOID') {
                totalRev += (sale.netAmount !== undefined ? sale.netAmount : sale.price) || 0; 
                totalCost += (sale.totalCost !== undefined ? sale.totalCost : sale.cost) || 0; 
            }
        });
        document.getElementById("metricRevenue").innerText = `₱${totalRev.toFixed(2)}`; 
        document.getElementById("metricCost").innerText = `₱${totalCost.toFixed(2)}`; 
        document.getElementById("metricProfit").innerText = `₱${(totalRev - totalCost).toFixed(2)}`;
        
        renderSalesPage(currentSalesPage); calculateNetProfit();
    });

    let expQuery = db.collection("expenses");
    if (dateStr) {
        const start = new Date(dateStr); start.setHours(0,0,0,0); const end = new Date(dateStr); end.setHours(23,59,59,999);
        expQuery = expQuery.where("timestamp", ">=", start).where("timestamp", "<=", end);
    } else { expQuery = expQuery.where("archived", "==", false); }

    unsubExpenses = expQuery.onSnapshot((snapshot) => {
        let totalExp = 0; currentExpensesData = [];
        snapshot.forEach(doc => currentExpensesData.push({ id: doc.id, ...doc.data() }));
        currentExpensesData.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));

        currentExpensesData.forEach((exp) => { totalExp += exp.amount; });
        document.getElementById("metricExpenses").innerText = `₱${totalExp.toFixed(2)}`;
        
        renderExpensePage(currentExpPage); calculateNetProfit();
    });
}

// 1. RENDER SALES TABLE
function renderSalesPage(page) {
    const list = document.getElementById("salesList");
    const paginationDiv = document.getElementById("salesPagination");
    let pageItems = [];

    if (page === 'ALL') {
        pageItems = currentSalesData;
        paginationDiv.style.display = 'none';
    } else {
        paginationDiv.style.display = 'flex';
        const totalPages = Math.ceil(currentSalesData.length / salesPerPage) || 1;
        if (page > totalPages) page = totalPages;
        if (page < 1) page = 1;
        currentSalesPage = page;

        const startIndex = (page - 1) * salesPerPage;
        pageItems = currentSalesData.slice(startIndex, startIndex + salesPerPage);

        paginationDiv.innerHTML = `
            <button class="page-btn" onclick="renderSalesPage(${page - 1})" ${page === 1 ? 'disabled' : ''}>◄ Prev</button>
            <span class="page-info">Page ${page} of ${totalPages}</span>
            <button class="page-btn" onclick="renderSalesPage(${page + 1})" ${page === totalPages ? 'disabled' : ''}>Next ►</button>
        `;
    }

    list.innerHTML = ""; 
    pageItems.forEach((sale) => {
        let time = "Just now"; if (sale.timestamp) time = sale.timestamp.toDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        
        const gross = sale.grossAmount !== undefined ? sale.grossAmount : (sale.price || 0);
        const net = sale.netAmount !== undefined ? sale.netAmount : (sale.price || 0);
        const method = sale.paymentMethod || "Cash";
        const invNo = sale.invoiceNo || "Old Record";
        let isVoid = sale.status === 'VOID';
        
        let trStyle = isVoid ? "text-decoration: line-through; color: #888;" : "";
        
        // NEW: Action Column with Reprint Button
        let actionBtn = isVoid 
            ? `<span style="color:#bd4b4b; font-weight:bold; display:block; margin-bottom:5px;">VOIDED</span>` 
            : `<button class="delete-btn" style="width:100%; margin-bottom:5px;" onclick="voidSale('${sale.id}')">Void</button>`;
            
        let reprintBtn = `<button class="save-btn" style="width:100%; background:#8c5d3a; padding: 6px 10px; font-size: 12px;" onclick="reprintReceipt('${sale.id}')">🖨️ Reprint</button>`;

        list.innerHTML += `<tr style="${trStyle}">
            <td>${time}<br><small style="color:#8c5d3a; font-weight:bold;">${invNo}</small></td>
            <td>Table ${sale.tableNo || 'N/A'}</td>
            <td><span class="badge-method method-${method}">${method}</span></td>
            <td>₱${gross.toFixed(2)}</td>
            <td style="color:#557a46; font-weight:bold;">₱${net.toFixed(2)}</td>
            <td class="no-print" style="width:80px;">${actionBtn}${reprintBtn}</td>
        </tr>`;
    });
}

// 2. RENDER EXPENSE TABLE
function renderExpensePage(page) {
    const list = document.getElementById("expenseList");
    const paginationDiv = document.getElementById("expensePagination");
    let pageItems = [];

    if (page === 'ALL') {
        pageItems = currentExpensesData;
        paginationDiv.style.display = 'none';
    } else {
        paginationDiv.style.display = 'flex';
        const totalPages = Math.ceil(currentExpensesData.length / expPerPage) || 1;
        if (page > totalPages) page = totalPages;
        if (page < 1) page = 1;
        currentExpPage = page;

        const startIndex = (page - 1) * expPerPage;
        pageItems = currentExpensesData.slice(startIndex, startIndex + expPerPage);

        paginationDiv.innerHTML = `
            <button class="page-btn" onclick="renderExpensePage(${page - 1})" ${page === 1 ? 'disabled' : ''}>◄ Prev</button>
            <span class="page-info">Page ${page} of ${totalPages}</span>
            <button class="page-btn" onclick="renderExpensePage(${page + 1})" ${page === totalPages ? 'disabled' : ''}>Next ►</button>
        `;
    }

    list.innerHTML = ""; 
    pageItems.forEach((exp) => {
        let time = "Just now"; if (exp.timestamp) time = exp.timestamp.toDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        list.innerHTML += `<tr><td>${time}</td><td>${exp.name}</td><td>₱${exp.amount.toFixed(2)}</td><td class="no-print"><button class="delete-btn" onclick="deleteExpense('${exp.id}')">✕</button></td></tr>`;
    });
}

function printSales() { 
    // 1. Render all sales and expense data
    renderSalesPage('ALL'); 
    renderExpensePage('ALL');
    
    // 2. Explicitly remove the 'hidden' class so the DOM physically displays the card
    const expensesCard = document.getElementById("expensesCard");
    const salesCard = document.getElementById("salesCard");
    
    if (expensesCard) expensesCard.classList.remove("hidden");
    if (salesCard) salesCard.classList.remove("hidden");

    // 3. Add print class for CSS formatting
    document.body.classList.add("print-sales"); 
    
    // 4. Use a slight delay so the browser finishes painting the data before printing
    setTimeout(() => {
        window.print();
        
        // 5. Cleanup: restore normal UI state, re-hide cards, and reset pagination
        document.body.classList.remove("print-sales"); 
        
        if (expensesCard) expensesCard.classList.add("hidden");
        if (salesCard) salesCard.classList.add("hidden");
        
        renderSalesPage(currentSalesPage); 
        renderExpensePage(currentExpPage);
    }, 300);
}

function calculateNetProfit() {
    const grossStr = document.getElementById("metricProfit").innerText.replace("₱", "");
    const expStr = document.getElementById("metricExpenses").innerText.replace("₱", "");
    const gross = parseFloat(grossStr) || 0; const exp = parseFloat(expStr) || 0; const net = gross - exp;
    const netEl = document.getElementById("metricNet"); netEl.innerText = `₱${net.toFixed(2)}`;
    netEl.style.color = net >= 0 ? "#557a46" : "#bd4b4b"; 
}

function addExpense() {
    const name = document.getElementById("expName").value.trim(); const amt = parseFloat(document.getElementById("expAmount").value);
    if(name && amt) {
        db.collection("expenses").add({ name: name, amount: amt, archived: false, timestamp: new Date() }).then(() => {
            document.getElementById("expName").value = ""; document.getElementById("expAmount").value = ""; showToast("Expense logged.");
        });
    }
}

function deleteExpense(id) { if(confirm("Delete this expense record?")) db.collection("expenses").doc(id).delete(); }

// BIR AUDIT-SAFE VOID LOGIC (NOW PIN PROTECTED)
async function voidSale(saleId) {
    // 1. Trigger the visual PIN pad and wait for authorization
    const isAuthorized = await requestAdminPin();
    if (!isAuthorized) return showToast("Void cancelled.");

    // 2. If authorized, proceed with the void
    try {
        const saleDoc = await db.collection("sales").doc(saleId).get(); 
        if (!saleDoc.exists) return;
        
        const saleData = saleDoc.data();
        if(saleData.status === 'VOID') return showToast("Already voided.");

        let restoreTotals = {};
        if (saleData.items) {
            for (let [itemName, itemData] of Object.entries(saleData.items)) {
                if (itemData.rawDeductions) {
                    for (let ing of itemData.rawDeductions) {
                        if(!restoreTotals[ing.name]) restoreTotals[ing.name] = 0;
                        restoreTotals[ing.name] += ing.qty;
                    }
                }
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
        
        batch.update(db.collection("sales").doc(saleId), { status: 'VOID', voidedAt: new Date() });
        await batch.commit(); 
        showToast("Transaction voided. Record kept for audit.");
    } catch (error) { 
        showToast("Error voiding order."); 
        console.error(error); 
    }
}

// NEW: RECEIPT REPRINTING
async function reprintReceipt(saleId) {
    try {
        const saleDoc = await db.collection("sales").doc(saleId).get();
        if (!saleDoc.exists) return showToast("Receipt not found.");
        const s = saleDoc.data();

        document.getElementById("receiptHeaderTitle").innerText = "SALES INVOICE (REPRINT)";
        document.getElementById("receiptInvoiceNo").innerText = s.invoiceNo || "Old Record";
        document.getElementById("receiptTableNo").innerText = `Table ${s.tableNo || "N/A"}`;
        document.getElementById("receiptTime").innerText = s.timestamp ? s.timestamp.toDate().toLocaleString() : new Date().toLocaleString();

        if(s.buyerDetails && (s.buyerDetails.name || s.buyerDetails.tin || s.buyerDetails.address)) {
            document.getElementById("receiptBuyerInfo").classList.remove("hidden");
            document.getElementById("receiptBuyerName").innerText = s.buyerDetails.name || "-";
            document.getElementById("receiptBuyerTin").innerText = s.buyerDetails.tin || "-";
            document.getElementById("receiptBuyerAddress").innerText = s.buyerDetails.address || "-";
        } else { document.getElementById("receiptBuyerInfo").classList.add("hidden"); }

        const receiptItems = document.getElementById("receiptItems"); receiptItems.innerHTML = "";
        if (s.items) {
            for (let [itemName, itemData] of Object.entries(s.items)) {
                let itemPrice = itemData.basePrice * itemData.qty;
                receiptItems.innerHTML += `<div class="receipt-item"><span>${itemData.qty}x ${itemName}</span><span>₱${itemPrice.toFixed(2)}</span></div>`;
            }
        } else if (s.itemName) {
            receiptItems.innerHTML += `<div class="receipt-item"><span>1x ${s.itemName}</span><span>₱${s.price.toFixed(2)}</span></div>`;
        }

        const gross = s.grossAmount !== undefined ? s.grossAmount : (s.price || 0);
        const net = s.netAmount !== undefined ? s.netAmount : (s.price || 0);

        document.getElementById("receiptSubtotal").innerText = `₱${gross.toFixed(2)}`;
        if ((s.discountAmount || 0) > 0) {
            document.getElementById("receiptDiscountRow").classList.remove("hidden");
            document.getElementById("receiptDiscountAmount").innerText = `-₱${s.discountAmount.toFixed(2)}`;
        } else { document.getElementById("receiptDiscountRow").classList.add("hidden"); }

        document.getElementById("receiptFinalTotal").innerText = `₱${net.toFixed(2)}`;
        document.getElementById("receiptPayMethod").innerText = s.paymentMethod || "Cash";

        const tenderedRow = document.getElementById("receiptTenderedRow");
        const changeRow = document.getElementById("receiptChangeRow");
        if (s.paymentMethod === "Cash" && s.cashTendered !== undefined) {
            tenderedRow.classList.remove("hidden"); changeRow.classList.remove("hidden");
            tenderedRow.style.display = "flex"; changeRow.style.display = "flex";
            document.getElementById("receiptTenderedAmount").innerText = `₱${(s.cashTendered).toFixed(2)}`;
            document.getElementById("receiptChangeAmount").innerText = `₱${(s.changeDue).toFixed(2)}`;
        } else {
            tenderedRow.classList.add("hidden"); changeRow.classList.add("hidden");
            tenderedRow.style.display = "none"; changeRow.style.display = "none";
        }

        // VAT Recalculation for Reprint
        let isSenior = (s.discountAmount > 0 && s.seniorDetails);
        let vatableSales = isSenior ? 0 : (gross / 1.12);
        let vatAmount = isSenior ? 0 : (gross - vatableSales);
        let vatExemptSales = isSenior ? (gross / 1.12) : 0;

        document.getElementById("receiptVatSales").innerText = `₱${vatableSales.toFixed(2)}`;
        document.getElementById("receiptVatAmount").innerText = `₱${vatAmount.toFixed(2)}`;
        document.getElementById("receiptVatExempt").innerText = `₱${vatExemptSales.toFixed(2)}`;

        if(s.seniorDetails) {
            document.getElementById("receiptSeniorInfo").classList.remove("hidden");
            document.getElementById("receiptScName").innerText = s.seniorDetails.name || "";
            document.getElementById("receiptScId").innerText = s.seniorDetails.id || "";
        } else { document.getElementById("receiptSeniorInfo").classList.add("hidden"); }

        document.getElementById("receiptPaymentSection").classList.remove("hidden");
        document.getElementById("receiptPaymentSection").style.display = "block";

        // Trigger the animation from pos-billing.js
        if(typeof showDigitalReceipt === "function") showDigitalReceipt('customerReceiptArea');
        
    } catch(e) { console.error(e); showToast("Error reprinting receipt."); }
}

// NEW: MID-SHIFT X-READING (WITH DRAWER FLOAT)
async function generateXReading() {
    let floatInput = prompt("Enter starting cash float (₱) for this shift:", "1000");
    if (floatInput === null) return; // User cancelled
    let startingFloat = parseFloat(floatInput) || 0;

    try {
        const salesSnap = await db.collection("sales").where("archived", "==", false).get();
        let gross = 0, voids = 0, discounts = 0, net = 0, cashSales = 0;
        let begInv = null, endInv = null;
        
        salesSnap.forEach(doc => { 
            let s = doc.data();
            let safeInvoice = s.invoiceNo || "INV-000000";
            let invNumStr = safeInvoice.replace("INV-", "");
            
            if (safeInvoice !== "INV-000000") {
                if(!begInv || invNumStr < begInv) begInv = invNumStr;
                if(!endInv || invNumStr > endInv) endInv = invNumStr;
            }
            
            if (s.status === 'VOID') {
                voids += s.grossAmount || s.price || 0;
            } else {
                let sGross = s.grossAmount !== undefined ? s.grossAmount : (s.price || 0);
                let sNet = s.netAmount !== undefined ? s.netAmount : (s.price || 0);
                gross += sGross;
                discounts += s.discountAmount || 0;
                net += sNet;
                
                if (s.paymentMethod === 'Cash') {
                    cashSales += sNet;
                }
            }
        });

        let totalExp = 0;
        const expSnap = await db.collection("expenses").where("archived", "==", false).get();
        expSnap.forEach(doc => { totalExp += doc.data().amount || 0; });

        let expectedCash = startingFloat + cashSales - totalExp;

        document.getElementById("xReadTime").innerText = new Date().toLocaleString();
        document.getElementById("xBegInv").innerText = begInv ? `INV-${begInv}` : "-";
        document.getElementById("xEndInv").innerText = endInv ? `INV-${endInv}` : "-";
        document.getElementById("xGross").innerText = `₱${gross.toFixed(2)}`;
        document.getElementById("xVoids").innerText = `₱${voids.toFixed(2)}`;
        document.getElementById("xDiscounts").innerText = `₱${discounts.toFixed(2)}`;
        document.getElementById("xNet").innerText = `₱${net.toFixed(2)}`;
        
        document.getElementById("xFloat").innerText = `₱${startingFloat.toFixed(2)}`;
        document.getElementById("xCashSales").innerText = `₱${cashSales.toFixed(2)}`;
        document.getElementById("xExpenses").innerText = `₱${totalExp.toFixed(2)}`;
        document.getElementById("xExpectedCash").innerText = `₱${expectedCash.toFixed(2)}`;
        
        if(typeof showDigitalReceipt === "function") showDigitalReceipt('xReadingArea');
        showToast("X-Reading generated.");
    } catch(e) { showToast("Error generating X-Read."); console.error(e); }
}

// FORMAL Z-READING SHIFT CLOSE (WITH DRAWER FLOAT)
async function closeShift() {
    let floatInput = prompt("Enter starting cash float (₱) for this shift:", "1000");
    if (floatInput === null) return; 
    let startingFloat = parseFloat(floatInput) || 0;

    if(!confirm("Generate Z-Reading and close shift?")) return;
    try {
        const configRef = db.collection('config').doc('system');
        const configDoc = await configRef.get();
        let zCount = configDoc.exists ? (configDoc.data().zCount || 1) : 1;
        let currentGT = configDoc.exists ? (configDoc.data().grandTotal || 0) : 0;

        const salesSnap = await db.collection("sales").where("archived", "==", false).get();
        let gross = 0, voids = 0, discounts = 0, net = 0, cashSales = 0;
        let begInv = null, endInv = null;
        
        const batch = db.batch();
        salesSnap.forEach(doc => { 
            let s = doc.data();
            let safeInvoice = s.invoiceNo || "INV-000000";
            let invNumStr = safeInvoice.replace("INV-", "");
            
            if (safeInvoice !== "INV-000000") {
                if(!begInv || invNumStr < begInv) begInv = invNumStr;
                if(!endInv || invNumStr > endInv) endInv = invNumStr;
            }
            
            if (s.status === 'VOID') {
                voids += s.grossAmount || s.price || 0;
            } else {
                let sGross = s.grossAmount !== undefined ? s.grossAmount : (s.price || 0);
                let sNet = s.netAmount !== undefined ? s.netAmount : (s.price || 0);
                gross += sGross;
                discounts += s.discountAmount || 0;
                net += sNet;
                
                if (s.paymentMethod === 'Cash') {
                    cashSales += sNet;
                }
            }
            batch.update(doc.ref, { archived: true }); 
        });
        
        let totalExp = 0;
        const expSnap = await db.collection("expenses").where("archived", "==", false).get();
        expSnap.forEach(doc => { 
            totalExp += doc.data().amount || 0; 
            batch.update(doc.ref, { archived: true }); 
        });

        const invSnap = await db.collection("inventory").get();
        invSnap.forEach(doc => batch.update(doc.ref, { shiftStartQty: doc.data().quantity || 0 }));
        
        let expectedCash = startingFloat + cashSales - totalExp;

        const zReadRef = db.collection("z_readings").doc();
        batch.set(zReadRef, {
            zCount: zCount, begInvoice: begInv ? `INV-${begInv}` : "-", endInvoice: endInv ? `INV-${endInv}` : "-",
            grossSales: gross, voids: voids, discounts: discounts, netSales: net, nrcst: currentGT, timestamp: new Date()
        });

        batch.update(configRef, { zCount: zCount + 1 });
        await batch.commit();

        document.getElementById("zReadTime").innerText = new Date().toLocaleString();
        document.getElementById("zCounterDisplay").innerText = String(zCount).padStart(4, '0');
        document.getElementById("zBegInv").innerText = begInv ? `INV-${begInv}` : "-";
        document.getElementById("zEndInv").innerText = endInv ? `INV-${endInv}` : "-";
        document.getElementById("zGross").innerText = `₱${gross.toFixed(2)}`;
        document.getElementById("zVoids").innerText = `₱${voids.toFixed(2)}`;
        document.getElementById("zDiscounts").innerText = `₱${discounts.toFixed(2)}`;
        document.getElementById("zNet").innerText = `₱${net.toFixed(2)}`;
        document.getElementById("zNewTotal").innerText = `₱${currentGT.toFixed(2)}`;
        
        document.getElementById("zFloat").innerText = `₱${startingFloat.toFixed(2)}`;
        document.getElementById("zCashSales").innerText = `₱${cashSales.toFixed(2)}`;
        document.getElementById("zExpenses").innerText = `₱${totalExp.toFixed(2)}`;
        document.getElementById("zExpectedCash").innerText = `₱${expectedCash.toFixed(2)}`;
        
        if(typeof showDigitalReceipt === "function") showDigitalReceipt('zReadingArea'); 
        showToast("Shift Closed and Z-Read Saved successfully.");
    } catch(e) { showToast("Error closing shift."); console.error(e); }
}

function exportCSV() {
    let csv = "Type,Date,Time,Invoice/Desc,Method,Gross,Discount,Net Revenue,Expense\n";
    currentSalesData.forEach(s => {
        let d = s.timestamp ? s.timestamp.toDate() : new Date();
        let invNo = s.invoiceNo || "Old Record";
        let grossAmt = s.grossAmount !== undefined ? s.grossAmount : (s.price || 0);
        let netAmt = s.netAmount !== undefined ? s.netAmount : (s.price || 0);
        csv += `Sale,${d.toLocaleDateString()},${d.toLocaleTimeString()},"${invNo} (Table ${s.tableNo || 'N/A'})",${s.paymentMethod || 'Cash'},${grossAmt},${s.discountAmount || 0},${s.status === 'VOID' ? 0 : netAmt},0\n`;
    });
    currentExpensesData.forEach(e => {
        let d = e.timestamp ? e.timestamp.toDate() : new Date();
        csv += `Expense,${d.toLocaleDateString()},${d.toLocaleTimeString()},"${e.name}",-,0,0,0,${e.amount}\n`;
    });
    const link = document.createElement("a"); link.setAttribute("href", encodeURI("data:text/csv;charset=utf-8," + csv));
    link.setAttribute("download", `HILOM_Report_${new Date().toLocaleDateString().replace(/\//g, '-')}.csv`);
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
}

// NEW: BIR ELECTRONIC JOURNAL EXPORT (.txt format)
function exportEJournal() {
    if (currentSalesData.length === 0) return showToast("No sales data to export for this date.");
    
    let txt = "=================================================\n";
    txt += "          HILOM POS - ELECTRONIC JOURNAL         \n";
    txt += "=================================================\n\n";

    let sortedSales = [...currentSalesData].sort((a, b) => (a.timestamp?.seconds || 0) - (b.timestamp?.seconds || 0));

    sortedSales.forEach(s => {
        let d = s.timestamp ? s.timestamp.toDate() : new Date();
        let isVoid = s.status === 'VOID';
        let gross = s.grossAmount !== undefined ? s.grossAmount : (s.price || 0);
        let discount = s.discountAmount || 0;
        let net = s.netAmount !== undefined ? s.netAmount : (s.price || 0);
        
        txt += "HILOM POS\n";
        txt += "SALES INVOICE\n";
        txt += `Invoice No: ${s.invoiceNo || "Old Record"}\n`;
        txt += `Table No: ${s.tableNo || "N/A"}\n`;
        txt += `Date/Time: ${d.toLocaleString()}\n`;
        
        if (isVoid) txt += "\n*** VOIDED TRANSACTION ***\n";
        
        txt += "-------------------------------------------------\n";
        
        if (s.buyerDetails) {
            txt += `Buyer: ${s.buyerDetails.name || "-"}\n`;
            txt += `TIN: ${s.buyerDetails.tin || "-"}\n`;
            txt += `Address: ${s.buyerDetails.address || "-"}\n`;
            txt += "-------------------------------------------------\n";
        }

        if (s.items) {
            for (let [itemName, itemData] of Object.entries(s.items)) {
                let itemTotal = itemData.basePrice * itemData.qty;
                txt += `${itemData.qty}x ${itemName.padEnd(25)} PHP ${itemTotal.toFixed(2)}\n`;
            }
        } else if (s.itemName) {
            txt += `1x ${s.itemName.padEnd(25)} PHP ${gross.toFixed(2)}\n`;
        }

        txt += "-------------------------------------------------\n";
        txt += `Gross Amount:                     PHP ${gross.toFixed(2)}\n`;
        txt += `Discount:                         PHP ${discount.toFixed(2)}\n`;
        txt += `NET DUE:                          PHP ${net.toFixed(2)}\n`;
        txt += "-------------------------------------------------\n";
        txt += `Method: ${s.paymentMethod || "Cash"}\n`;
        txt += "-------------------------------------------------\n";
        
        txt += "Developer: HILOM Solutions Inc.\n";
        txt += "Address: Bacolod City, Negros Occidental\n";
        txt += "TIN: 000-000-000-000\n";
        txt += "Accreditation No: xxxxxxx\n";
        txt += "MIN: MIN-xxxxxx | SN: SN-xxxxxx\n";
        txt += "=================================================\n\n";
    });

    const blob = new Blob([txt], { type: "text/plain;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `EJournal_${new Date().toLocaleDateString().replace(/\//g, '-')}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}