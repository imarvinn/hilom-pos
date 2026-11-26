// Safe HTML escaper for inventory & asset labels
function escapeInvHTML(val) {
    return String(val ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

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
    }, (error) => {
        console.error("Error loading inventory:", error);
    });
}

// 1. RENDER LIVE TRACKER TABLE
function renderInventoryPage(page) {
    const invList = document.getElementById("inventoryList");
    const paginationDiv = document.getElementById("inventoryPagination");
    
    // Safety check: Abort if the HTML elements don't exist yet
    if (!invList || !paginationDiv) return;
    
    const totalPages = Math.ceil(allInventoryItems.length / invItemsPerPage) || 1;
    if (page > totalPages) page = totalPages;
    if (page < 1) page = 1;
    currentInvPage = page;

    const startIndex = (page - 1) * invItemsPerPage;
    const endIndex = startIndex + invItemsPerPage;
    const pageItems = allInventoryItems.slice(startIndex, endIndex);

    invList.innerHTML = ""; 
    
    if (pageItems.length === 0) {
        invList.innerHTML = "<tr><td colspan='6' style='text-align:center;'>No inventory items found.</td></tr>";
    }

    pageItems.forEach((item) => {
        let expiryHTML = "-";
        if (item.expiry) {
            const expDate = new Date(item.expiry); const today = new Date(); today.setHours(0,0,0,0);
            const diffDays = Math.ceil((expDate - today) / (1000 * 60 * 60 * 24));
            if (diffDays < 0) { expiryHTML = `<span class="status-expired" style="color:#c62828; font-weight:bold;">Expired</span><br><small>${item.expiry}</small>`; } 
            else if (diffDays <= 7) { expiryHTML = `<span class="status-warning" style="color:#d4a373; font-weight:bold;">Expiring Soon</span><br><small>${item.expiry}</small>`; } 
            else { expiryHTML = `<span class="status-ok" style="color:#2e7d32; font-weight:bold;">Good</span><br><small>${item.expiry}</small>`; }
        }

        const unitLabel = item.unit || "";
        // Set low-stock warning threshold higher for grams/mls (500g) than pieces (5pcs)
        const lowThreshold = (unitLabel === "g" || unitLabel === "ml") ? 500 : 5;
        let statusBadge = (item.quantity || 0) <= lowThreshold 
            ? '<span class="status-low" style="background:#ffebee; color:#c62828; padding:3px 8px; border-radius:12px; font-size:12px;">Low Stock</span>' 
            : '<span class="status-ok" style="background:#e8f5e9; color:#2e7d32; padding:3px 8px; border-radius:12px; font-size:12px;">In Stock</span>';

        // Use larger step jumps (+100 / -100) for grams and mls for easier manual adjustments
        const step = (unitLabel === "g" || unitLabel === "ml") ? 100 : 1;

        invList.innerHTML += `
            <tr>
                <td><strong>${item.name || 'Unnamed'}</strong></td>
                <td>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <button onclick="updateStockQty('${item.id}', -${step}, ${item.quantity || 0})" style="padding: 4px 10px; background: #e0e5e0; color: #333; font-size: 14px; border-radius: 4px; border:none; cursor:pointer;">-${step}</button>
                        <span style="font-size: 16px; font-weight: bold; min-width: 55px; text-align: center;">${item.quantity || 0}${unitLabel}</span>
                        <button onclick="updateStockQty('${item.id}', ${step}, ${item.quantity || 0})" style="padding: 4px 10px; background: #e0e5e0; color: #333; font-size: 14px; border-radius: 4px; border:none; cursor:pointer;">+${step}</button>
                    </div>
                </td>
                <td>₱${(item.cost||0).toFixed(4)}/${unitLabel || 'unit'}</td>
                <td>${expiryHTML}</td>
                <td>${statusBadge}</td>
                <td class="no-print"><button class="delete-btn" style="background:transparent; color:#bd4b4b; border:1px solid #bd4b4b; border-radius:4px; cursor:pointer;" onclick="deleteItem('${item.id}')">✕</button></td>
            </tr>
        `;
    });

    // Build Pagination Buttons
    paginationDiv.innerHTML = `
        <button class="page-btn" style="padding:5px 10px; margin:0 5px;" onclick="renderInventoryPage(${page - 1})" ${page === 1 ? 'disabled' : ''}>◄ Prev</button>
        <span class="page-info" style="font-weight:bold;">Page ${page} of ${totalPages}</span>
        <button class="page-btn" style="padding:5px 10px; margin:0 5px;" onclick="renderInventoryPage(${page + 1})" ${page === totalPages ? 'disabled' : ''}>Next ►</button>
    `;
}

