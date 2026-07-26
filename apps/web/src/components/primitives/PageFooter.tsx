import { APP_VERSION } from "../../version.ts";
import type { PageId } from "../../routes.tsx";

// ─── PageFooter (WO-F4) ─────────────────────────────────────────────────────
// Rendered by the shell at the bottom of every page, above the fixed
// StatusBar: legal/Terms · Status · v<version> · Support · Help · Docs.

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
        <button type="button" className="footer-link" onClick={() => onNavigate("privacy")}>Privacy</button>
        <Sep />
        <button type="button" className="footer-link" onClick={() => onNavigate("status")}>Status</button>
        <Sep />
        <button type="button" className="footer-link" title="Web app version" onClick={() => onNavigate("changelog")}>
          v{APP_VERSION}
        </button>
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
