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
                            <div style="display: flex; gap: 15px;">
                                <button onclick="editRoomRate('${doc.id}', ${room.dailyRate})" style="background: transparent; color: #4a6fa5; border: none; font-size: 12px; cursor: pointer; font-weight: bold; padding: 0;">✏️ Edit</button>
                                <button onclick="deleteRoom('${doc.id}')" style="background: transparent; color: #bd4b4b; border: none; font-size: 12px; cursor: pointer; font-weight: bold; padding: 0;">🗑️ Delete</button>
                            </div>
                        </div>
                </div>
            `;
        });
    });
}

// --- 1. CHECK-IN (MULTI-ROOM MASTER FOLIO) ---
async function checkInRoom(clickedRoomId, roomRate, roomType) {
    const checklistContainer = document.getElementById("walkInRoomChecklist");
    checklistContainer.innerHTML = "<p style='color:#888; font-size:12px;'>Loading available rooms...</p>";
    
    // Clear old inputs
    document.getElementById("walkInName").value = "";
    document.getElementById("walkInNights").value = "1";
    document.getElementById("walkInExtraBeds").value = "0"; 
    document.getElementById("walkInInclusions").value = "";
    document.getElementById("walkInAge").value = "";
    document.getElementById("walkInContact").value = "";
    document.getElementById("walkInEmail").value = "";
    document.getElementById("walkInAddress").value = "";

    document.getElementById("walkInModal").classList.remove("hidden");

    try {
        // Fetch ONLY AVAILABLE rooms to prevent double booking errors
        const snapshot = await db.collection("rooms").where("status", "==", "AVAILABLE").get();
        checklistContainer.innerHTML = "";
        
        // Sort rooms sequentially for neatness
        const rooms = [];
        snapshot.forEach(doc => rooms.push({ id: doc.id, ...doc.data() }));
        rooms.sort((a, b) => a.roomNumber.localeCompare(b.roomNumber));
        
        rooms.forEach(room => {
            const isClicked = room.id === clickedRoomId;
            checklistContainer.innerHTML += `
                <label style="display: flex; align-items: center; gap: 10px; font-size: 14px; cursor: pointer; padding: 6px; background: #f9f9f9; border-radius: 4px; border: 1px solid #eee;">
                    <input type="checkbox" class="walkin-room-checkbox" value="${room.id}" data-rate="${room.dailyRate}" data-type="${room.roomType}" ${isClicked ? "checked" : ""}>
                    <strong>Room ${room.id}</strong> <span style="color:#666; font-size:12px;">(₱${room.dailyRate})</span>
                </label>
            `;
        });
    } catch(e) {
        console.error(e);
        checklistContainer.innerHTML = "<p style='color:red;'>Error loading rooms.</p>";
    }
}

function closeWalkInModal() {
    document.getElementById("walkInModal").classList.add("hidden");
}

async function confirmWalkInCheckIn() {
    // 1. Gather text inputs
    const guestName = sanitizeHTML(document.getElementById("walkInName").value.trim());
    const nightsStr = document.getElementById("walkInNights").value;
    const inclusions = sanitizeHTML(document.getElementById("walkInInclusions").value.trim()) || "None";
    
    const guestAge = sanitizeHTML(document.getElementById("walkInAge").value.trim());
    const guestContact = sanitizeHTML(document.getElementById("walkInContact").value.trim());
    const guestEmail = sanitizeHTML(document.getElementById("walkInEmail").value.trim());
    const guestAddress = sanitizeHTML(document.getElementById("walkInAddress").value.trim());
    const nights = parseInt(nightsStr);

    // 2. Capture extra beds
    const extraBeds = parseInt(document.getElementById("walkInExtraBeds").value) || 0;

    // 3. Gather all selected room checkboxes
    const checkboxes = document.querySelectorAll(".walkin-room-checkbox:checked");
    if (checkboxes.length === 0) {
        return alert("Please select at least one room to check in.");
    }

    if (!guestName || isNaN(nights) || nights <= 0) {
        return alert("Please enter the guest's name and a valid number of nights.");
    }

    // 4. Compute Dates
    let checkInDate = new Date();
    let expectedCheckOut = new Date(checkInDate);
    expectedCheckOut.setDate(expectedCheckOut.getDate() + nights);
    expectedCheckOut.setHours(12, 0, 0, 0); 

    // 5. Compute combined totals and string room names together
    let combinedRate = 0;
    let roomIdsArr = [];
    let roomTypesArr = [];

    checkboxes.forEach(cb => {
        combinedRate += parseFloat(cb.getAttribute("data-rate"));
        roomIdsArr.push(cb.value);
        roomTypesArr.push(cb.getAttribute("data-type"));
    });

    const combinedRoomString = roomIdsArr.join(", ");
    const combinedTypeString = [...new Set(roomTypesArr)].join(", "); 
    const extraBedCost = extraBeds * 800 * nights;

    const btn = document.getElementById("walkInSaveBtn");
    if (btn) {
        btn.innerText = "Checking In...";
        btn.disabled = true;
    }

    const batch = db.batch();
    const folioRef = db.collection("folios").doc();

    let initialPosOrders = [];
    if (extraBeds > 0) {
        initialPosOrders.push({
            itemsSummary: `Front Desk: ${extraBeds}x Extra Bed(s) (${nights} nights)`,
            amount: extraBedCost,
            timestamp: new Date().toISOString()
        });
    }

    // 6. Create ONE Master Folio Ledger for billing all rooms + Extra Beds
    batch.set(folioRef, {
        roomId: combinedRoomString, 
        roomType: combinedTypeString, 
        guestName: guestName,
        checkInTime: checkInDate.toISOString(),
        expectedCheckOut: expectedCheckOut.toISOString(), 
        dailyRate: combinedRate, 
        nights: nights,
        inclusions: inclusions,
        roomQty: checkboxes.length,
        extraBeds: extraBeds,
        roomChargesTotal: combinedRate * nights,
        posChargesTotal: extraBedCost, 
        posOrders: initialPosOrders,
        grandTotal: (combinedRate * nights) + extraBedCost,
        status: "OPEN"
    });

    // 7. Lock ALL selected rooms and link them to the exact same Master Folio
    checkboxes.forEach(cb => {
        batch.update(db.collection("rooms").doc(cb.value), {
            status: "OCCUPIED",
            currentGuestName: guestName,
            currentFolioId: folioRef.id,
            guestAge: guestAge,
            guestContact: guestContact,
            guestEmail: guestEmail,
            guestAddress: guestAddress,
            checkInTime: firebase.firestore.FieldValue.serverTimestamp()
        });
    });

    try {
        await batch.commit();
        alert(`Success: ${guestName} checked into ${checkboxes.length} room(s): ${combinedRoomString}`);
        closeWalkInModal();
    } catch (error) {
        console.error("Error checking in:", error);
        alert("Failed to check in guest. Check permissions.");
    } finally {
        if (btn) {
            btn.innerText = "✔️ Confirm Check-In";
            btn.disabled = false;
        }
    }
}


// --- PRINT A PRICE ESTIMATE (NO DATABASE SAVE) ---
function printWalkInQuote() {
    // 1. Gather inputs
    const guestName = document.getElementById("walkInName").value.trim() || "Valued Guest";
    const nights = parseInt(document.getElementById("walkInNights").value) || 1;
    const extraBeds = parseInt(document.getElementById("walkInExtraBeds").value) || 0;

    const checkboxes = document.querySelectorAll(".walkin-room-checkbox:checked");
    if (checkboxes.length === 0) {
        return alert("Please select at least one room to generate a quote.");
    }

    // 2. Calculate Math
    let roomDetailsHTML = "";
    let totalRoomRate = 0;

    checkboxes.forEach(cb => {
        const rate = parseFloat(cb.getAttribute("data-rate"));
        const type = cb.getAttribute("data-type");
        const roomId = cb.value;
        const roomSubtotal = rate * nights;
        totalRoomRate += rate;

        roomDetailsHTML += `
            <tr>
                <td style="padding: 10px; border-bottom: 1px solid #ccc;"><strong>Room ${roomId}</strong> (${type})</td>
                <td style="padding: 10px; border-bottom: 1px solid #ccc; text-align: center;">${nights}</td>
                <td style="padding: 10px; border-bottom: 1px solid #ccc; text-align: right;">₱${roomSubtotal.toFixed(2)}</td>
            </tr>
        `;
    });

    const extraBedTotal = extraBeds * 800 * nights;
    if (extraBeds > 0) {
        roomDetailsHTML += `
            <tr>
                <td style="padding: 10px; border-bottom: 1px solid #ccc;"><strong>Extra Beds</strong></td>
                <td style="padding: 10px; border-bottom: 1px solid #ccc; text-align: center;">${extraBeds} x ${nights} night(s)</td>
                <td style="padding: 10px; border-bottom: 1px solid #ccc; text-align: right;">₱${extraBedTotal.toFixed(2)}</td>
            </tr>
        `;
    }

    const grandTotal = (totalRoomRate * nights) + extraBedTotal;

    // 3. Generate the Printable Document
    const printWin = window.open('', '_blank', 'width=800,height=600');
    printWin.document.write(`
        <html>
        <head><title>Guest Quotation</title></head>
        <body style="font-family: Arial, sans-serif; padding: 40px; color: #333;">
            <div style="text-align: center; margin-bottom: 30px;">
                <img src="hilom.png" alt="Hilom Logo" style="height: 90px; object-fit: contain; margin-bottom: 10px;">
                <h2 style="color: #2b4227; margin: 0; font-size: 28px;">HILOM RESORT</h2>
                <p style="margin: 5px 0; color: #666;">Brgy. Dumanhog, Siquijor Island<br>hilomresort@gmail.com | +63 928 402 7378</p>
                <h3 style="margin-top: 20px; border-top: 2px solid #2b4227; padding-top: 15px; letter-spacing: 2px;">PRICE QUOTATION</h3>
                <p style="font-size: 13px; color: #888; font-style: italic;">This is an estimate only. Rooms are subject to availability.</p>
            </div>
            
            <div style="margin-bottom: 20px; font-size: 15px;">
                <p><strong>Prepared For:</strong> ${guestName}</p>
                <p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
            </div>

            <table style="width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 15px;">
                <thead>
                    <tr style="background-color: #f1f8e9;">
                        <th style="padding: 12px; text-align: left; border-bottom: 2px solid #2b4227;">Description</th>
                        <th style="padding: 12px; text-align: center; border-bottom: 2px solid #2b4227;">Qty / Nights</th>
                        <th style="padding: 12px; text-align: right; border-bottom: 2px solid #2b4227;">Subtotal</th>
                    </tr>
                </thead>
                <tbody>
                    ${roomDetailsHTML}
                </tbody>
                <tfoot>
                    <tr>
                        <td colspan="2" style="padding: 20px 10px; text-align: right; font-size: 18px; font-weight: bold;">ESTIMATED TOTAL:</td>
                        <td style="padding: 20px 10px; text-align: right; font-size: 18px; font-weight: bold; color: #2b4227;">₱${grandTotal.toFixed(2)}</td>
                    </tr>
                </tfoot>
            </table>
            
            <div style="margin-top: 50px; text-align: center; font-size: 12px; color: #666; border-top: 1px dashed #ccc; padding-top: 20px;">
                <p>Thank you for considering Hilom Resort. We hope to welcome you soon!</p>
            </div>
        </body>
        </html>
    `);
    
    printWin.document.close();
    printWin.focus();
    
    // Increased delay to 500ms to ensure the logo image has time to load before the print dialog opens
    setTimeout(() => { 
        printWin.print(); 
        printWin.close(); 
    }, 500);
}


// --- ADVANCE BOOKING LOGIC (MULTI-ROOM) ---
async function openAdvanceBookingModal(clickedRoomId, rate, type) {
    const checklistContainer = document.getElementById("advRoomChecklist");
    checklistContainer.innerHTML = "<p style='color:#888; font-size:12px;'>Loading rooms...</p>";
    
    document.getElementById("advGuestName").value = "";
    document.getElementById("advContact").value = "";
    document.getElementById("advCheckIn").value = "";
    document.getElementById("advCheckOut").value = "";
    
    const today = new Date().toISOString().split('T')[0];
    document.getElementById("advCheckIn").setAttribute('min', today);
    document.getElementById("advCheckOut").setAttribute('min', today);

    document.getElementById("advanceBookingModal").classList.remove("hidden");

    try {
        const snapshot = await db.collection("rooms").orderBy("roomNumber", "asc").get();
        checklistContainer.innerHTML = "";
        
        snapshot.forEach(doc => {
            const room = doc.data();
            const isClicked = doc.id === clickedRoomId;
            
            checklistContainer.innerHTML += `
                <label style="display: flex; align-items: center; gap: 10px; font-size: 14px; cursor: pointer; padding: 6px; background: #f9f9f9; border-radius: 4px; border: 1px solid #eee;">
                    <input type="checkbox" class="adv-room-checkbox" value="${doc.id}" data-type="${room.roomType}" ${isClicked ? "checked" : ""}>
                    <strong>Room ${doc.id}</strong> <span style="color:#666; font-size:12px;">(${room.roomType})</span>
                </label>
            `;
        });
    } catch(e) {
        console.error(e);
        checklistContainer.innerHTML = "<p style='color:red;'>Error loading rooms.</p>";
    }
}

function closeAdvanceBookingModal() {
    document.getElementById("advanceBookingModal").classList.add("hidden");
}

async function confirmAdvanceBooking() {
    const guestName = sanitizeHTML(document.getElementById("advGuestName").value.trim());
    const contact = sanitizeHTML(document.getElementById("advContact").value.trim());
    const checkIn = document.getElementById("advCheckIn").value;
    const checkOut = document.getElementById("advCheckOut").value;
    const extraBeds = parseInt(document.getElementById("advExtraBeds").value) || 0;

    const checkboxes = document.querySelectorAll(".adv-room-checkbox:checked");
    if (checkboxes.length === 0) {
        return alert("Please select at least one room for this booking.");
    }

    if (!guestName || !checkIn || !checkOut) {
        return alert("Please fill in the guest name and dates.");
    }
    
    if (new Date(checkOut) <= new Date(checkIn)) {
        return alert("Check-out date must be after check-in date.");
    }

    const uniqueRef = "HLM-" + Math.random().toString(36).substring(2, 8).toUpperCase();
    
    const saveBtn = document.getElementById("advSaveBtn");
    saveBtn.innerText = "Saving...";
    saveBtn.disabled = true;

    try {
        const batch = db.batch();
        
        checkboxes.forEach(cb => {
            const roomId = cb.value;
            const roomType = cb.getAttribute("data-type");
            const newResRef = db.collection("reservations").doc();
            
            batch.set(newResRef, {
                roomNumber: roomId, 
                roomType: roomType,
                guestName: guestName,
                contact: contact,
                checkIn: checkIn,
                checkOut: checkOut,
                status: "CONFIRMED", 
                source: "Front Desk Multi-Room Booking",
                bookingRef: uniqueRef, 
                extraBeds: extraBeds,
                addons: extraBeds > 0 ? `${extraBeds}x Extra Bed(s)` : "None",
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        });

        await batch.commit();

        alert(`Success! Group Booking saved for ${guestName}.\n\nBooking Reference: ${uniqueRef}\nRooms Reserved: ${checkboxes.length}`);
        
        closeAdvanceBookingModal();
        
        if (typeof loadBookingCalendar === "function") {
            loadBookingCalendar();
        }

    } catch (error) {
        console.error("Error saving booking:", error);
        alert("Failed to save advance booking. Check permissions.");
    } finally {
        saveBtn.innerText = "📅 Save Reservation";
        saveBtn.disabled = false;
    }
}


// --- 2. VIEW & SETTLE FOLIO ---
async function openFolioModal(roomId, folioId) {
    if(!folioId) return showToast("No active folio found.");
    
    // SAFETY LOCK: Save the ID globally so checkout never crashes
    window.activeFolioId = folioId;
    activeFolioRoomId = roomId;
    
    try {
        const folioDoc = await db.collection("folios").doc(folioId).get();
        if (!folioDoc.exists) return;
        activeFolioData = { id: folioDoc.id, ...folioDoc.data() };
        
        const dateOptions = { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' };
        const checkInStr = new Date(activeFolioData.checkInTime).toLocaleString('en-US', dateOptions);
        const checkOutStr = activeFolioData.expectedCheckOut ? new Date(activeFolioData.expectedCheckOut).toLocaleString('en-US', dateOptions) : 'TBD';
        
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

// --- 3. PRINT FOLIO INVOICE ---
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

// --- ROOM MANAGEMENT ---
function addNewRoom() {
    const roomNumber = sanitizeHTML(document.getElementById("newRoomNumber").value.trim());
    const roomType = sanitizeHTML(document.getElementById("newRoomType").value.trim());
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

function editRoomRate(roomId, currentRate) {
    const newRateStr = prompt(`Enter new daily rate for Room ${roomId}:`, currentRate);
    if (!newRateStr) return; 
    
    const newRate = parseFloat(newRateStr);
    if (isNaN(newRate) || newRate < 0) {
        return alert("Please enter a valid numeric amount.");
    }
    
    db.collection("rooms").doc(roomId).update({ 
        dailyRate: newRate,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    })
    .then(() => {
        alert(`Success! Room ${roomId} is now priced at ₱${newRate.toFixed(2)} / night.`);
    })
    .catch((e) => {
        console.error("Error updating room:", e);
        alert("Failed to update room rate.");
    });
}


// --- ADD EXTRA CUSTOM CHARGE TO FOLIO ---
function addFolioCharge() {
    if (!activeFolioData || !activeFolioRoomId) return;
    
    document.getElementById("extraChargeDesc").value = "";
    document.getElementById("extraChargeAmount").value = "";
    document.getElementById("extraChargeQty").value = "1";
    document.getElementById("extraChargeModal").classList.remove("hidden");
}

function closeExtraChargeModal() {
    document.getElementById("extraChargeModal").classList.add("hidden");
}

async function confirmExtraCharge() {
    const chargeName = sanitizeHTML(document.getElementById("extraChargeDesc").value.trim());
    const qty = parseInt(document.getElementById("extraChargeQty").value) || 1;
    const unitPrice = parseFloat(document.getElementById("extraChargeAmount").value);

    if (!chargeName || isNaN(unitPrice) || unitPrice <= 0 || qty <= 0) {
        return showToast("Please enter a valid description, quantity, and price.");
    }

    const totalAmount = unitPrice * qty;
    const displaySummary = `Front Desk: ${qty}x ${chargeName}`;
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
        
        const savedRoomId = activeFolioRoomId;
        const savedFolioId = activeFolioData.id;
        closeFolioModal();
        setTimeout(() => { openFolioModal(savedRoomId, savedFolioId); }, 200);

    } catch (err) {
        console.error(err);
        showToast("Error adding charge to folio.");
    }
}


// --- WEB RESERVATIONS ---
function listenForWebReservations() {
    db.collection("web_reservations").onSnapshot((snapshot) => {
        const panel = document.getElementById("webReservationsPanel");
        const list = document.getElementById("webReservationsList");
        if (!list || !panel) return;
        
        list.innerHTML = "";
        const pendingDocs = [];
        
        snapshot.forEach((doc) => {
            const data = doc.data();
            if (data.status === "PENDING") {
                pendingDocs.push({ id: doc.id, ...data });
            }
        });

        if (pendingDocs.length === 0) {
            panel.style.display = "none";
            return;
        }

        panel.style.display = "block"; 

        pendingDocs.forEach((data) => {
            const checkInDate = new Date(data.checkInDate || Date.now());
            const checkOutDate = new Date(data.checkOutDate || Date.now());
            const timeDiff = checkOutDate.getTime() - checkInDate.getTime();
            const nights = Math.ceil(timeDiff / (1000 * 3600 * 24)) || 1;

            const card = document.createElement("div");
            card.style.cssText = "background: white; padding: 12px; border-radius: 6px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); width: 250px;";
            card.innerHTML = `
                <div style="font-weight: bold; font-size: 15px;">${data.guestName || "Guest"}</div>
                <div style="font-size: 12px; color: #555; margin-bottom: 5px;">📞 ${data.contact || "N/A"}</div>
                <div style="color: #557a46; font-weight: bold; font-size: 13px;">${data.roomType || "Standard"} Room</div>
                
                <div style="font-size: 12px; margin-top: 8px; padding-top: 8px; border-top: 1px dashed #ccc;">
                    <strong>In:</strong> ${data.checkInDate} <br>
                    <strong>Out:</strong> ${data.checkOutDate} (${nights} nights)
                </div>
                
                <div style="font-size: 12px; margin-top: 8px; background: #fff3cd; padding: 5px; border-radius: 4px;">
                    <strong>Extras:</strong> ${data.addons || 'None'}<br>
                    <strong>Est. Total:</strong> <span style="color: #bd4b4b; font-weight: bold;">${data.estimatedTotal || 'N/A'}</span>
                </div>

                <div style="display: flex; gap: 5px; margin-top: 10px;">
                    <button onclick="approveWebReservation('${data.id}', '${data.guestName}', '${data.roomType}', ${nights}, '${data.checkInDate}', '${data.checkOutDate}')" style="background: #557a46; color: white; border: none; padding: 6px; border-radius: 4px; cursor: pointer; flex: 1; font-weight: bold;">Assign Room</button>
                    <button onclick="rejectWebReservation('${data.id}')" style="background: #bd4b4b; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-weight: bold;">X</button>
                </div>
            `;
            list.appendChild(card);
        });
   }, (error) => {
        if (error.code === "permission-denied") return;
        console.error("Listener error:", error);
    });
}

async function approveWebReservation(resId, guestName, roomType, nights, checkInStr, checkOutStr) {
    const roomId = prompt(`Assign ${guestName} (requested ${roomType}) to which Room ID? (e.g., Room 1)`);
    if (!roomId) return;
    
    const roomCheck = await db.collection("rooms").doc(roomId).get();
    if (!roomCheck.exists) {
        return alert(`Error: "${roomId}" does not exist in your database. Please check your spelling and try again.`);
    }
    
    const rateStr = prompt(`Enter daily rate for ${roomId}:`, "1500");
    if (!rateStr) return;
    const rate = parseFloat(rateStr);

    const inclusions = prompt(`Enter inclusions (e.g., Free Breakfast) or leave blank:`, "None");

    let checkInDate = new Date(checkInStr);
    checkInDate.setHours(14, 0, 0, 0); 
    let expectedCheckOut = new Date(checkOutStr);
    expectedCheckOut.setHours(12, 0, 0, 0); 

    const batch = db.batch();
    const folioRef = db.collection("folios").doc();

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

    batch.update(db.collection("rooms").doc(roomId), {
        status: "OCCUPIED",
        currentGuestName: guestName,
        currentFolioId: folioRef.id
    });

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

async function rejectWebReservation(resId) {
    if(!confirm("Are you sure you want to decline and delete this online reservation request?")) return;
    try {
        await db.collection("web_reservations").doc(resId).update({ status: "DECLINED" });
        showToast("Reservation declined.");
    } catch(e) { console.error(e); }
}


// --- MISC FRONT DESK FUNCTIONS ---
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

    const refDisplay = res.bookingRef ? res.bookingRef : res.reference ? res.reference : "N/A";

    const content = `
        <div style="background: #e8f5e9; padding: 12px; border-radius: 6px; border: 1px dashed #557a46; margin-bottom: 15px; text-align: center;">
            <span style="font-size: 11px; color: #557a46; font-weight: bold; text-transform: uppercase; letter-spacing: 1px;">Booking Reference</span><br>
            <span style="font-size: 20px; color: #2b4227; font-weight: bold; letter-spacing: 2px;">${refDisplay}</span>
        </div>
        
        <div style="margin-bottom: 20px;">
            <strong>Guest Name:</strong> ${res.guestName}<br>
            <strong>Contact No:</strong> ${res.contact || 'N/A'}<br>
            <strong>Dates:</strong> ${res.checkIn} to ${res.checkOut}
        </div>

        <table style="width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 14px;">
            <thead>
                <tr style="border-bottom: 2px solid #2b4227; font-weight: bold; color: #2b4227;">
                    <th style="padding: 8px 0; text-align: left;">Description</th>
                    <th style="padding: 8px 0; text-align: center;">Qty</th>
                    <th style="padding: 8px 0; text-align: right;">Unit Price</th>
                    <th style="padding: 8px 0; text-align: right;">Total</th>
                </tr>
            </thead>
            <tbody>
                <tr style="border-bottom: 1px dashed #ccc;">
                    <td style="padding: 10px 0;">
                        <strong>${res.roomType || 'Standard Room'}</strong><br>
                        <span style="font-size: 12px; color: #666;">Night(s) Stay</span>
                    </td>
                    <td style="padding: 10px 0; text-align: center;">${res.roomQty || '1'} Room(s)</td>
                    <td style="padding: 10px 0; text-align: right;">--</td>
                    <td style="padding: 10px 0; text-align: right;">--</td>
                </tr>
                <tr style="border-bottom: 1px dashed #ccc;">
                    <td style="padding: 10px 0;"><strong>${res.addons || 'No Extras'}</strong></td>
                    <td style="padding: 10px 0; text-align: center;">--</td>
                    <td style="padding: 10px 0; text-align: right;">--</td>
                    <td style="padding: 10px 0; text-align: right;">--</td>
                </tr>
            </tbody>
            <tfoot>
                <tr style="font-size: 18px; font-weight: bold;">
                    <td colspan="3" style="padding: 15px 0; text-align: right; color: #2b4227;">GRAND TOTAL:</td>
                    <td style="padding: 15px 0; text-align: right; color: #bd4b4b;">${res.estimatedTotal || 'TBD'}</td>
                </tr>
            </tfoot>
        </table>
        
        <p style="margin: 15px 0 5px 0; text-align: center;"><strong>Status:</strong> <span style="background: #e8f5e9; color: #557a46; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: bold;">${res.status}</span></p>
    `;
    
    document.getElementById("bookingDetailsContent").innerHTML = content;
    document.getElementById("cancelBookingBtn").onclick = () => confirmCancelBooking(res.id);
    document.getElementById("bookingDetailsModal").classList.remove("hidden");
}

function closeBookingDetailsModal() {
    document.getElementById("bookingDetailsModal").classList.add("hidden");
}

async function confirmCancelBooking(resId) {
    const pin = prompt("🔒 SECURITY CHECK: Enter a Manager or Master PIN to cancel this reservation:");
    if (!pin) return;

    try {
        const staffQuery = await db.collection("staff")
            .where("pinCode", "==", pin)
            .where("role", "in", ["Manager", "Master"])
            .get();
        
        if (staffQuery.empty) {
            return alert("❌ ACCESS DENIED: Invalid PIN or you do not have Manager/Master privileges. (Check your PIN in the Time Clock > Staff Information Sheet)");
        }
        
        const managerName = staffQuery.docs[0].data().name;

        if (!confirm(`Authorized as ${managerName}.\n\nAre you absolutely sure you want to cancel this booking? The room will immediately become available for these dates.`)) {
            return;
        }

        await db.collection("reservations").doc(resId).update({
            status: "CANCELLED",
            cancelledAt: firebase.firestore.FieldValue.serverTimestamp(),
            cancelledBy: managerName
        });

        alert("✅ Booking cancelled successfully.");
        closeBookingDetailsModal();
        
        if (typeof loadBookingCalendar === "function") {
            loadBookingCalendar();
        }

    } catch (error) {
        console.error("Error cancelling booking:", error);
        alert("Database error while cancelling the booking. Please check your connection.");
    }
}


// --- FOLIO PAYMENT & SETTLEMENT LOGIC ---
let currentCheckoutFolioId = null;
let currentCheckoutTotal = 0;

function initiateFolioCheckout() {
    const rawTotal = document.getElementById("folioGrandTotal").innerText.replace(/[^\d.-]/g, '');
    currentCheckoutTotal = parseFloat(rawTotal) || 0;
    
    currentCheckoutFolioId = window.activeFolioId; 

    if (!currentCheckoutFolioId || currentCheckoutFolioId === "undefined") {
        return alert("Error: System lost the Folio ID. Please close this window and click 'View Folio' again.");
    }

    document.getElementById("folioPaymentTotalDue").innerText = `₱${currentCheckoutTotal.toFixed(2)}`;
    document.getElementById("folioCashTendered").value = "";
    document.getElementById("folioRefNumber").value = "";
    document.getElementById("folioPaymentChange").innerText = "₱0.00";
    
    document.getElementById("folioPayMethod").value = "Cash";
    toggleFolioPaymentInputs();
    
    document.getElementById("folioPaymentModal").style.display = "flex";
}

function closeFolioPaymentModal() {
    document.getElementById("folioPaymentModal").style.display = "none";
}

function toggleFolioPaymentInputs() {
    const method = document.getElementById("folioPayMethod").value;
    const cashSec = document.getElementById("folioCashInputSection");
    const refSec = document.getElementById("folioReferenceInputSection");

    if (method === "Cash") {
        cashSec.style.display = "block";
        refSec.style.display = "none";
    } else {
        cashSec.style.display = "none";
        refSec.style.display = "block";
    }
}

function calculateFolioChange() {
    const tendered = parseFloat(document.getElementById("folioCashTendered").value) || 0;
    let change = tendered - currentCheckoutTotal;
    if (change < 0) change = 0;
    document.getElementById("folioPaymentChange").innerText = `₱${change.toFixed(2)}`;
}

async function confirmFolioCheckout() {
    const method = document.getElementById("folioPayMethod").value;
    let tendered = 0;
    let change = 0;
    let refNum = "N/A";

    if (method === "Cash") {
        tendered = parseFloat(document.getElementById("folioCashTendered").value) || 0;
        if (tendered < currentCheckoutTotal) {
            return alert(`Insufficient cash. Guest must pay at least ₱${currentCheckoutTotal.toFixed(2)}`);
        }
        change = tendered - currentCheckoutTotal;
    } else {
        refNum = document.getElementById("folioRefNumber").value.trim();
        if (!refNum) {
            return alert(`A Reference Number is required when paying via ${method}.`);
        }
        tendered = currentCheckoutTotal; 
    }

    try {
        const batch = db.batch();
        const folioRef = db.collection("folios").doc(currentCheckoutFolioId);
        
        batch.set(folioRef, {
            status: "CLOSED",
            paymentMethod: method,
            referenceNumber: refNum,
            amountTendered: tendered,
            changeDue: change,
            checkedOutAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        const tiedRooms = await db.collection("rooms").where("currentFolioId", "==", currentCheckoutFolioId).get();
        
        tiedRooms.forEach(roomDoc => {
            batch.update(db.collection("rooms").doc(roomDoc.id), {
                status: "MAINTENANCE", 
                currentGuestName: "",
                currentFolioId: "",
                guestAge: "",
                guestContact: "",
                guestEmail: "",
                guestAddress: "",
                checkInTime: null
            });
        });

        await batch.commit();

        const invPaymentDetails = document.getElementById("invPaymentDetails");
        if (invPaymentDetails) invPaymentDetails.style.display = "block";
        
        const invPayMethod = document.getElementById("invPayMethod");
        if (invPayMethod) invPayMethod.innerText = method;

        if (method === "Cash") {
            document.getElementById("invCashRow").style.display = "flex";
            document.getElementById("invChangeRow").style.display = "flex";
            document.getElementById("invRefRow").style.display = "none";
            document.getElementById("invCashTendered").innerText = `₱${tendered.toFixed(2)}`;
            document.getElementById("invChangeDue").innerText = `₱${change.toFixed(2)}`;
        } else {
            document.getElementById("invCashRow").style.display = "none";
            document.getElementById("invChangeRow").style.display = "none";
            document.getElementById("invRefRow").style.display = "flex";
            document.getElementById("invRefNum").innerText = refNum;
        }

        alert(`Success! Folio settled via ${method}.\nRooms have been set to Maintenance for cleaning.`);
        
        closeFolioPaymentModal();
        if (typeof closeFolioModal === "function") closeFolioModal(); 
        if (typeof printFolioInvoice === "function") printFolioInvoice(); 
        
    } catch (error) {
        console.error("Error during checkout:", error);
        alert("Checkout failed. Check your connection.");
    }
}