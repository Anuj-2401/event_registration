// api/create-order.js
// Tally's "redirect on completion" points here with the response id:
//   https://yourapp.vercel.app/api/create-order?response_id={{Response ID}}
//
// This function:
// 1. Fetches that submission's answers from Tally.
// 2. Creates a Razorpay order tagged with the response_id.
// 3. Saves a "pending" row in Google Sheets.
// 4. Redirects the browser to /pay.html with everything Checkout.js needs.

const Razorpay = require("razorpay");
const { getSubmissionByResponseId } = require("../lib/tally");
const { upsertRegistrant } = require("../lib/sheets");

const EVENT_FEE_PAISE = parseInt(process.env.EVENT_FEE_PAISE || "50000", 10); // default ₹500.00

module.exports = async (req, res) => {
  try {
    const responseId = req.query.response_id;
    if (!responseId) {
      res.status(400).send("Missing response_id");
      return;
    }

    // 1. Pull the registrant's form answers from Tally.
    const submission = await getSubmissionByResponseId(process.env.TALLY_FORM_ID, responseId);

    // 2. Create a Razorpay order tied to this specific registrant.
    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    const order = await razorpay.orders.create({
      amount: EVENT_FEE_PAISE, // amount in paise
      currency: "INR",
      receipt: responseId,
      notes: {
        response_id: responseId,
        name: submission.name,
        email: submission.email,
      },
    });

    // 3. Record a "pending" row so the sheet has everyone, paid or not.
    await upsertRegistrant(responseId, {
      name: submission.name,
      email: submission.email,
      phone: submission.phone,
      order_id: order.id,
      status: "pending",
      amount: (EVENT_FEE_PAISE / 100).toFixed(2),
      submitted_at: submission.submittedAt || new Date().toISOString(),
    });

    // 4. Send the browser straight into checkout — no separate link, no extra click.
    const params = new URLSearchParams({
      order_id: order.id,
      key: process.env.RAZORPAY_KEY_ID,
      amount: String(EVENT_FEE_PAISE),
      name: submission.name || "",
      email: submission.email || "",
      phone: submission.phone || "",
      response_id: responseId,
    });

    res.writeHead(302, { Location: `/pay.html?${params.toString()}` });
    res.end();
  } catch (err) {
    console.error(err);
    res.status(500).send("Something went wrong setting up your payment. Please contact the organizer.");
  }
};
