/**
 * @vitest-environment happy-dom
 */

// WO-P12 — Settings: profile/keys/seats half of the former AccountPage plus
// every section that had no home before (GitHub tokens, webhooks + delivery
// log, program toggles) and the Danger Zone (PATCH/DELETE /v1/account,
// WO-A5). App-level routing/auth-gate/account-redirect wiring lives in
// app-routing.test.tsx.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { SettingsPage } from "./SettingsPage.tsx";

function stubFetch(handlers: Array<[match: string, body: unknown, status?: number]>) {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const hit = handlers.find(([m]) => url.includes(m));
    const body = hit ? hit[1] : {};
    const status = hit?.[2] ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
      headers: { get: () => null },
    } as unknown as Response;
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

const ACCOUNT_FREE = { account_id: "acct_1", name: "Ada", email: "ada@example.com", tier: "free" as const, created_at: "2026-01-01T00:00:00Z" };
const ACCOUNT_PAID = { ...ACCOUNT_FREE, tier: "paid" as const };

function baseHandlers(account = ACCOUNT_FREE, overrides: Array<[match: string, body: unknown, status?: number]> = []) {
  return [
    ...overrides,
    ["/v1/account/keys", { keys: [] }],
    ["/v1/account/seats", { seats: [], count: 0, limit: 0, remaining: 0 }],
    ["/v1/account/github-token", { tokens: [] }],
    ["/v1/account/webhooks", { webhooks: [], count: 0 }],
    ["/v1/programs", { programs: [{ name: "theme", outputs: ["theme.css"], generator_count: 1 }], total_generators: 1 }],
    ["/v1/account", { account, entitlements: [] }],
  ] as Array<[match: string, body: unknown, status?: number]>;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

let onAuthChange: ReturnType<typeof vi.fn>;
beforeEach(() => { onAuthChange = vi.fn(); });

describe("SettingsPage — profile", () => {
  it("loads and shows the account's name and email; saving calls PATCH and shows the disclosure note", async () => {
    // getAccount()/getAccountEntitlements() (GET) and patchAccount() (PATCH)
    // all hit the same "/v1/account" path — a plain substring stub can't
    // tell them apart (a PATCH-shaped override would also swallow the
    // initial load's GET), so this needs a method-aware fetch.
    const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/v1/account") && init?.method === "PATCH") {
        const body = { account: { ...ACCOUNT_FREE, email: "new@example.com" }, name_changed: false, email_changed: true, note: "Email updated immediately — no verification step exists yet for this account type." };
        return { ok: true, status: 200, json: async () => body, text: async () => "", headers: { get: () => null } } as unknown as Response;
      }
      const handlers = baseHandlers();
      const hit = handlers.find(([m]) => url.includes(m));
      const body = hit ? hit[1] : {};
      return { ok: true, status: 200, json: async () => body, text: async () => "", headers: { get: () => null } } as unknown as Response;
    });
    vi.stubGlobal("fetch", fetchFn);
    render(<SettingsPage onAuthChange={onAuthChange} />);

    const emailField = await screen.findByLabelText("Email") as HTMLInputElement;
    // The field's initial value is synced from the loaded account in a
    // useEffect (fires after the field itself mounts) — wait for the value,
    // not just the field's existence.
    await waitFor(() => expect(emailField.value).toBe("ada@example.com"));

    fireEvent.change(emailField, { target: { value: "new@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(screen.getByText(/Email updated immediately/)).toBeTruthy());
    const patchCall = fetchFn.mock.calls.find((c) => (c[1] as RequestInit)?.method === "PATCH");
    expect(patchCall).toBeTruthy();
    expect(JSON.parse((patchCall![1] as RequestInit).body as string)).toEqual({ name: undefined, email: "new@example.com" });
  });

  it("shows an honest error Callout when the initial load fails", async () => {
    stubFetch([["/v1/account", { error: "boom" }, 500]]);
    render(<SettingsPage onAuthChange={onAuthChange} />);

    expect(await screen.findByText("Couldn't load your settings")).toBeTruthy();
  });

  it("Log Out clears the session marker and calls onAuthChange", async () => {
    stubFetch(baseHandlers());
    render(<SettingsPage onAuthChange={onAuthChange} />);

    await screen.findByText("Profile");
    localStorage.setItem("axis_api_key", "__cookie_session__");
    fireEvent.click(screen.getByRole("button", { name: "Log Out" }));

    expect(localStorage.getItem("axis_api_key")).toBeNull();
    expect(onAuthChange).toHaveBeenCalledTimes(1);
  });
});

describe("SettingsPage — API keys", () => {
  it("creating a key reveals the raw key once", async () => {
    // createApiKey (POST) and listApiKeys (GET) share the same /v1/account/keys
    // path — a plain substring stub can't tell them apart, so this needs a
    // method-aware fetch.
    const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/v1/account/keys") && init?.method === "POST") {
        const body = { key_id: "k1", raw_key: "axis_rawkey123", label: "default" };
        return { ok: true, status: 201, json: async () => body, text: async () => "", headers: { get: () => null } } as unknown as Response;
      }
      const handlers = baseHandlers();
      const hit = handlers.find(([m]) => url.includes(m));
      const body = hit ? hit[1] : {};
      return { ok: true, status: 200, json: async () => body, text: async () => "", headers: { get: () => null } } as unknown as Response;
    });
    vi.stubGlobal("fetch", fetchFn);

    render(<SettingsPage onAuthChange={onAuthChange} />);

    await screen.findByText("API Keys");
    fireEvent.click(screen.getByRole("button", { name: "+ New Key" }));

    expect(await screen.findByText("axis_rawkey123")).toBeTruthy();
  });
});

