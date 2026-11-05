// Key events (2026-11-04): the conversions the estate's onboarding contract (AXIS Launch scripts/estate_onboard.py
// KEY_EVENTS) and conversions ledger name for Axis' Iliad, sent to Google Analytics through Cloudflare Zaraz by
// public/consent.js (window.axisKeyEvent), only when they really happen and never under Global Privacy Control or Do
// Not Track. Send one only from the code path that has the server's confirmation in hand.
//
//   account_created: POST /v1/accounts answered with a new account and its first key (the email sign-up; the API
//                    answers 409 for an address that already has one), and the session was set.

export type KeyEvent = "account_created";

type Sender = (name: KeyEvent) => Promise<unknown> | undefined;

/**
 * Reports a key event and resolves once Zaraz has taken it, or after `waitMs`, whichever is first, so a caller that
 * reloads the page next does not cut the request off. Never throws and never blocks longer than `waitMs`.
 */
export function sendKeyEvent(name: KeyEvent, waitMs = 1500): Promise<void> {
  const send = (window as unknown as { axisKeyEvent?: Sender }).axisKeyEvent;
  if (typeof send !== "function") return Promise.resolve();
  let sent: Promise<unknown>;
  try {
    sent = Promise.resolve(send(name)).catch(() => undefined);
  } catch {
    return Promise.resolve();
  }
  return Promise.race([sent, new Promise((r) => setTimeout(r, waitMs))]).then(() => undefined);
}
