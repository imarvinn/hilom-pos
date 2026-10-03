// ==========================================
// --- FRONT DESK ROOM RACK & FOLIO LOGIC ---
// ==========================================

let activeFolioData = null;
let activeFolioRoomId = null;

function loadRoomRack() {
    db.collection("rooms").orderBy("roomNumber", "asc").onSnapshot((snapshot) => {
        const container = document.getElementById("roomRackContainer");
        if (!container) return; 
        container.innerHTML = "";
        
        if (snapshot.empty) {
            container.innerHTML = "<p style='color:#888;'>No rooms added yet.</p>";
            return;
        }

        snapshot.forEach((doc) => {
            const room = doc.data();
            
            // --- NEW MAINTENANCE COLORS ---
            let borderColor = "#2e7d32"; let bgColor = "#f1f8e9";
            if (room.status === "OCCUPIED") { borderColor = "#c62828"; bgColor = "#ffebee"; }
            else if (room.status === "MAINTENANCE") { borderColor = "#d4a373"; bgColor = "#fff3cd"; }
            
            // --- DYNAMIC ACTION BUTTONS ---
            let actionBtn = "";
            if (room.status === "AVAILABLE") {
                actionBtn = `
                    <button class="add-btn" style="width: 100%; padding: 10px; font-size: 14px; margin-bottom: 5px;" onclick="checkInRoom('${doc.id}', ${room.dailyRate}, '${room.roomType}')">Check-In Guest</button>
                    <button class="warn-btn" style="width: 100%; padding: 6px; font-size: 12px; background: #d4a373; border: none; color: white;" onclick="setRoomMaintenance('${doc.id}')">🛠️ Set Maintenance</button>
                `;
            } else if (room.status === "OCCUPIED") {
                actionBtn = `<button class="warn-btn" style="width: 100%; padding: 10px; font-size: 14px; background:#4a6fa5; color:white;" onclick="openFolioModal('${doc.id}', '${room.currentFolioId}')">View Room Folio</button>`;
            } else if (room.status === "MAINTENANCE") {
                actionBtn = `<button class="save-btn" style="width: 100%; padding: 10px; font-size: 14px; background: #557a46;" onclick="finishRoomMaintenance('${doc.id}')">✔️️ Ready / Available</button>`;
            }

            container.innerHTML += `
                <div style="border: 2px solid ${borderColor}; background: ${bgColor}; border-radius: 8px; padding: 15px; display: flex; flex-direction: column; justify-content: space-between; min-height: 160px;">
                    <div>
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <span style="font-weight: bold; font-size: 18px; color: #2b4227;">Room ${room.roomNumber}</span>
                            <span style="font-size: 11px; font-weight: bold; padding: 3px 8px; border-radius: 12px; background:${borderColor}; color:white;">${room.status}</span>
                        </div>
                        <div style="font-size: 12px; color: #666; margin-top: 5px;">${room.roomType}</div>
                        <div style="font-size: 14px; font-weight: bold; color: #557a46; margin-top: 5px;">₱${room.dailyRate.toFixed(2)} / night</div>
                        ${room.currentGuestName ? `<div style="font-size: 12px; font-weight: bold; color: #333; margin-top: 8px;">👤 ${room.currentGuestName}</div>` : ''}
                    </div>
                    <div style="margin-top: 15px; display: flex; flex-direction: column; gap: 8px;">
                        ${actionBtn}
                        <button class="delete-btn" style="background: transparent; color: #bd4b4b; border: 1px solid #bd4b4b; padding: 5px; font-size: 11px;" onclick="deleteRoom('${doc.id}')">Delete Room</button>
                    </div>
                </div>
            `;
        });
    });
}

