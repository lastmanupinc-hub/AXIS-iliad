import type { Answer } from "../answers.ts";

// ─── AnswerPage (2026-11-04, the estate's foundation check F09) ─────────────
// One question per page, answered in the first paragraph under the H1 (what a crawler or an AI search engine quotes),
// then the detail, then the sources. The order is the contract: nothing may sit between the H1 and the answer. The
// content lives in answers.ts; this only lays it out. Prerendered, so the answer is in the page's own HTML.

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function longDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

const isOutbound = (href: string) => /^https?:\/\//.test(href);

export function AnswerPage({ answer }: { answer: Answer }) {
  return (
    <article className="answer-page" style={{ maxWidth: 760, margin: "0 auto", lineHeight: 1.7 }}>
      <h1 style={{ fontSize: "1.6rem", fontWeight: 650, marginBottom: 12, lineHeight: 1.3 }}>{answer.question}</h1>
      <p className="answer-lead" style={{ fontSize: "1.05rem", marginBottom: 8 }}>{answer.answer}</p>
      <p style={{ color: "var(--text-muted)", fontSize: "0.8125rem", marginBottom: 28 }}>
        Updated <time dateTime={answer.updated}>{longDate(answer.updated)}</time>
      </p>

      {answer.sections.map((s) => (
        <section key={s.heading} style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: "1.1rem", fontWeight: 600, marginBottom: 8 }}>{s.heading}</h2>
          {s.steps && (
            <ol style={{ paddingLeft: 22, marginBottom: 10 }}>
              {s.steps.map((t) => <li key={t}>{t}</li>)}
            </ol>
          )}
          {s.paragraphs?.map((t) => <p key={t} style={{ marginBottom: 10 }}>{t}</p>)}
          {s.bullets && (
            <ul style={{ paddingLeft: 22, marginBottom: 10 }}>
              {s.bullets.map((t) => <li key={t}>{t}</li>)}
            </ul>
          )}
          {s.code?.map((c) => (
            <figure key={c.label} style={{ margin: "0 0 12px" }}>
              <figcaption style={{ color: "var(--text-muted)", fontSize: "0.8125rem", marginBottom: 4 }}>{c.label}</figcaption>
              <pre style={{ overflowX: "auto", padding: 12, borderRadius: "var(--radius)", background: "var(--bg-tertiary)", fontSize: "0.8125rem" }}>
                <code>{c.text}</code>
              </pre>
            </figure>
          ))}
        </section>
      ))}

      <section id="sources" style={{ borderTop: "1px solid var(--border)", paddingTop: 16 }}>
        <h2 style={{ fontSize: "1.1rem", fontWeight: 600, marginBottom: 8 }}>Sources</h2>
        <ul style={{ paddingLeft: 22 }}>
          {answer.sources.map((s) => (
            <li key={s.href}>
              <a href={s.href} style={{ color: "var(--accent)" }} {...(isOutbound(s.href) ? { rel: "noopener" } : {})}>{s.label}</a>
            </li>
          ))}
        </ul>
      </section>
    </article>
  );
}
