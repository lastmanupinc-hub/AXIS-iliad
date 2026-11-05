// Analytics and consent for iliad.trustfabric.ai (2026-11-04; the estate's pattern, from AXIS Launch's lastmanup.org).
// The hashed inline bootstrap every page carries creates this file (the CSP in _headers trusts that one hash and,
// through 'strict-dynamic', what it creates). It adds Cloudflare Zaraz's loader, which runs Google Analytics 4 behind
// Zaraz's consent box, except for a browser that sends Global Privacy Control or Do Not Track: then nothing loads, no
// box appears and no cookie is set. Zaraz's auto-inject stays off for the zone: an edge-inserted tag is
// parser-inserted, which the policy refuses.
/* global navigator */
(function () {
  var KEY = "axis_key_events";
  function signal() {
    return navigator.globalPrivacyControl === true || navigator.doNotTrack === "1" || window.doNotTrack === "1";
  }
  function pending() {
    try { return JSON.parse(window.sessionStorage.getItem(KEY) || "[]"); } catch { return []; }
  }
  function store(list) {
    try {
      if (list.length) window.sessionStorage.setItem(KEY, JSON.stringify(list));
      else window.sessionStorage.removeItem(KEY);
    } catch { /* storage blocked: nothing is kept */ }
  }
  function ready() {
    return !!(window.zaraz && typeof window.zaraz.track === "function");
  }
  function send(name) {
    var left = pending().filter(function (n) { return n !== name; });
    store(left);
    try { return Promise.resolve(window.zaraz.track(name)); } catch { return Promise.resolve(); }
  }
  function flush() {
    if (!ready()) return;
    pending().forEach(send);
  }

  // A key event (the conversions the estate's KEY_EVENTS name for this site) the app reports when it really happens.
  // It waits in this tab's sessionStorage until the loader has run (a page that reloads right after the event sends it
  // on the next page), and Zaraz holds it until the visitor has answered the box. Nothing is kept or sent under a
  // privacy signal.
  window.axisKeyEvent = function (name) {
    if (signal() || typeof name !== "string" || !name) return Promise.resolve();
    var list = pending();
    if (list.indexOf(name) === -1) list.push(name);
    store(list);
    return ready() ? send(name) : Promise.resolve();
  };

  if (!signal()) {
    var z = document.createElement("script");
    z.src = "/cdn-cgi/zaraz/i.js";
    z.async = true;
    z.referrerPolicy = "origin";
    z.addEventListener("load", flush);
    document.head.appendChild(z);
  } else {
    store([]);
  }
})();

// The "Privacy choices" link at the foot of every page reopens Zaraz's consent box. Where Zaraz is not on the page
// (a GPC or DNT browser, or a blocked script), the link is a plain link to the privacy policy. Capture
// phase, so the app's own link handling never sees the click first.
document.addEventListener("click", function (event) {
  var link = event.target && event.target.closest ? event.target.closest("[data-privacy-choices]") : null;
  if (!link) return;
  if (window.zaraz && window.zaraz.consent) {
    event.preventDefault();
    event.stopPropagation();
    window.zaraz.consent.modal = true;
  }
}, true);