// --- 1. UPDATE THIS: CHECK-IN (CREATES FOLIO LEDGER) ---
async function checkInRoom(roomId, rate, type) {
    let guestName = prompt(`Enter Guest Name for Room ${roomId}:`, "Walk-in Guest");
    if (!guestName) return; 
    
    let nightsStr = prompt(`How many nights? (Rate: ₱${rate}/night)`, "1");
    if (!nightsStr) return; 
    let nights = parseInt(nightsStr);
    if (isNaN(nights) || nights <= 0) return showToast("Invalid number of nights.");

    // NEW: Prompt for inclusions
    let inclusions = prompt(`Enter inclusions (e.g., Free Breakfast for 2) or leave blank:`, "Free Breakfast x2");

    let checkInDate = new Date();
    let expectedCheckOut = new Date(checkInDate);
    expectedCheckOut.setDate(expectedCheckOut.getDate() + nights);
    expectedCheckOut.setHours(12, 0, 0, 0); 

    const batch = db.batch();
    const folioRef = db.collection("folios").doc();

    batch.set(folioRef, {
        roomId: roomId,
        roomType: type || "Standard", 
        guestName: guestName,
        checkInTime: checkInDate.toISOString(),
        expectedCheckOut: expectedCheckOut.toISOString(), 
        dailyRate: rate,
        nights: nights,
        inclusions: inclusions || "None", // Saves the inclusions
        roomChargesTotal: rate * nights,
        posChargesTotal: 0,
        posOrders: [],
        grandTotal: rate * nights,
        status: "OPEN"
    });

    batch.update(db.collection("rooms").doc(roomId), {
        status: "OCCUPIED",
        currentGuestName: guestName,
        currentFolioId: folioRef.id
    });

    try { await batch.commit(); showToast(`Guest checked into Room ${roomId}!`); } 
    catch(e) { console.error(e); showToast("Error processing check-in."); }
}

