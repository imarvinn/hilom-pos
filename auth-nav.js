// --- SECURITY & NAVIGATION ---
function switchView(viewId, navElement) {
    const protectedViews = ['inventoryView', 'menuManageView', 'salesView'];
    
    if (protectedViews.includes(viewId) && !isAdminUnlocked) {
        pendingViewId = viewId; pendingNavElement = navElement;
        document.getElementById('pinModal').classList.remove('hidden');
        document.getElementById('adminPin').value = '';
        document.getElementById('adminPin').focus();
        return;
    }

document.querySelectorAll('.view-section').forEach(el => {
        el.classList.add('hidden');
        el.classList.remove('active');
    });
        document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    const targetView = document.getElementById(viewId);
    if (targetView) { targetView.classList.remove('hidden'); targetView.classList.add('active'); }
    if (navElement) navElement.classList.add('active');
    
    if (isAdminUnlocked) {
        document.getElementById("lockBtn").classList.remove("hidden");
        document.getElementById("changePinBtn").classList.remove("hidden");
    }
}

async function verifyPin() {
    const pinInput = document.getElementById("adminPin").value.trim();
    
    if (!pinInput) {
        return alert("Please enter a PIN.");
    }

    try {
        // Check the Staff Directory for a matching PIN with Manager or Master privileges
        const staffQuery = await db.collection("staff")
            .where("pinCode", "==", pinInput)
            .where("role", "in", ["Manager", "Master"])
            .get();
        
        if (staffQuery.empty) {
            document.getElementById("adminPin").value = ""; // clear the input
            return alert("❌ ACCESS DENIED: Invalid PIN or you do not have Manager/Master privileges.");
        }
        
        // If it matches, unlock the system
        const managerName = staffQuery.docs[0].data().name;
        
        // Hide the lock modal
        document.getElementById("pinModal").classList.add("hidden");
        document.getElementById("adminPin").value = ""; // clear it for next time
        
        showToast(`System unlocked by ${managerName}`);

        // If you have logic that hides/shows the sidebar buttons when locked, 
        // trigger the unlock logic here (e.g., revealing the nav buttons)
        document.querySelectorAll('.sidebar .nav-btn').forEach(btn => {
            btn.style.pointerEvents = "auto";
            btn.style.opacity = "1";
        });
        
    } catch (error) {
        console.error("Error verifying PIN:", error);
        alert("Database error verifying PIN.");
    }
}

function closePinModal() { document.getElementById('pinModal').classList.add('hidden'); }

function lockAdmin() {
    isAdminUnlocked = false;
    document.getElementById("lockBtn").classList.add("hidden");
    document.getElementById("changePinBtn").classList.add("hidden");
    showToast("System locked. Returned to POS.");
    switchView('posView', document.querySelectorAll('.nav-btn')[0]);
}

// --- CHANGE PIN LOGIC ---
function openChangePinModal() {
    document.getElementById('changePinModal').classList.remove('hidden');
    document.getElementById('newAdminPin').value = '';
    document.getElementById('confirmAdminPin').value = '';
    document.getElementById('newAdminPin').focus();
}

function closeChangePinModal() {
    document.getElementById('changePinModal').classList.add('hidden');
}

function saveNewPin() {
    const newPin = document.getElementById('newAdminPin').value;
    const confirmPin = document.getElementById('confirmAdminPin').value;

    if (newPin.length !== 4 || isNaN(newPin)) return showToast("PIN must be exactly 4 numbers.");
    if (newPin !== confirmPin) return showToast("PINs do not match.");

    // Use .set with merge:true to avoid errors if the document doesn't exist yet
    db.collection("settings").doc("security").set({ adminPin: newPin }, { merge: true })
    .then(() => {
        ADMIN_PIN = newPin; // NEW: Update the active PIN immediately without refreshing
        showToast("Admin PIN successfully updated!");
        closeChangePinModal();
    })
    .catch((error) => {
        showToast("Error updating PIN. Check console.");
        console.error(error);
    });
}

function login() { auth.signInWithEmailAndPassword(document.getElementById('email').value, document.getElementById('password').value).catch(() => document.getElementById('errorMessage').innerText = "Login failed."); }
function logout() { auth.signOut(); }