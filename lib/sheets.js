// lib/sheets.js
// Thin wrapper around Google Sheets API using a service account.
// The sheet is our "database". One row per registrant.
// Columns (row 1 = header):
// A: response_id | B: name | C: email | D: phone | E: order_id
// F: payment_id  | G: status | H: amount | I: submitted_at | J: paid_at

const { google } = require("googleapis");

function getAuth() {
  const credentials = JSON.parse(
    Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64, "base64").toString("utf-8")
  );
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

async function getSheetsClient() {
  const auth = getAuth();
  const client = await auth.getClient();
  return google.sheets({ version: "v4", auth: client });
}

const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID;
const SHEET_NAME = process.env.GOOGLE_SHEET_TAB_NAME || "Registrations";
const RANGE_ALL = `${SHEET_NAME}!A2:J`;

// Find the row number (1-indexed, including header) for a given response_id.
// Returns null if not found.
async function findRowByResponseId(sheets, responseId) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: RANGE_ALL,
  });
  const rows = res.data.values || [];
  for (let i = 0; i < rows.length; i++) {
    if (rows[i][0] === responseId) {
      return i + 2; // +2: account for header row + 0-index
    }
  }
  return null;
}

// Create or update the row for this registrant.
// `fields` is a partial object; only provided keys are written.
async function upsertRegistrant(responseId, fields) {
  const sheets = await getSheetsClient();
  const existingRow = await findRowByResponseId(sheets, responseId);

  const colOrder = [
    "response_id",
    "name",
    "email",
    "phone",
    "order_id",
    "payment_id",
    "status",
    "amount",
    "submitted_at",
    "paid_at",
  ];

  if (existingRow) {
    // Read current row so we only overwrite the fields we were given.
    const current = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A${existingRow}:J${existingRow}`,
    });
    const currentValues = (current.data.values && current.data.values[0]) || [];
    const merged = colOrder.map((key, idx) => {
      if (fields[key] !== undefined) return fields[key];
      return currentValues[idx] !== undefined ? currentValues[idx] : "";
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A${existingRow}:J${existingRow}`,
      valueInputOption: "RAW",
      requestBody: { values: [merged] },
    });
  } else {
    const row = colOrder.map((key) => (fields[key] !== undefined ? fields[key] : ""));
    row[0] = responseId; // always set
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: RANGE_ALL,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [row] },
    });
  }
}

module.exports = { upsertRegistrant, findRowByResponseId, getSheetsClient, SPREADSHEET_ID, SHEET_NAME };
