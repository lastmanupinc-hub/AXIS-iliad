// Shared in-memory fixture repo for iliad-md tests.
// Named .test-helper.ts so vitest does not collect it as a suite;
// excluded from the published build via tsconfig "exclude".

import type { FileEntry } from "./vendor/snapshots/types.js";

function entry(path: string, content: string): FileEntry {
  return { path, content, size: Buffer.byteLength(content, "utf-8") };
}

/** A tiny but realistic TypeScript + React fixture repo. */
export function fixtureFiles(): FileEntry[] {
  return [
    entry(
      "package.json",
      JSON.stringify(
        {
          name: "fixture-app",
          version: "1.0.0",
          type: "module",
          scripts: { build: "tsc", test: "vitest run", dev: "vite" },
          dependencies: { react: "^19.1.0" },
          devDependencies: { typescript: "^5.7.0", vitest: "^4.1.4" },
        },
        null,
        2,
      ) + "\n",
    ),
    entry("pnpm-lock.yaml", ""),
    entry(
      "tsconfig.json",
      JSON.stringify({ compilerOptions: { strict: true, outDir: "dist" }, include: ["src"] }, null, 2) + "\n",
    ),
    entry(
      "README.md",
      "# fixture-app\n\nA tiny fixture application used by the iliad-md test suite.\n",
    ),
    entry(
      "src/models.ts",
      [
        "export interface Order {",
        "  id: string;",
        "  total_cents: number;",
        "  status: string;",
        "  placed_at: string;",
        "  customer_id: string;",
        "}",
        "",
        "export interface Customer {",
        "  id: string;",
        "  name: string;",
        "  email: string;",
        "  address_line1: string;",
        "  address_line2: string;",
        "  city: string;",
        "  postal_code: string;",
        "}",
        "",
      ].join("\n"),
    ),
    entry(
      "src/index.ts",
      [
        'import type { Order, Customer } from "./models.js";',
        "",
        "export function totalOf(orders: Order[]): number {",
        "  return orders.reduce((sum, o) => sum + o.total_cents, 0);",
        "}",
        "",
        "export function ordersFor(orders: Order[], customer: Customer): Order[] {",
        "  return orders.filter((o) => o.customer_id === customer.id);",
        "}",
        "",
        "export function openOrders(orders: Order[]): Order[] {",
        '  return orders.filter((o) => o.status !== "closed");',
        "}",
        "",
        "export function formatAddress(customer: Customer): string {",
        "  const parts = [customer.address_line1, customer.address_line2, customer.city, customer.postal_code];",
        '  return parts.filter((p) => p.length > 0).join(", ");',
        "}",
        "",
      ].join("\n"),
    ),
    entry(
      "src/components/OrderList.tsx",
      [
        'import type { Order } from "../models.js";',
        "",
        "export function OrderList({ orders }: { orders: Order[] }) {",
        "  return <ul>{orders.map((o) => <li key={o.id}>{o.status}</li>)}</ul>;",
        "}",
        "",
      ].join("\n"),
    ),
  ];
}
