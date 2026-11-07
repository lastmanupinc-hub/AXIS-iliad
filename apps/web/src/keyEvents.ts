// Key events (2026-11-04): the conversions the estate's onboarding contract (AXIS Launch scripts/estate_onboard.py
// KEY_EVENTS) and conversions ledger name for Axis' Iliad, sent to Google Analytics through Cloudflare Zaraz by
// public/consent.js (window.axisKeyEvent), only when they really happen and never under Global Privacy Control or Do
// Not Track. Send one only from the code path that has the server's confirmation in hand.
//
//   account_created: POST /v1/accounts answered with a new account and its first key (the email sign-up; the API
//                    answers 409 for an address that already has one), and the session was set; or the GitHub or
//                    Google return carried new_account=1, which the API sets only when that sign-in created the
//                    account (AccountPage, taskgate T201).
//   purchase_completed: GET /v1/account reports a succeeded purchase this browser has not counted, within half an
//                    hour of a checkout's success return (purchaseReturn.ts): the plan or credits are on the
//                    account, so the purchase is real; the return URL alone counts nothing.

export type KeyEvent = "account_created" | "purchase_completed";

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
