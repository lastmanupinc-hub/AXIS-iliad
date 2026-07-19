import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
  getAccount,
  getAccountEntitlements,
  patchAccount,
  deleteAccount,
  createApiKey,
  listApiKeys,
  revokeApiKey,
  listSeats,
  inviteSeat,
  revokeSeat,
  listGitHubTokens,
  saveGitHubToken,
  deleteGitHubToken,
  listWebhooks,
  createWebhook,
  deleteWebhook,
  toggleWebhook,
  getWebhookDeliveries,
  getPrograms,
  updateProgramEntitlements,
  logoutSession,
  apiErrorDetails,
  VALID_WEBHOOK_EVENTS,
  type Account,
  type ApiKeyInfo,
  type Seat,
  type GitHubTokenSummary,
  type Webhook,
  type WebhookDelivery,
  type WebhookEventType,
  type ProgramCatalogEntry,
} from "../api.ts";
import { SectionHeader, Callout, Skeleton, TableWrap } from "../components/primitives/index.ts";
import { useFocusRetention } from "../useFocusRetention.ts";

// ─── SettingsPage (WO-P12) ────────────────────────────────────────────────
// Replaces the profile/keys/seats half of the former AccountPage (the
// billing/usage half already moved to UsagePage, WO-P10) and adds every
// section the build plan asks for that had no home before: GitHub token
// CRUD, webhooks + a delivery-log viewer, program entitlement toggles, and
// the Danger Zone (PATCH/DELETE /v1/account, WO-A5). AccountPage.tsx keeps
// only the OAuth-callback exchange and the signed-out sign-in card — it
// redirects here once a session exists (see its own comment).

/** Click once to arm, click again to confirm — same pattern as
 *  VersionsTab.tsx/ProjectsPage.tsx's DangerButton (each a small page-local
 *  copy; not shared, see either for the "why not a native confirm()"). */
function DangerButton({ label, confirmLabel, busy, onConfirm }: { label: string; confirmLabel: string; busy: boolean; onConfirm: () => void }) {
  const [armed, setArmed] = useState(false);
  const labelRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const wasArmed = useRef(false);

  // The confirm step replaces this control's whole subtree, which unmounts
  // whatever was just clicked and silently drops keyboard focus to <body>.
  // Move focus to the safer default (Cancel, not the destructive action)
  // on arm, and back to the label button when disarmed.
  useEffect(() => {
    if (armed && !wasArmed.current) cancelRef.current?.focus();
    if (!armed && wasArmed.current) labelRef.current?.focus();
    wasArmed.current = armed;
  }, [armed]);

  if (!armed) {
    return (
      <button ref={labelRef} type="button" className="btn" style={{ color: "var(--red)", borderColor: "var(--red)" }} onClick={() => setArmed(true)}>
        {label}
      </button>
    );
  }
  return (
    <span className="flex gap-2" style={{ alignItems: "center", flexWrap: "wrap" }}>
      <span className="text-muted text-sm">{confirmLabel}</span>
      <button type="button" className="btn btn-primary" style={{ background: "var(--red)", borderColor: "var(--red)" }} disabled={busy} onClick={onConfirm}>
        {busy ? "Working..." : "Yes, confirm"}
      </button>
      <button ref={cancelRef} type="button" className="btn" disabled={busy} onClick={() => setArmed(false)}>Cancel</button>
    </span>
  );
}

interface Props {
  onAuthChange?: () => void;
}

