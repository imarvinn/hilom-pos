window.verifyManagerPinServer = async function (pin, context = "POS_AUTHORIZATION") {
    const user = firebase.auth().currentUser;
    if (!user) return { valid: false, error: "Not signed in." };

    try {
        const idToken = await user.getIdToken();
        const res = await fetch("/api/verify-pin", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${idToken}`
            },
            body: JSON.stringify({ pin: String(pin || "").trim(), context })
        });
        return await res.json();
    } catch (err) {
        console.error("PIN verification request failed:", err);
        return { valid: false, error: "Unable to reach authorization server." };
    }
};

// --- CENTRAL AUDIT LOGGING HELPER ---
window.getAuditActor = function() {
    if (window.currentStaffProfile && window.currentStaffProfile.name) {
        return `${window.currentStaffProfile.name} (${window.currentStaffProfile.role || "Staff"})`;
    }
    const u = (typeof firebase !== "undefined" && firebase.auth) ? firebase.auth().currentUser : null;
    if (u) return u.displayName || u.email || "Authenticated Staff";
    return "System";
};

window.recordAuditEvent = async function({ category = "TRANSACTION", action = "SYSTEM_EVENT", tableNo = "System", amount = 0, authorizedBy = null, details = "" } = {}) {
    try {
        if (typeof db === "undefined") return;
        const actor = window.getAuditActor();
        await db.collection("audit_logs").add({
            category: category,
            action: action,
            tableNo: String(tableNo || "System"),
            amount: Number(amount) || 0,
            performedBy: actor,
            authorizedBy: authorizedBy || actor,
            details: String(details || ""),
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch (err) {
        console.warn("Audit log write skipped:", err);
    }
};

// --- SECURITY & NAVIGATION ---
function switchView(viewId, navElement) {
    const protectedViews = ['inventoryView', 'menuManageView', 'salesView'];
    
    if (protectedViews.includes(viewId) && !isAdminUnlocked) {
        pendingViewId = viewId;
        pendingNavElement = navElement;
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
    if (targetView) {
        targetView.classList.remove('hidden');
        targetView.classList.add('active');
    }
    if (navElement) navElement.classList.add('active');
    
    if (isAdminUnlocked) {
        const lockBtn = document.getElementById("lockBtn");
        const changePinBtn = document.getElementById("changePinBtn");
        if (lockBtn) lockBtn.classList.remove("hidden");
        if (changePinBtn) changePinBtn.classList.remove("hidden");
    }
}

async function verifyPin() {
    const pinInput = document.getElementById("adminPin");
    const enteredPin = pinInput ? pinInput.value.trim() : "";
    if (!enteredPin) return showToast("Please enter a 4-digit PIN.");

    const result = await window.verifyManagerPinServer(enteredPin, "POS_MODAL_AUTH");

    if (result && result.valid) {
        window.lastPinAuthorizer = result.authorizedBy || "Manager PIN";
        if (pinInput) pinInput.value = "";
        document.getElementById("pinModal").classList.add("hidden");

        // 1. If triggered by a Promise-based action (e.g., Void / Discount)
        if (typeof pinResolvePromise === "function") {
            const resolve = pinResolvePromise;
            pinResolvePromise = null;
            resolve(true);
            return;
        }

        // 2. If triggered by clicking a protected tab (Inventory / Menu / Sales)
        isAdminUnlocked = true;
        window.isAdminUnlocked = true;

        if (typeof pendingViewId !== "undefined" && pendingViewId) {
            const targetView = pendingViewId;
            const targetNav = typeof pendingNavElement !== "undefined" ? pendingNavElement : null;
            pendingViewId = null;
            pendingNavElement = null;
            switchView(targetView, targetNav);
        }
        return;
    }

    if (pinInput) pinInput.value = "";
    showToast((result && result.error) || "Invalid Manager PIN.");
}

function closePinModal() { 
    const mainModal = document.getElementById('pinModal');
    if (mainModal) mainModal.classList.add('hidden'); 
    const pinElement = document.getElementById("adminPin");
    if (pinElement) pinElement.value = "";

    if (typeof pendingViewId !== "undefined") pendingViewId = null;
    if (typeof pendingNavElement !== "undefined") pendingNavElement = null;

    if (typeof pinResolvePromise === "function" && pinResolvePromise !== null) {
        const resolve = pinResolvePromise;
        pinResolvePromise = null;
        resolve(false);
    }
}

window.submitClassicPin = verifyPin;

function lockAdmin() {
    isAdminUnlocked = false;
    window.isAdminUnlocked = false;
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

    db.collection("settings").doc("security").set({ adminPin: newPin }, { merge: true })
    .then(() => {
        ADMIN_PIN = newPin;
        if (typeof window.recordAuditEvent === "function") {
            window.recordAuditEvent({
                category: "SECURITY",
                action: "CHANGE_ADMIN_PIN",
                tableNo: "System Security",
                amount: 0,
                authorizedBy: window.lastPinAuthorizer || window.getAuditActor(),
                details: "Master/Admin security PIN was changed."
            });
        }
        showToast("Admin PIN successfully updated!");
        closeChangePinModal();
    })
    .catch((error) => {
        showToast("Error updating PIN. Check console.");
        console.error(error);
    });
}

function login() {
    auth.signInWithEmailAndPassword(
        document.getElementById('email').value,
        document.getElementById('password').value
    ).catch(() => document.getElementById('errorMessage').innerText = "Login failed.");
}

function logout() { auth.signOut(); }