// --- INVENTORY LOGIC WITH PAGINATION ---
let allInventoryItems = [];
let currentInvPage = 1;
const invItemsPerPage = 10; // Shows 10 items per page

let currentRepPage = 1;
const repItemsPerPage = 10;

function loadInventory() {
    db.collection("inventory").orderBy("name").onSnapshot((snapshot) => {
        allInventoryItems = [];
        snapshot.forEach((doc) => {
            allInventoryItems.push({ id: doc.id, ...doc.data() });
        });
        // Render both tables when data updates
        renderInventoryPage(currentInvPage);
        renderReportPage(currentRepPage);
    });
}

// 1. RENDER LIVE TRACKER TABLE
function renderInventoryPage(page) {
    const invList = document.getElementById("inventoryList");
    const paginationDiv = document.getElementById("inventoryPagination");
    
    const totalPages = Math.ceil(allInventoryItems.length / invItemsPerPage) || 1;
    if (page > totalPages) page = totalPages;
    if (page < 1) page = 1;
    currentInvPage = page;

    const startIndex = (page - 1) * invItemsPerPage;
    const endIndex = startIndex + invItemsPerPage;
    const pageItems = allInventoryItems.slice(startIndex, endIndex);

    invList.innerHTML = ""; 
    pageItems.forEach((item) => {
        let expiryHTML = "-";
        if (item.expiry) {
            const expDate = new Date(item.expiry); const today = new Date(); today.setHours(0,0,0,0);
            const diffDays = Math.ceil((expDate - today) / (1000 * 60 * 60 * 24));
            if (diffDays < 0) { expiryHTML = `<span class="status-expired">Expired</span><br><small>${item.expiry}</small>`; } 
            else if (diffDays <= 7) { expiryHTML = `<span class="status-warning">Expiring Soon</span><br><small>${item.expiry}</small>`; } 
            else { expiryHTML = `<span class="status-ok">Good</span><br><small>${item.expiry}</small>`; }
        }

        let statusBadge = item.quantity <= 5 ? '<span class="status-low">Low Stock</span>' : '<span class="status-ok">In Stock</span>';

        invList.innerHTML += `
            <tr>
                <td><strong>${item.name}</strong></td>
                <td>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <button onclick="updateStockQty('${item.id}', -1, ${item.quantity})" style="padding: 4px 10px; background: #e0e5e0; color: #333; font-size: 14px; border-radius: 4px;">-</button>
                        <span style="font-size: 16px; font-weight: bold; min-width: 25px; text-align: center;">${item.quantity}</span>
                        <button onclick="updateStockQty('${item.id}', 1, ${item.quantity})" style="padding: 4px 10px; background: #e0e5e0; color: #333; font-size: 14px; border-radius: 4px;">+</button>
                    </div>
                </td>
                <td>₱${(item.cost||0).toFixed(2)}</td><td>${expiryHTML}</td><td>${statusBadge}</td><td class="no-print"><button class="delete-btn" onclick="deleteItem('${item.id}')">✕</button></td>
            </tr>
        `;
    });

    // Build Pagination Buttons
    paginationDiv.innerHTML = `
        <button class="page-btn" onclick="renderInventoryPage(${page - 1})" ${page === 1 ? 'disabled' : ''}>◄ Prev</button>
        <span class="page-info">Page ${page} of ${totalPages}</span>
        <button class="page-btn" onclick="renderInventoryPage(${page + 1})" ${page === totalPages ? 'disabled' : ''}>Next ►</button>
    `;
}

