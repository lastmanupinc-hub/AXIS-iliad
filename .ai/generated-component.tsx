/**
 * axis-iliad — App shell.
 *
 * Top-level React component for the generated app. Mounted by index.html
 * and paired with /theme.css. Wraps content in an error boundary so a
 * failure in any section does not blank the whole UI.
 *
 * The data tables (routes / models / entry points) are extracted from the
 * snapshot at generation time. Edit freely once the project is bootstrapped.
 */
import { Component, type ReactNode } from "react";

type Route = { method: string; path: string; source: string };
type Model = { name: string; kind: string; fields: number; source: string };
type Entry = { path: string; type: string };

const ROUTES: Route[] = [
  {
    "method": "GET",
    "path": "/v1/health",
    "source": "apps/api/src/admin.test.ts"
  },
  {
    "method": "POST",
    "path": "/v1/accounts",
    "source": "apps/api/src/admin.test.ts"
  },
  {
    "method": "POST",
    "path": "/v1/snapshots",
    "source": "apps/api/src/admin.test.ts"
  },
  {
    "method": "GET",
    "path": "/v1/admin/stats",
    "source": "apps/api/src/admin.test.ts"
  },
  {
    "method": "GET",
    "path": "/v1/admin/accounts",
    "source": "apps/api/src/admin.test.ts"
  },
  {
    "method": "GET",
    "path": "/v1/admin/activity",
    "source": "apps/api/src/admin.test.ts"
  },
  {
    "method": "GET",
    "path": "/llms.txt",
    "source": "apps/api/src/agent-discovery.test.ts"
  },
  {
    "method": "GET",
    "path": "/.well-known/skills/index.json",
    "source": "apps/api/src/agent-discovery.test.ts"
  },
  {
    "method": "GET",
    "path": "/v1/docs.md",
    "source": "apps/api/src/agent-discovery.test.ts"
  },
  {
    "method": "GET",
    "path": "/.well-known/axis.json",
    "source": "apps/api/src/agent-discovery.test.ts"
  },
  {
    "method": "GET",
    "path": "/for-agents",
    "source": "apps/api/src/agent-discovery.test.ts"
  },
  {
    "method": "GET",
    "path": "/v1/install",
    "source": "apps/api/src/agent-discovery.test.ts"
  }
];
const MODELS: Model[] = [
  {
    "name": "AuthContext",
    "kind": "interface",
    "fields": 3,
    "source": "apps/api/src/billing.ts"
  },
  {
    "name": "EnvSpec",
    "kind": "interface",
    "fields": 5,
    "source": "apps/api/src/env.ts"
  },
  {
    "name": "ValidationError",
    "kind": "interface",
    "fields": 2,
    "source": "apps/api/src/env.ts"
  },
  {
    "name": "ValidationResult",
    "kind": "interface",
    "fields": 3,
    "source": "apps/api/src/env.ts"
  },
  {
    "name": "ZipEntry",
    "kind": "interface",
    "fields": 4,
    "source": "apps/api/src/export.ts"
  },
  {
    "name": "PullRequestPayload",
    "kind": "interface",
    "fields": 5,
    "source": "apps/api/src/github-webhook.ts"
  },
  {
    "name": "PushPayload",
    "kind": "interface",
    "fields": 7,
    "source": "apps/api/src/github-webhook.ts"
  },
  {
    "name": "SnapshotTarget",
    "kind": "interface",
    "fields": 5,
    "source": "apps/api/src/github-webhook.ts"
  }
];
const ENTRY_POINTS: Entry[] = [];

// ─── ErrorBoundary ─────────────────────────────────────────────
// React requires a class for getDerivedStateFromError. This thin
// wrapper is the only class in the file; everything else is a
// function component.
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) { console.error("AxisIliad crash:", error); }
  render() {
    if (this.state.error) {
      return (
        <div role="alert" className="axis-iliad-error">
          <h2>Something went wrong</h2>
          <pre>{this.state.error.message}</pre>
          <button onClick={() => this.setState({ error: null })}>Reset</button>
        </div>
      );
    }
    return this.props.children;
  }
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="axis-iliad-section">
      <h2 className="axis-iliad-section-title">{title}</h2>
      {children}
    </section>
  );
}

function Routes() {
  if (ROUTES.length === 0) return <p className="axis-iliad-empty">No HTTP routes detected.</p>;
  return (
    <table className="axis-iliad-table">
      <thead><tr><th>Method</th><th>Path</th><th>Source</th></tr></thead>
      <tbody>
        {ROUTES.map((r) => (
          <tr key={r.method + " " + r.path}>
            <td><code>{r.method}</code></td>
            <td><code>{r.path}</code></td>
            <td><code>{r.source}</code></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Models() {
  if (MODELS.length === 0) return <p className="axis-iliad-empty">No domain models detected.</p>;
  return (
    <ul className="axis-iliad-list">
      {MODELS.map((m) => (
        <li key={m.name}>
          <strong>{m.name}</strong> <span className="axis-iliad-meta">({m.kind}, {m.fields} fields)</span> <code>{m.source}</code>
        </li>
      ))}
    </ul>
  );
}

function EntryPoints() {
  if (ENTRY_POINTS.length === 0) return <p className="axis-iliad-empty">No entry points detected.</p>;
  return (
    <ul className="axis-iliad-list">
      {ENTRY_POINTS.map((e) => (
        <li key={e.path}><code>{e.path}</code> <span className="axis-iliad-meta">— {e.type}</span></li>
      ))}
    </ul>
  );
}

export function AxisIliad() {
  return (
    <ErrorBoundary>
      <main className="axis-iliad-app">
        <header className="axis-iliad-header">
          <h1 className="axis-iliad-title">AxisIliad</h1>
          <p className="axis-iliad-tagline">Generated by Axis Artifacts.</p>
        </header>
        <Section title="Routes">
          <Routes />
        </Section>
        <Section title="Domain Models">
          <Models />
        </Section>
        <Section title="Entry Points">
          <EntryPoints />
        </Section>
      </main>
    </ErrorBoundary>
  );
}

export default AxisIliad;
