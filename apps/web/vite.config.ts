import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { axisSeo } from "@axis/seo";
import { seoRoutes, SITE_URL, SITE_NAME } from "./seo.routes.ts";

export default defineConfig({
  plugins: [
    react(),
    // Emits one crawlable HTML file per public route with its own title,
    // description, canonical, OG tags, and JSON-LD entity graph — plus
    // sitemap.xml and robots.txt. See apps/web/seo.routes.ts.
    axisSeo({
      siteUrl: SITE_URL,
      siteName: SITE_NAME,
      routes: seoRoutes,
      defaultImage: "/og-image.png",
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      "/v1": "http://localhost:4000",
    },
  },
});
