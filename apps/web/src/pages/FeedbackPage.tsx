import { useState, type FormEvent } from "react";
import { Callout } from "../components/primitives/index.ts";
import { submitFeedback, ApiError, apiErrorDetails, type FeedbackCategory } from "../api.ts";
import { DOCS_API_BASE } from "../config.ts";

// ─── Feedback / support ──────────────────────────────────────────
//
// One intake for humans and agents alike. The form is deliberately short —
// only the message is required — because the reports most worth having come
// from people who hit a wall and have little patience left for a form. Every
// other field is optional structure that helps triage when it's offered.
//
// The JSON-LD below describes the page itself (a ContactPage with a real
// ContactPoint). It carries NO review or rating markup: with no published
// reviews yet, emitting AggregateRating would be fabricated structured data —
// both dishonest and a well-known ranking penalty. When real reviews exist and
// are published, that markup can be added truthfully.

const CATEGORIES: Array<{ id: FeedbackCategory; label: string; hint: string }> = [
  { id: "bug", label: "Something's broken", hint: "It errored, hung, or gave the wrong result." },
  { id: "feature", label: "Feature request", hint: "Something you wish it did." },
  { id: "question", label: "Question", hint: "You're not sure how something works." },
  { id: "praise", label: "This worked well", hint: "Tell us what to protect." },
  { id: "other", label: "Something else", hint: "Anything that doesn't fit above." },
];

// The API origin is derived from config.ts, never written out here — that
// single-source rule is enforced by count-honesty, and a hardcoded host in a
// page would silently point structured data at the wrong environment.
const WEB_ORIGIN = "https://iliad.trustfabric.ai";

const JSON_LD = {
  "@context": "https://schema.org",
  "@type": "ContactPage",
  name: "Feedback & Support — Axis' Iliad",
  description:
    "Report a bug, request a feature, or ask a question about Axis' Iliad. Submissions reach the team by email and are used to harden the platform during beta. Agents can file the same structured report programmatically via POST /v1/feedback.",
  url: `${WEB_ORIGIN}/feedback`,
  isPartOf: { "@type": "WebSite", name: "Axis' Iliad", url: WEB_ORIGIN },
  mainEntity: {
    "@type": "ContactPoint",
    contactType: "customer support",
    email: "support@jonathanarvay.com",
    availableLanguage: "English",
  },
  potentialAction: {
    "@type": "CommunicateAction",
    name: "Submit feedback",
    target: {
      "@type": "EntryPoint",
      urlTemplate: `${DOCS_API_BASE}/v1/feedback`,
      httpMethod: "POST",
      contentType: "application/json",
    },
  },
};

