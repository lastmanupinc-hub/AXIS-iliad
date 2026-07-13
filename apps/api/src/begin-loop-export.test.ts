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

  it("body is exactly the repo-root begin.yaml — no duplicated/hand-typed copy to drift", () => {
    const onDisk = readFileSync(new URL("../../../begin.yaml", import.meta.url), "utf-8");
    expect(body).toBe(onDisk);
    expect(body).toContain("project_begin:");
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
    expect(body).toBe(onDisk);
  });
});