describe("SettingsPage — GitHub tokens", () => {
  it("adding a token clears the form and lists it", async () => {
    let saved = false;
    const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/v1/account/github-token") && init?.method === "POST") {
        saved = true;
        const body = { token_id: "t1", label: "default", token_prefix: "ghp_1234", scopes: [], created_at: "2026-07-01T00:00:00Z", message: "stored" };
        return { ok: true, status: 201, json: async () => body, text: async () => "", headers: { get: () => null } } as unknown as Response;
      }
      if (url.includes("/v1/account/github-token")) {
        const body = saved ? { tokens: [{ token_id: "t1", label: "default", token_prefix: "ghp_1234", scopes: [], created_at: "2026-07-01T00:00:00Z", expires_at: null, last_used_at: null, valid: true }] } : { tokens: [] };
        return { ok: true, status: 200, json: async () => body, text: async () => "", headers: { get: () => null } } as unknown as Response;
      }
      const handlers = baseHandlers();
      const hit = handlers.find(([m]) => url.includes(m));
      const body = hit ? hit[1] : {};
      return { ok: true, status: 200, json: async () => body, text: async () => "", headers: { get: () => null } } as unknown as Response;
    });
    vi.stubGlobal("fetch", fetchFn);

    render(<SettingsPage onAuthChange={onAuthChange} />);
    await screen.findByText("GitHub Tokens");

    fireEvent.change(screen.getByPlaceholderText("ghp_..."), { target: { value: "ghp_abcdefghijklmnop" } });
    fireEvent.click(screen.getByRole("button", { name: "+ Add Token" }));

    expect(await screen.findByText("ghp_1234...")).toBeTruthy();
  });
});

