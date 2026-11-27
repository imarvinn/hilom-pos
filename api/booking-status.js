const { getFirebaseAdmin } = require("./_firebaseAdmin");

// Best-effort in-memory per-IP rate limiter (15 lookups per minute per instance)
const ipHits = new Map();
const WINDOW_MS = 60 * 1000;
const MAX_HITS = 15;

function isRateLimited(ip) {
  const now = Date.now();
  const entry = ipHits.get(ip) || { count: 0, resetAt: now + WINDOW_MS };
  if (now > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + WINDOW_MS;
  }
  entry.count += 1;
  ipHits.set(ip, entry);
  return entry.count > MAX_HITS;
}

function maskGuestName(fullName) {
  const parts = String(fullName || "Guest").trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed." });
  }

  const forwarded = req.headers["x-forwarded-for"];
  const clientIp = (Array.isArray(forwarded) ? forwarded[0] : String(forwarded || "unknown")).split(",")[0].trim();
  if (isRateLimited(clientIp)) {
    return res.status(429).json({ error: "Too many lookup requests. Please wait a minute." });
  }

  try {
    const { db } = getFirebaseAdmin();

    const contact = String((req.body && req.body.contact) || "").trim();
    if (contact.length < 7 || contact.length > 40) {
      return res.status(400).json({ error: "Please enter a valid contact number." });
    }

    const snapshot = await db
      .collection("web_reservations")
      .where("contact", "==", contact)
      .limit(10)
      .get();

    if (snapshot.empty) {
      return res.status(200).json({ bookings: [] });
    }

    const bookings = [];
    snapshot.forEach((doc) => {
      const d = doc.data();
      bookings.push({
        guestName: maskGuestName(d.guestName),
        roomType: d.roomType || "",
        checkInDate: d.checkInDate || "",
        checkOutDate: d.checkOutDate || "",
        status: d.status ? String(d.status).toUpperCase() : "PENDING",
        sortSeconds: d.timestamp && d.timestamp._seconds ? d.timestamp._seconds : 0,
      });
    });

    bookings.sort((a, b) => b.sortSeconds - a.sortSeconds);

    return res.status(200).json({
      bookings: bookings.map(({ sortSeconds, ...safe }) => safe),
    });
  } catch (err) {
    console.error("booking-status error:", err);
    return res.status(500).json({ error: "Unable to retrieve reservation status." });
  }
};