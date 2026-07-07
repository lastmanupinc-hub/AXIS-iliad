import { APP_VERSION } from "../../version.ts";
import { API_BASE } from "../../api.ts";
import type { PageId } from "../../routes.tsx";

// ─── PageFooter (WO-F4) ─────────────────────────────────────────────────────
// Rendered by the shell at the bottom of every page, above the fixed
// StatusBar: legal/Terms · Status · v<version> · Support · Help · Docs.
// - "Status" points at the live API health endpoint for now; WO-P17 repoints
//   it to the #status page when that ships (no dead in-app link until then).
// - The version badge is plain text for now; WO-P16 links it to #changelog.

export interface PageFooterProps {
  onNavigate: (page: PageId) => void;
}

function Sep() {
  return <span className="footer-sep" aria-hidden> · </span>;
}

export function PageFooter({ onNavigate }: PageFooterProps) {
  return (
    <footer className="ide-footer">
      <p>
        <span>© {new Date().getFullYear()} Last Man Up Inc.</span>
        <Sep />
        <button type="button" className="footer-link" onClick={() => onNavigate("terms")}>Terms</button>
        <Sep />
        <a className="footer-link" href={`${API_BASE}/v1/health`} target="_blank" rel="noreferrer">Status</a>
        <Sep />
        <span title="Web app version">v{APP_VERSION}</span>
        <Sep />
        <a className="footer-link" href="mailto:support@jonathanarvay.com">Support</a>
        <Sep />
        <button type="button" className="footer-link" onClick={() => onNavigate("help")}>Help</button>
        <Sep />
        <button type="button" className="footer-link" onClick={() => onNavigate("docs")}>Docs</button>
      </p>
    </footer>
  );
}