// 2. RENDER SHIFT ANALYSIS TABLE
function renderReportPage(page) {
    const reportList = document.getElementById("inventoryReportList");
    const paginationDiv = document.getElementById("reportPagination");
    
    // If 'ALL' is passed (used for printing), render every item
    let pageItems = [];
    if (page === 'ALL') {
        pageItems = allInventoryItems;
        paginationDiv.style.display = 'none';
    } else {
        paginationDiv.style.display = 'flex';
        const totalPages = Math.ceil(allInventoryItems.length / repItemsPerPage) || 1;
        if (page > totalPages) page = totalPages;
        if (page < 1) page = 1;
        currentRepPage = page;

        const startIndex = (page - 1) * repItemsPerPage;
        const endIndex = startIndex + repItemsPerPage;
        pageItems = allInventoryItems.slice(startIndex, endIndex);

        paginationDiv.innerHTML = `
            <button class="page-btn" onclick="renderReportPage(${page - 1})" ${page === 1 ? 'disabled' : ''}>◄ Prev</button>
            <span class="page-info">Page ${page} of ${totalPages}</span>
            <button class="page-btn" onclick="renderReportPage(${page + 1})" ${page === totalPages ? 'disabled' : ''}>Next ►</button>
        `;
    }

    reportList.innerHTML = ""; 
    pageItems.forEach((item) => {
        let startQty = item.shiftStartQty !== undefined ? item.shiftStartQty : item.quantity; 
        
        // Calculate net change: Current Quantity minus Starting Quantity
        let netChange = item.quantity - startQty;
        
        // Green for added stock (+), Red for deductions (-), Grey for no change
        let changeColor = netChange > 0 ? '#557a46' : (netChange < 0 ? '#bd4b4b' : '#666'); 
        
        // Format with explicit '+' sign if positive
        let formattedChange = netChange > 0 ? `+${netChange}` : `${netChange}`;

        reportList.innerHTML += `
            <tr>
                <td><strong>${item.name}</strong></td>
                <td>${startQty}</td>
                <td>${item.quantity}</td>
                <td style="color:${changeColor}; font-weight:bold;">${formattedChange}</td>
            </tr>
        `;
    });
}

function updateStockQty(id, change, currentQty) {
    if (currentQty + change < 0) return showToast("Quantity cannot be less than 0");
    db.collection("inventory").doc(id).update({ quantity: firebase.firestore.FieldValue.increment(change) }).catch(() => showToast("Error updating stock quantity."));
}

function addItem() {
    const name = document.getElementById("itemName").value, qty = document.getElementById("itemQty").value;
    const cost = document.getElementById("itemCost").value, expiry = document.getElementById("itemExpiry").value;
    if(name && qty && cost) { 
        db.collection("inventory").add({ name: name.trim(), quantity: parseInt(qty), shiftStartQty: parseInt(qty), cost: parseFloat(cost), expiry: expiry || null })
        .then(() => { document.getElementById("itemName").value = ""; document.getElementById("itemQty").value = ""; document.getElementById("itemCost").value = ""; document.getElementById("itemExpiry").value = ""; }); 
    }
}

function deleteItem(id) { 
    if(confirm("Delete inventory item?")) 
        db.collection("inventory").doc(id).delete(); 
    }

    // --- INVENTORY TAB SWITCHER ---
function switchInvTab(tabName) {
    const liveCard = document.getElementById("liveInventoryCard");
    const reportCard = document.getElementById("inventoryReportCard");
    const btnLive = document.getElementById("tabLiveInventory");
    const btnReport = document.getElementById("tabShiftAnalysis");

    if (tabName === 'live') {
        liveCard.classList.remove("hidden");
        reportCard.classList.add("hidden");
        
        // Highlight Live Tab
        btnLive.style.backgroundColor = "#557a46";
        btnLive.style.color = "white";
        btnReport.style.backgroundColor = "#e0e5e0";
        btnReport.style.color = "#333";
    } else {
        liveCard.classList.add("hidden");
        reportCard.classList.remove("hidden");
        
        // Highlight Report Tab
        btnReport.style.backgroundColor = "#8c5d3a"; 
        btnReport.style.color = "white";
        btnLive.style.backgroundColor = "#e0e5e0";
        btnLive.style.color = "#333";
    }
}

// --- PRINT INVENTORY REPORT ---
function printInventoryReport() {
    // 1. Temporarily render ALL items so the pagination doesn't hide them from the printer
    renderReportPage('ALL');
    
    // 2. Apply the CSS print class to unhide the report area
    document.body.classList.add('print-inv-report');
    
    // 3. Trigger the browser's native print dialog
    window.print();
    
    // 4. Restore the UI back to normal after printing
    document.body.classList.remove('print-inv-report');
    renderReportPage(currentRepPage);
}