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
        // 1. BULLETPROOF CHECK: Fetch all staff and compare manually in JavaScript.
        // This guarantees it works whether the database saved your PIN as a String OR a Number.
        const staffQuery = await db.collection("staff").get();
        let authorizedUser = null;

        staffQuery.forEach(doc => {
            const data = doc.data();
            // Force both to be strings so they match perfectly
            if (String(data.pinCode) === pinInput) {
                const role = String(data.role).toLowerCase();
                // Check if the role contains admin keywords
                if (role.includes("manager") || role.includes("master") || role.includes("it")) {
                    authorizedUser = data;
                }
            }
        });
        
        if (!authorizedUser) {
            document.getElementById("adminPin").value = ""; 
            return alert("❌ ACCESS DENIED: Invalid PIN or your account doesn't have Manager privileges.");
        }
        
        // 2. FORCE CLOSE THE MODAL (Bypasses duplicate HTML IDs)
        const pinElement = document.getElementById("adminPin");
        if (pinElement) {
            pinElement.value = ""; // clear for next time
            const modal = pinElement.closest('.modal-overlay');
            if (modal) modal.classList.add("hidden");
            
            // Backup close just in case
            const mainModal = document.getElementById("pinModal");
            if (mainModal) mainModal.classList.add("hidden");
        }
        
       // 3. FORCE ALL TABS TO REVEAL (BRUTE-FORCE OVERRIDE)
        // This targets the CSS classes in your sidebar instead of guessing exact IDs
        
        // Grab literally everything inside your sidebar navigation
        const allSidebarTabs = document.querySelectorAll('.sidebar li, .sidebar a, .sidebar div, .nav-btn, [style*="display: none"]');
        
        allSidebarTabs.forEach(tab => {
            // Force override any CSS hiding it
            tab.style.display = "block"; 
            tab.style.visibility = "visible";
            tab.style.pointerEvents = "auto";
            tab.style.opacity = "1";
            tab.classList.remove("hidden");
        });

        // Specific check for the Audit tab if it exists
        const roleStr = String(authorizedUser.role).toLowerCase();
        if (!roleStr.includes("master") && !roleStr.includes("it")) {
            // If they aren't Master/IT, hide the audit log again just in case it got revealed
            const auditTab = document.getElementById("navAudit") || document.getElementById("auditTab");
            if (auditTab) {
                auditTab.style.display = "none";
            }
        }
        
        alert(`✅ System unlocked by ${authorizedUser.name || "Admin"}`);
        
    } catch (error) {
        console.error("Error verifying PIN:", error);
        alert("Database error verifying PIN. Check your connection.");
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