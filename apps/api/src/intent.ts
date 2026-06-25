// Probe/intent telemetry — User-Agent classification + per-tool intent capture.
// Extracted from mcp-server.ts to break the handlers.ts <-> mcp-server.ts import cycle
// (handlers.ts needs classifyProbe/captureIntent; this module depends on neither).

export type ProbeClass = "quality-agent" | "registry-crawler" | "purchasing-agent" | "dev-tool" | "unknown";

const PROBE_PATTERNS: { pattern: RegExp; cls: ProbeClass }[] = [
  { pattern: /chiark|quality-index|qci-agent/i, cls: "quality-agent" },
  { pattern: /smithery|glama|mcp-registry|registry-crawler/i, cls: "registry-crawler" },
  { pattern: /aws|amazon|cloudfront/i, cls: "registry-crawler" },
  { pattern: /purchasing-agent|commerce-bot|402\.ad/i, cls: "purchasing-agent" },
  { pattern: /cursor|copilot|claude|windsurf|cline|continue|aider/i, cls: "dev-tool" },
];

export function classifyProbe(userAgent: string): ProbeClass {
  for (const { pattern, cls } of PROBE_PATTERNS) {
    if (pattern.test(userAgent)) return cls;
  }
  return "unknown";
}

// Finer-grained client attribution than ProbeClass: which tool/agent is calling.
const SOURCE_PATTERNS: { pattern: RegExp; source: string }[] = [
  { pattern: /claude|anthropic/i, source: "claude" },
  { pattern: /cursor/i, source: "cursor" },
  { pattern: /copilot/i, source: "copilot" },
  { pattern: /windsurf/i, source: "windsurf" },
  { pattern: /cline/i, source: "cline" },
  { pattern: /\bcontinue\b/i, source: "continue" },
  { pattern: /aider/i, source: "aider" },
  { pattern: /chatgpt|openai|gpt-/i, source: "openai" },
  { pattern: /smithery/i, source: "smithery" },
  { pattern: /glama/i, source: "glama" },
  { pattern: /node-fetch|undici|axios|python-requests|curl|httpx|go-http/i, source: "script" },
];

/** Map a User-Agent to a canonical client source (claude, cursor, …) for telemetry. */
export function detectMcpSource(userAgent: string): string {
  if (!userAgent) return "unknown";
  for (const { pattern, source } of SOURCE_PATTERNS) {
    if (pattern.test(userAgent)) return source;
  }
  return "other";
}

interface IntentCapture {
  tool: string;
  intent: string | null;
  probe_class: ProbeClass;
  user_agent: string;
  timestamp: string;
}

const _intentLog: IntentCapture[] = [];
const MAX_INTENT_LOG = 500;

export function captureIntent(tool: string, intent: string | null, userAgent: string): void {
  const entry: IntentCapture = {
    tool,
    intent,
    probe_class: classifyProbe(userAgent),
    user_agent: userAgent,
    timestamp: new Date().toISOString(),
  };
  _intentLog.push(entry);
  if (_intentLog.length > MAX_INTENT_LOG) _intentLog.shift();
}

export function getIntentLog(): IntentCapture[] {
  return [..._intentLog];
}