// --- 2. UPDATE THIS: VIEW & SETTLE FOLIO ---
async function openFolioModal(roomId, folioId) {
    if(!folioId) return showToast("No active folio found.");
    activeFolioRoomId = roomId;
    
    try {
        const folioDoc = await db.collection("folios").doc(folioId).get();
        if (!folioDoc.exists) return;
        activeFolioData = { id: folioDoc.id, ...folioDoc.data() };
        
        const dateOptions = { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' };
        const checkInStr = new Date(activeFolioData.checkInTime).toLocaleString('en-US', dateOptions);
        const checkOutStr = activeFolioData.expectedCheckOut ? new Date(activeFolioData.expectedCheckOut).toLocaleString('en-US', dateOptions) : 'TBD';
        
        // Adds the inclusions to the header UI
        let inclusionsText = activeFolioData.inclusions && activeFolioData.inclusions !== "None" 
            ? `<br><span style="color:#557a46;"><strong>Inclusions:</strong> ${activeFolioData.inclusions}</span>` 
            : "";

        document.getElementById("folioHeader").innerHTML = `
            <div style="display: flex; justify-content: space-between;">
                <div><strong>Guest:</strong> ${activeFolioData.guestName}</div>
                <div><strong>Room:</strong> ${activeFolioData.roomId}</div>
            </div>
            <div style="font-size: 12px; color: #555; margin-top: 5px; border-top: 1px dashed #ccc; padding-top: 5px;">
                <strong>In:</strong> ${checkInStr} &nbsp;|&nbsp; <strong>Out:</strong> ${checkOutStr}
                ${inclusionsText}
            </div>
        `;

        let breakdownHTML = `
            <div style="display:flex; justify-content:space-between; margin-bottom: 6px;">
                <span>Room ${activeFolioData.roomId} (${activeFolioData.nights} night/s):</span>
                <span>₱${activeFolioData.roomChargesTotal.toFixed(2)}</span>
            </div>
        `;

        if (activeFolioData.posOrders && activeFolioData.posOrders.length > 0) {
            breakdownHTML += `<div style="border-top: 1px dashed #ccc; margin: 8px 0; padding-top: 6px; font-weight:bold;">Additional Charges:</div>`;
            activeFolioData.posOrders.forEach(order => {
                let displayLabel = order.itemsSummary.replace("Front Desk: ", "");
                breakdownHTML += `
                    <div style="display:flex; justify-content:space-between; color:#555; margin-bottom: 4px; font-size:12px;">
                        <span>${displayLabel}</span>
                        <span>₱${order.amount.toFixed(2)}</span>
                    </div>
                `;
            });
        }

        document.getElementById("folioBreakdown").innerHTML = breakdownHTML;
        document.getElementById("folioGrandTotal").innerText = `₱${activeFolioData.grandTotal.toFixed(2)}`;
        document.getElementById("folioModal").classList.remove("hidden");
    } catch (err) { console.error(err); showToast("Error loading folio."); }
}

function closeFolioModal() {
    document.getElementById("folioModal").classList.add("hidden");
    activeFolioData = null; activeFolioRoomId = null;
}

// --- PAY & CHECKOUT ROOM ---
async function processFolioCheckout() {
    if (!activeFolioData) return;
    if (!confirm(`Complete checkout and record payment of ₱${activeFolioData.grandTotal.toFixed(2)} for Room ${activeFolioRoomId}?`)) return;

    const batch = db.batch();
    const folioRef = db.collection("folios").doc(activeFolioData.id);
    const roomRef = db.collection("rooms").doc(activeFolioRoomId);
    
    // Generate Invoice for Sales Report
    const configRef = db.collection('config').doc('system');
    const configDoc = await configRef.get();
    let invNum = configDoc.exists ? (configDoc.data().invoiceCount || 1) : 1;
    let currentGT = configDoc.exists ? (configDoc.data().grandTotal || 0) : 0;
    let invString = "INV-" + String(invNum).padStart(6, '0');

    // 1. Log payment into standard Sales Report
    const saleRef = db.collection("sales").doc();
    batch.set(saleRef, {
        invoiceNo: invString,
        tableNo: `Room ${activeFolioRoomId}`,
        itemName: "Room Folio Checkout",
        grossAmount: activeFolioData.grandTotal,
        netAmount: activeFolioData.grandTotal,
        totalCost: 0, 
        paymentMethod: "Cash",
        status: 'COMPLETED',
        archived: false,
        timestamp: new Date()
    });

    // 2. Close Folio & Clear Room
    batch.update(folioRef, { status: "CLOSED", closedAt: new Date().toISOString(), invoiceNo: invString });
    batch.update(roomRef, { status: "AVAILABLE", currentFolioId: null, currentGuestName: null });
    batch.update(configRef, { invoiceCount: invNum + 1, grandTotal: currentGT + activeFolioData.grandTotal });

    try {
        await batch.commit();
        showToast(`Room ${activeFolioRoomId} checked out successfully!`);
        closeFolioModal();
    } catch(e) { console.error(e); showToast("Error processing checkout."); }
}

// --- 3. UPDATE THIS: PRINT FOLIO INVOICE ---
function printFolioInvoice() {
    if (!activeFolioData) return showToast("No active folio to print.");

    const dateOptions = { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' };
    const checkInTime = new Date(activeFolioData.checkInTime);
    let checkOutTime;
    
    if (activeFolioData.status === "CLOSED" && activeFolioData.closedAt) {
        checkOutTime = new Date(activeFolioData.closedAt);
    } else if (activeFolioData.expectedCheckOut) {
        checkOutTime = new Date(activeFolioData.expectedCheckOut);
    } else {
        checkOutTime = new Date();
    }

    document.getElementById("invGuestName").innerText = activeFolioData.guestName;
    document.getElementById("invRoom").innerText = activeFolioData.roomId;
    document.getElementById("invCheckIn").innerText = checkInTime.toLocaleString('en-US', dateOptions);
    document.getElementById("invCheckOut").innerText = checkOutTime.toLocaleString('en-US', dateOptions);
    
    const roomTitleEl = document.getElementById("invRoomTitle");
    if (roomTitleEl) {
        roomTitleEl.innerText = `Room ${activeFolioData.roomId} - ${activeFolioData.roomType || "Stay"}`;
    }
    
    // NEW: Inject the Inclusions text directly under the room rate on the invoice
    let rateText = `₱${activeFolioData.dailyRate.toFixed(2)} x ${activeFolioData.nights} night(s)`;
    if (activeFolioData.inclusions && activeFolioData.inclusions !== "None") {
        rateText += `<br><span style="color:#557a46; font-style:italic; font-weight:bold;">+ ${activeFolioData.inclusions}</span>`;
    }
    document.getElementById("invRoomRate").innerHTML = rateText;
    
    document.getElementById("invRoomTotal").innerText = `₱${activeFolioData.roomChargesTotal.toFixed(2)}`;

    let posOrdersHTML = '';
    if (activeFolioData.posOrders && activeFolioData.posOrders.length > 0) {
        activeFolioData.posOrders.forEach(order => {
            let mainLabel = "Restaurant Charge";
            let subLabel = order.itemsSummary;
            
            if (order.itemsSummary.startsWith("Front Desk: ")) {
                mainLabel = order.itemsSummary.replace("Front Desk: ", "");
                subLabel = "Additional Folio Charge"; 
            }

            posOrdersHTML += `
                <tr>
                    <td style="padding: 10px; border: 1px solid #ccc;">
                        <strong>${mainLabel}</strong><br>
                        <small style="color: #555;">${subLabel}</small>
                    </td>
                    <td style="padding: 10px; border: 1px solid #ccc; text-align: right;">₱${order.amount.toFixed(2)}</td>
                </tr>`;
        });
    }
    
    document.getElementById("invPosList").innerHTML = posOrdersHTML;
    document.getElementById("invGrandTotal").innerText = `₱${activeFolioData.grandTotal.toFixed(2)}`;

    document.body.classList.add("print-folio");
    setTimeout(() => { window.print(); document.body.classList.remove("print-folio"); }, 250);
}

function addNewRoom() {
    const roomNumber = document.getElementById("newRoomNumber").value.trim();
    const roomType = document.getElementById("newRoomType").value.trim();
    const dailyRate = parseFloat(document.getElementById("newRoomRate").value);

    if (!roomNumber || !roomType || !dailyRate) return showToast("Please fill in all room details.");

    db.collection("rooms").doc(roomNumber).set({
        roomNumber: roomNumber, roomType: roomType, dailyRate: dailyRate,
        status: "AVAILABLE", currentFolioId: null, currentGuestName: null, updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(() => {
        showToast(`Room ${roomNumber} created!`);
        document.getElementById("newRoomNumber").value = ""; document.getElementById("newRoomType").value = ""; document.getElementById("newRoomRate").value = "";
    });
}

function deleteRoom(roomId) {
    if (confirm(`Are you sure you want to delete Room ${roomId}?`)) db.collection("rooms").doc(roomId).delete();
}

// --- ADD EXTRA CUSTOM CHARGE TO FOLIO (e.g., Beddings) ---
async function addFolioCharge() {
    if (!activeFolioData || !activeFolioRoomId) return;

    const chargeName = prompt("Enter charge description (e.g., Extra Bedding, Laundry):", "Extra Bedding");
    if (!chargeName) return;
    
    const chargeAmtStr = prompt(`Enter amount for ${chargeName} (₱):`, "500");
    if (!chargeAmtStr) return;
    
    const amount = parseFloat(chargeAmtStr);
    if (isNaN(amount) || amount <= 0) return showToast("Invalid amount entered.");

    const folioRef = db.collection("folios").doc(activeFolioData.id);

    try {
        await folioRef.update({
            // Reusing the posOrders array to keep the receipt formatting unified
            posOrders: firebase.firestore.FieldValue.arrayUnion({
                itemsSummary: `Front Desk: ${chargeName}`,
                amount: amount,
                timestamp: new Date().toISOString()
            }),
            posChargesTotal: firebase.firestore.FieldValue.increment(amount),
            grandTotal: firebase.firestore.FieldValue.increment(amount)
        });

        showToast(`₱${amount.toFixed(2)} charged to Room ${activeFolioRoomId} for ${chargeName}!`);
        
        // Temporarily store IDs, close, and immediately reopen to refresh the UI
        const savedRoomId = activeFolioRoomId;
        const savedFolioId = activeFolioData.id;
        closeFolioModal();
        setTimeout(() => { openFolioModal(savedRoomId, savedFolioId); }, 200);

    } catch (err) {
        console.error(err);
        showToast("Error adding charge to folio.");
    }
}

// --- 1. OPEN THE PAYMENT MODAL ---
function initiateFolioCheckout() {
    if (!activeFolioData) return showToast("No active folio selected.");
    
    // Set the grand total text
    document.getElementById("paymentTotalDue").innerText = `₱${activeFolioData.grandTotal.toFixed(2)}`;
    
    // Reset form fields
    document.getElementById("paymentMethod").value = "Cash";
    document.getElementById("cashTendered").value = "";
    document.getElementById("paymentChange").innerText = "₱0.00";
    toggleCashInput();

    // Hide the main folio view and show the payment screen
    document.getElementById("folioModal").classList.add("hidden"); 
    document.getElementById("folioPaymentModal").style.display = "flex";
}

// --- 2. HIDE/SHOW CASH INPUT BASED ON PAYMENT METHOD ---
function toggleCashInput() {
    const method = document.getElementById("paymentMethod").value;
    const cashSection = document.getElementById("cashInputSection");
    
    if (method === "Cash") {
        cashSection.style.display = "block";
    } else {
        // Hide cash inputs if using GCash/Card, because exact amount is usually transferred
        cashSection.style.display = "none";
    }
}

// --- 3. LIVE CALCULATE CHANGE ---
function calculateChange() {
    const totalDue = activeFolioData.grandTotal;
    const tendered = parseFloat(document.getElementById("cashTendered").value) || 0;
    
    let change = tendered - totalDue;
    if (change < 0) change = 0; // Prevent negative change from showing
    
    document.getElementById("paymentChange").innerText = `₱${change.toFixed(2)}`;
}

// --- 4. CANCEL PAYMENT (GO BACK) ---
function closePaymentModal() {
    document.getElementById("folioPaymentModal").style.display = "none";
    document.getElementById("folioModal").classList.remove("hidden"); // Go back to folio details
}

// --- 5. CONFIRM PAYMENT & UPDATE DATABASE ---
async function confirmFolioCheckout() {
    const method = document.getElementById("paymentMethod").value;
    const totalDue = activeFolioData.grandTotal;
    let tendered = totalDue; 
    let change = 0;

    // Validation if they are paying in cash
    if (method === "Cash") {
        tendered = parseFloat(document.getElementById("cashTendered").value) || 0;
        if (tendered < totalDue) {
            return alert("Insufficient cash tendered. Please enter a valid amount.");
        }
        change = tendered - totalDue;
    }

    const batch = db.batch();
    const checkoutTime = new Date().toISOString();

    // Generate Invoice Number for Sales Report
    const configRef = db.collection('config').doc('system');
    const configDoc = await configRef.get();
    let invNum = configDoc.exists ? (configDoc.data().invoiceCount || 1) : 1;
    let currentGT = configDoc.exists ? (configDoc.data().grandTotal || 0) : 0;
    let invString = "INV-" + String(invNum).padStart(6, '0');

    // 1. Log payment into Sales Report (WITH FULL FOLIO DATA)
    const saleRef = db.collection("sales").doc();
    batch.set(saleRef, {
        invoiceNo: invString,
        tableNo: `Room ${activeFolioRoomId}`,
        itemName: "Room Folio Checkout",
        grossAmount: activeFolioData.grandTotal,
        netAmount: activeFolioData.grandTotal,
        totalCost: 0, 
        paymentMethod: method,
        cashTendered: tendered,
        changeDue: change,
        status: 'COMPLETED',
        archived: false,
        timestamp: new Date(),
        folioSnapshot: activeFolioData // Saves guest info so it can be reprinted later!
    });

    // 2. Mark Folio as CLOSED and record payment details
    batch.update(db.collection("folios").doc(activeFolioData.id), {
        status: "CLOSED",
        closedAt: checkoutTime,
        paymentMethod: method,
        amountTendered: tendered,
        changeGiven: change,
        invoiceNo: invString
    });

    // 3. Clear the Room in the Rack
    batch.update(db.collection("rooms").doc(activeFolioRoomId), {
        status: "AVAILABLE",
        currentGuestName: null,
        currentFolioId: null
    });

    // 4. Update Global Invoice Counter
    batch.update(configRef, { invoiceCount: invNum + 1, grandTotal: currentGT + activeFolioData.grandTotal });

    try {
        await batch.commit();

        // 🖨️ AUTO-PRINT THE GUEST INVOICE IMMEDIATELY!
        printFolioInvoice();

        // Hide modal and show success message
        document.getElementById("folioPaymentModal").style.display = "none";
        showToast(`Payment successful!\nMethod: ${method}\nChange: ₱${change.toFixed(2)}`);

        // Clear memory
        activeFolioData = null; 
        activeFolioRoomId = null;

    } catch (e) {
        console.error(e);
        alert("Error processing payment.");
    }
}

// --- 1. REAL-TIME LISTENER FOR PENDING WEB BOOKINGS ---
function listenForWebReservations() {
    db.collection("web_reservations").where("status", "==", "PENDING")
        .onSnapshot((snapshot) => {
            const panel = document.getElementById("webReservationsPanel");
            const list = document.getElementById("webReservationsList");
            list.innerHTML = "";

            if (snapshot.empty) {
                panel.style.display = "none";
                return;
            }

            panel.style.display = "block"; // Show panel if there are pending bookings

            snapshot.forEach((doc) => {
                const data = doc.data();
                
                // Calculate number of nights
                const checkInDate = new Date(data.checkInDate);
                const checkOutDate = new Date(data.checkOutDate);
                const timeDiff = checkOutDate.getTime() - checkInDate.getTime();
                const nights = Math.ceil(timeDiff / (1000 * 3600 * 24));

                const card = document.createElement("div");
                card.style.cssText = "background: white; padding: 12px; border-radius: 6px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); width: 250px;";
                card.innerHTML = `
                    <div style="font-weight: bold; font-size: 15px;">${data.guestName}</div>
                    <div style="font-size: 12px; color: #555; margin-bottom: 5px;">📞 ${data.contact}</div>
                    <div style="color: #557a46; font-weight: bold; font-size: 13px;">${data.roomType} Room</div>
                    <div style="font-size: 12px; margin-bottom: 10px;">
                        <strong>In:</strong> ${data.checkInDate} <br>
                        <strong>Out:</strong> ${data.checkOutDate} (${nights} nights)
                    </div>
                    <div style="display: flex; gap: 5px;">
                        <button onclick="approveWebReservation('${doc.id}', '${data.guestName}', '${data.roomType}', ${nights}, '${data.checkInDate}', '${data.checkOutDate}')" style="background: #557a46; color: white; border: none; padding: 6px; border-radius: 4px; cursor: pointer; flex: 1; font-weight: bold;">Assign Room</button>
                        <button onclick="rejectWebReservation('${doc.id}')" style="background: #bd4b4b; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-weight: bold;">X</button>
                    </div>
                `;
                list.appendChild(card);
            });
        });
}

async function approveWebReservation(resId, guestName, roomType, nights, checkInStr, checkOutStr) {
    const roomId = prompt(`Assign ${guestName} (requested ${roomType}) to which Room ID? (e.g., Room 1)`);
    if (!roomId) return;
    
    // --- ADD THIS SAFETY CHECK ---
    const roomCheck = await db.collection("rooms").doc(roomId).get();
    if (!roomCheck.exists) {
        return alert(`Error: "${roomId}" does not exist in your database. Please check your spelling and try again.`);
    }
    // -----------------------------
    
    const rateStr = prompt(`Enter daily rate for ${roomId}:`, "1500");
    if (!rateStr) return;
    const rate = parseFloat(rateStr);

    const inclusions = prompt(`Enter inclusions (e.g., Free Breakfast) or leave blank:`, "None");

    // Format dates mathematically to match your folio ledger standards
    let checkInDate = new Date(checkInStr);
    checkInDate.setHours(14, 0, 0, 0); // Sets default check-in time to 2:00 PM
    let expectedCheckOut = new Date(checkOutStr);
    expectedCheckOut.setHours(12, 0, 0, 0); // Sets default check-out time to 12:00 PM

    const batch = db.batch();
    const folioRef = db.collection("folios").doc();

    // 1. Create the Folio Ledger
    batch.set(folioRef, {
        roomId: roomId,
        roomType: roomType, 
        guestName: guestName,
        checkInTime: checkInDate.toISOString(),
        expectedCheckOut: expectedCheckOut.toISOString(), 
        dailyRate: rate,
        nights: nights,
        inclusions: inclusions || "None", 
        roomChargesTotal: rate * nights,
        posChargesTotal: 0,
        posOrders: [],
        grandTotal: rate * nights,
        status: "OPEN" 
    });

    // 2. Lock the physical room in the rack
    batch.update(db.collection("rooms").doc(roomId), {
        status: "OCCUPIED",
        currentGuestName: guestName,
        currentFolioId: folioRef.id
    });

    // 3. Update Web Reservation status so it clears from the notifications panel
    batch.update(db.collection("web_reservations").doc(resId), {
        status: "CONFIRMED",
        assignedRoom: roomId
    });

    try { 
        await batch.commit(); 
        showToast(`Online booking for ${guestName} confirmed in ${roomId}!`); 
    } 
    catch(e) { console.error(e); showToast("Error approving reservation."); }
}

// --- 3. REJECT RESERVATION FUNCTION ---
async function rejectWebReservation(resId) {
    if(!confirm("Are you sure you want to decline and delete this online reservation request?")) return;
    try {
        await db.collection("web_reservations").doc(resId).update({ status: "DECLINED" });
        showToast("Reservation declined.");
    } catch(e) { console.error(e); }
}

function switchSalesTab(tabName) {
    const posContainer = document.getElementById("posSalesContainer");
    const roomContainer = document.getElementById("roomSalesContainer");
    const btnPos = document.getElementById("btnPosSales");
    const btnRoom = document.getElementById("btnRoomSales");

    if (tabName === 'pos') {
        posContainer.style.display = "block";
        roomContainer.style.display = "none";
        btnPos.style.background = "#557a46";
        btnPos.style.color = "white";
        btnRoom.style.background = "#ddd";
        btnRoom.style.color = "#333";
    } else {
        posContainer.style.display = "none";
        roomContainer.style.display = "block";
        btnRoom.style.background = "#557a46";
        btnRoom.style.color = "white";
        btnPos.style.background = "#ddd";
        btnPos.style.color = "#333";
    }
}
// --- NEW: MAINTENANCE TOGGLES ---
function setRoomMaintenance(roomId) {
    if(confirm(`Mark Room ${roomId} as under maintenance? It will not be available for check-in.`)) {
        db.collection("rooms").doc(roomId).update({ status: "MAINTENANCE" })
          .then(() => showToast(`Room ${roomId} is now under maintenance.`))
          .catch((e) => console.error(e));
    }
}

function finishRoomMaintenance(roomId) {
    if(confirm(`Is Room ${roomId} ready for guests?`)) {
        db.collection("rooms").doc(roomId).update({ status: "AVAILABLE" })
          .then(() => showToast(`Room ${roomId} is now Available.`))
          .catch((e) => console.error(e));
    }
}



// ==========================================
// --- INITIALIZE LISTENERS ON PAGE LOAD ---
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
    // Start listening for online bookings as soon as the POS loads
    if (typeof listenForWebReservations === "function") {
        listenForWebReservations(); 
    }
});

