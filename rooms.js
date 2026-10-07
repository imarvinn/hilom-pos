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
            
            let borderColor = "#2e7d32"; let bgColor = "#f1f8e9";
            if (room.status === "OCCUPIED") { borderColor = "#c62828"; bgColor = "#ffebee"; }
            else if (room.status === "MAINTENANCE") { borderColor = "#d4a373"; bgColor = "#fff3cd"; }
            
          // --- DYNAMIC ACTION BUTTONS & VISUAL HIERARCHY ---
            let primaryActions = "";
            let secondaryActions = "";

            if (room.status === "AVAILABLE") {
                primaryActions = `
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px;">
                        <button onclick="checkInRoom('${doc.id}', ${room.dailyRate}, '${room.roomType}')" style="background: #557a46; color: white; border: none; padding: 10px 5px; border-radius: 6px; font-weight: bold; font-size: 13px; cursor: pointer;">Check-In</button>
                        <button onclick="openAdvanceBookingModal('${doc.id}', ${room.dailyRate}, '${room.roomType}')" style="background: #4a6fa5; color: white; border: none; padding: 10px 5px; border-radius: 6px; font-weight: bold; font-size: 13px; cursor: pointer;">Advance</button>
                    </div>
                `;
                secondaryActions = `
                    <button onclick="setRoomMaintenance('${doc.id}')" style="background: transparent; color: #d4a373; border: none; font-size: 12px; cursor: pointer; font-weight: bold; padding: 0;">🔧 Maintenance</button>
                `;
            } else if (room.status === "OCCUPIED") {
                primaryActions = `
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px;">
                        <button onclick="openFolioModal('${doc.id}', '${room.currentFolioId}')" style="background: #2b4227; color: white; border: none; padding: 10px 5px; border-radius: 6px; font-weight: bold; font-size: 13px; cursor: pointer;">View Folio</button>
                        <button onclick="openAdvanceBookingModal('${doc.id}', ${room.dailyRate}, '${room.roomType}')" style="background: #4a6fa5; color: white; border: none; padding: 10px 5px; border-radius: 6px; font-weight: bold; font-size: 13px; cursor: pointer;">Advance</button>
                    </div>
                `;
            } else if (room.status === "MAINTENANCE") {
                primaryActions = `
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px;">
                        <button onclick="finishRoomMaintenance('${doc.id}')" style="background: #557a46; color: white; border: none; padding: 10px 5px; border-radius: 6px; font-weight: bold; font-size: 13px; cursor: pointer;">✔ Ready</button>
                        <button onclick="openAdvanceBookingModal('${doc.id}', ${room.dailyRate}, '${room.roomType}')" style="background: #4a6fa5; color: white; border: none; padding: 10px 5px; border-radius: 6px; font-weight: bold; font-size: 13px; cursor: pointer;">Advance</button>
                    </div>
                `;
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
                    
                    <div style="margin-top: 15px;">
                        ${primaryActions}
                        <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px dashed #ccc; padding-top: 8px;">
                            <div>${secondaryActions}</div>
                            <button onclick="deleteRoom('${doc.id}')" style="background: transparent; color: #bd4b4b; border: none; font-size: 12px; cursor: pointer; font-weight: bold; padding: 0;">🗑️ Delete</button>
                        </div>
                    </div>
                </div>
            `;
        });
    });
}

// --- 1. CHECK-IN (CREATES FOLIO LEDGER & SAVES CRM DATA) ---
let pendingWalkInRoomId = null;
let pendingWalkInRoomNumber = null;
let pendingWalkInRate = null;
let pendingWalkInType = null;

// Opens the custom modal
function checkInRoom(roomId, roomRate, roomType) {
    pendingWalkInRoomId = roomId;
    
    // We need to fetch the room number from the DOM or pass it differently.
    // For now, extract it assuming roomId is the roomNumber string based on your setup.
    pendingWalkInRoomNumber = roomId; 
    
    pendingWalkInRate = roomRate;
    pendingWalkInType = roomType;

    document.getElementById("walkInRoomDisplay").innerText = "Room " + pendingWalkInRoomNumber + ` (₱${roomRate}/night)`;
    
    // Clear old inputs
    document.getElementById("walkInName").value = "";
    document.getElementById("walkInNights").value = "1";
    document.getElementById("walkInInclusions").value = "";
    document.getElementById("walkInAge").value = "";
    document.getElementById("walkInContact").value = "";
    document.getElementById("walkInEmail").value = "";
    document.getElementById("walkInAddress").value = "";

    document.getElementById("walkInModal").classList.remove("hidden");
}

function closeWalkInModal() {
    document.getElementById("walkInModal").classList.add("hidden");
    pendingWalkInRoomId = null;
}


// --- ADVANCE BOOKING LOGIC ---
let pendingAdvRoomId = null;
let pendingAdvRoomType = null;

function openAdvanceBookingModal(roomId, rate, type) {
    pendingAdvRoomId = roomId;
    pendingAdvRoomType = type;
    
    document.getElementById("advRoomDisplay").innerText = `Room ${roomId} (${type})`;
    document.getElementById("advGuestName").value = "";
    document.getElementById("advContact").value = "";
    document.getElementById("advCheckIn").value = "";
    document.getElementById("advCheckOut").value = "";
    
    // Prevent booking in the past
    const today = new Date().toISOString().split('T')[0];
    document.getElementById("advCheckIn").setAttribute('min', today);
    document.getElementById("advCheckOut").setAttribute('min', today);

    document.getElementById("advanceBookingModal").classList.remove("hidden");
}

function closeAdvanceBookingModal() {
    document.getElementById("advanceBookingModal").classList.add("hidden");
    pendingAdvRoomId = null;
}

async function confirmAdvanceBooking() {
    const guestName = document.getElementById("advGuestName").value.trim();
    const contact = document.getElementById("advContact").value.trim();
    const checkIn = document.getElementById("advCheckIn").value;
    const checkOut = document.getElementById("advCheckOut").value;

    if (!guestName || !checkIn || !checkOut) {
        return alert("Please fill in the guest name and dates.");
    }
    
    if (new Date(checkOut) <= new Date(checkIn)) {
        return alert("Check-out date must be after check-in date.");
    }

    // --- GENERATE UNIQUE BOOKING REFERENCE ---
    // Creates a random string like 'HLM-8X4KF9'
    const uniqueRef = "HLM-" + Math.random().toString(36).substring(2, 8).toUpperCase();

    try {
        await db.collection("reservations").add({
            roomNumber: pendingAdvRoomId, 
            roomType: pendingAdvRoomType,
            guestName: guestName,
            contact: contact,
            checkIn: checkIn,
            checkOut: checkOut,
            status: "CONFIRMED", 
            source: "Front Desk Walk-in Booking",
            bookingRef: uniqueRef, // SAVE TO DATABASE
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Show the reference number to the front desk staff
        alert(`Success! Booking saved for ${guestName}.\n\nBooking Reference: ${uniqueRef}`);
        closeAdvanceBookingModal();
        
        if (typeof loadBookingCalendar === "function") {
            loadBookingCalendar();
        }

    } catch (error) {
        console.error("Error saving booking:", error);
        alert("Failed to save advance booking. Check permissions.");
    }
}

// Handles the database save when they click "Confirm Check-In"
async function confirmWalkInCheckIn() {
    const guestName = document.getElementById("walkInName").value.trim();
    const nightsStr = document.getElementById("walkInNights").value;
    const inclusions = document.getElementById("walkInInclusions").value.trim() || "None";
    
    const guestAge = document.getElementById("walkInAge").value.trim();
    const guestContact = document.getElementById("walkInContact").value.trim();
    const guestEmail = document.getElementById("walkInEmail").value.trim();
    const guestAddress = document.getElementById("walkInAddress").value.trim();

    const nights = parseInt(nightsStr);

    if (!guestName || isNaN(nights) || nights <= 0) {
        alert("Please enter the guest's name and a valid number of nights.");
        return;
    }

    let checkInDate = new Date();
    let expectedCheckOut = new Date(checkInDate);
    expectedCheckOut.setDate(expectedCheckOut.getDate() + nights);
    expectedCheckOut.setHours(12, 0, 0, 0); 

    const batch = db.batch();
    const folioRef = db.collection("folios").doc();

    // 1. Create the Folio Ledger for billing
    batch.set(folioRef, {
        roomId: pendingWalkInRoomId,
        roomType: pendingWalkInType || "Standard", 
        guestName: guestName,
        checkInTime: checkInDate.toISOString(),
        expectedCheckOut: expectedCheckOut.toISOString(), 
        dailyRate: pendingWalkInRate,
        nights: nights,
        inclusions: inclusions,
        roomChargesTotal: pendingWalkInRate * nights,
        posChargesTotal: 0,
        posOrders: [],
        grandTotal: pendingWalkInRate * nights,
        status: "OPEN"
    });

    // 2. Lock the room and save the CRM Data
    batch.update(db.collection("rooms").doc(pendingWalkInRoomId), {
        status: "OCCUPIED",
        currentGuestName: guestName,
        currentFolioId: folioRef.id,
        guestAge: guestAge,
        guestContact: guestContact,
        guestEmail: guestEmail,
        guestAddress: guestAddress,
        checkInTime: firebase.firestore.FieldValue.serverTimestamp()
    });

    try {
        await batch.commit();
        alert(`Success: ${guestName} checked into Room ${pendingWalkInRoomNumber}`);
        closeWalkInModal();
    } catch (error) {
        console.error("Error checking in:", error);
        alert("Failed to check in guest. Check permissions.");
    }
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

// --- ADD EXTRA CUSTOM CHARGE TO FOLIO ---

// 1. Open the custom modal
function addFolioCharge() {
    if (!activeFolioData || !activeFolioRoomId) return;
    
    // Clear previous inputs & default Qty to 1
    document.getElementById("extraChargeDesc").value = "";
    document.getElementById("extraChargeAmount").value = "";
    document.getElementById("extraChargeQty").value = "1";
    
    // Show the modal
    document.getElementById("extraChargeModal").classList.remove("hidden");
}

// 2. Close the modal
function closeExtraChargeModal() {
    document.getElementById("extraChargeModal").classList.add("hidden");
}

// 3. Process the data
async function confirmExtraCharge() {
    const chargeName = document.getElementById("extraChargeDesc").value.trim();
    const qty = parseInt(document.getElementById("extraChargeQty").value) || 1;
    const unitPrice = parseFloat(document.getElementById("extraChargeAmount").value);

    if (!chargeName || isNaN(unitPrice) || unitPrice <= 0 || qty <= 0) {
        return showToast("Please enter a valid description, quantity, and price.");
    }

    // Calculate the total cost for this line item
    const totalAmount = unitPrice * qty;
    const displaySummary = `Front Desk: ${qty}x ${chargeName}`;

    // Close the popup window
    closeExtraChargeModal();

    const folioRef = db.collection("folios").doc(activeFolioData.id);

    try {
        await folioRef.update({
            posOrders: firebase.firestore.FieldValue.arrayUnion({
                itemsSummary: displaySummary,
                amount: totalAmount,
                timestamp: new Date().toISOString()
            }),
            posChargesTotal: firebase.firestore.FieldValue.increment(totalAmount),
            grandTotal: firebase.firestore.FieldValue.increment(totalAmount)
        });

        showToast(`₱${totalAmount.toFixed(2)} charged to Room ${activeFolioRoomId} for ${qty}x ${chargeName}!`);
        
        // Refresh the UI
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
                    
                    <div style="font-size: 12px; margin-top: 8px; padding-top: 8px; border-top: 1px dashed #ccc;">
                        <strong>In:</strong> ${data.checkInDate} <br>
                        <strong>Out:</strong> ${data.checkOutDate} (${nights} nights)
                    </div>
                    
                    <div style="font-size: 12px; margin-top: 8px; background: #fff3cd; padding: 5px; border-radius: 4px;">
                        <strong>Extras:</strong> ${data.addons || 'None'}<br>
                        <strong>Est. Total:</strong> <span style="color: #bd4b4b; font-weight: bold;">${data.estimatedTotal || 'N/A'}</span>
                    </div>

                    <div style="display: flex; gap: 5px; margin-top: 10px;">
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

// --- CALENDAR BOOKING DETAILS & CANCELLATION ---

function openBookingDetails(resId) {
    const res = window.currentCalendarReservations.find(r => r.id === resId);
    if (!res) return;

    // Handle older bookings that might not have a reference number yet
    const refDisplay = res.bookingRef ? res.bookingRef : "N/A";

    const content = `
        <div style="background: #e8f5e9; padding: 12px; border-radius: 6px; border: 1px dashed #557a46; margin-bottom: 15px; text-align: center;">
            <span style="font-size: 11px; color: #557a46; font-weight: bold; text-transform: uppercase; letter-spacing: 1px;">Booking Reference</span><br>
            <span style="font-size: 20px; color: #2b4227; font-weight: bold; letter-spacing: 2px;">${refDisplay}</span>
        </div>
        <p style="margin: 5px 0;"><strong>Guest Name:</strong> <span style="color:#2b4227;">${res.guestName}</span></p>
        <p style="margin: 5px 0;"><strong>Contact No:</strong> ${res.contact || 'N/A'}</p>
        <p style="margin: 5px 0;"><strong>Assigned Room:</strong> Room ${res.roomNumber}</p>
        <div style="border-top: 1px dashed #ccc; margin: 10px 0; padding-top: 10px;">
            <p style="margin: 5px 0;"><strong>Check-In:</strong> ${res.checkIn}</p>
            <p style="margin: 5px 0;"><strong>Check-Out:</strong> ${res.checkOut}</p>
        </div>
        <p style="margin: 5px 0;"><strong>Status:</strong> <span style="background: #e8f5e9; color: #557a46; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: bold;">${res.status}</span></p>
    `;
    
    document.getElementById("bookingDetailsContent").innerHTML = content;
    
    document.getElementById("cancelBookingBtn").onclick = () => confirmCancelBooking(res.id);
    
    document.getElementById("bookingDetailsModal").classList.remove("hidden");
}

function closeBookingDetailsModal() {
    document.getElementById("bookingDetailsModal").classList.add("hidden");
}

async function confirmCancelBooking(resId) {
    // 1. Prompt for Security PIN
    const pin = prompt("🔒 SECURITY CHECK: Enter a Manager PIN to cancel this reservation:");
    if (!pin) return;

    try {
        // 2. Verify PIN and Role in the database
        const staffQuery = await db.collection("staff").where("pinCode", "==", pin).where("role", "==", "Manager").get();
        
        if (staffQuery.empty) {
            return alert("❌ ACCESS DENIED: Invalid PIN or you do not have Manager privileges.");
        }
        
        const managerName = staffQuery.docs[0].data().name;

        // 3. Final Confirmation
        if (!confirm(`Manager ${managerName} verified.\n\nAre you absolutely sure you want to cancel this booking? The room will immediately become available for these dates.`)) {
            return;
        }

        // 4. Update the database to remove it from the calendar
        await db.collection("reservations").doc(resId).update({
            status: "CANCELLED",
            cancelledAt: firebase.firestore.FieldValue.serverTimestamp(),
            cancelledBy: managerName
        });

        alert("✅ Booking cancelled successfully.");
        closeBookingDetailsModal();
        
        // Refresh the calendar to clear the green blocks
        if (typeof loadBookingCalendar === "function") {
            loadBookingCalendar();
        }

    } catch (error) {
        console.error("Error cancelling booking:", error);
        alert("Database error while cancelling the booking. Please check your connection.");
    }
}



