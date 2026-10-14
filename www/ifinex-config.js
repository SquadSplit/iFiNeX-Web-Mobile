/* iFiNeX v8.7 — runtime configuration + connection mode.  MUST be the FIRST script of every page (before vendor/supabase.js).
   Decides, on every page load:
     • which MODE the app runs in:  'server'  = talks to a Supabase backend described by an ifinex-config.json on a server (GitHub Pages, your own host …)
                                     'standalone' = everything stays on this phone (on-device engine, no network)
     • which backend (url + public key) the server mode uses → window.IFX_CFG
   Website (browser): always 'server'; the backend comes from the ifinex-config.json that sits NEXT TO the pages (so every self-hoster edits one small file).
   Android / iOS app: asks once on first start (start.html); the choice + the server's config are stored on the device.
   Also injects a Content-Security-Policy that allows ONLY this backend (a script injected by an attacker cannot send data anywhere else). */
(function (W, D) {
  'use strict';
  var LEGACY_HOST = 'lznnetxeklmdrykxtsbm.supabase.co';          // the original project keeps its original session-storage name → nobody is logged out by this upgrade
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { } return null; }
  function native() { try { return !!(W.Capacitor && W.Capacitor.isNativePlatform && W.Capacitor.isNativePlatform()); } catch (e) { return false; } }
  function hash(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return ('0000000' + h.toString(16)).slice(-8); }
  function hostOf(u) { try { return new URL(u).host; } catch (e) { return ''; } }
  function jparse(s) { try { return JSON.parse(s); } catch (e) { return null; } }
  function validCfg(c) {
    if (!c || typeof c !== 'object') return false;
    if (typeof c.supabaseUrl !== 'string' || !/^https:\/\/[a-z0-9.-]+(:\d+)?\/?$/i.test(c.supabaseUrl)) return false;
    if (typeof c.supabaseKey !== 'string' || c.supabaseKey.length < 20 || c.supabaseKey.length > 2000 || !/^[A-Za-z0-9._-]+$/.test(c.supabaseKey)) return false;
    return true;
  }

  var isNative = native(), page = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  var onStart = page === 'start.html';
  var mode = ls('ifx_mode');
  if (!isNative && mode !== 'standalone') mode = 'server';       // website = its own server (standalone in a browser only via an explicit stored choice, used by tests)
  if (mode !== 'server' && mode !== 'standalone') mode = null;
  // upgrade from the old cloud-only app (same app id): it already holds a login for the original server → keep using that server, no questions asked
  if (isNative && mode === null) {
    try {
      var had = ls('squadsplit-auth-v1') || Object.keys(localStorage).some(function (k) { return /^ifx_prof_/.test(k); });
      if (had) {
        var xb = new XMLHttpRequest(); xb.open('GET', 'ifinex-config.json', false); xb.send(null);
        var bc = xb.status === 200 ? jparse(xb.responseText) : null;
        if (validCfg(bc)) { ls('ifx_server', JSON.stringify({ format: 'ifinex-server', version: 1, name: bc.name || 'iFiNeX', site: bc.site || '', url: bc.site ? bc.site.replace(/\/*$/, '/') : '', supabaseUrl: bc.supabaseUrl.replace(/\/+$/, ''), supabaseKey: bc.supabaseKey, google: bc.google || null, savedAt: new Date().toISOString() })); ls('ifx_mode', 'server'); mode = 'server'; }
      }
    } catch (e) { }
  }

  var cfg = { mode: mode, native: isNative, name: 'iFiNeX', site: '', supabaseUrl: '', supabaseKey: '', host: '', authKey: 'squadsplit-auth-v1', ok: false, error: '', google: null };

  function fill(c) {
    cfg.name = String(c.name || 'iFiNeX').slice(0, 60); cfg.site = String(c.site || ''); cfg.supabaseUrl = c.supabaseUrl.replace(/\/+$/, ''); cfg.supabaseKey = c.supabaseKey;
    cfg.host = hostOf(cfg.supabaseUrl); cfg.authKey = cfg.host === LEGACY_HOST ? 'squadsplit-auth-v1' : 'ifx-auth-' + hash(cfg.supabaseUrl);
    cfg.google = (c.google && typeof c.google === 'object') ? c.google : null; cfg.ok = true;
  }

  if (mode === 'server') {
    var c = null;
    if (isNative) c = jparse(ls('ifx_server'));
    else {                                                        // website: the config that is deployed next to the pages (sync XHR on purpose: nothing may run before the backend is known)
      try { var x = new XMLHttpRequest(); x.open('GET', 'ifinex-config.json', false); x.send(null); if (x.status === 200) { c = jparse(x.responseText); if (validCfg(c)) ls('ifx_cfg_cache', JSON.stringify(c)); } } catch (e) { }
      if (!validCfg(c)) c = jparse(ls('ifx_cfg_cache'));         // brief network hiccup: last good copy
    }
    if (validCfg(c)) fill(c); else cfg.error = isNative ? 'no_server' : 'This website has no valid ifinex-config.json next to it (see the Self-hosting guide).';
  } else if (mode === 'standalone') {
    cfg.name = 'iFiNeX (this phone)'; cfg.supabaseUrl = 'local://this-device'; cfg.supabaseKey = 'local'; cfg.host = 'this-device'; cfg.authKey = 'ifx-auth-local'; cfg.ok = true;
  }

  // Google Drive backup client: the server may provide one; otherwise the one that ships with this app (bundled ifinex-config.json)
  if (isNative && cfg.ok && !(cfg.google && cfg.google.clientId)) {
    try { var xg = new XMLHttpRequest(); xg.open('GET', 'ifinex-config.json', false); xg.send(null); var bg = xg.status === 200 ? jparse(xg.responseText) : null; if (bg && bg.google && bg.google.clientId) cfg.google = bg.google; } catch (e) { }
  }

  W.IFX_CFG = cfg;

  // ---- native app, nothing chosen yet (or server mode without a stored server) → the chooser. Stop this page completely. ----
  if (isNative && !onStart && (mode === null || (mode === 'server' && !cfg.ok))) {
    cfg.redirecting = true; cfg.supabaseUrl = 'https://placeholder.invalid'; cfg.supabaseKey = 'placeholder-placeholder-placeholder';   // harmless values so the page scripts that still load do not crash; the pages' boot code checks cfg.redirecting and does nothing
    try { D.write('<style>html{background:#0b0b18}body{display:none}</style>'); } catch (e) { }
    location.replace('start.html');
    return;
  }
  if (!cfg.ok) { cfg.supabaseUrl = cfg.supabaseUrl || 'https://placeholder.invalid'; cfg.supabaseKey = cfg.supabaseKey || 'placeholder-placeholder-placeholder'; }

  // ---- Content-Security-Policy tightened to exactly this backend (the static policy in each page is the loose baseline; policies combine = the strictest wins) ----
  try {
    var origin = cfg.ok && mode === 'server' ? cfg.supabaseUrl : '';
    var ws = origin ? origin.replace(/^https:/, 'wss:') : '';
    var gcfg = cfg.google && cfg.google.clientId;
    var goog = gcfg ? ' https://accounts.google.com https://oauth2.googleapis.com https://www.googleapis.com' : '';
    if (!onStart) {
      var csp = "connect-src 'self' " + origin + ' ' + ws + goog + "; img-src 'self' data: blob: " + origin + ';';
      D.write('<meta http-equiv="Content-Security-Policy" content="' + csp.replace(/"/g, '') + '">');
    }
  } catch (e) { }

  // ---- helpers for the chooser / connection screen / sign-out hygiene ----
  W.IFX_MODE = {
    // forget everything that belongs to ONE backend (caches keyed by e-mail would otherwise leak from server A into server B)
    purgeCaches: function () {
      try { Object.keys(localStorage).forEach(function (k) { if (/^(ifx_prof_|ifx_bt_|ifx_sqcache_)/.test(k) || k === 'sq_members_v2') localStorage.removeItem(k); }); } catch (e) { }
      try { sessionStorage.clear(); } catch (e) { }
    },
    useServer: function (c, serverUrl) {
      if (!validCfg(c)) throw new Error('bad_config');
      var prev = jparse(ls('ifx_server')); if (!prev || prev.supabaseUrl !== c.supabaseUrl || ls('ifx_mode') !== 'server') this.purgeCaches();
      var keep = { format: 'ifinex-server', version: 1, name: String(c.name || 'iFiNeX').slice(0, 60), site: String(c.site || serverUrl || ''), url: serverUrl || c.site || '', supabaseUrl: c.supabaseUrl.replace(/\/+$/, ''), supabaseKey: c.supabaseKey, google: c.google || null, savedAt: new Date().toISOString() };
      ls('ifx_server', JSON.stringify(keep)); ls('ifx_mode', 'server');
      if (keep.google && keep.google.clientId) ls('ifx_google_cfg', JSON.stringify(keep.google));
    },
    useStandalone: function () { this.purgeCaches(); ls('ifx_mode', 'standalone'); },
    forget: function () { ls('ifx_mode', null); },
    valid: validCfg, host: hostOf
  };
})(window, document);
