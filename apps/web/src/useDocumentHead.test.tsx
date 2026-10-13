/**
 * @vitest-environment happy-dom
 */

// useDocumentHead's noindex handling: a route marked `noindex` (a page that
// exists ahead of its public launch, e.g. the agentic-commerce index) gets
// <meta name="robots" content="noindex"> while active; every other route
// leaves index.html's default (no robots meta) in place.

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, renderHook } from "@testing-library/react";
import { useDocumentHead } from "./useDocumentHead.ts";
import { routeForPage } from "./routes.tsx";

const robots = () => document.querySelectorAll('meta[name="robots"]');

afterEach(() => {
  cleanup();
  document.querySelectorAll('meta[name="robots"]').forEach((el) => el.remove());
});

describe("useDocumentHead — noindex", () => {
  it("adds one robots noindex tag on a noindex route and removes it on leaving", () => {
    const hidden = routeForPage("commerce-index");
    const normal = routeForPage("changelog");
    expect(hidden.noindex).toBe(true);

    const { rerender } = renderHook(({ def, hash }) => useDocumentHead(def, hash), {
      initialProps: { def: hidden, hash: "agentic-commerce-index" },
    });
    expect(robots()).toHaveLength(1);
    expect(robots()[0].getAttribute("content")).toBe("noindex");

    rerender({ def: hidden, hash: "agentic-commerce-index" }); // re-running never duplicates it
    expect(robots()).toHaveLength(1);

    rerender({ def: normal, hash: "changelog" });
    expect(robots()).toHaveLength(0);
  });
});
