const crypto = require("crypto");
const { admin, db, auth } = require("./_firebaseAdmin");

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 5 * 60 * 1000; // 5 minutes

function safeEqual(a, b) {
  const bufA = Buffer.from(String(a || ""), "utf8");
  const bufB = Buffer.from(String(b || ""), "utf8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ valid: false, error: "Method not allowed." });
  }

  try {
    // 1. Verify caller's Firebase Auth ID Token
    const authHeader = req.headers.authorization || "";
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!match) {
      return res.status(401).json({ valid: false, error: "Missing authorization token." });
    }

    const decoded = await auth.verifyIdToken(match[1]);
    const uid = decoded.uid;

    // 2. Confirm caller is an APPROVED staff account
    const callerDoc = await db.collection("admin_users").doc(uid).get();
    if (!callerDoc.exists || callerDoc.data().status !== "APPROVED") {
      return res.status(403).json({ valid: false, error: "Account not approved." });
    }
    const callerData = callerDoc.data();
    const callerLabel = `${callerData.name || decoded.email || uid} (${callerData.role || "Staff"})`;

    // 3. Validate PIN format
    const { pin, context } = req.body || {};
    const cleanPin = String(pin || "").trim();
    const cleanContext = String(context || "POS_AUTHORIZATION").slice(0, 60);

    if (!/^\d{4}$/.test(cleanPin)) {
      return res.status(400).json({ valid: false, error: "PIN must be exactly 4 digits." });
    }

    // 4. Server-side brute-force lockout check
    const attemptRef = db.collection("security_pin_attempts").doc(uid);
    const attemptDoc = await attemptRef.get();
    const now = Date.now();

    if (attemptDoc.exists) {
      const att = attemptDoc.data();
      if (att.lockedUntil && att.lockedUntil > now) {
        const secsLeft = Math.ceil((att.lockedUntil - now) / 1000);
        return res.status(429).json({
          valid: false,
          error: `Too many failed PIN attempts. Try again in ${secsLeft}s.`,
        });
      }
    }

    // 5. Check Manager / Master PINs in staff collection
    let authorizedBy = null;
    let authorizedRole = null;

    const mgrSnap = await db
      .collection("staff")
      .where("role", "in", ["Manager", "Master"])
      .get();

    for (const doc of mgrSnap.docs) {
      const data = doc.data();
      if (data.pinCode && safeEqual(data.pinCode, cleanPin)) {
        authorizedBy = data.name || "Manager";
        authorizedRole = data.role;
        break;
      }
    }

    // 6. Fallback: Check master admin PIN in settings/security
    if (!authorizedBy) {
      const secDoc = await db.collection("settings").doc("security").get();
      if (secDoc.exists) {
        const secData = secDoc.data();
        const masterPin = secData.adminPin || secData.pin;
        if (masterPin && safeEqual(masterPin, cleanPin)) {
          authorizedBy = "Master Admin PIN";
          authorizedRole = "Master";
        }
      }
    }

    // 7. Handle Success vs. Failure
    if (authorizedBy) {
      await attemptRef.set(
        { attempts: 0, lockedUntil: null, lastSuccessAt: admin.firestore.FieldValue.serverTimestamp() },
        { merge: true }
      );
      return res.status(200).json({
        valid: true,
        authorizedBy,
        role: authorizedRole,
      });
    }

    // Record failed attempt & lock out after 5 failures
    const prevAttempts = attemptDoc.exists && (!attemptDoc.data().lockedUntil || attemptDoc.data().lockedUntil <= now)
      ? Number(attemptDoc.data().attempts || 0)
      : 0;
    const newAttempts = prevAttempts + 1;
    const lockedUntil = newAttempts >= MAX_ATTEMPTS ? now + LOCKOUT_MS : null;

    await Promise.all([
      attemptRef.set(
        {
          attempts: newAttempts,
          lockedUntil,
          lastFailedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      ),
      db.collection("audit_logs").add({
        category: "SECURITY",
        action: "FAILED_PIN_ATTEMPT",
        tableNo: cleanContext,
        amount: 0,
        performedBy: callerLabel,
        authorizedBy: "DENIED",
        details: `Invalid Manager PIN entered (${newAttempts}/${MAX_ATTEMPTS})${lockedUntil ? " — Account locked for 5 minutes." : "."}`,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      }),
    ]);

    const remaining = Math.max(0, MAX_ATTEMPTS - newAttempts);
    return res.status(403).json({
      valid: false,
      error: lockedUntil
        ? "Too many failed attempts. Locked for 5 minutes."
        : `Invalid Manager PIN (${remaining} attempt${remaining === 1 ? "" : "s"} left).`,
    });
  } catch (err) {
    console.error("verify-pin error:", err);
    return res.status(500).json({ valid: false, error: "Authorization service error." });
  }
};