// 2. RENDER SHIFT ANALYSIS TABLE
function renderReportPage(page) {
    const reportList = document.getElementById("inventoryReportList");
    const paginationDiv = document.getElementById("reportPagination");
    
    // Safety check
    if (!reportList || !paginationDiv) return;
    
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
            <button class="page-btn" style="padding:5px 10px; margin:0 5px;" onclick="renderReportPage(${page - 1})" ${page === 1 ? 'disabled' : ''}>◄ Prev</button>
            <span class="page-info" style="font-weight:bold;">Page ${page} of ${totalPages}</span>
            <button class="page-btn" style="padding:5px 10px; margin:0 5px;" onclick="renderReportPage(${page + 1})" ${page === totalPages ? 'disabled' : ''}>Next ►</button>
        `;
    }

    reportList.innerHTML = ""; 
    pageItems.forEach((item) => {
        let startQty = item.shiftStartQty !== undefined ? item.shiftStartQty : (item.quantity || 0); 
        
        // Calculate net change: Current Quantity minus Starting Quantity
        let netChange = (item.quantity || 0) - startQty;
        
        // Green for added stock (+), Red for deductions (-), Grey for no change
        let changeColor = netChange > 0 ? '#557a46' : (netChange < 0 ? '#bd4b4b' : '#666'); 
        
        // Format with explicit '+' sign if positive
        let formattedChange = netChange > 0 ? `+${netChange}` : `${netChange}`;

        reportList.innerHTML += `
            <tr>
                <td><strong>${item.name || 'Unnamed'}</strong></td>
                <td>${startQty}</td>
                <td>${item.quantity || 0}</td>
                <td style="color:${changeColor}; font-weight:bold;">${formattedChange}</td>
            </tr>
        `;
    });
}

function updateStockQty(id, change, currentQty) {
    if (currentQty + change < 0) return showToast("Quantity cannot be less than 0");
    db.collection("inventory").doc(id).update({ quantity: firebase.firestore.FieldValue.increment(change) }).catch(() => showToast("Error updating stock quantity."));
}

// --- AUTO-CONVERTING ADD ITEM FUNCTION ---
function addItem() {
    const name = document.getElementById("itemName").value.trim();
    const rawQty = parseFloat(document.getElementById("itemQty").value);
    const unitSelect = document.getElementById("itemUnit");
    const selectedUnit = unitSelect ? unitSelect.value : "pcs";
    const totalCostInput = parseFloat(document.getElementById("itemCost").value);
    const expiry = document.getElementById("itemExpiry").value;

    if (!name || isNaN(rawQty) || isNaN(totalCostInput)) {
        return showToast("Please fill in a valid name, quantity, and total cost.");
    }

    let finalQty = rawQty;
    let baseUnit = selectedUnit;

    // Auto-convert kg to grams, and Liters to milliliters
    if (selectedUnit === "kg") {
        finalQty = rawQty * 1000;
        baseUnit = "g";
    } else if (selectedUnit === "L") {
        finalQty = rawQty * 1000;
        baseUnit = "ml";
    }

    // Automatically calculate cost per single base unit (e.g. cost per 1 gram)
    const costPerUnit = finalQty > 0 ? (totalCostInput / finalQty) : 0;

    db.collection("inventory").add({
        name: name,
        quantity: finalQty,
        shiftStartQty: finalQty,
        unit: baseUnit,
        cost: costPerUnit,
        expiry: expiry || null
    }).then(() => {
        document.getElementById("itemName").value = "";
        document.getElementById("itemQty").value = "";
        document.getElementById("itemCost").value = "";
        document.getElementById("itemExpiry").value = "";
        showToast("Stock added successfully!");
    }).catch(err => {
        console.error("Error adding stock:", err);
        showToast("Failed to add stock.");
    });
}

async function deleteItem(id) {
    const confirmed = window.hilomConfirm
        ? await hilomConfirm("Delete this inventory item?")
        : confirm("Delete inventory item?");
    if (confirmed) {
        try {
            const itemObj = allInventoryItems.find(i => i.id === id);
            await db.collection("inventory").doc(id).delete();
            if (typeof window.recordAuditEvent === "function") {
                window.recordAuditEvent({
                    category: "SECURITY",
                    action: "DELETE_INVENTORY",
                    tableNo: "Inventory",
                    amount: 0,
                    details: `Deleted inventory item: ${itemObj ? itemObj.name : id}`
                });
            }
            showToast("Inventory item deleted.");
        } catch (err) {
            console.error("Error deleting inventory item:", err);
            showToast("Failed to delete inventory item.");
        }
    }
}

// --- INVENTORY TAB SWITCHER ---
function switchInvTab(tabName) {
    const liveCard = document.getElementById("liveInventoryCard");
    const reportCard = document.getElementById("inventoryReportCard");
    const assetsCard = document.getElementById("assetsCard"); 

    const btnLive = document.getElementById("tabLiveInventory");
    const btnReport = document.getElementById("tabShiftAnalysis");
    const btnAssets = document.getElementById("tabFixedAssets"); 
    
    if(!liveCard || !reportCard || !assetsCard) return;

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
// FIXED ASSETS LOGIC (WITH DEPARTMENT & EDITING)
// ==========================================

let editingAssetId = null;

// 1. Add or Update Asset in Firebase
async function addAsset() {
    const rawName = document.getElementById("assetName").value.trim();
    const name = typeof sanitizeHTML === "function" ? sanitizeHTML(rawName) : rawName.replace(/[<>]/g, "");
    const category = document.getElementById("assetCategory").value;
    const deptEl = document.getElementById("assetDepartment");
    const department = deptEl ? deptEl.value : "General / Shared";
    const qty = parseInt(document.getElementById("assetQty").value);
    const cost = parseFloat(document.getElementById("assetCost").value) || 0;
    const date = document.getElementById("assetDate").value;
    const rawSerial = document.getElementById("assetSerial").value.trim() || "-";
    const serial = typeof sanitizeHTML === "function" ? sanitizeHTML(rawSerial) : rawSerial.replace(/[<>]/g, "");
    const status = document.getElementById("assetStatus").value;

    if (!name || isNaN(qty) || qty < 0) return alert("Please provide a valid name and quantity.");

    const payload = {
        name: name,
        category: category,
        department: department,
        quantity: qty,
        purchaseCost: cost,
        purchaseDate: date,
        serialNumber: serial,
        status: status
    };

    try {
        if (editingAssetId) {
            const oldAsset = allFixedAssetsData.find(a => a.id === editingAssetId) || {};
            payload.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
            await db.collection("fixed_assets").doc(editingAssetId).update(payload);

            if (typeof window.recordAuditEvent === "function") {
                window.recordAuditEvent({
                    category: "SECURITY",
                    action: "EDIT_ASSET",
                    tableNo: department,
                    amount: qty * cost,
                    details: `Updated fixed asset "${name}": Cat [${oldAsset.category || "-"} → ${category}], Dept [${oldAsset.department || "Unassigned"} → ${department}], Qty [${oldAsset.quantity ?? 0} → ${qty}], Cost [₱${(oldAsset.purchaseCost || 0).toFixed(2)} → ₱${cost.toFixed(2)}], Status [${oldAsset.status || "Active"} → ${status}].`
                });
            }

            showToast(`Asset "${name}" updated!`);
            resetAssetForm();
        } else {
            payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            await db.collection("fixed_assets").add(payload);
            showToast(`Asset added to ${department} (${category})!`);
            resetAssetForm();
        }
    } catch (error) {
        console.error("Error saving asset:", error);
        alert("Failed to save asset.");
    }
}

// 1b. Load Existing Asset Into Form for Editing
function editAsset(id) {
    const asset = allFixedAssetsData.find(a => a.id === id);
    if (!asset) return showToast("Asset record not found.");

    editingAssetId = id;

    document.getElementById("assetName").value = asset.name || "";

    const catSelect = document.getElementById("assetCategory");
    if (catSelect) {
        const hasCat = Array.from(catSelect.options).some(opt => opt.value === asset.category);
        catSelect.value = hasCat ? asset.category : "Other";
    }

    const deptSelect = document.getElementById("assetDepartment");
    if (deptSelect) {
        const hasDept = Array.from(deptSelect.options).some(opt => opt.value === asset.department);
        deptSelect.value = hasDept ? asset.department : "General / Shared";
    }

    document.getElementById("assetQty").value = asset.quantity ?? 0;
    document.getElementById("assetCost").value = asset.purchaseCost ?? 0;
    document.getElementById("assetDate").value = asset.purchaseDate || "";
    document.getElementById("assetSerial").value = (asset.serialNumber && asset.serialNumber !== "-") ? asset.serialNumber : "";

    const statusSelect = document.getElementById("assetStatus");
    if (statusSelect) {
        const hasStatus = Array.from(statusSelect.options).some(opt => opt.value === asset.status);
        statusSelect.value = hasStatus ? asset.status : "Active";
    }

    const submitBtn = document.getElementById("assetSubmitBtn");
    if (submitBtn) {
        submitBtn.innerText = "💾 Update Asset";
        submitBtn.style.backgroundColor = "#4a6fa5";
    }

    const cancelBtn = document.getElementById("cancelEditAssetBtn");
    if (cancelBtn) cancelBtn.classList.remove("hidden");

    const banner = document.getElementById("assetEditBanner");
    const bannerName = document.getElementById("assetEditNameDisplay");
    if (bannerName) bannerName.innerText = asset.name || "Unnamed Asset";
    if (banner) banner.classList.remove("hidden");

    document.getElementById("assetName").scrollIntoView({ behavior: "smooth", block: "center" });
    document.getElementById("assetName").focus();
}

// 1c. Reset Asset Form Back to Add Mode
function resetAssetForm() {
    editingAssetId = null;
    document.getElementById("assetName").value = "";
    document.getElementById("assetQty").value = "";
    document.getElementById("assetCost").value = "";
    document.getElementById("assetDate").value = "";
    document.getElementById("assetSerial").value = "";

    const statusSelect = document.getElementById("assetStatus");
    if (statusSelect) statusSelect.value = "Active";

    const submitBtn = document.getElementById("assetSubmitBtn");
    if (submitBtn) {
        submitBtn.innerText = "+ Add Asset";
        submitBtn.style.backgroundColor = "";
    }

    const cancelBtn = document.getElementById("cancelEditAssetBtn");
    if (cancelBtn) cancelBtn.classList.add("hidden");

    const banner = document.getElementById("assetEditBanner");
    if (banner) banner.classList.add("hidden");
}

// 2. Listen to Assets Collection & Render Filtered Table + Metrics
let assetsListener = null;
let allFixedAssetsData = [];

function loadAssets() {
    if (assetsListener !== null) {
        renderAssetsTable();
        return; // Prevent duplicate listeners
    }

    assetsListener = db.collection("fixed_assets").orderBy("name").onSnapshot(snapshot => {
        allFixedAssetsData = [];
        snapshot.forEach(doc => {
            allFixedAssetsData.push({ id: doc.id, ...doc.data() });
        });
        renderAssetsTable();
    }, error => {
        console.error("Error loading fixed assets:", error);
    });
}

function renderAssetsTable() {
    const list = document.getElementById("assetsList");
    if (!list) return;

    const filterEl = document.getElementById("assetDeptFilter");
    const activeDept = filterEl ? filterEl.value : "ALL";

    const filteredAssets = allFixedAssetsData.filter(data => {
        const dept = data.department || "Unassigned";
        return activeDept === "ALL" || dept === activeDept;
    });

    list.innerHTML = "";

    if (filteredAssets.length === 0) {
        const emptyMsg = activeDept === "ALL"
            ? "No assets recorded yet."
            : `No assets recorded under ${escapeInvHTML(activeDept)}.`;
        list.innerHTML = `<tr><td colspan="9" style="text-align: center; color: #888; padding: 15px;">${emptyMsg}</td></tr>`;
        document.getElementById("assetMetricTotalUnits").innerText = "0";
        document.getElementById("assetMetricTotalValuation").innerText = "₱0.00";
        document.getElementById("assetMetricActiveUnits").innerText = "0";
        document.getElementById("assetMetricMaintUnits").innerText = "0";
        document.getElementById("assetMetricDisposedUnits").innerText = "0";
        return;
    }

    let totalUnits = 0;
    let totalValuation = 0;
    let activeUnits = 0;
    let maintUnits = 0;
    let disposedUnits = 0;

    filteredAssets.forEach(data => {
        const qty = data.quantity || 0;
        const cost = data.purchaseCost || 0;
        const itemTotalCost = cost * qty;
        const status = data.status || "Active";
        const department = data.department || "Unassigned";

        totalUnits += qty;
        totalValuation += itemTotalCost;

        if (status === "Active") activeUnits += qty;
        else if (status === "Maintenance") maintUnits += qty;
        else if (status === "Disposed") disposedUnits += qty;

        let statusColor = "#557a46"; let bgStatus = "#e8f5e9";
        if (status === "Maintenance") { statusColor = "#d4a373"; bgStatus = "#fff3cd"; }
        else if (status === "Disposed") { statusColor = "#bd4b4b"; bgStatus = "#ffebee"; }

        list.innerHTML += `
            <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 10px; font-weight: bold; color: #333;">${escapeInvHTML(data.name)}</td>
                <td style="padding: 10px;"><span style="background: #e9ece9; padding: 4px 8px; border-radius: 4px; font-size: 11px; color: #555; font-weight: bold;">${escapeInvHTML(data.category)}</span></td>
                <td style="padding: 10px;"><span style="background: #eef4fb; border: 1px solid #c5daf2; padding: 4px 8px; border-radius: 4px; font-size: 11px; color: #2d5986; font-weight: bold;">${escapeInvHTML(department)}</span></td>
                <td style="padding: 10px; font-weight: bold; font-size: 15px; color: #2b4227;">${qty}</td>
                <td style="padding: 10px; color: #555;">₱${cost.toFixed(2)}<br><small style="color:#888;">(Tot: ₱${itemTotalCost.toFixed(2)})</small></td>
                <td style="padding: 10px; color: #888; font-family: monospace;">${escapeInvHTML(data.serialNumber || "-")}</td>
                <td style="padding: 10px;"><span style="background: ${bgStatus}; color: ${statusColor}; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: bold;">${escapeInvHTML(status)}</span></td>
                <td style="padding: 10px; color: #666;">${escapeInvHTML(data.purchaseDate || "-")}</td>
                <td class="no-print" style="padding: 10px; white-space: nowrap;">
                    <button onclick="updateAssetQty('${data.id}', ${qty}, 1)" style="background: #557a46; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-weight: bold;">+1</button>
                    <button onclick="updateAssetQty('${data.id}', ${qty}, -1)" style="background: #d4a373; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-weight: bold; margin-left: 2px;">-1</button>
                    <button onclick="editAsset('${data.id}')" style="background: transparent; color: #4a6fa5; border: 1px solid #4a6fa5; padding: 4px 8px; border-radius: 4px; cursor: pointer; margin-left: 5px; font-size: 11px; font-weight: bold;">Edit</button>
                    <button onclick="deleteAsset('${data.id}')" style="background: transparent; color: #bd4b4b; border: 1px solid #bd4b4b; padding: 4px 8px; border-radius: 4px; cursor: pointer; margin-left: 4px; font-size: 11px;">Remove</button>
                </td>
            </tr>
        `;
    });

    document.getElementById("assetMetricTotalUnits").innerText = totalUnits;
    document.getElementById("assetMetricTotalValuation").innerText = `₱${totalValuation.toLocaleString('en-PH', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    document.getElementById("assetMetricActiveUnits").innerText = activeUnits;
    document.getElementById("assetMetricMaintUnits").innerText = maintUnits;
    document.getElementById("assetMetricDisposedUnits").innerText = disposedUnits;
}

// 3. Update Quantity
async function updateAssetQty(id, currentQty, change) {
    const newQty = currentQty + change;
    if (newQty < 0) return; 
    try {
        await db.collection("fixed_assets").doc(id).update({ quantity: newQty });
    } catch (error) {
        console.error("Error updating qty:", error);
    }
}

// 4. Delete Asset completely
async function deleteAsset(id) {
    const confirmed = window.hilomConfirm
        ? await hilomConfirm("Are you sure you want to permanently remove this asset?")
        : confirm("Are you sure you want to permanently remove this asset?");
    if (confirmed) {
        try {
            const assetObj = allFixedAssetsData.find(a => a.id === id);
            await db.collection("fixed_assets").doc(id).delete();
            if (editingAssetId === id) resetAssetForm();
            if (typeof window.recordAuditEvent === "function") {
                window.recordAuditEvent({
                    category: "SECURITY",
                    action: "DELETE_ASSET",
                    tableNo: assetObj ? (assetObj.department || "Fixed Assets") : "Fixed Assets",
                    amount: assetObj ? ((assetObj.quantity || 0) * (assetObj.purchaseCost || 0)) : 0,
                    details: `Removed fixed asset: ${assetObj ? `${assetObj.name} (${assetObj.category}, Qty ${assetObj.quantity || 0})` : id}`
                });
            }
            showToast("Asset removed.");
        } catch (error) {
            console.error("Error deleting asset:", error);
        }
    }
}

// 5. Print Asset Inventory & Valuation Report (Respects Department Filter)
function printAssetReport() {
    const filterEl = document.getElementById("assetDeptFilter");
    const activeDept = filterEl ? filterEl.value : "ALL";
    const itemsToPrint = allFixedAssetsData.filter(item => {
        const dept = item.department || "Unassigned";
        return activeDept === "ALL" || dept === activeDept;
    });

    if (itemsToPrint.length === 0) return showToast("No asset data available to print.");

    let totalVal = 0;
    let totalUnits = 0;
    let tableRows = "";

    itemsToPrint.forEach(item => {
        let subtotal = (item.quantity || 0) * (item.purchaseCost || 0);
        totalVal += subtotal;
        totalUnits += (item.quantity || 0);

        tableRows += `
            <tr>
                <td style="border: 1px solid #ccc; padding: 8px;"><b>${escapeInvHTML(item.name)}</b></td>
                <td style="border: 1px solid #ccc; padding: 8px;">${escapeInvHTML(item.category)}</td>
                <td style="border: 1px solid #ccc; padding: 8px;">${escapeInvHTML(item.department || "Unassigned")}</td>
                <td style="border: 1px solid #ccc; padding: 8px; text-align: center;">${item.quantity || 0}</td>
                <td style="border: 1px solid #ccc; padding: 8px; text-align: right;">₱${(item.purchaseCost || 0).toFixed(2)}</td>
                <td style="border: 1px solid #ccc; padding: 8px; text-align: right;">₱${subtotal.toFixed(2)}</td>
                <td style="border: 1px solid #ccc; padding: 8px; text-align: center;">${escapeInvHTML(item.status || "Active")}</td>
                <td style="border: 1px solid #ccc; padding: 8px; text-align: center;">${escapeInvHTML(item.serialNumber || "-")}</td>
            </tr>
        `;
    });

    const deptSubtitle = activeDept === "ALL" ? "All Departments" : `Department: ${escapeInvHTML(activeDept)}`;

    const printWin = window.open('', '_blank', 'width=950,height=700');
    printWin.document.write(`
        <html>
        <head>
            <title>Fixed Assets & Capital Inventory Report</title>
            <style>
                body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 30px; color: #333; }
                h2, h4 { margin: 5px 0; color: #2b4227; text-align: center; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 13px; }
                th { background-color: #f1f8e9; border: 1px solid #ccc; padding: 8px; text-align: left; }
                .total-bar { margin-top: 20px; padding: 15px; background: #e8f5e9; border: 1px solid #c8dac8; display: flex; justify-content: space-between; font-weight: bold; }
            </style>
        </head>
        <body>
            <div style="border-bottom: 2px solid #2b4227; padding-bottom: 10px; margin-bottom: 20px;">
                <h2>HILOM RESORT - FIXED ASSETS REGISTER & VALUATION</h2>
                <h4>${deptSubtitle} &nbsp;|&nbsp; Generated on: ${new Date().toLocaleString()}</h4>
            </div>
            <table>
                <thead>
                    <tr>
                        <th>Asset Name</th>
                        <th>Category</th>
                        <th>Department</th>
                        <th style="text-align: center;">Qty</th>
                        <th style="text-align: right;">Unit Cost</th>
                        <th style="text-align: right;">Total Value</th>
                        <th style="text-align: center;">Status</th>
                        <th style="text-align: center;">Serial No.</th>
                    </tr>
                </thead>
                <tbody>
                    ${tableRows}
                </tbody>
            </table>
            <div class="total-bar">
                <span>Total Recorded Assets: ${totalUnits} Units</span>
                <span>Combined Asset Value: ₱${totalVal.toLocaleString('en-PH', {minimumFractionDigits: 2})}</span>
            </div>
        </body>
        </html>
    `);
    printWin.document.close();
    printWin.focus();
    setTimeout(() => { printWin.print(); printWin.close(); }, 350);
}