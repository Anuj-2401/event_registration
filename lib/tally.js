// lib/tally.js
// Fetches a single form submission from Tally and flattens it into
// a simple { name, email, phone } object.
//
// IMPORTANT: Tally's public docs guarantee GET /forms/:id/submissions
// (a list, filterable/paginated). A direct GET /forms/:id/submissions/:id
// endpoint mirrors the documented DELETE endpoint pattern but isn't
// spelled out in the docs at time of writing. This helper tries the
// direct endpoint first and falls back to scanning the list endpoint,
// so it keeps working either way.

const TALLY_API_BASE = "https://api.tally.so";

async function tallyFetch(path) {
  const res = await fetch(`${TALLY_API_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${process.env.TALLY_API_KEY}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    throw new Error(`Tally API error ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

// Turn Tally's { questions, responses } shape for one submission into
// a flat map of "question title" -> "answer".
function flattenSubmission(submission, questions) {
  const titleById = {};
  for (const q of questions) titleById[q.id] = q.title;

  const flat = {};
  for (const r of submission.responses) {
    const title = titleById[r.questionId] || r.questionId;
    flat[title] = r.answer;
  }
  return flat;
}

// Best-effort matching of common field labels to name/email/phone.
// Adjust these keyword lists if your form uses different question wording.
function pickField(flat, keywords) {
  const entries = Object.entries(flat);
  for (const [title, value] of entries) {
    const t = title.toLowerCase();
    if (keywords.some((k) => t.includes(k))) return value;
  }
  return "";
}

async function getSubmissionByResponseId(formId, responseId) {
  let submission = null;
  let questions = [];

  // Try direct fetch first.
  try {
    const direct = await tallyFetch(`/forms/${formId}/submissions/${responseId}`);
    // Some Tally responses nest the submission directly, others wrap it.
    submission = direct.submission || direct;
    questions = direct.questions || [];
  } catch (e) {
    submission = null;
  }

  // Fallback: list submissions and find the matching id.
  if (!submission) {
    const list = await tallyFetch(`/forms/${formId}/submissions?limit=100`);
    questions = list.questions || [];
    submission = (list.submissions || []).find((s) => s.id === responseId);
  }

  if (!submission) {
    throw new Error(`Submission ${responseId} not found for form ${formId}`);
  }

  const flat = flattenSubmission(submission, questions);

  return {
    responseId: submission.id,
    submittedAt: submission.submittedAt,
    raw: flat,
    name: pickField(flat, ["name"]),
    email: pickField(flat, ["email"]),
    phone: pickField(flat, ["phone", "mobile", "contact"]),
  };
}

module.exports = { getSubmissionByResponseId };
