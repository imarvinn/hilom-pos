const admin = require("firebase-admin");

function normalizePrivateKey(key) {
  let k = String(key || "").trim();
  if ((k.startsWith('"') && k.endsWith('"')) || (k.startsWith("'") && k.endsWith("'"))) {
    k = k.slice(1, -1);
  }
  return k.replace(/\\n/g, "\n");
}

function getCredentialConfig() {
  // Option A (Recommended): 3 simple separate env vars
  const projectId = (process.env.FIREBASE_PROJECT_ID || "").trim();
  const clientEmail = (process.env.FIREBASE_CLIENT_EMAIL || "").trim();
  const privateKey = (process.env.FIREBASE_PRIVATE_KEY || "").trim();

  if (projectId && clientEmail && privateKey) {
    return {
      projectId,
      clientEmail,
      privateKey: normalizePrivateKey(privateKey),
    };
  }

  // Option B (Fallback): single JSON or Base64 JSON blob
  let raw = (process.env.FIREBASE_SERVICE_ACCOUNT_KEY || "").trim().replace(/^\uFEFF/, "");
  if (!raw) {
    throw new Error(
      "Missing Firebase Admin env vars. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY in Vercel."
    );
  }

  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    raw = raw.slice(1, -1).trim();
  }

  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    try {
      const decoded = Buffer.from(raw.replace(/\s+/g, ""), "base64")
        .toString("utf8")
        .trim()
        .replace(/^\uFEFF/, "");
      parsed = JSON.parse(decoded);
    } catch {
      throw new Error("FIREBASE_SERVICE_ACCOUNT_KEY is neither valid JSON nor valid Base64 JSON.");
    }
  }

  if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
    throw new Error("Service account JSON is missing project_id, client_email, or private_key.");
  }

  return {
    projectId: parsed.project_id,
    clientEmail: parsed.client_email,
    privateKey: normalizePrivateKey(parsed.private_key),
  };
}

function getFirebaseAdmin() {
  if (!admin.apps.length) {
    const creds = getCredentialConfig();
    admin.initializeApp({
      credential: admin.credential.cert(creds),
    });
  }
  return {
    admin,
    db: admin.firestore(),
    auth: admin.auth(),
  };
}

module.exports = { getFirebaseAdmin };