describe("SettingsPage — webhooks", () => {
  it("requires at least one event before creating a webhook, and wires the error to the checkbox group via aria-describedby (H5.1b(g))", async () => {
    stubFetch(baseHandlers());
    render(<SettingsPage onAuthChange={onAuthChange} />);
    await screen.findByText("Webhooks");

    fireEvent.change(screen.getByPlaceholderText("https://example.com/hook"), { target: { value: "https://example.com/hook" } });
    fireEvent.click(screen.getByRole("button", { name: "+ New Webhook" }));

    const errorText = await screen.findByText("Select at least one event to subscribe to");
    expect(errorText).toBeTruthy();

    const errorCallout = errorText.closest(".callout") as HTMLElement;
    expect(errorCallout.id).toBe("settings-error");
    const eventsGroup = screen.getByRole("group", { name: "Webhook events" });
    expect(eventsGroup.getAttribute("aria-describedby")).toBe("settings-error");
  });

  it("lists an existing webhook and toggles it paused/active", async () => {
    const webhook = { webhook_id: "wh1", account_id: "acct_1", url: "https://example.com/hook", events: ["snapshot.created"], secret: null, active: true, created_at: "2026-07-01T00:00:00Z", updated_at: "2026-07-01T00:00:00Z" };
    let toggled = false;
    const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/toggle")) {
        toggled = true;
        return { ok: true, status: 200, json: async () => ({ webhook_id: "wh1", active: false }), text: async () => "", headers: { get: () => null } } as unknown as Response;
      }
      if (url.includes("/v1/account/webhooks")) {
        const body = { webhooks: [{ ...webhook, active: !toggled }], count: 1 };
        return { ok: true, status: 200, json: async () => body, text: async () => "", headers: { get: () => null } } as unknown as Response;
      }
      void init;
      const handlers = baseHandlers();
      const hit = handlers.find(([m]) => url.includes(m));
      const body = hit ? hit[1] : {};
      return { ok: true, status: 200, json: async () => body, text: async () => "", headers: { get: () => null } } as unknown as Response;
    });
    vi.stubGlobal("fetch", fetchFn);

    render(<SettingsPage onAuthChange={onAuthChange} />);
    await waitFor(() => expect(screen.getByText("https://example.com/hook")).toBeTruthy());
    expect(screen.getByText("Active")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Pause" }));

    await waitFor(() => expect(screen.getByText("Paused")).toBeTruthy());
  });

  // H-Phase-A cycle 18: handleViewDeliveries was the one webhook handler the
  // bulk sweep's request-id guard missed -- deliveries is a single shared
  // array, not keyed per webhook, so an older, slower response resolving
  // AFTER a newer one used to silently swap the visible panel back to the
  // stale webhook's data even though the user's last action opened a
  // different one.
  it("viewing a second webhook's deliveries while the first's request is still in flight does not let the older response overwrite the newer panel", async () => {
    const webhookA = { webhook_id: "wh-a", account_id: "acct_1", url: "https://a.example.com/hook", events: ["snapshot.created"], secret: null, active: true, created_at: "2026-07-01T00:00:00Z", updated_at: "2026-07-01T00:00:00Z" };
    const webhookB = { webhook_id: "wh-b", account_id: "acct_1", url: "https://b.example.com/hook", events: ["snapshot.created"], secret: null, active: true, created_at: "2026-07-01T00:00:00Z", updated_at: "2026-07-01T00:00:00Z" };
    const resolvers: Array<(body: unknown) => void> = [];
    let deliveryCallCount = 0;
    const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/deliveries")) {
        const index = deliveryCallCount++;
        const body = await new Promise((resolve) => { resolvers[index] = resolve; });
        return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body), headers: { get: () => null } } as unknown as Response;
      }
      if (url.includes("/v1/account/webhooks")) {
        return { ok: true, status: 200, json: async () => ({ webhooks: [webhookA, webhookB], count: 2 }), text: async () => "", headers: { get: () => null } } as unknown as Response;
      }
      const handlers = baseHandlers();
      const hit = handlers.find(([m]) => url.includes(m));
      const body = hit ? hit[1] : {};
      return { ok: true, status: 200, json: async () => body, text: async () => "", headers: { get: () => null } } as unknown as Response;
    });
    vi.stubGlobal("fetch", fetchFn);

    render(<SettingsPage onAuthChange={onAuthChange} />);
    await waitFor(() => expect(screen.getByText("https://a.example.com/hook")).toBeTruthy());
    const rowA = screen.getByText("https://a.example.com/hook").closest(".card") as HTMLElement;
    const rowB = screen.getByText("https://b.example.com/hook").closest(".card") as HTMLElement;

    // Open A's deliveries -- its request (call 0) is now in flight.
    fireEvent.click(within(rowA).getByRole("button", { name: "View deliveries" }));
    await waitFor(() => expect(resolvers[0]).toBeTruthy());

    // Open B's deliveries BEFORE A's request resolves -- its own request (call 1) also in flight.
    fireEvent.click(within(rowB).getByRole("button", { name: "View deliveries" }));
    await waitFor(() => expect(resolvers[1]).toBeTruthy());

    // B's request (the NEWER call) resolves first.
    resolvers[1]({
      deliveries: [{ delivery_id: "d-b", webhook_id: "wh-b", event_type: "snapshot.created", payload: "{}", status_code: 200, response_body: null, success: true, attempted_at: "2026-07-01T00:00:00Z" }],
      count: 1,
    });
    await waitFor(() => expect(within(rowB).getByRole("region", { name: /Deliveries for/ })).toBeTruthy());

    // A's request (the OLDER call) resolves AFTER -- must be ignored, not
    // swap the visible panel back to A.
    resolvers[0]({
      deliveries: [{ delivery_id: "d-a", webhook_id: "wh-a", event_type: "snapshot.created", payload: "{}", status_code: 200, response_body: null, success: true, attempted_at: "2026-07-01T00:00:00Z" }],
      count: 1,
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(within(rowB).getByRole("region", { name: /Deliveries for/ })).toBeTruthy();
    expect(within(rowA).queryByRole("region", { name: /Deliveries for/ })).toBeNull();
  });
});

