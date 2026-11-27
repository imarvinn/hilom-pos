const admin = require("firebase-admin");

function getServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) {
    throw new Error("Missing FIREBASE_SERVICE_ACCOUNT_KEY environment variable.");
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Fallback if stored as Base64 in Vercel Environment Variables
    const decoded = Buffer.from(raw, "base64").toString("utf8");
    parsed = JSON.parse(decoded);
  }

  if (parsed.private_key) {
    parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
  }
  return parsed;
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(getServiceAccount()),
  });
}

module.exports = {
  admin,
  db: admin.firestore(),
  auth: admin.auth(),
};