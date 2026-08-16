# Event Registration: Tally → Vercel → Razorpay → Google Sheets

Flow: person fills Tally form → instantly redirected into Razorpay
Checkout (same tab, no separate link) → pays via UPI/card → webhook
marks them "Paid" in a Google Sheet, matched by a unique response ID
(never by name/phone/account number).

---

## 1. Create the Tally form

1. Go to tally.so, build your form (name, email, phone, whatever else
   you need).
2. Publish it.
3. Go to **Settings → After submission → Redirect to a website**.
   Set the URL to:

   ```
   https://YOUR-VERCEL-APP.vercel.app/api/create-order?response_id={{Response ID}}
   ```

   `{{Response ID}}` is a built-in Tally variable — no hidden field
   setup needed, every submission already has a unique ID.

4. Get your **Form ID**: it's the string in your form's edit URL,
   e.g. `tally.so/forms/wAbc123/edit` → form ID is `wAbc123`.
5. Get an **API key**: Settings → Developer → Generate API key.

## 2. Set up the Google Sheet (your database)

1. Create a new Google Sheet. In row 1, add these headers exactly:

   ```
   response_id | name | email | phone | order_id | payment_id | status | amount | submitted_at | paid_at
   ```

2. Rename the tab to `Registrations` (or set `GOOGLE_SHEET_TAB_NAME`
   to whatever you name it).
3. Copy the Sheet ID from its URL:
   `docs.google.com/spreadsheets/d/THIS_PART/edit`

## 3. Create a Google service account (so the app can write to the sheet)

1. Go to [Google Cloud Console](https://console.cloud.google.com) →
   create a project (or use an existing one).
2. Enable the **Google Sheets API**.
3. Go to **IAM & Admin → Service Accounts → Create Service Account**.
4. Once created, open it → **Keys → Add Key → JSON**. This downloads
   a `.json` file — keep it private, never commit it.
5. Open your Google Sheet → **Share** → paste the service account's
   `client_email` (looks like `xxx@yyy.iam.gserviceaccount.com`) →
   give it **Editor** access.
6. Base64-encode the whole JSON file (this becomes one env variable):
   ```bash
   base64 -i service-account.json | tr -d '\n'
   ```

## 4. Set up Razorpay

1. Dashboard → **Settings → API Keys** → generate Key ID + Key Secret.
2. Dashboard → **Settings → Webhooks → Add New Webhook**:
   - URL: `https://YOUR-VERCEL-APP.vercel.app/api/webhook`
   - Active events: check **payment.captured**
   - Set a secret — this becomes `RAZORPAY_WEBHOOK_SECRET`
3. Make sure UPI is enabled as a payment method on your account
   (it is by default for most Indian business accounts).

## 5. Deploy to Vercel

1. Push this folder to a GitHub repo.
2. Go to vercel.com → **New Project** → import that repo.
3. Under **Environment Variables**, add everything from `.env.example`
   with your real values.
4. Deploy. Note your live URL (e.g. `event-reg-yourname.vercel.app`)
   and go back to **step 1** to put the real URL into your Tally
   redirect setting, and **step 4** for the webhook URL.

## 6. Test it end-to-end before the real event

1. Submit your own Tally form as a test.
2. Confirm you land on the Razorpay checkout instantly.
3. Pay a small test amount (or use Razorpay test mode keys first).
4. Check the Google Sheet — a row should appear as `pending` right
   after submission, then flip to `paid` within a few seconds of
   payment, with `payment_id` and `paid_at` filled in.
5. Deliberately abandon a payment (close the checkout) — confirm the
   row stays `pending`, so you can see who registered but didn't pay.

## Why this is error-proof for the "who paid" problem

- Every payment is tied to a Razorpay **order** created specifically
  for one `response_id`.
- The webhook reads `response_id` back out of `payment.notes` —
  this travels with the transaction itself, not with whoever's
  bank account or phone actually made the payment.
- So it doesn't matter if a friend, parent, or colleague pays on the
  registrant's behalf — the link is unbreakable and automatic.

## Notes / things to double check

- `lib/tally.js` assumes a direct "get one submission" endpoint exists;
  if Tally ever changes this, it automatically falls back to scanning
  the list endpoint, so it keeps working either way.
- The registration fee is fixed (`EVENT_FEE_PAISE`). If you have
  multiple ticket tiers, extend `create-order.js` to read the tier
  from the Tally answers and set the amount accordingly.
- Start with Razorpay **test mode** keys until you've confirmed the
  whole flow works, then swap in live keys.