describe("SettingsPage — team seats (tier-gated honestly)", () => {
  it("free tier shows the honest gate message, not a hidden/blank section", async () => {
    stubFetch(baseHandlers(ACCOUNT_FREE));
    render(<SettingsPage onAuthChange={onAuthChange} />);

    expect(await screen.findByText("Team seats are available on Paid or Suite tiers.")).toBeTruthy();
  });

  it("paid tier shows the invite form and existing seats", async () => {
    stubFetch(baseHandlers(ACCOUNT_PAID, [
      ["/v1/account/seats", { seats: [{ seat_id: "s1", account_id: "acct_1", email: "bob@example.com", role: "member", invited_by: "acct_1", accepted_at: "2026-07-01T00:00:00Z", revoked_at: null, created_at: "2026-07-01T00:00:00Z", accepted: true }], count: 1, limit: 5, remaining: 4 }],
    ]));
    render(<SettingsPage onAuthChange={onAuthChange} />);

    await waitFor(() => expect(screen.getByText("bob@example.com")).toBeTruthy());
    expect(screen.getByPlaceholderText("teammate@example.com")).toBeTruthy();
  });
});

describe("SettingsPage — programs (tier-gated honestly)", () => {
  it("free tier shows the honest gate message", async () => {
    stubFetch(baseHandlers(ACCOUNT_FREE));
    render(<SettingsPage onAuthChange={onAuthChange} />);

    expect(await screen.findByText("Program management is available on Paid or Suite tiers.")).toBeTruthy();
  });

  it("paid tier can toggle a program on", async () => {
    const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/v1/account/programs")) {
        return { ok: true, status: 200, json: async () => ({ programs: ["theme"] }), text: async () => "", headers: { get: () => null } } as unknown as Response;
      }
      void init;
      const handlers = baseHandlers(ACCOUNT_PAID);
      const hit = handlers.find(([m]) => url.includes(m));
      const body = hit ? hit[1] : {};
      return { ok: true, status: 200, json: async () => body, text: async () => "", headers: { get: () => null } } as unknown as Response;
    });
    vi.stubGlobal("fetch", fetchFn);

    render(<SettingsPage onAuthChange={onAuthChange} />);
    const themeRow = (await screen.findByText("theme")).closest("tr")!;
    fireEvent.click(within(themeRow).getByRole("button", { name: "Enable" }));

    await waitFor(() => expect(within(themeRow).getByRole("button", { name: "Disable" })).toBeTruthy());
  });

  // H-Phase-A bulk sweep: handleToggleProgram's setEntitlements had no
  // request-id guard -- toggling a SECOND, different program while the
  // first's own refetch was still in flight let an older response silently
  // revert the first program's just-applied change if it resolved later.
  it("toggling a second program does not let an older refetch revert the first program's own change", async () => {
    const catalog = { programs: [{ name: "theme", outputs: ["theme.css"], generator_count: 1 }, { name: "seo", outputs: ["seo-rules.md"], generator_count: 1 }], total_generators: 2 };
    const resolvers: Array<(body: unknown) => void> = [];
    let toggleCallCount = 0;
    const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/v1/account/programs")) {
        const index = toggleCallCount++;
        const body = await new Promise((resolve) => { resolvers[index] = resolve; });
        return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body), headers: { get: () => null } } as unknown as Response;
      }
      if (url.includes("/v1/programs")) {
        return { ok: true, status: 200, json: async () => catalog, text: async () => "", headers: { get: () => null } } as unknown as Response;
      }
      const handlers = baseHandlers(ACCOUNT_PAID);
      const hit = handlers.find(([m]) => url.includes(m));
      const body = hit ? hit[1] : {};
      return { ok: true, status: 200, json: async () => body, text: async () => "", headers: { get: () => null } } as unknown as Response;
    });
    vi.stubGlobal("fetch", fetchFn);

    render(<SettingsPage onAuthChange={onAuthChange} />);
    const themeRow = (await screen.findByText("theme")).closest("tr")!;
    const seoRow = (await screen.findByText("seo")).closest("tr")!;

    // Enable theme -- its own refetch (call 0) is now in flight.
    fireEvent.click(within(themeRow).getByRole("button", { name: "Enable" }));
    await waitFor(() => expect(resolvers[0]).toBeTruthy());

    // Enable seo BEFORE theme's refetch resolves -- its own refetch (call 1) also in flight.
    fireEvent.click(within(seoRow).getByRole("button", { name: "Enable" }));
    await waitFor(() => expect(resolvers[1]).toBeTruthy());

    // seo's refetch (the NEWER call) resolves first, correctly reflecting both enabled.
    resolvers[1]({ programs: ["theme", "seo"] });
    await waitFor(() => expect(within(seoRow).getByRole("button", { name: "Disable" })).toBeTruthy());
    expect(within(themeRow).getByRole("button", { name: "Disable" })).toBeTruthy();

    // theme's refetch (the OLDER call, reflecting a world where seo wasn't
    // enabled yet) resolves AFTER -- must be ignored, not revert seo.
    resolvers[0]({ programs: ["theme"] });
    await new Promise((r) => setTimeout(r, 0));
    expect(within(themeRow).getByRole("button", { name: "Disable" })).toBeTruthy();
    expect(within(seoRow).getByRole("button", { name: "Disable" })).toBeTruthy();
  });
});

