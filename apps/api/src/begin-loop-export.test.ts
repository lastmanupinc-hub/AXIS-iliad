/**
 * H4.4 — GET /begin.yaml, GET /continuation.yaml: serve AXIS's own root-level
 * begin-loop files verbatim, so an agent crawling this API discovers the same
 * self-driving loop AXIS generates for every analysis. Public, no auth.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server } from "node:http";
import { readFileSync } from "node:fs";
import { Router } from "./router.js";
import { handleBeginYaml, handleContinuationYaml } from "./handlers.js";

async function req(
  path: string,
): Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: string }> {
  return new Promise((resolve, reject) => {
    const r = require("node:http").request(
      { hostname: "127.0.0.1", port: TEST_PORT, path, method: "GET" },
      (res: import("node:http").IncomingMessage) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers as Record<string, string | string[] | undefined>,
            body: Buffer.concat(chunks).toString("utf-8"),
          });
        });
      },
    );
    r.on("error", reject);
    r.end();
  });
}

let server: Server;
let TEST_PORT: number;

beforeAll(async () => {
  const router = new Router();
  router.get("/begin.yaml", handleBeginYaml);
  router.get("/continuation.yaml", handleContinuationYaml);
  server = createServer((r, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    router.handle(r, res);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no address");
  TEST_PORT = addr.port;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
});

describe("GET /begin.yaml", () => {
  let status: number;
  let headers: Record<string, string | string[] | undefined>;
  let body: string;

  beforeAll(async () => {
    const r = await req("/begin.yaml");
    status = r.status;
    headers = r.headers;
    body = r.body;
  });

  it("returns 200", () => {
    expect(status).toBe(200);
  });

  it("returns application/yaml content-type", () => {
    expect(String(headers["content-type"])).toContain("application/yaml");
  });

  it("body matches the repo-root begin.yaml outside the redacted block", () => {
    const onDisk = readFileSync(new URL("../../../begin.yaml", import.meta.url), "utf-8");
    expect(body).toContain("project_begin:");
    // Content before the ticket system (required_read_order etc.) is untouched.
    expect(body.slice(0, 200)).toBe(onDisk.slice(0, 200));
    // Content after the ticket block (optimization_policy onward) is untouched.
    const tail = onDisk.slice(onDisk.indexOf("\n  optimization_policy:"));
    expect(body).toContain(tail);
  });

  it("2026-09-02: redacts inter_repo_ticket_system before serving over HTTP", () => {
    const onDisk = readFileSync(new URL("../../../begin.yaml", import.meta.url), "utf-8");
    // The on-disk file, on this branch, genuinely carries a sibling repo's
    // internal engineering detail inside a ticket's provider_reply -- prove
    // the served copy is shorter (something was actually stripped) and that
    // the specific leaky markers are gone, not just that a stub was appended.
    expect(body.length).toBeLessThan(onDisk.length);
    expect(onDisk).toContain("provider_reply:"); // sanity: the thing we're redacting really exists on disk
    expect(body).not.toContain("provider_reply:");
    expect(onDisk).toContain("_tiered_generate_price"); // sanity: Foundry's internal pricing fn really is on disk
    expect(body).not.toContain("_tiered_generate_price");
    // The key itself and a visible reason survive -- this is a redaction, not
    // a silent truncation an agent could mistake for the whole file.
    expect(body).toContain("inter_repo_ticket_system:");
    expect(body).toContain("[redacted for public HTTP serving");
  });
});

describe("GET /continuation.yaml", () => {
  let status: number;
  let headers: Record<string, string | string[] | undefined>;
  let body: string;

  beforeAll(async () => {
    const r = await req("/continuation.yaml");
    status = r.status;
    headers = r.headers;
    body = r.body;
  });

  it("returns 200", () => {
    expect(status).toBe(200);
  });

  it("returns application/yaml content-type", () => {
    expect(String(headers["content-type"])).toContain("application/yaml");
  });

  it("body is exactly the repo-root continuation.yaml — no duplicated/hand-typed copy to drift", () => {
    const onDisk = readFileSync(new URL("../../../continuation.yaml", import.meta.url), "utf-8");
    // continuation.yaml carries no inter_repo_ticket_system marker (it's the
    // terminal, historical queue -- see begin.yaml's own supersedes note), so
    // this also proves redactInterRepoTicketSystem's marker-absent path is a
    // true no-op rather than accidentally mangling an unrelated file.
    expect(body).toBe(onDisk);
  });
});
