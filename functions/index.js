const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const crypto = require("crypto");

admin.initializeApp();
const db = admin.firestore();

// ============================================================
// LEMON SQUEEZY WEBHOOK
// ============================================================
// Receives subscription events from LemonSqueezy and updates
// the user's subscription status in Firestore.
//
// Firestore structure:
//   subscriptions/{email} = { status, expiresAt, uid, variantId }
//   users/{uid}.subscription = { status, expiresAt }
// ============================================================

exports.lemonWebhook = functions.https.onRequest(async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  // Verify LemonSqueezy signature
  const secret = process.env.LEMONSQUEEZY_SECRET;
  const signature = req.headers["x-signature"];

  if (secret && signature) {
    const hash = crypto
      .createHmac("sha256", secret)
      .update(JSON.stringify(req.body))
      .digest("hex");

    if (hash !== signature) {
      console.error("Invalid signature");
      return res.status(401).send("Unauthorized");
    }
  }

  const event = req.headers["x-event-name"];
  const data = req.body.data;
  const attributes = data?.attributes;

  if (!attributes) {
    return res.status(400).send("Bad Request");
  }

  const email = attributes.user_email?.toLowerCase();
  const customUserId = attributes.first_order_item?.custom_price !== undefined
    ? null
    : (req.body.meta?.custom_data?.user_id || null);

  const status = mapStatus(event, attributes.status);
  const endsAt = attributes.ends_at || attributes.renews_at || null;

  console.log(`Event: ${event}, email: ${email}, status: ${status}`);

  try {
    // 1. Save to subscriptions collection (keyed by email)
    await db.collection("subscriptions").doc(email).set({
      status,
      email,
      uid: customUserId || null,
      expiresAt: endsAt ? new Date(endsAt) : null,
      lemonSqueezyId: data.id,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    // 2. If we have UID — also update users/{uid} directly
    if (customUserId) {
      await db.collection("users").doc(customUserId).set({
        subscription: {
          status,
          expiresAt: endsAt ? new Date(endsAt) : null,
        }
      }, { merge: true });
    } else {
      // Try to find user by email
      const usersSnap = await db.collection("users")
        .where("email", "==", email)
        .limit(1)
        .get();

      if (!usersSnap.empty) {
        const uid = usersSnap.docs[0].id;
        await db.collection("users").doc(uid).set({
          subscription: {
            status,
            expiresAt: endsAt ? new Date(endsAt) : null,
          }
        }, { merge: true });
      }
    }

    return res.status(200).send("OK");
  } catch (err) {
    console.error("Firestore error:", err);
    return res.status(500).send("Internal Error");
  }
});

// Maps LemonSqueezy event + status to our internal status
function mapStatus(event, lsStatus) {
  if (event === "subscription_created" || event === "subscription_updated") {
    if (lsStatus === "active") return "active";
    if (lsStatus === "on_trial") return "trialing";
    if (lsStatus === "past_due") return "past_due";
    if (lsStatus === "cancelled") return "cancelled";
    if (lsStatus === "expired") return "expired";
    return lsStatus;
  }
  if (event === "subscription_expired") return "expired";
  if (event === "subscription_cancelled") return "cancelled";
  if (event === "subscription_payment_failed") return "past_due";
  if (event === "subscription_payment_success") return "active";
  return "unknown";
}
