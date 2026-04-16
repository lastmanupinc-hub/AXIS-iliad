import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getDb } from "@axis/snapshots";
import type { IncomingMessage, ServerResponse } from "node:http";
import { sendJSON, sendError } from "./router.js";
import { ErrorCode } from "./logger.js";
import type { Account } from "@axis/snapshots";

// JWT configuration - read from .pem files in project root, with fallback for tests
let JWT_PRIVATE_KEY: string;
let JWT_PUBLIC_KEY: string;
const JWT_ALGORITHM = "RS256";

try {
  JWT_PRIVATE_KEY = fs.readFileSync(path.join(process.cwd(), "..", "..", "private-key.pem"), "utf8");
  JWT_PUBLIC_KEY = fs.readFileSync(path.join(process.cwd(), "..", "..", "public-key.pem"), "utf8");
} catch (error) {
  // Fallback for test environments - generate temporary keys
  if (process.env.NODE_ENV === "test") {
    const { privateKey, publicKey } = require("crypto").generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    JWT_PRIVATE_KEY = privateKey;
    JWT_PUBLIC_KEY = publicKey;
  } else {
    throw error;
  }
}

// Simple OAuth server implementation

/** GET /oauth/authorize — Authorization endpoint */
export async function handleOAuthAuthorize(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  const clientId = url.searchParams.get("client_id");
  const redirectUri = url.searchParams.get("redirect_uri");
  const scope = url.searchParams.get("scope") ?? "mcp:read";
  const responseType = url.searchParams.get("response_type");
  const state = url.searchParams.get("state");

  if (!clientId || !redirectUri || responseType !== "code") {
    sendError(res, 400, ErrorCode.INVALID_FORMAT, "Invalid authorization request");
    return;
  }

  // In a real implementation, show authorization UI
  // For now, auto-approve for demo
  const code = generateAuthCode();
  const redirectUrl = new URL(redirectUri);
  redirectUrl.searchParams.set("code", code);
  if (state) redirectUrl.searchParams.set("state", state);

  res.writeHead(302, { Location: redirectUrl.toString() });
  res.end();
}

/** POST /oauth/token — Token endpoint */
export async function handleOAuthToken(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readFormBody(req);
  const grantType = body.grant_type;
  const code = body.code;
  const clientId = body.client_id;
  const clientSecret = body.client_secret;

  if (grantType !== "authorization_code" || !code || !clientId || !clientSecret) {
    sendError(res, 400, ErrorCode.INVALID_FORMAT, "Invalid token request");
    return;
  }

  // Verify client
  const db = getDb();
  const client = db.prepare("SELECT * FROM oauth_clients WHERE id = ? AND secret = ?").get(clientId, clientSecret) as any;
  if (!client) {
    sendError(res, 401, ErrorCode.AUTH_REQUIRED, "Invalid client");
    return;
  }

  // In a real implementation, verify code
  // For demo, issue token
  const token = jwt.sign(
    {
      sub: "test-user",
      client_id: clientId,
      scope: "mcp:read",
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    },
    JWT_PRIVATE_KEY,
    { algorithm: JWT_ALGORITHM }
  );

  sendJSON(res, 200, {
    access_token: token,
    token_type: "Bearer",
    expires_in: 3600,
    scope: "mcp:read",
  });
}

/** GET /oauth/jwks — JWKS endpoint */
export async function handleOAuthJwks(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  const jwks = getJWKS();
  sendJSON(res, 200, jwks);
}

/** POST /oauth/introspect — Token introspection endpoint */
export async function handleOAuthIntrospect(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readBody(req);
  const token = body.token;

  if (!token) {
    sendError(res, 400, ErrorCode.MISSING_FIELD, "Missing token");
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_PUBLIC_KEY, { algorithms: [JWT_ALGORITHM] }) as jwt.JwtPayload;
    sendJSON(res, 200, {
      active: true,
      sub: decoded.sub,
      client_id: decoded.client_id,
      scope: decoded.scope,
      exp: decoded.exp,
      iat: decoded.iat,
    });
  } catch (err) {
    sendJSON(res, 200, { active: false });
  }
}

// Utility functions

function generateAuthCode(): string {
  return crypto.randomUUID();
}

function getJWKS() {
  // Extract modulus from the public key PEM
  const publicKey = crypto.createPublicKey(JWT_PUBLIC_KEY);
  const keyObject = publicKey.export({ type: 'pkcs1', format: 'der' });
  const modulus = keyObject.subarray(9, 9 + 256); // Skip DER header and extract modulus (2048-bit = 256 bytes)
  const modulusBase64 = modulus.toString('base64url');

  return {
    keys: [
      {
        kty: "RSA",
        use: "sig",
        alg: JWT_ALGORITHM,
        n: modulusBase64,
        e: "AQAB",
        kid: "oauth-key-1",
      },
    ],
  };
}

function readBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", () => {
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

function readFormBody(req: IncomingMessage): Promise<Record<string, string>> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", () => {
      try {
        const params = new URLSearchParams(body);
        const result: Record<string, string> = {};
        for (const [key, value] of params) {
          result[key] = value;
        }
        resolve(result);
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

// Middleware to check Bearer token
export async function requireBearerToken(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    sendError(res, 401, ErrorCode.AUTH_REQUIRED, "Missing or invalid Bearer token");
    return false;
  }

  const token = authHeader.substring(7);

  try {
    jwt.verify(token, JWT_PUBLIC_KEY, { algorithms: [JWT_ALGORITHM] });
    return true;
  } catch (err) {
    sendError(res, 401, ErrorCode.AUTH_REQUIRED, "Invalid token");
    return false;
  }
}

// Utility function for creating OAuth clients
export function createOAuthClient(name: string, redirectUris: string[], scopes: string[] = ["mcp:read"]) {
  const db = getDb();
  const id = crypto.randomUUID();
  const secret = crypto.randomUUID(); // In production, use secure random

  db.prepare(`
    INSERT INTO oauth_clients (id, name, secret, redirect_uris, scopes, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    name,
    secret,
    JSON.stringify(redirectUris),
    JSON.stringify(scopes),
    new Date().toISOString(),
    new Date().toISOString()
  );

  return { id, secret };
}