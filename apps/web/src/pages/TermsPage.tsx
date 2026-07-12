// ─── Terms of Service ───────────────────────────────────────────

const EFFECTIVE_DATE = "April 11, 2026";

interface Section {
  id: string;
  title: string;
}

const SECTIONS: Section[] = [
  { id: "acceptance", title: "1. Acceptance of Terms" },
  { id: "service", title: "2. Description of Service" },
  { id: "accounts", title: "3. Accounts & Registration" },
  { id: "subscriptions", title: "4. Subscriptions & Billing" },
  { id: "data", title: "5. Data Handling & Privacy" },
  { id: "ip", title: "6. Intellectual Property" },
  { id: "acceptable-use", title: "7. Acceptable Use" },
  { id: "disclaimer", title: "8. Disclaimer of Warranties" },
  { id: "liability", title: "9. Limitation of Liability" },
  { id: "termination", title: "10. Termination" },
  { id: "changes", title: "11. Changes to These Terms" },
  { id: "governing-law", title: "12. Governing Law" },
  { id: "contact", title: "13. Contact" },
];

export function TermsPage() {
  const scrollTo = (id: string) => {
    const el = document.getElementById(`terms-${id}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>

      {/* Header */}
      <div className="card" style={{ textAlign: "center", marginBottom: 24 }}>
        <h2 style={{ fontSize: "1.5rem", marginBottom: 8 }}>Terms of Service</h2>
        <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>
          Last Man Up Inc. · Effective {EFFECTIVE_DATE}
        </p>
        <p style={{ color: "var(--text-muted)", maxWidth: 560, margin: "12px auto 0" }}>
          Please read these terms carefully before using Axis' Iliad. By creating an account or using
          the service you agree to be bound by them.
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
          <div className="card" id="terms-acceptance">
            <h3 style={{ marginBottom: 12 }}>1. Acceptance of Terms</h3>
            <p style={{ color: "var(--text-muted)", lineHeight: 1.7 }}>
              These Terms of Service ("Terms") govern your access to and use of Axis' Iliad (the
              "Service"), operated by Last Man Up Inc. ("we", "us", or "our"). By accessing or using
              the Service you agree to these Terms. If you do not agree, do not use the Service.
            </p>
            <p style={{ color: "var(--text-muted)", lineHeight: 1.7, marginTop: 12 }}>
              If you are using the Service on behalf of an organisation, you represent that you have
              authority to bind that organisation to these Terms.
            </p>
          </div>

          {/* 2 */}
          <div className="card" id="terms-service">
            <h3 style={{ marginBottom: 12 }}>2. Description of Service</h3>
            <p style={{ color: "var(--text-muted)", lineHeight: 1.7 }}>
              Axis' Iliad is a software analysis platform that accepts source-code repositories (via
              file upload, ZIP archive, GitHub URL, or API submission), performs automated analysis,
              and generates structured governance artifacts — including but not limited to context
              maps, skills files, debug playbooks, SEO rules, design tokens, brand guidelines, and AI
              agent instruction sets.
            </p>
            <p style={{ color: "var(--text-muted)", lineHeight: 1.7, marginTop: 12 }}>
              The Service is provided on a tiered subscription basis. Free-tier users receive access
              to a subset of programs. Paid tiers use a blended monthly credit model.
            </p>
          </div>

          {/* 3 */}
          <div className="card" id="terms-accounts">
            <h3 style={{ marginBottom: 12 }}>3. Accounts & Registration</h3>
            <ul style={{ color: "var(--text-muted)", lineHeight: 1.7, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 8 }}>
              <li>You must provide accurate name and email information when registering.</li>
              <li>
                You are responsible for maintaining the confidentiality of your API key. Treat it as
                you would a password. Do not share it publicly or embed it in client-side code.
              </li>
              <li>You are responsible for all activity carried out under your account.</li>
              <li>You must be at least 18 years old, or the age of majority in your jurisdiction, to
                create an account.</li>
              <li>We reserve the right to suspend or terminate accounts that violate these Terms.</li>
            </ul>
          </div>

          {/* 4 */}
          <div className="card" id="terms-subscriptions">
            <h3 style={{ marginBottom: 12 }}>4. Subscriptions & Billing</h3>

            <h4 style={{ marginBottom: 8, marginTop: 16 }}>4.1 Plans</h4>
            <p style={{ color: "var(--text-muted)", lineHeight: 1.7 }}>
              Axis' Iliad offers four tiers: Free ($0/month, 10,000 monthly credits), Starter
              ($29/month, 75,000 credits), Pro ($99/month, 300,000 credits), and Growth
              ($299/month, 1,200,000 credits). Annual billing may include a 20% discount.
              Plan features and entitlements are described on the Plans page and are subject to
              change with reasonable notice.
            </p>

            <h4 style={{ marginBottom: 8, marginTop: 16 }}>4.1.1 Overage</h4>
            <p style={{ color: "var(--text-muted)", lineHeight: 1.7 }}>
              Usage above included monthly credits is billed as overage at $0.0018 per credit. In
              supported autonomous payment flows, overages may be handled through x402-compatible
              payment negotiation.
            </p>

            <h4 style={{ marginBottom: 8, marginTop: 16 }}>4.1.2 Referral Rewards</h4>
            <p style={{ color: "var(--text-muted)", lineHeight: 1.7 }}>
              Referral rewards lower your effective dollars per call as successful referrals grow
              (up to 0.02% benefit per call). Referral reward state resets each billing cycle.
            </p>

            <h4 style={{ marginBottom: 8, marginTop: 16 }}>4.2 Payment Processing</h4>
            <p style={{ color: "var(--text-muted)", lineHeight: 1.7 }}>
              Payments are handled by <strong>PAI'D Payments Intelligence</strong>, which settles
              transactions via Stripe, Inc. We do not store your card details. By subscribing you
              also agree to{" "}
              <a href="https://stripe.com/legal/ssa" target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)" }}>
                Stripe's Services Agreement
              </a>. All amounts are in USD.
            </p>

            <h4 style={{ marginBottom: 8, marginTop: 16 }}>4.3 Auto-Renewal</h4>
            <p style={{ color: "var(--text-muted)", lineHeight: 1.7 }}>
              Paid subscriptions automatically renew at the end of each billing period. You authorise
              us to charge your payment method on file for each renewal period unless you cancel
              before the renewal date.
            </p>

            <h4 style={{ marginBottom: 8, marginTop: 16 }}>4.4 Cancellation</h4>
            <p style={{ color: "var(--text-muted)", lineHeight: 1.7 }}>
              You may cancel your subscription at any time from the Usage page. Cancellation takes
              effect at the end of the current billing period; you retain access to paid features
              until that date. We do not provide pro-rated refunds for partial billing periods unless
              required by applicable law.
            </p>

            <h4 style={{ marginBottom: 8, marginTop: 16 }}>4.5 Growth and Custom Terms</h4>
            <p style={{ color: "var(--text-muted)", lineHeight: 1.7 }}>
              Growth plan seat counts, service-level commitments, and any custom payment terms may be
              negotiated individually. Contact{" "}
              <a href="mailto:sales@lastmanup.com" style={{ color: "var(--accent)" }}>
                sales@lastmanup.com
              </a>{" "}
              for details.
            </p>

            <h4 style={{ marginBottom: 8, marginTop: 16 }}>4.6 Taxes</h4>
            <p style={{ color: "var(--text-muted)", lineHeight: 1.7 }}>
              Prices are exclusive of applicable taxes. Where required by law, applicable sales tax,
              VAT, or GST will be added at checkout and is your responsibility.
            </p>
          </div>

          {/* 5 */}
          <div className="card" id="terms-data">
            <h3 style={{ marginBottom: 12 }}>5. Data Handling & Privacy</h3>

            <h4 style={{ marginBottom: 8, marginTop: 16 }}>5.1 Source Code</h4>
            <p style={{ color: "var(--text-muted)", lineHeight: 1.7 }}>
              <strong>Your source code is never persistently stored.</strong> When you upload a
              repository or submit a GitHub URL, the files are processed in memory, analysis artifacts
              are generated, and the raw source is discarded immediately upon snapshot completion.
              We do not retain copies of your code on disk after analysis.
            </p>

            <h4 style={{ marginBottom: 8, marginTop: 16 }}>5.2 AI Training</h4>
            <p style={{ color: "var(--text-muted)", lineHeight: 1.7 }}>
              <strong>Your code is never used to train AI or machine-learning models</strong> — by us
              or any third party. Generated artifacts (context maps, governance files) are stored in
              your account only for the duration of your session or until you delete them.
            </p>

            <h4 style={{ marginBottom: 8, marginTop: 16 }}>5.3 Account Data</h4>
            <p style={{ color: "var(--text-muted)", lineHeight: 1.7 }}>
              We store your account name, email address, API key hash, usage metrics, subscription
              status, and generated artifact metadata. This data is used solely to operate the
              Service, enforce quotas, and communicate with you about your account.
            </p>

            <h4 style={{ marginBottom: 8, marginTop: 16 }}>5.4 Third-Party Services</h4>
            <p style={{ color: "var(--text-muted)", lineHeight: 1.7 }}>
              We use PAI'D Payments Intelligence for payment processing (which settles transactions
              via Stripe) and GitHub (via public tarball API) for repository fetching. Their
              respective privacy policies apply to data they process on our behalf.
            </p>

            <h4 style={{ marginBottom: 8, marginTop: 16 }}>5.5 Data Deletion</h4>
            <p style={{ color: "var(--text-muted)", lineHeight: 1.7 }}>
              You may request deletion of your account and all associated data by contacting{" "}
              <a href="mailto:support@jonathanarvay.com" style={{ color: "var(--accent)" }}>
                support@jonathanarvay.com
              </a>. We will fulfil deletion requests within 30 days.
            </p>
          </div>

          {/* 6 */}
          <div className="card" id="terms-ip">
            <h3 style={{ marginBottom: 12 }}>6. Intellectual Property</h3>

            <h4 style={{ marginBottom: 8, marginTop: 16 }}>6.1 Your Code</h4>
            <p style={{ color: "var(--text-muted)", lineHeight: 1.7 }}>
              You retain full ownership of all source code, repositories, and other content you
              submit. You grant us a limited, non-exclusive, royalty-free licence to process your
              content solely for the purpose of providing the Service to you.
            </p>

            <h4 style={{ marginBottom: 8, marginTop: 16 }}>6.2 Generated Artifacts</h4>
            <p style={{ color: "var(--text-muted)", lineHeight: 1.7 }}>
              Governance artifacts and output files generated by the Service from your code are
              owned by you. You may use, modify, copy, and distribute them without restriction.
            </p>

            <h4 style={{ marginBottom: 8, marginTop: 16 }}>6.3 Our Platform</h4>
            <p style={{ color: "var(--text-muted)", lineHeight: 1.7 }}>
              Axis' Iliad — including the software, algorithms, UI, branding, and documentation —
              is proprietary to Last Man Up Inc. and protected by copyright and other intellectual
              property laws. You may not copy, reverse-engineer, or create derivative works of the
              platform itself.
            </p>
          </div>

          {/* 7 */}
          <div className="card" id="terms-acceptable-use">
            <h3 style={{ marginBottom: 12 }}>7. Acceptable Use</h3>
            <p style={{ color: "var(--text-muted)", lineHeight: 1.7, marginBottom: 12 }}>
              You agree not to use the Service to:
            </p>
            <ul style={{ color: "var(--text-muted)", lineHeight: 1.7, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 8 }}>
              <li>Upload malicious code, malware, or content designed to harm other systems.</li>
              <li>Attempt to reverse-engineer, scrape, or extract the underlying analysis pipeline,
                model weights, or proprietary algorithms.</li>
              <li>Circumvent rate limits, quota enforcement, or authentication mechanisms.</li>
              <li>Use the Service for any unlawful purpose or in violation of applicable regulations.</li>
              <li>Resell, sublicence, or provide access to the Service to third parties outside the
                scope of your plan's seat entitlements.</li>
              <li>Submit code you do not own or are not authorised to analyse.</li>
              <li>Conduct denial-of-service attacks or attempt to degrade availability for other users.</li>
            </ul>
          </div>

          {/* 8 */}
          <div className="card" id="terms-disclaimer">
            <h3 style={{ marginBottom: 12 }}>8. Disclaimer of Warranties</h3>
            <p style={{ color: "var(--text-muted)", lineHeight: 1.7 }}>
              THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND,
              EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS
              FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE SERVICE
              WILL BE UNINTERRUPTED, ERROR-FREE, OR THAT GENERATED ARTIFACTS WILL BE COMPLETE,
              ACCURATE, OR SUITABLE FOR ANY SPECIFIC USE.
            </p>
            <p style={{ color: "var(--text-muted)", lineHeight: 1.7, marginTop: 12 }}>
              Generated governance files are provided as developer tooling aids. You are solely
              responsible for reviewing, validating, and deciding whether to use any generated
              artifact in your project.
            </p>
          </div>

          {/* 9 */}
          <div className="card" id="terms-liability">
            <h3 style={{ marginBottom: 12 }}>9. Limitation of Liability</h3>
            <p style={{ color: "var(--text-muted)", lineHeight: 1.7 }}>
              TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL LAST MAN UP INC.
              BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES,
              OR ANY LOSS OF PROFITS, REVENUE, DATA, GOODWILL, OR OTHER INTANGIBLE LOSSES, ARISING
              OUT OF OR IN CONNECTION WITH YOUR USE OF OR INABILITY TO USE THE SERVICE.
            </p>
            <p style={{ color: "var(--text-muted)", lineHeight: 1.7, marginTop: 12 }}>
              OUR TOTAL CUMULATIVE LIABILITY TO YOU FOR ANY CLAIMS ARISING OUT OF OR RELATED TO
              THESE TERMS OR THE SERVICE SHALL NOT EXCEED THE GREATER OF (A) THE AMOUNT YOU PAID
              US IN THE 12 MONTHS PRECEDING THE CLAIM, OR (B) USD $50.
            </p>
          </div>

          {/* 10 */}
          <div className="card" id="terms-termination">
            <h3 style={{ marginBottom: 12 }}>10. Termination</h3>
            <p style={{ color: "var(--text-muted)", lineHeight: 1.7 }}>
              You may terminate your account at any time by cancelling your subscription and
              contacting support to request account deletion.
            </p>
            <p style={{ color: "var(--text-muted)", lineHeight: 1.7, marginTop: 12 }}>
              We may suspend or terminate your access immediately and without notice if you breach
              these Terms, if we are required to do so by law, or if continuing to provide the
              Service becomes commercially impractical. Upon termination, your right to use the
              Service ceases and we may delete your account data in accordance with our data
              retention policy.
            </p>
          </div>

          {/* 11 */}
          <div className="card" id="terms-changes">
            <h3 style={{ marginBottom: 12 }}>11. Changes to These Terms</h3>
            <p style={{ color: "var(--text-muted)", lineHeight: 1.7 }}>
              We may update these Terms from time to time. If we make material changes we will
              notify you by email or by a prominent notice in the application at least 14 days before
              the changes take effect. Your continued use of the Service after the effective date
              constitutes acceptance of the revised Terms.
            </p>
          </div>

          {/* 12 */}
          <div className="card" id="terms-governing-law">
            <h3 style={{ marginBottom: 12 }}>12. Governing Law</h3>
            <p style={{ color: "var(--text-muted)", lineHeight: 1.7 }}>
              These Terms are governed by and construed in accordance with the laws applicable in
              the jurisdiction where Last Man Up Inc. is incorporated. Any disputes arising under
              these Terms shall be subject to the exclusive jurisdiction of the courts of that
              jurisdiction, unless otherwise required by applicable consumer protection law in your
              country of residence.
            </p>
          </div>

          {/* 13 */}
          <div className="card" id="terms-contact">
            <h3 style={{ marginBottom: 12 }}>13. Contact</h3>
            <p style={{ color: "var(--text-muted)", lineHeight: 1.7, marginBottom: 16 }}>
              If you have questions about these Terms, please contact us:
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div className="card" style={{ background: "var(--bg-tertiary)" }}>
                <p style={{ fontWeight: 600, marginBottom: 4 }}>General & Legal</p>
                <a href="mailto:support@jonathanarvay.com" style={{ color: "var(--accent)" }}>
                  support@jonathanarvay.com
                </a>
              </div>
              <div className="card" style={{ background: "var(--bg-tertiary)" }}>
                <p style={{ fontWeight: 600, marginBottom: 4 }}>Enterprise Sales</p>
                <a href="mailto:sales@lastmanup.com" style={{ color: "var(--accent)" }}>
                  sales@lastmanup.com
                </a>
              </div>
            </div>
            <p style={{ color: "var(--text-muted)", fontSize: "0.8rem", marginTop: 16 }}>
              Last Man Up Inc. · Effective {EFFECTIVE_DATE}
            </p>
          </div>

        </div>
      </div>
    </div>
  );
}
