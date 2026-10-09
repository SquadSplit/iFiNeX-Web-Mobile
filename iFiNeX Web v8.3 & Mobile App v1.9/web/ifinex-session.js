/* ============================================================================
   iFiNeX persistent login (v8.3) — shared by index.html and bill-tracker.html
   Problem fixed: the app showed the login page on every open.
   Root causes found in the old code:
     1. Any transient error at start-up (slow radio after a cold start, a failed lookup) fell through to the
        login screen (or the "not registered" screen) even though a valid session existed.
     2. The session lived in ONE place only (WebView localStorage). If the WebView store was evicted/reset the
        user was silently logged out.
     3. The "which account am I managing" choice lived in sessionStorage, which Android wipes when the app is killed.
   What this file does:
     - IFX_AUTH_STORAGE: a storage adapter for supabase-js that writes the session to THREE places
       (localStorage, IndexedDB, and native Preferences when the Capacitor plugin is installed) and reads from
       whichever still has it. Only an explicit logout (signOut -> removeItem) clears all three.
     - ifxRestoreSession(sb): returns {session} | {none:true} (really logged out) | {offline:true} (could not reach
       the server — the stored session is KEPT and the page shows a Retry screen instead of the login form).
   ============================================================================ */
(function () {
  'use strict';
  var W = window;
  var KEY = 'squadsplit-auth-v1';           // legacy name kept on purpose: renaming would log everybody out
  var IDB_NAME = 'ifinex-auth', IDB_STORE = 'kv';

  function prefs() {
    try { return (W.Capacitor && W.Capacitor.isNativePlatform && W.Capacitor.isNativePlatform() && W.Capacitor.Plugins && W.Capacitor.Plugins.Preferences) || null; }
    catch (e) { return null; }
  }
  function idb() {
    return new Promise(function (ok) {
      try {
        var r = indexedDB.open(IDB_NAME, 1);
        r.onupgradeneeded = function () { r.result.createObjectStore(IDB_STORE); };
        r.onsuccess = function () { ok(r.result); };
        r.onerror = function () { ok(null); };
      } catch (e) { ok(null); }
    });
  }
  function idbOp(mode, fn) {
    return idb().then(function (db) {
      if (!db) return null;
      return new Promise(function (ok) {
        try {
          var tx = db.transaction(IDB_STORE, mode), st = tx.objectStore(IDB_STORE), req = fn(st);
          tx.oncomplete = function () { ok(req && 'result' in req ? req.result : null); db.close(); };
          tx.onerror = tx.onabort = function () { ok(null); try { db.close(); } catch (e) {} };
        } catch (e) { ok(null); }
      });
    });
  }
  async function get(k) {
    var v = null;
    try { v = localStorage.getItem(k); } catch (e) {}
    if (v == null) { var P = prefs(); if (P) { try { v = (await P.get({ key: k })).value; } catch (e) {} } }
    if (v == null) { try { v = await idbOp('readonly', function (s) { return s.get(k); }); } catch (e) {} }
    if (v != null) { try { if (localStorage.getItem(k) == null) localStorage.setItem(k, v); } catch (e) {} }
    return v == null ? null : v;
  }
  async function set(k, v) {
    try { localStorage.setItem(k, v); } catch (e) {}
    var P = prefs(); if (P) { try { await P.set({ key: k, value: v }); } catch (e) {} }
    try { await idbOp('readwrite', function (s) { return s.put(v, k); }); } catch (e) {}
  }
  async function del(k) {
    try { localStorage.removeItem(k); } catch (e) {}
    var P = prefs(); if (P) { try { await P.remove({ key: k }); } catch (e) {} }
    try { await idbOp('readwrite', function (s) { return s.delete(k); }); } catch (e) {}
  }
  W.IFX_AUTH_STORAGE = { getItem: get, setItem: set, removeItem: del };
  W.IFX_AUTH_KEY = KEY;

  // show the splash immediately (before the login form can flash) when this device holds a saved session
  document.addEventListener('DOMContentLoaded', function () { try { if (localStorage.getItem(KEY)) W.ifxBootSplash(); } catch (e) {} });

  // Small helpers for values that must survive an app kill (replaces sessionStorage for the managed-account choice)
  W.ifxKeep = {
    get: function (k) { try { return localStorage.getItem('ifx_' + k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem('ifx_' + k, v); } catch (e) {} },
    del: function (k) { try { localStorage.removeItem('ifx_' + k); } catch (e) {} },
    clearAll: function () { try { Object.keys(localStorage).filter(function (x) { return x.indexOf('ifx_keep_') === 0 || x.indexOf('ifx_bt_') === 0; }).forEach(function (x) { localStorage.removeItem(x); }); } catch (e) {} }
  };

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  // "fatal" = the server clearly says this refresh token is dead; anything else (network, 5xx, timeout) is transient
  function isFatal(err) {
    if (!err) return false;
    var m = String(err.message || err).toLowerCase(), s = err.status;
    if (/failed to fetch|network|timeout|load failed|fetch/.test(m)) return false;
    if (s === 400 || s === 401 || s === 403) return true;
    return /invalid refresh token|refresh_token_not_found|refresh token not found|already used|session_not_found|invalid_grant/.test(m);
  }
  W.ifxIsFatalAuth = isFatal;

  function overlay(html) {
    var el = document.getElementById('ifx-boot');
    if (!el) {
      el = document.createElement('div'); el.id = 'ifx-boot';
      el.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:#0b0b18;color:#e8ecff;font-family:Nunito,system-ui,sans-serif;text-align:center;padding:24px;';
      document.body.appendChild(el);
    }
    el.innerHTML = html; return el;
  }
  W.ifxBootHide = function () { var el = document.getElementById('ifx-boot'); if (el) el.remove(); };
  W.ifxBootSplash = function (msg) {
    overlay('<img src="assets/ifinex-emblem-192.png" alt="" style="width:92px;height:92px;border-radius:50%;animation:ifxpulse 1.3s ease-in-out infinite;">' +
      '<div style="font-weight:800;font-size:.95rem;">' + (msg || 'Restoring your session…') + '</div>' +
      '<style>@keyframes ifxpulse{0%,100%{transform:scale(1);opacity:.85}50%{transform:scale(1.08);opacity:1}}</style>');
  };
  W.ifxBootOffline = function (retry, why) {
    var el = overlay('<img src="assets/ifinex-emblem-192.png" alt="" style="width:80px;height:80px;border-radius:50%;opacity:.8;">' +
      '<div style="font-weight:800;font-size:1rem;">Can\'t reach the server</div>' +
      '<div style="font-size:.8rem;opacity:.75;max-width:300px;">You are still signed in. Check your internet connection and try again — you will NOT have to log in again.</div>' +
      (why ? '<div style="font-size:.66rem;opacity:.5;max-width:300px;word-break:break-word;"></div>' : '') +
      '<button id="ifx-boot-retry" style="margin-top:6px;padding:12px 26px;border-radius:12px;border:0;font-weight:800;background:linear-gradient(135deg,#4D96FF,#B06AFF);color:#fff;font-size:.9rem;">Try again</button>');
    if (why) { var d = el.querySelectorAll('div'); d[d.length - 1].textContent = String(why).slice(0, 160); }
    document.getElementById('ifx-boot-retry').onclick = function () { W.ifxBootSplash('Reconnecting…'); retry(); };
  };

  // Returns { session } | { none:true } | { offline:true, error }
  W.ifxRestoreSession = async function (sb) {
    var lastErr = null;
    for (var attempt = 0; attempt < 4; attempt++) {
      try {
        var r = await sb.auth.getSession();
        if (r && r.data && r.data.session) return { session: r.data.session };
        if (r && r.error && !isFatal(r.error)) throw r.error;
        var raw = await get(KEY);                       // getSession() said "no session": is there really nothing stored?
        if (!raw) return { none: true };
        var tok = null; try { tok = JSON.parse(raw); } catch (e) {}
        if (!tok || !tok.refresh_token) { await del(KEY); return { none: true }; }
        var rr = await sb.auth.refreshSession({ refresh_token: tok.refresh_token });
        if (rr && rr.data && rr.data.session) return { session: rr.data.session };
        if (rr && rr.error) { if (isFatal(rr.error)) { await del(KEY); return { none: true }; } throw rr.error; }
        throw new Error('session not ready');
      } catch (e) {
        lastErr = e;
        if (isFatal(e)) { await del(KEY); return { none: true }; }
        await sleep(500 * Math.pow(2, attempt));       // 0.5s, 1s, 2s, 4s
      }
    }
    return { offline: true, error: lastErr };
  };
})();
