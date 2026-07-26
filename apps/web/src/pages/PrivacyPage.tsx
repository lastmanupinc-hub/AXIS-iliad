// ─── Privacy Policy ─────────────────────────────────────────────
// Mirrors the structure/styling of TermsPage.tsx. Content is synced from the
// root PRIVACY_POLICY.md draft (R2.4) -- keep the two in lockstep the same
// way TermsPage.tsx and TERMS_OF_SERVICE.md are meant to be. Ships as a
// visible DRAFT (unlike TermsPage) because attorney review is still an
// owner-gated step; do not remove the draft notice without that review.

import { PROD_API_BASE } from "../config.ts";

// config.ts is the ONE module web pages may hardcode the API origin in
// (count-honesty.test.ts's "canonical API origin is hardcoded only in
// config.ts" guard) -- read the host out rather than repeating the literal.
const API_HOST = PROD_API_BASE.replace(/^https?:\/\//, "");

interface Section {
  id: string;
  title: string;
}

const SECTIONS: Section[] = [
  { id: "who", title: "1. Who We Are" },
  { id: "collect", title: "2. What We Collect and Why" },
  { id: "cookies", title: "3. Cookies and Local Storage" },
  { id: "subprocessors", title: "4. Subprocessors" },
  { id: "deletion", title: "5. Data Deletion" },
  { id: "gdpr", title: "6. Your Rights — GDPR" },
  { id: "ccpa", title: "7. Your Rights — CCPA/CPRA" },
  { id: "security", title: "8. Security" },
  { id: "children", title: "9. Children" },
  { id: "changes", title: "10. Changes to This Policy" },
  { id: "contact", title: "11. Contact" },
];

export function PrivacyPage() {
  const scrollTo = (id: string) => {
    const el = document.getElementById(`privacy-${id}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>

      {/* Header */}
      <div className="card" style={{ textAlign: "center", marginBottom: 24 }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 600, marginBottom: 8 }}>Privacy Policy</h1>
        <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>
          Last Man Up Inc. · Draft — pending attorney review, not yet effective
        </p>
        <p style={{ color: "var(--text-muted)", maxWidth: 560, margin: "12px auto 0" }}>
          This describes what Axis' Iliad collects, why, and your rights over it. It is
          published as a working draft ahead of formal legal review — the described
          behavior matches the current live system, but the document itself has not yet
          been reviewed by counsel.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 24, alignItems: "start" }}>

        {/* Table of contents */}
        <div className="card" style={{ position: "sticky", top: 16 }}>
          <p style={{ fontWeight: 600, marginBottom: 12, fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>
            Contents
          </p>
          <nav style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                className="btn"
                style={{ textAlign: "left", padding: "4px 8px", fontSize: "0.8rem", justifyContent: "flex-start" }}
                onClick={() => scrollTo(s.id)}
              >
                {s.title}
              </button>
            ))}
          </nav>
        </div>

        {/* Body */}
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

          {/* 1 */}
          <div className="card" id="privacy-who">
            <h2 style={{ marginBottom: 12, fontSize: "1rem", fontWeight: 600 }}>1. Who We Are</h2>
            <p style={{ color: "var(--text-muted)", lineHeight: 1.7 }}>
              Axis' Iliad ("Axis", "we", "us") is a hosted codebase-analysis and
              artifact-generation service, operated by Last Man Up Inc. The API is served
              at <code>{API_HOST}</code> and the web dashboard at{" "}
              <code>iliad.trustfabric.ai</code>. The service is also reachable as an MCP
              (Model Context Protocol) server at the <code>/mcp</code> endpoint.
            </p>
          </div>

          {/* 2 */}
          <div className="card" id="privacy-collect">
            <h2 style={{ marginBottom: 12, fontSize: "1rem", fontWeight: 600 }}>2. What We Collect and Why</h2>

            <h3 style={{ marginBottom: 8, marginTop: 16, fontSize: "1em", fontWeight: 700 }}>2.1 Source code you submit</h3>
            <p style={{ color: "var(--text-muted)", lineHeight: 1.7 }}>
              When you upload files or point Axis at a GitHub repository, the submitted
              file contents are stored as a <strong>snapshot</strong> in our PostgreSQL
              database (Neon, US). While you're logged in to the web dashboard, this lets
              you request additional analyses of the same snapshot without re-uploading.{" "}
              <strong>Logging out of the web dashboard discards that source content</strong> —
              we keep only file paths, sizes, and the analysis artifacts already generated
              for you, not the underlying code. This logout-triggered discard is specific to
              the web dashboard's login session; if you use the API, CLI, or MCP server
              directly, there's no login/logout session to trigger it, so that source content
              is retained until you delete it via{" "}
              <code>DELETE /v1/snapshots/:snapshot_id</code>,{" "}
              <code>DELETE /v1/projects/:project_id</code>, or the dashboard. We do not
              sell, license, or train machine-learning models on your source code.
            </p>

            <h3 style={{ marginBottom: 8, marginTop: 16, fontSize: "1em", fontWeight: 700 }}>2.2 Account information</h3>
            <p style={{ color: "var(--text-muted)", lineHeight: 1.7 }}>
              When you create an account we store your name, email address, billing tier,
              and account creation timestamp. We use your email to operate your account
              (key recovery, billing notices, transactional messages) — never for
              third-party advertising.
            </p>

            <h3 style={{ marginBottom: 8, marginTop: 16, fontSize: "1em", fontWeight: 700 }}>2.3 API keys and GitHub tokens</h3>
            <p style={{ color: "var(--text-muted)", lineHeight: 1.7 }}>
              API keys are shown to you once at creation; we store only a SHA-256 hash,
              never the raw key. Revoked keys are purged 90 days after revocation. A
              GitHub personal-access token you connect is encrypted at rest with
              AES-256-GCM and can be listed or deleted at any time.
            </p>

            <h3 style={{ marginBottom: 8, marginTop: 16, fontSize: "1em", fontWeight: 700 }}>2.4 Payment information</h3>
            <p style={{ color: "var(--text-muted)", lineHeight: 1.7 }}>
              Payments are handled by <strong>PAI'D Payments Intelligence</strong>, which
              settles transactions via Stripe, Inc. Card details are entered directly into
              Stripe-hosted surfaces and never touch Axis servers. Each purchase is a
              single one-time charge, not a recurring subscription — see the{" "}
              <a href="#terms" style={{ color: "var(--accent)" }}>Terms of Service</a> for
              the current billing model.
            </p>

            <h3 style={{ marginBottom: 8, marginTop: 16, fontSize: "1em", fontWeight: 700 }}>2.5 Usage counters and logs</h3>
            <p style={{ color: "var(--text-muted)", lineHeight: 1.7 }}>
              We record per-account usage (which program ran, when, credits consumed) for
              billing, abuse prevention, and rate limiting, using first-party counters
              only — no third-party analytics or advertising trackers. Standard service
              logs (request method/path, status, latency) are written to our hosting
              provider's log stream for debugging and security monitoring.
            </p>
          </div>

          {/* 3 */}
          <div className="card" id="privacy-cookies">
            <h2 style={{ marginBottom: 12, fontSize: "1rem", fontWeight: 600 }}>3. Cookies and Local Storage</h2>
            <p style={{ color: "var(--text-muted)", lineHeight: 1.7 }}>
              The Axis web dashboard does not use third-party advertising cookies. Your
              signed-in session is held in an <strong>HttpOnly session cookie</strong>,
              which JavaScript on the page cannot read. The dashboard additionally stores
              a non-sensitive session marker, your theme preference, and your most recent
              analysis result in your browser's <code>localStorage</code> — none of which
              is your actual credential. Logging out clears the session cookie and the
              stored marker, and also discards your uploaded source content (see 2.1).
            </p>
          </div>

          {/* 4 */}
          <div className="card" id="privacy-subprocessors">
            <h2 style={{ marginBottom: 12, fontSize: "1rem", fontWeight: 600 }}>4. Subprocessors</h2>
            <p style={{ color: "var(--text-muted)", lineHeight: 1.7, marginBottom: 12 }}>
              We share data with the following service providers, strictly to operate the
              service. We do not sell personal information to any party.
            </p>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                    <th style={{ textAlign: "left", padding: "6px 8px" }}>Subprocessor</th>
                    <th style={{ textAlign: "left", padding: "6px 8px" }}>Purpose</th>
                  </tr>
                </thead>
                <tbody style={{ color: "var(--text-muted)" }}>
                  <tr><td style={{ padding: "6px 8px" }}>Render (US)</td><td style={{ padding: "6px 8px" }}>Application hosting</td></tr>
                  <tr><td style={{ padding: "6px 8px" }}>Neon (US)</td><td style={{ padding: "6px 8px" }}>Managed PostgreSQL database — all persisted service data</td></tr>
                  <tr><td style={{ padding: "6px 8px" }}>Cloudflare</td><td style={{ padding: "6px 8px" }}>Web frontend hosting / CDN / object storage</td></tr>
                  <tr><td style={{ padding: "6px 8px" }}>GitHub</td><td style={{ padding: "6px 8px" }}>OAuth sign-in, repository fetching, webhooks</td></tr>
                  <tr><td style={{ padding: "6px 8px" }}>PAI'D Payments Intelligence</td><td style={{ padding: "6px 8px" }}>Payment orchestration</td></tr>
                  <tr><td style={{ padding: "6px 8px" }}>Stripe</td><td style={{ padding: "6px 8px" }}>Underlying payment processing (via PAI'D)</td></tr>
                  <tr><td style={{ padding: "6px 8px" }}>OpenAI</td><td style={{ padding: "6px 8px" }}>Embeddings proxy tool</td></tr>
                  <tr><td style={{ padding: "6px 8px" }}>Resend</td><td style={{ padding: "6px 8px" }}>Transactional email delivery</td></tr>
                  <tr><td style={{ padding: "6px 8px" }}>Firecrawl</td><td style={{ padding: "6px 8px" }}>Web research proxy tools</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* 5 */}
          <div className="card" id="privacy-deletion">
            <h2 style={{ marginBottom: 12, fontSize: "1rem", fontWeight: 600 }}>5. Data Deletion</h2>
            <ul style={{ color: "var(--text-muted)", lineHeight: 1.7, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 8 }}>
              <li>Snapshots / projects: self-serve, immediate, via the API or dashboard.</li>
              <li>Stored GitHub tokens and webhooks: self-serve, via the API or dashboard.</li>
              <li>
                Full account deletion: email{" "}
                <a href="mailto:support@jonathanarvay.com" style={{ color: "var(--accent)" }}>
                  support@jonathanarvay.com
                </a>{" "}
                from your account email address.
              </li>
            </ul>
          </div>

          {/* 6 */}
          <div className="card" id="privacy-gdpr">
            <h2 style={{ marginBottom: 12, fontSize: "1rem", fontWeight: 600 }}>6. Your Rights — GDPR (EEA/UK Users)</h2>
            <p style={{ color: "var(--text-muted)", lineHeight: 1.7 }}>
              If you are in the European Economic Area or the United Kingdom, you have the
              right to access, rectify, erase, restrict or object to processing, receive a
              portable copy of, or withdraw consent for your personal data, and to lodge a
              complaint with your local supervisory authority. Contact{" "}
              <a href="mailto:support@jonathanarvay.com" style={{ color: "var(--accent)" }}>
                support@jonathanarvay.com
              </a>{" "}
              to exercise any of these rights.
            </p>
          </div>

          {/* 7 */}
          <div className="card" id="privacy-ccpa">
            <h2 style={{ marginBottom: 12, fontSize: "1rem", fontWeight: 600 }}>7. Your Rights — CCPA/CPRA (California Users)</h2>
            <p style={{ color: "var(--text-muted)", lineHeight: 1.7 }}>
              California residents have the right to know, access, delete, and correct
              their personal information, without discrimination for exercising these
              rights. We do not sell personal information or share it for cross-context
              behavioral advertising. Contact{" "}
              <a href="mailto:support@jonathanarvay.com" style={{ color: "var(--accent)" }}>
                support@jonathanarvay.com
              </a>{" "}
              to exercise these rights.
            </p>
          </div>

          {/* 8 */}
          <div className="card" id="privacy-security">
            <h2 style={{ marginBottom: 12, fontSize: "1rem", fontWeight: 600 }}>8. Security</h2>
            <p style={{ color: "var(--text-muted)", lineHeight: 1.7 }}>
              API keys are stored only as SHA-256 hashes; GitHub personal-access tokens are
              encrypted at rest with AES-256-GCM; payment-card data is handled exclusively
              by Stripe; webhook payloads are verified with HMAC-SHA-256 signatures; all
              API and dashboard traffic uses TLS in transit. No system is perfectly secure
              — if we become aware of a breach affecting your personal data, we will
              notify you as required by applicable law.
            </p>
          </div>

          {/* 9 */}
          <div className="card" id="privacy-children">
            <h2 style={{ marginBottom: 12, fontSize: "1rem", fontWeight: 600 }}>9. Children</h2>
            <p style={{ color: "var(--text-muted)", lineHeight: 1.7 }}>
              The service is not directed at children under 16, and we do not knowingly
              collect personal information from them.
            </p>
          </div>

          {/* 10 */}
          <div className="card" id="privacy-changes">
            <h2 style={{ marginBottom: 12, fontSize: "1rem", fontWeight: 600 }}>10. Changes to This Policy</h2>
            <p style={{ color: "var(--text-muted)", lineHeight: 1.7 }}>
              We will post updates to this page and revise it accordingly. Material
              changes will be announced by email to account holders.
            </p>
          </div>

          {/* 11 */}
          <div className="card" id="privacy-contact">
            <h2 style={{ marginBottom: 12, fontSize: "1rem", fontWeight: 600 }}>11. Contact</h2>
            <p style={{ color: "var(--text-muted)", lineHeight: 1.7, marginBottom: 16 }}>
              Questions, rights requests, or complaints about this policy:
            </p>
            <div className="card" style={{ background: "var(--bg-tertiary)" }}>
              <p style={{ fontWeight: 600, marginBottom: 4 }}>Privacy & Data Requests</p>
              <a href="mailto:support@jonathanarvay.com" style={{ color: "var(--accent)" }}>
                support@jonathanarvay.com
              </a>
            </div>
            <p style={{ color: "var(--text-muted)", fontSize: "0.8rem", marginTop: 16 }}>
              Last Man Up Inc. · Full text: see PRIVACY_POLICY.md in the repository.
            </p>
          </div>

        </div>
      </div>
    </div>
  );
}
