import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { axisSeo } from "./src/plugins/axis-seo/vitePlugin";
import { defineSeoConfig } from "./src/plugins/axis-seo/config";
import { seoRoutes, SITE_URL, SITE_NAME } from "./seo.routes.ts";

export default defineConfig({
  plugins: [
    react(),
    // Emits one crawlable HTML file per public route with its own title,
    // description, canonical, OG tags, and JSON-LD entity graph — plus
    // sitemap.xml and robots.txt. See apps/web/seo.routes.ts.
    axisSeo({
      // The current plugin API takes the entity graph via `config`, not loose
      // fields — the old {siteUrl, siteName, defaultImage} shape was written
      // against the sibling repo's stale dist/ and never built against src/.
      // No person/organization nodes: we do not fabricate entity data the
      // owner has not provided; the graph carries only what is real.
      config: defineSeoConfig({
        siteUrl: SITE_URL,
        siteName: SITE_NAME,
        defaultImage: "/og-image.png",
        // The canonical Person node. NOT invented here: the audit bin this build
        // runs (vendored verbatim from the owner's axis-seo package) hardcodes
        // "jonathanarvay.com/#person" as the attribution it requires on every
        // page — that IS the owner's recorded entity decision, and
        // jonathanarvay.com is their live domain (Iliad support runs on it).
        // Only checkable fields; jobTitle/description omitted rather than
        // guessed, per PersonConfig's own docblock.
        person: {
          id: "https://jonathanarvay.com/#person",
          name: "Jonathan Arvay",
          url: "https://jonathanarvay.com/",
        },
        // Routes tag themselves product:"iliad"; the schema builder requires the
        // entity to exist. Only verifiable fields — no fabricated org/person.
        products: [
          {
            key: "iliad",
            name: "Iliad",
            url: SITE_URL,
            description: "Turns a repository into deterministic, agent-ready context artifacts.",
          },
        ],
      }),
      routes: seoRoutes,
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      "/v1": "http://localhost:4000",
    },
  },
});