describe("SettingsPage — Danger Zone", () => {
  it("is click-to-arm and calls deleteAccount + onAuthChange on confirm", async () => {
    let deleteCalled = false;
    const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/v1/account") && init?.method === "DELETE") {
        deleteCalled = true;
        return { ok: true, status: 200, json: async () => ({ deleted: true, projects_deleted: 2 }), text: async () => "", headers: { get: () => null } } as unknown as Response;
      }
      const handlers = baseHandlers();
      const hit = handlers.find(([m]) => url.includes(m));
      const body = hit ? hit[1] : {};
      return { ok: true, status: 200, json: async () => body, text: async () => "", headers: { get: () => null } } as unknown as Response;
    });
    vi.stubGlobal("fetch", fetchFn);
    localStorage.setItem("axis_api_key", "__cookie_session__");

    render(<SettingsPage onAuthChange={onAuthChange} />);
    await screen.findByText("Danger Zone");

    fireEvent.click(screen.getByRole("button", { name: "Delete Account" }));
    expect(deleteCalled).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Yes, confirm" }));

    await waitFor(() => expect(deleteCalled).toBe(true));
    expect(localStorage.getItem("axis_api_key")).toBeNull();
    expect(onAuthChange).toHaveBeenCalledTimes(1);
  });
});
