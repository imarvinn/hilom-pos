// FIREBASE CONFIG
const firebaseConfig = {
    apiKey: "AIzaSyAfu260e9bNPHMBPcEtVzEJ2G2hcScNl5A",
    authDomain: "dbr-pos.firebaseapp.com",
    projectId: "dbr-pos",
    storageBucket: "dbr-pos.firebasestorage.app",
    messagingSenderId: "176532211278",
    appId: "1:176532211278:web:57d78462a3355a32ce251f"
};

// 1. SAFE INITIALIZATION CHECK
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();
const auth = firebase.auth();

// GLOBAL VARIABLES
let dynamicMenuRecipes = {}; 
let dynamicMenuDocs = {}; 
let activeTablesData = {};
let editingMenuId = null; 
let activeBillingTableId = null; 
let cart = {}; 
let cartTotalRaw = 0;
let currentSalesData = []; 
let currentExpensesData = [];
let isAdminUnlocked = false; 
let ADMIN_PIN = "1234";
let pendingViewId = ""; 
let pendingNavElement = null;
let currentPrintType = "";

// GLOBAL UTILITIES
function showToast(message) {
    const toast = document.getElementById("toast"); 
    if (toast) {
        toast.innerText = message; 
        toast.className = "show";
        setTimeout(() => { toast.className = toast.className.replace("show", ""); }, 3000);
    }
}

// ========================================================
// DELAYED LOADERS: Only fire these AFTER user is authorized
// ========================================================

function loadSecuritySettings() {
    db.collection("settings").doc("security").onSnapshot((doc) => {
        if (doc.exists && doc.data().adminPin) {
            ADMIN_PIN = doc.data().adminPin;
        } else {
            db.collection("settings").doc("security").set({ adminPin: "1234" }).catch(err => console.error(err));
        }
    });
}

async function initializeConfig() {
    try {
        const configRef = db.collection('config').doc('system');
        const doc = await configRef.get();
        if (!doc.exists) {
            await configRef.set({ invoiceCount: 1, zCount: 1, grandTotal: 0 });
        }
    } catch (err) {
        console.error("Config init error:", err);
    }
}

async function updatePinInDatabase(newPin) {
  try {
    await db.collection("settings").doc("security").update({
      adminPin: newPin
    });
    showToast("PIN successfully updated!");
  } catch (error) {
    console.error("Error updating PIN: ", error);
    showToast("Error updating PIN.");
  }
}

// FRONTEND SEARCH OPTIMIZATION
document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('pos-search-bar');
    if (searchInput) {
        searchInput.addEventListener('input', debounce(handleSearch, 300));
    } else {
        console.warn("Search bar not found on this page.");
    }
});