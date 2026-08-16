// api/webhook.js
// Configure this URL in Razorpay Dashboard -> Settings -> Webhooks:
//   https://yourapp.vercel.app/api/webhook
// Subscribe to event: payment.captured
//
// This is the SOURCE OF TRUTH for "paid" status — never trust the
// browser-side handler alone, since it can be closed/interrupted or spoofed.

const crypto = require("crypto");
const { upsertRegistrant } = require("../lib/sheets");

// Vercel needs the raw request body to verify the HMAC signature,
// so we disable the default JSON body parsing here.
module.exports.config = { api: { bodyParser: false } };

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).send("Method not allowed");
    return;
  }

  const rawBody = await getRawBody(req);
  const signature = req.headers["x-razorpay-signature"];

  const expectedSignature = crypto
    .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex");

  if (signature !== expectedSignature) {
    console.error("Invalid Razorpay webhook signature");
    res.status(400).send("Invalid signature");
    return;
  }

  const payload = JSON.parse(rawBody);

  // Only act on captured payments; ignore other event types.
  if (payload.event === "payment.captured") {
    const payment = payload.payload.payment.entity;
    const responseId = payment.notes && payment.notes.response_id;

    if (!responseId) {
      console.error("Webhook received without response_id in notes", payment.id);
      res.status(200).send("ok"); // ack anyway so Razorpay doesn't retry forever
      return;
    }

    await upsertRegistrant(responseId, {
      payment_id: payment.id,
      order_id: payment.order_id,
      status: "paid",
      amount: (payment.amount / 100).toFixed(2),
      paid_at: new Date().toISOString(),
    });
  }

  // Always ack quickly so Razorpay marks the webhook delivered.
  res.status(200).send("ok");
};