export function FeedbackPage() {
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [category, setCategory] = useState<FeedbackCategory>("bug");
  const [rating, setRating] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<string | null>(null);
  const [ticketId, setTicketId] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = message.trim();
    if (trimmed.length < 10) {
      setError("Please write at least 10 characters so we know what to look at.");
      return;
    }
    setError(null);
    setErrorDetails(null);
    setSubmitting(true);
    try {
      const res = await submitFeedback({
        message: trimmed,
        ...(email.trim() ? { email: email.trim() } : {}),
        category,
        ...(rating !== null ? { rating } : {}),
        // Where they came from — the previous hash, not this page's own.
        page: document.referrer || window.location.hash || "(direct)",
      });
      setTicketId(res.ticket_id);
      setMessage("");
      setRating(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't reach the feedback service.");
      setErrorDetails(apiErrorDetails(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      {/* Structured data for search + LLM crawlers. Describes this page only. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }} />

      <div className="card" style={{ textAlign: "center", marginBottom: 24 }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 600, marginBottom: 8 }}>Feedback &amp; Support</h1>
        <p style={{ color: "var(--text-muted)", maxWidth: 560, margin: "0 auto" }}>
          Tell us what broke, what's missing, or what worked. Every submission goes straight to the
          team's inbox.
        </p>
      </div>

      <Callout tone="info" title="Axis' Iliad is in beta">
        We're hardening the platform in the open. Reviews and bug reports submitted here are read and
        used directly to decide what gets fixed and tested next — that's the whole point of this page
        existing before a polished support portal does.
      </Callout>

      {ticketId ? (
        <div className="card mt-4">
          <Callout tone="success" title="Got it — your report reached the team">
            <p style={{ marginBottom: 8 }}>
              Reference: <code className="mono">{ticketId}</code>
            </p>
            <p style={{ marginBottom: 12 }}>
              {email.trim()
                ? "We'll reply to the address you left."
                : "You didn't leave an email, so we can't reply directly — but the report was received."}
            </p>
            <button className="btn" onClick={() => setTicketId(null)}>
              Send another
            </button>
          </Callout>
        </div>
      ) : (
        <div className="card mt-4">
          <form onSubmit={(e) => { void handleSubmit(e); }}>
            <label htmlFor="feedback-category">What kind of feedback is this?</label>
            <select
              id="feedback-category"
              value={category}
              onChange={(e) => setCategory(e.target.value as FeedbackCategory)}
              style={{ width: "100%", marginBottom: 4 }}
            >
              {CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
            <p className="text-muted text-sm" style={{ marginBottom: 16 }}>
              {CATEGORIES.find((c) => c.id === category)?.hint}
            </p>

            <label htmlFor="feedback-message">
              What happened? <span style={{ color: "var(--accent)" }}>*</span>
            </label>
            <textarea
              id="feedback-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="What you were doing, what you expected, and what actually happened. Exact error text helps a lot."
              rows={7}
              maxLength={5000}
              required
              style={{ width: "100%" }}
              aria-describedby="feedback-message-hint"
            />
            <p id="feedback-message-hint" className="text-muted text-sm" style={{ marginBottom: 16 }}>
              {message.length}/5000 — at least 10 characters.
            </p>

            <label htmlFor="feedback-email">Your email (optional)</label>
            <input
              id="feedback-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              style={{ width: "100%", marginBottom: 4 }}
              aria-describedby="feedback-email-hint"
            />
            <p id="feedback-email-hint" className="text-muted text-sm" style={{ marginBottom: 16 }}>
              Only used to reply to you. Leave it blank to report anonymously.
            </p>

            <fieldset style={{ border: "none", padding: 0, margin: "0 0 16px" }}>
              <legend className="text-sm" style={{ padding: 0, marginBottom: 8 }}>
                How's it going so far? (optional)
              </legend>
              <div className="flex" style={{ gap: 8, flexWrap: "wrap" }}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={`btn ${rating === n ? "btn-primary" : ""}`}
                    aria-pressed={rating === n}
                    onClick={() => setRating(rating === n ? null : n)}
                  >
                    {n}
                  </button>
                ))}
                <span className="text-muted text-sm" style={{ alignSelf: "center" }}>
                  1 = rough, 5 = great
                </span>
              </div>
            </fieldset>

            <button type="submit" className="btn btn-primary" disabled={submitting || message.trim().length < 10}>
              {submitting ? (
                <>
                  <span className="spinner" /> Sending…
                </>
              ) : (
                "Send feedback"
              )}
            </button>
          </form>

          {error && (
            <div className="mt-4">
              <Callout tone="danger" title="That didn't send" details={errorDetails}>
                {error} You can also email us directly at{" "}
                <a href="mailto:support@jonathanarvay.com">support@jonathanarvay.com</a>.
              </Callout>
            </div>
          )}
        </div>
      )}

      <div className="card mt-4">
        <h2 style={{ fontSize: "1.1rem", fontWeight: 600, marginBottom: 8 }}>Filing a report as an agent</h2>
        <p className="text-muted text-sm" style={{ marginBottom: 12 }}>
          Agents are first-class users here. If a tool call behaved unexpectedly, file the same
          structured report programmatically — no API key required.
        </p>
        <pre className="mono text-sm" style={{ overflowX: "auto", padding: 12, background: "var(--bg-alt)", borderRadius: 4 }}>
{`curl -X POST ${DOCS_API_BASE}/v1/feedback \\
  -H "Content-Type: application/json" \\
  -d '{
    "message": "analyze_repo returned an empty file list for a valid repo",
    "category": "bug",
    "email": "agent-owner@example.com"
  }'`}
        </pre>
        <p className="text-muted text-sm" style={{ marginTop: 12 }}>
          Categories: <code className="mono">bug</code>, <code className="mono">feature</code>,{" "}
          <code className="mono">question</code>, <code className="mono">praise</code>,{" "}
          <code className="mono">other</code>. Optional <code className="mono">rating</code> is 1–5.
          Responses carry a <code className="mono">ticket_id</code> you can quote in follow-up.
        </p>
      </div>

      <div className="card mt-4">
        <h2 style={{ fontSize: "1.1rem", fontWeight: 600, marginBottom: 8 }}>Security issues</h2>
        <p className="text-muted text-sm">
          Please don't report vulnerabilities through this form — it delivers to a normal support
          inbox. Use the contact in{" "}
          <a href={`${DOCS_API_BASE}/.well-known/security.txt`}>security.txt</a> so it's handled
          under the disclosure policy.
        </p>
      </div>
    </div>
  );
}
