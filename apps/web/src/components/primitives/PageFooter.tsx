import { APP_VERSION } from "../../version.ts";
import { hrefForPage, type PageId } from "../../routes.tsx";
import { followIn } from "../../linkClick.ts";

// ─── PageFooter (WO-F4) ─────────────────────────────────────────────────────
// Rendered by the shell at the bottom of every page, above the fixed
// StatusBar: legal/Terms · Status · v<version> · Contact · Support · Help · Docs.
// Links with real addresses since 2026-10-26 (AXIS Launch taskgate T151): the footer was buttons, so a crawler found
// no footer menu and no way to reach a person.

export interface PageFooterProps {
  onNavigate: (page: PageId) => void;
}

function Sep() {
  return <span className="footer-sep" aria-hidden> · </span>;
}

export function PageFooter({ onNavigate }: PageFooterProps) {
  const link = (page: PageId, label: string, title?: string) => (
    <a className="footer-link" href={hrefForPage(page)} data-route={page} title={title} onClick={followIn(() => onNavigate(page))}>{label}</a>
  );
  return (
    <footer className="ide-footer">
      <p>
        <span>© {new Date().getFullYear()} Last Man Up Inc.</span>
        <Sep />
        {link("terms", "Terms")}
        <Sep />
        {link("privacy", "Privacy")}
        <Sep />
        {link("status", "Status")}
        <Sep />
        {link("changelog", `v${APP_VERSION}`, "Web app version")}
        <Sep />
        {link("feedback", "Contact")}
        <Sep />
        <a className="footer-link" href="mailto:support@jonathanarvay.com">Support</a>
        <Sep />
        {link("help", "Help")}
        <Sep />
        {link("docs", "Docs")}
        <Sep />
        <a className="footer-link trust-mark" href="https://glama.ai/mcp/servers/lastmanupinc-hub/AXIS-iliad">Listed on Glama</a>
        <Sep />
        <a className="footer-link" href="https://jonathanarvay.com/?utm_source=iliad&utm_medium=site_credit">Site by Jonathan Arvay</a>
      </p>
    </footer>
  );
}
