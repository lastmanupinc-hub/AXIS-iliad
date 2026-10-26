// ProgramPage — one program, its own page (2026-10-26, AXIS Launch taskgate T151). Everything on it comes from
// programs.ts: the name, the tagline, the tier, the files one run writes (held to the manifest by count-honesty), and
// what people search for when they need it. Prerendered at /programs/<id>/ for every program.
import { PROGRAMS } from "../programs.ts";
import { followIn } from "../linkClick.ts";

interface Props {
  id: string;
  onAnalyze: () => void;
  onBack: () => void;
}

export function ProgramPage({ id, onAnalyze, onBack }: Props) {
  const program = PROGRAMS.find((p) => p.id === id);
  if (!program) {
    return (
      <div className="card" style={{ maxWidth: 720 }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 600, marginBottom: 8 }}>No program called “{id}”</h1>
        <p><a href="/programs/" onClick={followIn(onBack)}>See every program</a></p>
      </div>
    );
  }
  const free = program.tier === "free";
  return (
    <article className="card" style={{ maxWidth: 760 }}>
      <p className="text-sm mb-2"><a href="/programs/" data-route="programs" onClick={followIn(onBack)}>← All programs</a></p>
      <h1 style={{ fontSize: "1.6rem", fontWeight: 600, marginBottom: 8 }}>{program.name}</h1>
      <p className="text-muted mb-3">{program.tagline}</p>
      <p className="mb-4"><span className={`badge ${free ? "badge-success" : "badge-accent"}`}>{free ? "FREE" : "PRO"}</span></p>
      <h2 className="mb-2" style={{ fontSize: "1rem", fontWeight: 600 }}>What one run writes</h2>
      <ul className="mb-4">
        {program.outputs.map((o) => <li key={o}><code className="mono">{o}</code></li>)}
      </ul>
      <h2 className="mb-2" style={{ fontSize: "1rem", fontWeight: 600 }}>What it is for</h2>
      <ul className="mb-4">
        {program.keywords.map((k) => <li key={k}>{k}</li>)}
      </ul>
      <button type="button" className="btn btn-primary" onClick={onAnalyze}>{program.cta}</button>
    </article>
  );
}
