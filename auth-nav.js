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
        // Check the Staff Directory for Manager, Master, or IT privileges
        const staffQuery = await db.collection("staff")
            .where("pinCode", "==", pinInput)
            .where("role", "in", ["Manager", "Master", "IT"])
            .get();
        
        if (staffQuery.empty) {
            document.getElementById("adminPin").value = ""; // clear the input
            return alert("❌ ACCESS DENIED: Invalid PIN or you do not have Admin privileges.");
        }
        
        const managerData = staffQuery.docs[0].data();
        const managerName = managerData.name;
        const managerRole = managerData.role;
        
        // Hide the lock modal
        document.getElementById("pinModal").classList.add("hidden");
        document.getElementById("adminPin").value = ""; 
        
        // BULLETPROOF TAB REVEAL: Target the exact IDs of all hidden Admin tabs
        const adminTabs = ["navFrontDesk", "navPos", "navKitchen", "navInv", "navMenu", "navSales", "navTimeClock", "changePinBtn", "lockBtn"];
        
        adminTabs.forEach(tabId => {
            const tab = document.getElementById(tabId);
            if (tab) {
                tab.style.display = "block";
                tab.classList.remove("hidden");
            }
        });

        // Only reveal the IT Audit Log tab for Master or IT roles
        if (managerRole === "Master" || managerRole === "IT") {
            const auditTab = document.getElementById("navAudit");
            if (auditTab) auditTab.style.display = "block";
        }
        
        // Safe success message (Replaces the 'showToast' line that may have caused the crash)
        alert(`System unlocked by ${managerName}`);
        
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