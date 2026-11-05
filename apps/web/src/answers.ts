// Answer pages (2026-11-04, the estate's startup foundation check F09): three questions the owner declared for Axis'
// Iliad (D:/Estate Presence/data/foundation.json, brands.axis-iliad.answer_pages), each answered in 40-60 words
// directly under the page's H1, dated, with its sources. Read by routes.tsx (the page) and seo.routes.ts (head,
// JSON-LD, sitemap), without React.
//
// Every fact here is the code's, not copy's: the counts come from config.ts (held to the generator manifest by
// apps/api/src/count-honesty.test.ts), and every price, credit figure and limit in PRICING is held equal to the pricing
// code by apps/api/src/answer-pages.test.ts (@axis/mpp PRICING_TIERS, @axis/snapshots MARKETED_TIERS, TIER_LIMITS,
// PERSISTENCE_CREDIT_PACKS). Change a price there and that test names the sentence here to rewrite.
//
// Each page is served without a trailing slash (`flat`): Cloudflare Pages answers /what-is-iliad from
// what-is-iliad.html with a 200, where a folder's index.html would be a 308 to /what-is-iliad/.

import { ARTIFACT_COUNT, FREE_FILE_COUNT, FREE_PROGRAM_NAMES, PROD_API_BASE, PROGRAM_COUNT } from "./config.ts";
import { PROGRAMS } from "./programs.ts";

export interface AnswerSection {
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
  /** Numbered steps, in order. */
  steps?: string[];
  code?: { label: string; text: string }[];
}

export interface AnswerSource {
  label: string;
  href: string;
}

export interface Answer {
  page: "what-is-iliad" | "what-does-iliad-cost" | "how-to-connect-iliad-mcp";
  path: string;
  question: string;
  /** 40-60 words, the first paragraph under the H1; also the FAQ answer in the page's JSON-LD, verbatim. */
  answer: string;
  /** ISO date the facts were last checked against the code and the cited pages. */
  updated: string;
  title: string;
  description: string;
  sections: AnswerSection[];
  sources: AnswerSource[];
}