export function SettingsPage({ onAuthChange }: Props) {
  const [account, setAccount] = useState<Account | null>(null);
  const [entitlements, setEntitlements] = useState<string[]>([]);
  const [keys, setKeys] = useState<ApiKeyInfo[]>([]);
  const [seats, setSeats] = useState<{ seats: Seat[]; count: number; limit: number; remaining: number } | null>(null);
  const [tokens, setTokens] = useState<GitHubTokenSummary[]>([]);
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [programs, setPrograms] = useState<ProgramCatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; details: string | null } | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [acct, ents, keysData, seatsData, tokensData, webhooksData, programsData] = await Promise.all([
        getAccount(),
        getAccountEntitlements(),
        listApiKeys(),
        listSeats(),
        listGitHubTokens(),
        listWebhooks(),
        getPrograms(),
      ]);
      setAccount(acct);
      setEntitlements(ents);
      // H-Phase-A cycle 13: defense-in-depth against a malformed API response
      // missing its expected array field (matches getAccountEntitlements's own
      // `?? []` above) — every list.length read below assumes an array.
      setKeys(keysData.keys ?? []);
      setSeats(seatsData);
      setTokens(tokensData.tokens ?? []);
      setWebhooks(webhooksData.webhooks ?? []);
      setPrograms(programsData.programs ?? []);
    } catch (err) {
      setError({ message: err instanceof Error ? err.message : "Failed to load settings", details: apiErrorDetails(err) });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // ─── Profile ─────────────────────────────────────────────────
  const [profileName, setProfileName] = useState("");
  const [profileEmail, setProfileEmail] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileNote, setProfileNote] = useState<string | null>(null);
  const saveProfileRef = useFocusRetention<HTMLButtonElement>(profileSaving);

  useEffect(() => {
    if (account) {
      setProfileName(account.name);
      setProfileEmail(account.email);
    }
  }, [account]);

  async function handleSaveProfile(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setProfileNote(null);
    setProfileSaving(true);
    try {
      const result = await patchAccount({
        name: account && profileName !== account.name ? profileName : undefined,
        email: account && profileEmail !== account.email ? profileEmail : undefined,
      });
      setAccount(result.account);
      if (result.note) setProfileNote(result.note);
    } catch (err) {
      setError({ message: err instanceof Error ? err.message : "Failed to update profile", details: apiErrorDetails(err) });
    } finally {
      setProfileSaving(false);
    }
  }

  function handleLogout() {
    void logoutSession();
    localStorage.removeItem("axis_api_key");
    onAuthChange?.();
  }

  // ─── API Keys ────────────────────────────────────────────────
  const [newKeyLabel, setNewKeyLabel] = useState("");
  const [revealedKey, setRevealedKey] = useState<string | null>(null);

  async function handleCreateKey(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const result = await createApiKey(newKeyLabel.trim() || "default");
      setRevealedKey(result.raw_key);
      setNewKeyLabel("");
      setKeys((await listApiKeys()).keys ?? []);
    } catch (err) {
      setError({ message: err instanceof Error ? err.message : "Failed to create key", details: apiErrorDetails(err) });
    }
  }

  const [revokingKeyId, setRevokingKeyId] = useState<string | null>(null);
  async function handleRevokeKey(keyId: string) {
    setRevokingKeyId(keyId);
    try {
      await revokeApiKey(keyId);
      setKeys((await listApiKeys()).keys ?? []);
    } catch (err) {
      setError({ message: err instanceof Error ? err.message : "Failed to revoke key", details: apiErrorDetails(err) });
    } finally {
      setRevokingKeyId(null);
    }
  }

  // ─── GitHub tokens ───────────────────────────────────────────
  const [newToken, setNewToken] = useState("");
  const [newTokenLabel, setNewTokenLabel] = useState("");

  async function handleSaveToken(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await saveGitHubToken(newToken.trim(), newTokenLabel.trim() || "default");
      setNewToken("");
      setNewTokenLabel("");
      setTokens((await listGitHubTokens()).tokens ?? []);
    } catch (err) {
      setError({ message: err instanceof Error ? err.message : "Failed to save token", details: apiErrorDetails(err) });
    }
  }

  const [deletingTokenId, setDeletingTokenId] = useState<string | null>(null);
  async function handleDeleteToken(tokenId: string) {
    setDeletingTokenId(tokenId);
    try {
      await deleteGitHubToken(tokenId);
      setTokens((await listGitHubTokens()).tokens ?? []);
    } catch (err) {
      setError({ message: err instanceof Error ? err.message : "Failed to delete token", details: apiErrorDetails(err) });
    } finally {
      setDeletingTokenId(null);
    }
  }

  // ─── Webhooks ────────────────────────────────────────────────
  const [newWebhookUrl, setNewWebhookUrl] = useState("");
  const [newWebhookEvents, setNewWebhookEvents] = useState<WebhookEventType[]>([]);
  const [openDeliveries, setOpenDeliveries] = useState<string | null>(null);
  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([]);

  async function handleCreateWebhook(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (newWebhookEvents.length === 0) {
      setError({ message: "Select at least one event to subscribe to", details: null });
      return;
    }
    try {
      await createWebhook(newWebhookUrl.trim(), newWebhookEvents);
      setNewWebhookUrl("");
      setNewWebhookEvents([]);
      setWebhooks((await listWebhooks()).webhooks ?? []);
    } catch (err) {
      setError({ message: err instanceof Error ? err.message : "Failed to create webhook", details: apiErrorDetails(err) });
    }
  }

  const [deletingWebhookId, setDeletingWebhookId] = useState<string | null>(null);
  async function handleDeleteWebhook(webhookId: string) {
    setDeletingWebhookId(webhookId);
    try {
      await deleteWebhook(webhookId);
      setWebhooks((await listWebhooks()).webhooks ?? []);
    } catch (err) {
      setError({ message: err instanceof Error ? err.message : "Failed to delete webhook", details: apiErrorDetails(err) });
    } finally {
      setDeletingWebhookId(null);
    }
  }

  async function handleToggleWebhook(webhookId: string, active: boolean) {
    try {
      await toggleWebhook(webhookId, active);
      setWebhooks((await listWebhooks()).webhooks ?? []);
    } catch (err) {
      setError({ message: err instanceof Error ? err.message : "Failed to update webhook", details: apiErrorDetails(err) });
    }
  }

  async function handleViewDeliveries(webhookId: string) {
    if (openDeliveries === webhookId) {
      setOpenDeliveries(null);
      return;
    }
    try {
      const result = await getWebhookDeliveries(webhookId);
      setDeliveries(result.deliveries ?? []);
      setOpenDeliveries(webhookId);
    } catch (err) {
      setError({ message: err instanceof Error ? err.message : "Failed to load deliveries", details: apiErrorDetails(err) });
    }
  }

  // ─── Team seats (revoke only — invite stays inline on its form) ──
  const [revokingSeatId, setRevokingSeatId] = useState<string | null>(null);
  async function handleRevokeSeat(seatId: string) {
    setRevokingSeatId(seatId);
    try {
      await revokeSeat(seatId);
      setSeats(await listSeats());
    } catch (err) {
      setError({ message: err instanceof Error ? err.message : "Failed to revoke seat", details: apiErrorDetails(err) });
    } finally {
      setRevokingSeatId(null);
    }
  }

  // ─── Programs ────────────────────────────────────────────────
  const [programBusy, setProgramBusy] = useState<string | null>(null);
  // One busy flag drives N per-row toggle buttons, so useFocusRetention's
  // single-button shape doesn't fit — track each row's element in a
  // registry and refocus whichever one was actually busy once it clears.
  const programButtonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const lastBusyProgram = useRef<string | null>(null);
  useEffect(() => {
    if (programBusy === null && lastBusyProgram.current) {
      programButtonRefs.current.get(lastBusyProgram.current)?.focus();
    }
    lastBusyProgram.current = programBusy;
  }, [programBusy]);

  async function handleToggleProgram(program: string, enabled: boolean) {
    setProgramBusy(program);
    setError(null);
    try {
      const result = enabled
        ? await updateProgramEntitlements({ enable: [program] })
        : await updateProgramEntitlements({ disable: [program] });
      setEntitlements(result.programs ?? []);
    } catch (err) {
      setError({ message: err instanceof Error ? err.message : "Failed to update program", details: apiErrorDetails(err) });
    } finally {
      setProgramBusy(null);
    }
  }

  // ─── Danger zone ─────────────────────────────────────────────
  const [deletingAccount, setDeletingAccount] = useState(false);

  async function handleDeleteAccount() {
    setDeletingAccount(true);
    setError(null);
    try {
      await deleteAccount();
      localStorage.removeItem("axis_api_key");
      onAuthChange?.();
    } catch (err) {
      setError({ message: err instanceof Error ? err.message : "Failed to delete account", details: apiErrorDetails(err) });
      setDeletingAccount(false);
    }
  }

  if (loading) {
    return (
      <div>
        <SectionHeader title="Settings" level="h1" />
        <div role="status" aria-busy="true">
          <Skeleton lines={8} height={60} />
        </div>
      </div>
    );
  }

  if (!account) {
    return (
      <div>
        <SectionHeader title="Settings" level="h1" />
        <Callout tone="danger" title="Couldn't load your settings" details={error?.details ?? null}>{error?.message ?? "Unknown error"}</Callout>
      </div>
    );
  }

  const canManagePrograms = account.tier !== "free";
  const canUseSeats = account.tier !== "free";

  return (
    <div>
      <SectionHeader title="Settings" sub="Profile, API keys, integrations, and account management." level="h1" />

      {error && (
        <div className="mb-4">
          <Callout id="settings-error" tone="danger" title="Something went wrong" details={error.details}>{error.message}</Callout>
        </div>
      )}

      {/* Profile */}
      <div className="card">
        <div className="flex-between mb-2">
          <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: 4 }}>Profile</h2>
          <button type="button" className="btn text-sm" onClick={handleLogout}>Log Out</button>
        </div>
        <form onSubmit={(e) => void handleSaveProfile(e)} className="stack gap-2" style={{ maxWidth: 420 }}>
          <label className="text-sm text-muted" htmlFor="settings-name">Name</label>
          <input id="settings-name" value={profileName} onChange={(e) => setProfileName(e.target.value)} />
          <label className="text-sm text-muted" htmlFor="settings-email">Email</label>
          <input id="settings-email" type="email" value={profileEmail} onChange={(e) => setProfileEmail(e.target.value)} />
          <button ref={saveProfileRef} type="submit" className="btn btn-primary" disabled={profileSaving} style={{ alignSelf: "flex-start" }}>
            {profileSaving ? "Saving..." : "Save changes"}
          </button>
        </form>
        {profileNote && <p className="text-muted text-xs mt-2">{profileNote}</p>}
      </div>

      {/* Revealed key banner */}
      {revealedKey && (
        <div className="card" style={{ borderColor: "var(--yellow)" }}>
          <div className="flex-between">
            <div>
              <h2 style={{ color: "var(--yellow)", fontSize: "1rem", fontWeight: 600, marginBottom: 4 }}>Save your API key — it won&apos;t be shown again</h2>
              <code className="mono text-sm" style={{ wordBreak: "break-all" }}>{revealedKey}</code>
            </div>
            <button type="button" className="btn" onClick={() => void navigator.clipboard.writeText(revealedKey)}>Copy</button>
          </div>
        </div>
      )}

      {/* API Keys */}
      <div className="card">
        <div className="flex-between mb-2">
          <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: 4 }}>API Keys</h2>
          <form onSubmit={(e) => void handleCreateKey(e)} className="flex gap-2">
            <input value={newKeyLabel} onChange={(e) => setNewKeyLabel(e.target.value)} placeholder="Key label (optional)" aria-label="API key label" style={{ width: 200 }} />
            <button type="submit" className="btn btn-primary" style={{ whiteSpace: "nowrap" }}>+ New Key</button>
          </form>
        </div>
        {keys.length === 0 ? (
          <p className="text-muted text-sm">No API keys yet.</p>
        ) : (
          <TableWrap label="API keys">
            <table>
              <thead><tr><th>Label</th><th>Prefix</th><th>Created</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k.key_id}>
                    <td>{k.label}</td>
                    <td className="mono">{k.prefix}...</td>
                    <td>{new Date(k.created_at).toLocaleDateString()}</td>
                    <td>{k.revoked_at ? <span className="badge badge-red">Revoked</span> : <span className="badge badge-green">Active</span>}</td>
                    <td>{!k.revoked_at && (
                      <DangerButton
                        label="Revoke"
                        confirmLabel="Revoke this key? Anything using it stops working immediately."
                        busy={revokingKeyId === k.key_id}
                        onConfirm={() => void handleRevokeKey(k.key_id)}
                      />
                    )}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </div>

      {/* GitHub Tokens */}
      <div className="card">
        <h2 className="mb-2" style={{ fontSize: "1rem", fontWeight: 600 }}>GitHub Tokens</h2>
        <p className="text-muted text-sm mb-2">Stored tokens are used automatically for private-repo analysis. Only a prefix is ever shown again.</p>
        <form onSubmit={(e) => void handleSaveToken(e)} className="flex gap-2 mb-4" style={{ flexWrap: "wrap" }}>
          <input value={newToken} onChange={(e) => setNewToken(e.target.value)} placeholder="ghp_..." type="password" aria-label="GitHub token value" style={{ width: 240 }} required minLength={10} />
          <input value={newTokenLabel} onChange={(e) => setNewTokenLabel(e.target.value)} placeholder="Label (optional)" aria-label="GitHub token label" style={{ width: 160 }} />
          <button type="submit" className="btn btn-primary">+ Add Token</button>
        </form>
        {tokens.length === 0 ? (
          <p className="text-muted text-sm">No GitHub tokens stored.</p>
        ) : (
          <TableWrap label="GitHub tokens">
            <table>
              <thead><tr><th>Label</th><th>Prefix</th><th>Created</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {tokens.map((t) => (
                  <tr key={t.token_id}>
                    <td>{t.label}</td>
                    <td className="mono">{t.token_prefix}...</td>
                    <td>{new Date(t.created_at).toLocaleDateString()}</td>
                    <td>{t.valid ? <span className="badge badge-green">Valid</span> : <span className="badge badge-red">Invalid</span>}</td>
                    <td>
                      <DangerButton
                        label="Remove"
                        confirmLabel="Remove this token? Program runs relying on it will stop working."
                        busy={deletingTokenId === t.token_id}
                        onConfirm={() => void handleDeleteToken(t.token_id)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </div>

      {/* Webhooks */}
      <div className="card">
        <h2 className="mb-2" style={{ fontSize: "1rem", fontWeight: 600 }}>Webhooks</h2>
        <form onSubmit={(e) => void handleCreateWebhook(e)} className="stack gap-2 mb-4" style={{ maxWidth: 480 }}>
          <input value={newWebhookUrl} onChange={(e) => setNewWebhookUrl(e.target.value)} placeholder="https://example.com/hook" type="url" aria-label="Webhook URL" required />
          <div
            className="flex gap-2"
            style={{ flexWrap: "wrap" }}
            role="group"
            aria-label="Webhook events"
            {...(error?.message === "Select at least one event to subscribe to" ? { "aria-describedby": "settings-error" } : {})}
          >
            {VALID_WEBHOOK_EVENTS.map((evt) => (
              <label key={evt} className="text-sm flex gap-1" style={{ alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={newWebhookEvents.includes(evt)}
                  onChange={(e) => setNewWebhookEvents((prev) => (e.target.checked ? [...prev, evt] : prev.filter((x) => x !== evt)))}
                />
                {evt}
              </label>
            ))}
          </div>
          <button type="submit" className="btn btn-primary" style={{ alignSelf: "flex-start" }}>+ New Webhook</button>
        </form>
        {webhooks.length === 0 ? (
          <p className="text-muted text-sm">No webhooks registered.</p>
        ) : (
          <div className="stack gap-2">
            {webhooks.map((w) => (
              <div key={w.webhook_id} className="card" style={{ margin: 0 }}>
                <div className="flex-between">
                  <div>
                    <div className="mono text-sm" style={{ wordBreak: "break-all" }}>{w.url}</div>
                    <div className="flex gap-1 mt-1" style={{ flexWrap: "wrap" }}>
                      {w.events.map((e) => <span key={e} className="badge">{e}</span>)}
                    </div>
                  </div>
                  <div className="flex gap-2" style={{ flexWrap: "wrap" }}>
                    <span className={w.active ? "badge badge-green" : "badge badge-yellow"}>{w.active ? "Active" : "Paused"}</span>
                    <button type="button" className="btn text-xs" onClick={() => void handleToggleWebhook(w.webhook_id, !w.active)}>{w.active ? "Pause" : "Resume"}</button>
                    <button type="button" className="btn text-xs" onClick={() => void handleViewDeliveries(w.webhook_id)}>{openDeliveries === w.webhook_id ? "Hide deliveries" : "View deliveries"}</button>
                    <DangerButton
                      label="Delete"
                      confirmLabel="Delete this webhook? Delivery history goes with it."
                      busy={deletingWebhookId === w.webhook_id}
                      onConfirm={() => void handleDeleteWebhook(w.webhook_id)}
                    />
                  </div>
                </div>
                {openDeliveries === w.webhook_id && (
                  <div className="mt-2">
                    {deliveries.length === 0 ? (
                      <p className="text-muted text-xs">No deliveries yet.</p>
                    ) : (
                      <TableWrap label={`Deliveries for ${w.url}`}>
                        <table>
                          <thead><tr><th>Event</th><th>Attempted</th><th>Status</th><th>Attempt</th></tr></thead>
                          <tbody>
                            {deliveries.map((d) => (
                              <tr key={d.delivery_id}>
                                <td className="text-xs">{d.event_type}</td>
                                <td className="text-xs">{new Date(d.attempted_at).toLocaleString()}</td>
                                <td>{d.success ? <span className="badge badge-green">{d.status_code ?? "ok"}</span> : <span className="badge badge-red">{d.status_code ?? "failed"}</span>}</td>
                                <td className="text-xs">{d.attempt_number}{d.dead_lettered ? " (dead-lettered)" : ""}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </TableWrap>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Team Seats */}
      <div className="card">
        <h2 className="mb-2" style={{ fontSize: "1rem", fontWeight: 600 }}>Team Seats {seats && canUseSeats && <span className="text-muted text-sm">({seats.count}/{seats.limit})</span>}</h2>
        {!canUseSeats ? (
          <p className="text-muted text-sm">Team seats are available on Paid or Suite tiers.</p>
        ) : (
          <>
            <form
              onSubmit={(e: FormEvent) => {
                e.preventDefault();
                const form = e.currentTarget as HTMLFormElement;
                const email = (new FormData(form).get("email") as string) ?? "";
                setError(null);
                void (async () => {
                  try {
                    await inviteSeat(email.trim());
                    form.reset();
                    setSeats(await listSeats());
                  } catch (err) {
                    setError({ message: err instanceof Error ? err.message : "Failed to invite", details: apiErrorDetails(err) });
                  }
                })();
              }}
              className="flex gap-2 mb-2"
            >
              <input name="email" placeholder="teammate@example.com" type="email" aria-label="Invite teammate email" style={{ width: 220 }} required />
              <button type="submit" className="btn btn-primary" style={{ whiteSpace: "nowrap" }}>+ Invite</button>
            </form>
            {!seats || seats.seats.length === 0 ? (
              <p className="text-muted text-sm">No team members yet.</p>
            ) : (
              <TableWrap label="Team seats">
                <table>
                  <thead><tr><th>Email</th><th>Role</th><th>Status</th><th>Invited</th><th></th></tr></thead>
                  <tbody>
                    {seats.seats.map((s) => (
                      <tr key={s.seat_id}>
                        <td>{s.email}</td>
                        <td><span className="badge">{s.role}</span></td>
                        <td>{s.revoked_at ? <span className="badge badge-red">Revoked</span> : s.accepted ? <span className="badge badge-green">Active</span> : <span className="badge badge-yellow">Pending</span>}</td>
                        <td>{new Date(s.created_at).toLocaleDateString()}</td>
                        <td>
                          {!s.revoked_at && (
                            <DangerButton
                              label="Revoke"
                              confirmLabel={`Revoke ${s.email}'s seat? They lose access immediately.`}
                              busy={revokingSeatId === s.seat_id}
                              onConfirm={() => void handleRevokeSeat(s.seat_id)}
                            />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            )}
          </>
        )}
      </div>

      {/* Programs */}
      <div className="card">
        <h2 className="mb-2" style={{ fontSize: "1rem", fontWeight: 600 }}>Programs</h2>
        {!canManagePrograms ? (
          <p className="text-muted text-sm">Program management is available on Paid or Suite tiers.</p>
        ) : (
          <TableWrap label="Program entitlements">
            <table>
              <thead><tr><th>Program</th><th>Outputs</th><th>Enabled</th></tr></thead>
              <tbody>
                {programs.map((p) => {
                  const enabled = entitlements.includes(p.name);
                  return (
                    <tr key={p.name}>
                      <td><span className="badge">{p.name}</span></td>
                      <td className="text-xs text-muted">{p.outputs.length} outputs</td>
                      <td>
                        <button
                          ref={(el) => { if (el) programButtonRefs.current.set(p.name, el); else programButtonRefs.current.delete(p.name); }}
                          type="button"
                          className={`btn text-xs ${enabled ? "" : "btn-primary"}`}
                          disabled={programBusy === p.name}
                          onClick={() => void handleToggleProgram(p.name, !enabled)}
                        >
                          {programBusy === p.name ? "Working..." : enabled ? "Disable" : "Enable"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>
        )}
      </div>

      {/* Danger Zone */}
      <div className="card" style={{ borderColor: "var(--red)" }}>
        <h2 className="mb-2" style={{ color: "var(--red)", fontSize: "1rem", fontWeight: 600 }}>Danger Zone</h2>
        <p className="text-muted text-sm mb-2">
          Deletes your API keys, GitHub tokens, webhooks, seats, and every project/snapshot you own immediately —
          this cannot be undone. Billing and dispute records are retained as required for accounting purposes.
        </p>
        <DangerButton
          label="Delete Account"
          confirmLabel="This permanently deletes your projects and access. Are you sure?"
          busy={deletingAccount}
          onConfirm={() => void handleDeleteAccount()}
        />
      </div>
    </div>
  );
}
