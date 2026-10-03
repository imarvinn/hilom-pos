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

    document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden', 'active'));
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    const targetView = document.getElementById(viewId);
    if (targetView) { targetView.classList.remove('hidden'); targetView.classList.add('active'); }
    if (navElement) navElement.classList.add('active');
    
    if (isAdminUnlocked) {
        document.getElementById("lockBtn").classList.remove("hidden");
        document.getElementById("changePinBtn").classList.remove("hidden");
    }
}

function verifyPin() {
    if (document.getElementById('adminPin').value === ADMIN_PIN) {
        isAdminUnlocked = true;
        closePinModal();
        showToast("Admin access granted.");
        switchView(pendingViewId, pendingNavElement);
    } else {
        showToast("Incorrect PIN.");
        document.getElementById('adminPin').value = '';
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

// --- AUTHENTICATION ---
auth.onAuthStateChanged((user) => {
    if (user) {
        document.getElementById('loginScreen').classList.add('hidden');
        document.getElementById('appScreen').classList.remove('hidden');
        
        // NEW: Fetch the saved PIN from Firebase immediately on login
        db.collection("settings").doc("security").get().then((doc) => {
            if (doc.exists && doc.data().adminPin) {
                ADMIN_PIN = doc.data().adminPin;
            }
        }).catch(err => console.error("Error loading PIN:", err));

        initializeConfig(); 
        loadCategories(); 
        loadRoomRack(); 
        loadInventory(); 
        loadMenu(); 
        filterSales(); 
        loadActiveTables();
    } else {
        document.getElementById('loginScreen').classList.remove('hidden');
        document.getElementById('appScreen').classList.add('hidden');
    }
});

function login() { auth.signInWithEmailAndPassword(document.getElementById('email').value, document.getElementById('password').value).catch(() => document.getElementById('errorMessage').innerText = "Login failed."); }
function logout() { auth.signOut(); }