/** The words the estate's check counts (D:/Estate Presence/scripts/foundation.py answer_page_verdict). */
export function answerWords(text: string): number {
  return (text.match(/[\w'’-]+/g) ?? []).length;
}

/** Prices and limits as the pricing code sets them today (held equal to it by apps/api/src/answer-pages.test.ts). */
export const PRICING = {
  analyzeStandardCents: 300,
  analyzeEngineerCents: 2500,
  usdPerCredit: 0.0018,
  standardCredits: 1667,
  engineerCredits: 13889,
  plans: [
    { id: "free", name: "Free", monthlyCents: 0, credits: 10_000 },
    { id: "starter", name: "Starter", monthlyCents: 2900, credits: 75_000 },
    { id: "pro", name: "Pro", monthlyCents: 9900, credits: 300_000 },
    { id: "growth", name: "Growth", monthlyCents: 29900, credits: 1_200_000 },
  ],
  annualDiscountPercent: 20,
  freeSnapshotsPerMonth: 10,
  freeProjects: 1,
  paidSnapshotsPerMonth: 200,
  packs: [
    { credits: 100, priceCents: 500 },
    { credits: 500, priceCents: 2000 },
    { credits: 2000, priceCents: 6000 },
  ],
} as const;

const usd = (cents: number) => (cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`);
const usd2 = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const n = (x: number) => x.toLocaleString("en-US");
const plan = (id: string) => PRICING.plans.find((p) => p.id === id)!;
const annual = (monthlyCents: number) => Math.round(monthlyCents * 12 * (1 - PRICING.annualDiscountPercent / 100));

const MCP_URL = `${PROD_API_BASE}/mcp`;
const UPDATED = "2026-11-04";

const freeNames = FREE_PROGRAM_NAMES.map((p) => PROGRAMS.find((d) => d.id === p)?.name ?? p);

export const ANSWERS: Answer[] = [
  {
    page: "what-is-iliad",
    path: "/what-is-iliad",
    question: "What is Axis' Iliad and what does it produce from a repository?",
    answer:
      `Axis' Iliad reads a code repository, from a GitHub address or an upload, and writes the files AI coding tools ` +
      `read: AGENTS.md, CLAUDE.md, .cursorrules, MCP configs, debug playbooks and more, ${ARTIFACT_COUNT} files across ` +
      `${PROGRAM_COUNT} programs. A standard run is deterministic: the same repository gives the same files every time. ` +
      `${FREE_FILE_COUNT} of the files are free.`,
    updated: UPDATED,
    title: "What is Axis' Iliad? Repository in, agent files out",
    description:
      `Iliad reads a repository and writes AGENTS.md, CLAUDE.md, .cursorrules, MCP configs and more: ` +
      `${ARTIFACT_COUNT} files across ${PROGRAM_COUNT} programs, ${FREE_FILE_COUNT} of them free.`,
    sections: [
      {
        heading: "How a run works",
        steps: [
          "Paste a GitHub repository's address on the Analyze page, or upload the files.",
          "Iliad reads the files and builds a map of the project: its languages, frameworks, structure and dependencies.",
          "Each program turns that map into files: instructions for coding agents, MCP configs, debug and test playbooks, SEO and brand rules, and more.",
          "Read the files in the browser or download them as one zip. Agents can run the same analysis themselves through the MCP server or the REST API.",
        ],
      },
      {
        heading: "What comes out, program by program",
        paragraphs: [
          `${PROGRAM_COUNT} programs, each writing its own files. ${freeNames.join(", ")} are free in full; every other program has at least one free file.`,
        ],
        bullets: PROGRAMS.map((p) => `${p.name}: ${p.outputs.slice(0, 3).join(", ")}${p.outputs.length > 3 ? " and more" : ""}`),
      },
      {
        heading: "Who reads these files",
        paragraphs: [
          "AGENTS.md is the open instructions format many coding agents read; CLAUDE.md is the memory file Claude Code loads at the start of a session; .cursorrules carries project rules for Cursor; the MCP configs connect an agent to tools over the Model Context Protocol.",
        ],
      },
    ],
    sources: [
      { label: "Every program and the files it writes (Axis' Iliad)", href: "/programs/" },
      { label: "Documentation (Axis' Iliad)", href: "/docs/" },
      { label: "AGENTS.md, the open format for coding-agent instructions", href: "https://agents.md/" },
      { label: "How Claude Code reads CLAUDE.md (Claude Code docs)", href: "https://code.claude.com/docs/en/memory" },
      { label: "Project rules in Cursor (Cursor docs)", href: "https://cursor.com/docs/context/rules" },
      { label: "Model Context Protocol", href: "https://modelcontextprotocol.io/" },
    ],
  },
  {
    page: "what-does-iliad-cost",
    path: "/what-does-iliad-cost",
    question: "What does an Iliad analysis cost?",
    answer:
      `Iliad's free files cost nothing: ${FREE_FILE_COUNT} of its ${ARTIFACT_COUNT}, at least one from every program. ` +
      `Plans unlock the rest: Starter is ${usd(plan("starter").monthlyCents)} for ${n(plan("starter").credits)} monthly credits, ` +
      `Pro ${usd(plan("pro").monthlyCents)} for ${n(plan("pro").credits)}, Growth ${usd(plan("growth").monthlyCents)} for ` +
      `${n(plan("growth").credits)}. A full standard analysis over MCP costs ${usd2(PRICING.analyzeStandardCents)}, which is ` +
      `${n(PRICING.standardCredits)} credits.`,
    updated: UPDATED,
    title: "What does an Iliad analysis cost? Prices and credits",
    description:
      `Free files cost nothing. A full standard analysis is ${usd2(PRICING.analyzeStandardCents)} (${n(PRICING.standardCredits)} credits); ` +
      `plans run from ${usd(plan("starter").monthlyCents)} to ${usd(plan("growth").monthlyCents)}. Every price, from the pricing code.`,
    sections: [
      {
        heading: "Free",
        bullets: [
          `${FREE_FILE_COUNT} of the ${ARTIFACT_COUNT} files are free, at least one from every program; ${freeNames.join(", ")} are free in full.`,
          `A free account includes ${n(plan("free").credits)} monthly credits, ${PRICING.freeSnapshotsPerMonth} analyses a month and ${PRICING.freeProjects} project.`,
          "No card is needed to start.",
        ],
      },
      {
        heading: "Plans",
        bullets: [
          ...PRICING.plans
            .filter((p) => p.monthlyCents > 0)
            .map((p) => `${p.name}: ${usd(p.monthlyCents)} for ${n(p.credits)} monthly credits, or ${usd2(annual(p.monthlyCents))} billed annually (${PRICING.annualDiscountPercent}% less).`),
          `Every plan unlocks all ${PROGRAM_COUNT} programs. Starter and Pro include ${PRICING.paidSnapshotsPerMonth} web analyses a month; Growth has no monthly cap.`,
          "Enterprise is a custom contract with its own credits and limits.",
          "Plans are paid through PAI'D's hosted checkout.",
        ],
      },
      {
        heading: "Per analysis, in credits",
        bullets: [
          `One credit is $${PRICING.usdPerCredit}. A standard analysis over MCP (the analyze_repo tool) is ${usd2(PRICING.analyzeStandardCents)}, so it uses ${n(PRICING.standardCredits)} credits.`,
          `Engineer mode, which adds a checked model pass that keeps only claims grounded in the repository's own facts, is ${usd2(PRICING.analyzeEngineerCents)}: ${n(PRICING.engineerCredits)} credits.`,
          "Lite mode is retired: it returns the free files at no charge.",
          "When the included credits run out, the call is refused before any work runs, with the amount due named in the reply. Nothing is billed afterwards.",
        ],
      },
      {
        heading: "Credit packs are for saving versions, not analyses",
        bullets: [
          `Packs of ${PRICING.packs.map((p) => `${n(p.credits)} for ${usd(p.priceCents)}`).join(", ")} pay for saving and comparing versions of a project.`,
        ],
      },
    ],
    sources: [
      { label: "Plans and live prices (Axis' Iliad)", href: "/pricing/" },
      { label: "Prices, payment and budgets for agents (Axis' Iliad)", href: "/for-agents/" },
      { label: "What every program writes, free and paid (Axis' Iliad)", href: "/programs/" },
      { label: "Terms of Service (Axis' Iliad)", href: "/terms/" },
    ],
  },
  {
    page: "how-to-connect-iliad-mcp",
    path: "/how-to-connect-iliad-mcp",
    question: "How do I connect Iliad to Claude, Cursor or VS Code?",
    answer:
      `Iliad is a remote MCP server at ${MCP_URL}, over Streamable HTTP. Sign in, create an API key in Settings, and send it ` +
      `as an Authorization: Bearer header: in Claude Code with claude mcp add --header, in Claude as a custom ` +
      `connector's request header, and in Cursor or VS Code in mcp.json.`,
    updated: UPDATED,
    title: "How to connect Iliad to Claude, Cursor or VS Code (MCP)",
    description:
      "Add Iliad as a remote MCP server: the endpoint, the API key header, and the exact steps for Claude Code, Claude, Cursor and VS Code.",
    sections: [
      {
        heading: "Before you start: an API key",
        steps: [
          "Sign in at iliad.trustfabric.ai with GitHub, Google or email. The account is free.",
          "Open Settings and create an API key. It is shown once: copy it then.",
          `Every client below sends it to ${MCP_URL} as the header Authorization: Bearer YOUR_API_KEY.`,
        ],
        paragraphs: [
          "A few discovery tools answer without a key; analyses need one. There is no OAuth sign-in for the MCP server: the key is the credential.",
        ],
      },
      {
        heading: "Claude Code",
        code: [
          {
            label: "In a terminal",
            text: `claude mcp add --transport http axis-iliad ${MCP_URL} --header "Authorization: Bearer YOUR_API_KEY"`,
          },
        ],
        paragraphs: [
          "Add --scope user to have it in every project. Inside Claude Code, /mcp shows whether it connected.",
        ],
      },
      {
        heading: "Claude (claude.ai and Claude Desktop)",
        steps: [
          "Go to Customize, then Connectors, then + Add, then Add custom connector.",
          `Name it Axis' Iliad and enter ${MCP_URL}.`,
          "Under Request headers, add Authorization with the value Bearer YOUR_API_KEY, then click Add.",
        ],
        paragraphs: [
          "On Team and Enterprise plans an Owner adds it under Organization settings, Connectors, and everyone who connects shares that key. Claude Desktop's claude_desktop_config.json is for local servers, so a remote server goes in Connectors.",
        ],
      },
      {
        heading: "Cursor",
        code: [
          {
            label: "~/.cursor/mcp.json (every project) or .cursor/mcp.json (one project)",
            text: JSON.stringify(
              { mcpServers: { "axis-iliad": { url: MCP_URL, headers: { Authorization: "Bearer YOUR_API_KEY" } } } },
              null,
              2,
            ),
          },
        ],
        paragraphs: ["To keep the key out of the file, write \"Bearer ${env:AXIS_API_KEY}\" and set AXIS_API_KEY in your environment."],
      },
      {
        heading: "VS Code",
        code: [
          {
            label: ".vscode/mcp.json",
            text: JSON.stringify(
              {
                inputs: [{ type: "promptString", id: "axis-api-key", description: "Axis' Iliad API key", password: true }],
                servers: { "axis-iliad": { type: "http", url: MCP_URL, headers: { Authorization: "Bearer ${input:axis-api-key}" } } },
              },
              null,
              2,
            ),
          },
        ],
        paragraphs: ["VS Code asks for the key the first time the server starts and stores it for you."],
      },
    ],
    sources: [
      { label: "Connect Claude Code to tools via MCP (Claude Code docs)", href: "https://code.claude.com/docs/en/mcp" },
      { label: "Get started with custom connectors using remote MCP (Claude Help Center)", href: "https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-MCP" },
      { label: "Model Context Protocol in Cursor (Cursor docs)", href: "https://cursor.com/docs/context/mcp" },
      { label: "Use MCP servers in VS Code (VS Code docs)", href: "https://code.visualstudio.com/docs/copilot/customization/mcp-servers" },
      { label: "Streamable HTTP transport (MCP specification)", href: "https://modelcontextprotocol.io/specification/2025-03-26/basic/transports" },
      { label: "The MCP page, with every tool (Axis' Iliad)", href: "/mcp/" },
    ],
  },
];

export function answerFor(page: Answer["page"]): Answer {
  return ANSWERS.find((a) => a.page === page)!;
}
