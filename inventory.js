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
    const assetsCard = document.getElementById("assetsCard"); // NEW

    const btnLive = document.getElementById("tabLiveInventory");
    const btnReport = document.getElementById("tabShiftAnalysis");
    const btnAssets = document.getElementById("tabFixedAssets"); // NEW

    // 1. Reset all buttons to inactive gray
    btnLive.style.backgroundColor = "#e0e5e0";
    btnLive.style.color = "#333";
    btnReport.style.backgroundColor = "#e0e5e0";
    btnReport.style.color = "#333";
    btnAssets.style.backgroundColor = "#e0e5e0";
    btnAssets.style.color = "#333";

    // 2. Hide all cards
    liveCard.classList.add("hidden");
    reportCard.classList.add("hidden");
    assetsCard.classList.add("hidden");

    // 3. Show the selected card and highlight its button
    if (tabName === 'live') {
        liveCard.classList.remove("hidden");
        btnLive.style.backgroundColor = "#557a46"; // Green
        btnLive.style.color = "white";
    } else if (tabName === 'analysis') {
        reportCard.classList.remove("hidden");
        btnReport.style.backgroundColor = "#8c5d3a"; // Brown
        btnReport.style.color = "white";
    } else if (tabName === 'assets') {
        assetsCard.classList.remove("hidden");
        btnAssets.style.backgroundColor = "#2b4227"; // Dark Green
        btnAssets.style.color = "white";
        
        // Trigger the Firebase fetch when they open the tab
        if (typeof loadAssets === "function") loadAssets();
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

// ==========================================
// FIXED ASSETS LOGIC
// ==========================================

// 1. Add Asset to Firebase
async function addAsset() {
    const name = document.getElementById("assetName").value.trim();
    const category = document.getElementById("assetCategory").value;
    const qty = parseInt(document.getElementById("assetQty").value);

    if (!name || isNaN(qty)) return alert("Please provide a valid name and quantity.");

    try {
        await db.collection("fixed_assets").add({
            name: name,
            category: category,
            quantity: qty,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        document.getElementById("assetName").value = "";
        document.getElementById("assetQty").value = "";
    } catch (error) {
        console.error("Error adding asset:", error);
        alert("Failed to add asset.");
    }
}

// 2. Listen to Assets Collection
let assetsListener = null;
function loadAssets() {
    if (assetsListener !== null) return; // Prevent duplicate listeners

    assetsListener = db.collection("fixed_assets").orderBy("name").onSnapshot(snapshot => {
        const list = document.getElementById("assetsList");
        list.innerHTML = "";

        if (snapshot.empty) {
            list.innerHTML = "<tr><td colspan='4' style='text-align: center; color: #888; padding: 15px;'>No assets recorded yet.</td></tr>";
            return;
        }

        snapshot.forEach(doc => {
            const data = doc.data();
            list.innerHTML += `
                <tr style="border-bottom: 1px solid #eee;">
                    <td style="font-weight: bold; color: #333;">${data.name}</td>
                    <td><span style="background: #e9ece9; padding: 4px 8px; border-radius: 4px; font-size: 12px; color: #555;">${data.category}</span></td>
                    <td style="font-weight: bold; font-size: 15px; color: #2b4227;">${data.quantity}</td>
                    <td class="no-print">
                        <button onclick="updateAssetQty('${doc.id}', ${data.quantity}, 1)" style="background: #557a46; color: white; border: none; padding: 4px 10px; border-radius: 4px; cursor: pointer; font-weight: bold;">+1</button>
                        <button onclick="updateAssetQty('${doc.id}', ${data.quantity}, -1)" style="background: #d4a373; color: white; border: none; padding: 4px 10px; border-radius: 4px; cursor: pointer; font-weight: bold; margin-left: 5px;">-1</button>
                        <button onclick="deleteAsset('${doc.id}')" style="background: transparent; color: #bd4b4b; border: 1px solid #bd4b4b; padding: 4px 8px; border-radius: 4px; cursor: pointer; margin-left: 10px; font-size: 11px;">Remove</button>
                    </td>
                </tr>
            `;
        });
    });
}

// 3. Update Quantity (e.g., if a towel goes missing)
async function updateAssetQty(id, currentQty, change) {
    const newQty = currentQty + change;
    if (newQty < 0) return; // Prevent negative stock
    try {
        await db.collection("fixed_assets").doc(id).update({ quantity: newQty });
    } catch (error) {
        console.error("Error updating qty:", error);
    }
}

// 4. Delete Asset completely
async function deleteAsset(id) {
    if (confirm("Are you sure you want to permanently remove this asset?")) {
        try {
            await db.collection("fixed_assets").doc(id).delete();
        } catch (error) {
            console.error("Error deleting asset:", error);
        }
    }
}