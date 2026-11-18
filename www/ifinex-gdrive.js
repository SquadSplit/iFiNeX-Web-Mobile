/* iFiNeX v9.4 — Server mode now uses MANAGED Drive backup (Google account chooser + scheduled server-side backups, see the v9.4 block below); the device-code flow below is kept for STANDALONE mode.
   iFiNeX v8.7 — Google Drive backup (optional).  Settings ☰ → 💾 Backup & Restore → ☁️ Google Drive backup
   • Stores backups in the HIDDEN app-data folder of the user's OWN Google Drive (scope drive.appdata — the app can see nothing else in Drive, and the user cannot clutter/see the files in "My Drive").
   • Sign-in uses Google's "device code" flow (works the same on Android, iOS and in a browser, no Google SDK, no embedded sign-in page): the app shows a short code, the user approves it on google.com/device.
   • Standalone mode: backup AND restore (full).  Server mode (v8.8): backup AND restore — restore only re-adds MISSING rows through the ifx_restore_rows database function (never overwrites).
   • Needs a Google "TVs and Limited Input devices" OAuth client (id + secret) in ifinex-config.json → "google": {clientId, clientSecret}. Without it the screen explains what is missing. Nothing else in the app changes.
   • The only network addresses used: oauth2.googleapis.com (sign-in) and www.googleapis.com (Drive). Tokens stay on this device. */
/* v14.0 — STANDALONE: Google sign-in on first run (restore the latest backup or start fresh), a DAILY backup at 12:00 AM (the Android app does it even when closed
   through the native IfinexBackup job; the web layer writes a snapshot file for it), "Restore latest backup" any time, 14 daily copies are kept. */
(function (W, D) {
  'use strict';
  var C = W.IFX_CFG || {}, G = C.google || null;
  var LSK = 'ifx_gd', LAST = 'ifx_gd_last', AUTO = 'ifx_gd_auto', DAYK = 'ifx_gd_day', HASHK = 'ifx_gd_hash';
  var SCOPE = 'openid email https://www.googleapis.com/auth/drive.appdata';
  var OAUTH = 'https://oauth2.googleapis.com', DRIVE = 'https://www.googleapis.com';
  var MAX_KEEP = 10, MAX_UPLOAD = 4.8 * 1048576;
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { } return null; }
  function jp(s) { try { return JSON.parse(s); } catch (e) { return null; } }
  function configured() { return !!(G && G.clientId && G.clientSecret && /^[\w.-]+\.apps\.googleusercontent\.com$/.test(G.clientId)); }
  function tok() { return jp(ls(LSK)) || null; }
  function native() { return !!C.native; }
  function say(m) { try { (W.toast || W.showToast)(m); } catch (e) { alert(m); } }
  function pad(x) { return String(x).padStart(2, '0'); }
  function when(iso) { var d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function mb(n) { n = +n || 0; return n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'; }

  // ---------- Google OAuth (device flow) ----------
  function form(o) { return Object.keys(o).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(o[k]); }).join('&'); }
  async function post(url, o) {                                // native: Capacitor's HTTP plugin (no browser CORS rules) · browser: fetch
    var body = form(o), N = W.Capacitor && W.Capacitor.Plugins && W.Capacitor.Plugins.CapacitorHttp;
    if (native() && N && N.request) {
      var r = await N.request({ url: url, method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, data: body });
      var d = typeof r.data === 'string' ? (jp(r.data) || {}) : (r.data || {}); return { status: r.status, json: d };
    }
    var f = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body, credentials: 'omit' });
    return { status: f.status, json: await f.json().catch(function () { return {}; }) };
  }
  function emailOf(idt) { try { var p = idt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'); return JSON.parse(atob(p + '==='.slice((p.length + 3) % 4))).email || ''; } catch (e) { return ''; } }
  async function startDevice() {
    var r = await post(OAUTH + '/device/code', { client_id: G.clientId, scope: SCOPE });
    if (r.status !== 200 || !r.json.device_code) throw new Error('device_code:' + (r.json.error || r.status));
    return r.json;
  }
  async function pollDevice(d, cancelled, tick) {
    var wait = Math.max(3, +d.interval || 5), until = Date.now() + (+d.expires_in || 300) * 1000;
    while (Date.now() < until) {
      await new Promise(function (ok) { setTimeout(ok, wait * 1000); });
      if (cancelled()) throw new Error('cancelled'); if (tick) tick(Math.max(0, Math.round((until - Date.now()) / 1000)));
      var r = await post(OAUTH + '/token', { client_id: G.clientId, client_secret: G.clientSecret, device_code: d.device_code, grant_type: 'urn:ietf:params:oauth:grant-type:device_code' });
      if (r.status === 200 && r.json.access_token) return r.json;
      var e = r.json.error;
      if (e === 'authorization_pending') continue;
      if (e === 'slow_down') { wait += 5; continue; }
      if (e === 'access_denied') throw new Error('denied');
      throw new Error('token:' + (e || r.status));
    }
    throw new Error('expired');
  }
  function saveTokens(j, prev) {
    var t = { access: j.access_token, exp: Date.now() + (+j.expires_in || 3000) * 1000 - 60000, refresh: j.refresh_token || (prev && prev.refresh) || '', email: (j.id_token ? emailOf(j.id_token) : '') || (prev && prev.email) || '' };
    ls(LSK, JSON.stringify(t)); setTimeout(syncNative, 50); return t;
  }
  async function access() {
    var t = tok(); if (!t || !t.refresh) throw new Error('not_connected');
    if (t.access && t.exp > Date.now()) return t.access;
    var r = await post(OAUTH + '/token', { client_id: G.clientId, client_secret: G.clientSecret, refresh_token: t.refresh, grant_type: 'refresh_token' });
    if (r.status !== 200 || !r.json.access_token) { if (r.json.error === 'invalid_grant') { ls(LSK, null); throw new Error('not_connected'); } throw new Error('refresh:' + (r.json.error || r.status)); }
    return saveTokens(r.json, t).access;
  }
  async function disconnect() {
    var t = tok(); ls(LSK, null); ls(DAYK, null); ls(HASHK, null); try { var nb = nat(); if (nb) await nb.configure({ enabled: false }); } catch (e0) { }
    try { if (t && (t.refresh || t.access)) await post(OAUTH + '/revoke', { token: t.refresh || t.access }); } catch (e) { }
  }

  // ---------- Drive (appDataFolder) ----------
  async function gz(str) {
    var cs = new CompressionStream('gzip'), w = cs.writable.getWriter(); w.write(new TextEncoder().encode(str)); w.close();
    return new Uint8Array(await new Response(cs.readable).arrayBuffer());
  }
  async function gunzip(buf) {
    var ds = new DecompressionStream('gzip'), w = ds.writable.getWriter(); w.write(buf); w.close();
    return new TextDecoder().decode(await new Response(ds.readable).arrayBuffer());
  }
  async function dget(path, tk, asText) {
    var r = await fetch(DRIVE + path, { headers: { Authorization: 'Bearer ' + tk }, credentials: 'omit' });
    if (r.status === 401) throw new Error('not_connected'); if (!r.ok) throw new Error('drive_' + r.status);
    return asText === 'buf' ? new Uint8Array(await r.arrayBuffer()) : r.json();
  }
  async function list(prefix) {
    var tk = await access();
    var j = await dget('/drive/v3/files?spaces=appDataFolder&orderBy=createdTime%20desc&pageSize=60&fields=' + encodeURIComponent('files(id,name,size,createdTime)'), tk);
    return (j.files || []).filter(function (f) { return !prefix || f.name.indexOf(prefix) === 0; });
  }
  async function upload(name, text) {
    var tk = await access(), mime = 'application/json', bytes = new TextEncoder().encode(text);
    if (bytes.length > MAX_UPLOAD) { bytes = await gz(text); mime = 'application/gzip'; name += '.gz'; }
    if (bytes.length > MAX_UPLOAD) throw new Error('too_big');
    var b = 'ifxb' + Math.random().toString(36).slice(2), enc = new TextEncoder();
    var head = enc.encode('--' + b + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify({ name: name, parents: ['appDataFolder'] }) + '\r\n--' + b + '\r\nContent-Type: ' + mime + '\r\n\r\n'), tail = enc.encode('\r\n--' + b + '--');
    var all = new Uint8Array(head.length + bytes.length + tail.length); all.set(head, 0); all.set(bytes, head.length); all.set(tail, head.length + bytes.length);
    var r = await fetch(DRIVE + '/upload/drive/v3/files?uploadType=multipart&fields=id,name,size,createdTime', { method: 'POST', headers: { Authorization: 'Bearer ' + tk, 'Content-Type': 'multipart/related; boundary=' + b }, body: all, credentials: 'omit' });
    if (r.status === 401) throw new Error('not_connected'); if (!r.ok) throw new Error('drive_' + r.status);
    return r.json();
  }
  async function prune(prefix) {
    try { var fs = await list(prefix), tk = await access(); for (var i = (C.mode === 'standalone' ? 14 : MAX_KEEP); i < fs.length; i++) await fetch(DRIVE + '/drive/v3/files/' + encodeURIComponent(fs[i].id), { method: 'DELETE', headers: { Authorization: 'Bearer ' + tk }, credentials: 'omit' }); } catch (e) { }
  }
  async function fetchBackup(id, name) {
    var tk = await access(), buf = await dget('/drive/v3/files/' + encodeURIComponent(id) + '?alt=media', tk, 'buf');
    var text = /\.gz$/.test(name || '') ? await gunzip(buf) : new TextDecoder().decode(buf);
    return JSON.parse(text);
  }

  // ---------- what gets backed up ----------
  var BT = ['bill_cards', 'bill_card_shares', 'bill_card_payments', 'bill_expenses', 'bill_owed', 'bill_settlements', 'bill_payees', 'bill_payee_entries', 'bill_plans', 'bill_plan_payments', 'bill_user_prefs', 'et_trackers', 'et_entries', 'et_categories', 'et_kinds', 'bp_income', 'bp_items', 'bp_goals'];
  var SQ = ['members_config', 'expenses', 'settlements', 'prev_balances'];
  var P = {
    standalone: function () {
      var L = W.IFX_LOCAL; return { key: 'standalone', title: 'Standalone backup', canRestore: !!L, ready: !!L,
        make: function () { return L.exportAll(); },
        count: function (o) { return Object.keys(o.tables || {}).reduce(function (t, k) { return t + o.tables[k].length; }, 0); },
        valid: function (o) { return L.validate(o); },
        restore: async function (o) { await L.importAll(o); } };
    },
    server: function () {
      var R = W.ifxBR;   // v8.8: the same paged backup + restore-missing-rows engine as the file backup (ifinex-backup.js)
      return { key: 'server', title: 'Server backup', canRestore: !!R, ready: typeof sb !== 'undefined' && !!R,
        make: function () { return R.make({ scope: 'account' }); },
        count: function (o) { return R.count(o); },
        valid: function (o) { return R.validate(o); },
        restoreNote: 'Only MISSING records are added back to the server. Nothing existing is changed or deleted.',
        restore: async function (o) { var rep = await R.restore(o); try { alert(R.reportText(rep)); } catch (e) { } } };
    }
  };
  function provider() { return C.mode === 'standalone' ? P.standalone() : P.server(); }
  function fname(p) { var d = new Date(); return 'iFiNeX-' + p.key + '-' + d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + '_' + pad(d.getHours()) + pad(d.getMinutes()) + '.json'; }
  async function backupNow(quiet) {
    var p = provider(); if (!p.ready) throw new Error('not_ready');
    var o = await p.make(), n = p.count(o);
    var f = await upload(fname(p), JSON.stringify(o));
    ls(LAST, new Date().toISOString()); ls(DAYK, dayKey()); if (C.mode === 'standalone') ls(HASHK, dataHash(o)); prune('iFiNeX-' + p.key + '-');
    return { file: f, records: n };
  }

  // ================= v14.0 · standalone: daily 12:00 AM backup · restore latest · first-run Google sign-in =================
  var fnv = function (t) { var h = 2166136261; for (var i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h.toString(16); };
  function dayKey(d) { d = d || new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function dataHash(o) { var t = JSON.stringify([o.tables, o.blobs, o.settings]); return fnv(t) + '-' + t.length; }   // the time stamp inside the backup is left out on purpose
  function nat() { try { return (W.Capacitor && W.Capacitor.Plugins && W.Capacitor.Plugins.IfinexBackup) || null; } catch (e) { return null; } }
  var snapHash = '';
  async function writeSnap() {   // the native midnight job uploads THIS file (the app is closed at midnight, so it cannot read the on-device database itself)
    var n = nat(); if (!n || C.mode !== 'standalone' || !W.IFX_LOCAL || !(tok() || {}).refresh) return false;
    try { var o = await W.IFX_LOCAL.exportAll(), h = dataHash(o); if (h === snapHash) return true; await n.writeSnapshot({ data: JSON.stringify(o) }); snapHash = h; return true; } catch (e) { return false; }
  }
  var syncing = false;
  async function syncNative() {
    var n = nat(); if (!n || C.mode !== 'standalone' || syncing) return; syncing = true;
    try { var t = tok(); if (t && t.refresh && configured() && ls(AUTO) !== '0') { await n.configure({ enabled: true, clientId: G.clientId, clientSecret: G.clientSecret, refreshToken: t.refresh, email: t.email || '' }); await writeSnap(); } else await n.configure({ enabled: false }); } catch (e) { }
    syncing = false;
  }
  async function nativeStatus() { var n = nat(); if (!n) return null; try { return await n.status(); } catch (e) { return null; } }
  /* once per calendar day: on the phone the native job does it at about 12:00 AM; this runs the same thing as a catch-up when the app is opened, and as a timer if the app is open at midnight */
  async function dailyRun() {
    try {
      if (C.mode !== 'standalone' || !configured() || ls(AUTO) === '0' || !(tok() || {}).refresh) return;
      var today = dayKey(), n = nat(), L = W.IFX_LOCAL; if (!L) return;
      if (n) {
        var st = await nativeStatus(); await writeSnap();
        if (st && st.lastDay === today) return;
        if (n.runNow) await n.runNow(); return;
      }
      if (ls(DAYK) === today) return;
      var c = await L.counts(), cnt = Object.keys(c).reduce(function (t, k) { return t + (c[k] || 0); }, 0); if (cnt < 3) { ls(DAYK, today); return; }
      var p = provider(), o = await p.make(); if (dataHash(o) === ls(HASHK)) { ls(DAYK, today); return; }
      await upload(fname(p), JSON.stringify(o)); ls(LAST, new Date().toISOString()); ls(DAYK, today); ls(HASHK, dataHash(o)); prune('iFiNeX-' + p.key + '-');
    } catch (e) { /* silent: offline or access removed — it is tried again the next time the app opens */ }
  }
  var dailyArmed = false;
  function armMidnight() {
    var now = new Date(), nxt = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 20 + Math.floor(Math.random() * 40));
    setTimeout(function () { dailyRun().then(armMidnight, armMidnight); }, Math.min(2147000000, nxt - now));
  }
  function startDaily() {
    if (C.mode !== 'standalone' || dailyArmed) return; dailyArmed = true;
    syncNative(); dailyRun(); armMidnight();
    setInterval(writeSnap, 5 * 60000);
    D.addEventListener('visibilitychange', function () { if (D.hidden) writeSnap(); });
    W.addEventListener('pagehide', function () { writeSnap(); });
  }
  function markSetup() { try { localStorage.setItem('ifx_sa_setup', '1'); } catch (e) { } }

  // the Google device-code sign-in (shared by Settings and the first-run welcome)
  async function deviceConnect(area, onOk, onCancel) {
    area.textContent = ''; var msg = line(area, 'Contacting Google…');
    try {
      var d = await startDevice(); msg.textContent = '';
      line(area, '1) Open this page on this phone (or any device):'); area.appendChild(btn(d.verification_url || 'google.com/device', false, function () { try { W.open(d.verification_url || 'https://www.google.com/device', '_blank'); } catch (e) { } }));
      line(area, '2) Enter this code and approve:'); area.appendChild(el('div', 'font-size:1.7rem;font-weight:900;letter-spacing:3px;text-align:center;background:var(--card2,rgba(255,255,255,.06));border-radius:12px;padding:12px;', d.user_code));
      area.appendChild(btn('Copy code', false, function () { try { navigator.clipboard.writeText(d.user_code); say('Code copied'); } catch (e) { } }));
      var wait = line(area, 'Waiting for your approval…', 'color:var(--muted,#9aa3c7);font-size:.76rem'); area.appendChild(btn('Cancel', false, function () { cancelFlag = true; if (onCancel) onCancel(); }));
      var j = await pollDevice(d, function () { return cancelFlag; }, function (sec) { wait.textContent = 'Waiting for your approval… ' + Math.floor(sec / 60) + ':' + pad(sec % 60) + ' left'; });
      saveTokens(j, null); say('Google connected ✓'); if (onOk) onOk();
    } catch (e) { if (/cancelled/.test(String(e && e.message))) return; area.textContent = ''; line(area, '❌ ' + human(e), 'color:#FF6B6B'); area.appendChild(btn('Try again', true, function () { cancelFlag = false; deviceConnect(area, onOk, onCancel); })); }
  }
  async function doRestore(o, p) { await p.restore(o); if (C.mode === 'standalone') markSetup(); say('Restored ✓ — reloading…'); setTimeout(function () { location.reload(); }, 900); }
  /* "your latest backup": shows when it was made and how much it holds, then restore / choose another / (first run) start fresh */
  async function latestPanel(box, p, o) {
    o = o || {}; var st = line(box, 'Looking for your latest backup in Google Drive…', 'color:var(--muted,#9aa3c7)');
    var fresh = function () { if (o.onFresh) o.onFresh(); else open(); };
    try {
      var fs = await list('iFiNeX-' + p.key + '-');
      if (!fs.length) { st.textContent = o.welcome ? 'No earlier backup found on this Google account — you are starting fresh. Your data will be backed up here every night at 12:00 AM.' : 'No backup in Google Drive yet.'; box.appendChild(btn(o.welcome ? 'Start fresh' : 'Back', true, fresh)); return; }
      var f = fs[0], b = await fetchBackup(f.id, f.name), err = p.valid(b); if (err) throw new Error(err);
      st.textContent = ''; line(box, '✅ Latest backup found', 'font-weight:800'); line(box, 'Made: ' + when(b.exported_at || f.createdTime) + ' · ' + p.count(b) + ' records · ' + mb(f.size), '');
      box.appendChild(btn('⬇ Restore this latest backup', true, async function () {
        if (!o.welcome && !confirm('Restore the latest backup?\n\nMade: ' + when(b.exported_at || f.createdTime) + '\nRecords: ' + p.count(b) + '\n\nEverything currently on this phone will be REPLACED.')) return;
        this.disabled = true; this.textContent = 'Restoring…'; try { await doRestore(b, p); } catch (e) { st.textContent = '❌ ' + human(e); st.style.color = '#FF6B6B'; this.disabled = false; this.textContent = '⬇ Restore this latest backup'; }
      }));
      box.appendChild(btn('Choose an older backup…', false, function () { restoreScreen(p, o); }));
      box.appendChild(btn(o.welcome ? 'Start fresh instead (keep Google connected)' : 'Back', false, fresh));
    } catch (e) { st.textContent = '❌ ' + human(e); st.style.color = '#FF6B6B'; box.appendChild(btn(o.welcome ? 'Start fresh' : 'Back', false, fresh)); }
  }
  async function restoreLatest() {
    if (!configured()) { say('Google backup is not switched on in this app yet.'); return; }
    var box = shell(), p = provider();
    if (!(tok() || {}).refresh) { line(box, 'Sign in with Google first — then your latest backup is found automatically.', 'font-weight:700'); var area = el('div'); box.appendChild(area); area.appendChild(btn('Continue with Google', true, function () { deviceConnect(area, function () { restoreLatest(); }, open); })); box.appendChild(btn('Close', false, close)); return; }
    latestPanel(box, p, {});
  }
  /* first run of the standalone app: Continue with Google (restores the latest backup) or start fresh. Resolves 'fresh' | 'skip' (a restore reloads the page). */
  function welcome() {
    return new Promise(function (resolve) {
      if (C.mode !== 'standalone' || !configured()) return resolve('skip');
      var box = shell(), p = provider(), done = function (r) { welcomeRes = null; close(); resolve(r); }; welcomeRes = resolve;
      var head = box.firstChild; if (head && head.firstChild) head.firstChild.textContent = '👋 Welcome to iFiNeX';
      var body = el('div'); box.appendChild(body);
      var start = function () {
        cancelFlag = false; body.textContent = '';
        line(body, 'New phone, reinstalled, or the first time?', 'font-weight:800');
        line(body, 'Continue with Google: if you used iFiNeX before, your latest backup comes back. Either way, your data is then backed up to your own Google Drive every night at 12:00 AM.', 'color:var(--muted,#9aa3c7);font-size:.78rem');
        body.appendChild(btn('Continue with Google', true, function () {
          var area = el('div'); body.textContent = ''; body.appendChild(area);
          deviceConnect(area, function () { body.textContent = ''; latestPanel(body, p, { welcome: true, onFresh: function () { done('fresh'); } }); }, start);
        }));
        body.appendChild(btn('Start fresh without Google', false, function () { done('skip'); }));
        line(body, 'You can connect Google later: ☰ → Backup & Restore → Google Drive.', 'color:var(--muted,#9aa3c7);font-size:.72rem');
      };
      start();
    });
  }

  // ---------- UI ----------
  var ov = null, cancelFlag = false;
  function el(t, css, txt) { var n = D.createElement(t); if (css) n.style.cssText = css; if (txt != null) n.textContent = txt; return n; }
  function btn(label, primary, fn, danger) {
    var b = el('button', 'width:100%;padding:13px;border-radius:12px;margin-top:8px;font-weight:800;font-size:.9rem;cursor:pointer;border:1px solid var(--border,rgba(255,255,255,.2));' + (primary ? 'background:var(--accent,#4d96ff);color:#fff;border-color:transparent;' : 'background:var(--card2,rgba(255,255,255,.06));color:' + (danger ? '#FF6B6B' : 'var(--text,inherit)') + ';'), label);
    b.addEventListener('click', fn); return b;
  }
  var quiet = false, welcomeRes = null;
  function close() { cancelFlag = true; if (ov) { ov.remove(); ov = null; } if (!quiet && welcomeRes) { var r = welcomeRes; welcomeRes = null; r('skip'); } }
  function line(box, t, css) { var d = el('div', 'font-size:.82rem;line-height:1.5;margin:10px 0;' + (css || ''), t); box.appendChild(d); return d; }
  function shell() {
    quiet = true; close(); quiet = false; cancelFlag = false;
    ov = el('div', 'position:fixed;inset:0;z-index:9910;background:rgba(0,0,0,.6);display:flex;align-items:flex-end;justify-content:center;');
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    var box = el('div', 'width:min(520px,100%);max-height:90vh;overflow:auto;background:var(--card,#151528);color:var(--text,#e8ecff);border:1px solid var(--border,rgba(255,255,255,.15));border-radius:22px 22px 0 0;padding:16px 16px calc(18px + env(safe-area-inset-bottom,0px));box-sizing:border-box;');
    box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true');
    var h = el('div', 'display:flex;justify-content:space-between;align-items:center;font-weight:900;font-size:1.05rem;'); h.appendChild(el('span', '', '☁️ Google Drive backup'));
    var x = el('button', 'background:none;border:0;color:inherit;font-size:1.2rem;cursor:pointer;', '✕'); x.setAttribute('aria-label', 'Close'); x.addEventListener('click', close); h.appendChild(x); box.appendChild(h);
    ov.appendChild(box); D.body.appendChild(ov); return box;
  }
  function human(e) {
    var m = String((e && e.message) || e);
    if (/not_connected/.test(m)) return 'Google is not connected (or access was removed). Connect again.';
    if (/too_big/.test(m)) return 'This backup is too large to send from the app. Use “Create backup file” instead.';
    if (/denied/.test(m)) return 'Google access was declined.';
    if (/expired/.test(m)) return 'The code expired. Start again.';
    if (/Failed to fetch|NetworkError|network|timeout/i.test(m)) return 'No connection to Google right now. Check your internet and try again.';
    if (/device_code:invalid_client|token:invalid_client/.test(m)) return 'Google rejected this app’s client settings (invalid_client). The server owner must check the Google client id/secret.';
    if (/drive_403/.test(m)) return 'Google Drive refused access (403). Is the Google Drive API enabled for the owner’s Google project?';
    return 'Problem: ' + m;
  }


  // ================= v9.4 · MANAGED Google Drive (server mode: website + app connected to a server) =================
  // Sign in with Google's own account chooser → the SERVER (edge function gdrive-backup) keeps an encrypted refresh token, creates the
  // backup files itself and runs the schedule (daily / weekly / monthly / custom) even when the app is closed.  The phone/browser never
  // sees a Google token.  Scope: drive.file (the app only sees the "iFiNeX Backups" folder it created).
  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  function sbc() { try { return W.sb || (typeof sb !== 'undefined' ? sb : null); } catch (e) { return null; } }
  function useManaged() { return C.mode === 'server' && !!sbc() && !!C.supabaseUrl; }
  function fnUrl(path) { return String(C.supabaseUrl).replace(/\/+$/, '') + '/functions/v1/gdrive-backup' + path; }
  async function call(path, body) {
    var s = sbc(), ses = await s.auth.getSession(), jwt = ses && ses.data && ses.data.session && ses.data.session.access_token;
    if (!jwt) return { status: 401, j: { error: 'not_signed_in' }, text: '' };
    var r = await fetch(fnUrl(path), { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + jwt, apikey: C.supabaseKey || '' }, body: JSON.stringify(body || {}) });
    var text = await r.text(), j = null; try { j = JSON.parse(text); } catch (e) { j = {}; }
    return { status: r.status, j: j, text: text };
  }
  async function mStatus() {
    var r = await sbc().rpc('gdrive_status');
    if (r.error) { var e = new Error(r.error.message || 'status'); e.missing = /does not exist|schema cache|Could not find/i.test(r.error.message || ''); throw e; }
    if (!r.data || typeof r.data !== 'object') { var e2 = new Error('no_status'); e2.missing = true; throw e2; }
    return r.data;
  }
  function tzName() { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch (e) { return 'UTC'; } }
  function mHuman(code, msg) {
    var m = { not_signed_in: 'Sign in to iFiNeX first.', not_configured: 'Google Drive backup is not finished on the server yet: ' + (msg || 'the owner must complete the Google setup (Setup Guide).'), too_fast: 'Wait a minute before the next backup.', needs_reauth: 'Google asked you to sign in again. Tap “Reconnect”.', not_connected: 'Google Drive is not connected.', bad_interval: 'Custom schedule: hours must be 6–720, days 1–365.', bad_timezone: 'Time zone not known to the server.' };
    return m[code] || (msg || code || 'Something went wrong');
  }
  var HASHMSG = { ok: 'Google Drive connected ✓', err_denied: 'You cancelled the Google sign-in.', err_scope: 'You did not tick the Google Drive permission. Connect again and keep the Drive box ticked.', err_norefresh: 'Google did not allow offline access. Remove “iFiNeX” at myaccount.google.com/permissions and connect again.', err_state: 'The sign-in link expired. Connect again.', err_expired: 'The sign-in took too long. Connect again.', err_token: 'Google refused the sign-in (check the client id/secret on the server).', err_google: 'Google reported an error. Try again.', err_server: 'Server error while connecting. Try again.', err_nocode: 'Google returned no code. Try again.' };
  function field(box, label, node) { var w = el('label', 'display:block;font-size:.76rem;margin:8px 0 0;color:var(--muted,#9aa3c7);'); w.appendChild(D.createTextNode(label)); node.style.cssText += 'display:block;width:100%;box-sizing:border-box;margin-top:4px;padding:10px;border-radius:10px;font-size:.9rem;border:1px solid var(--border,rgba(255,255,255,.2));background:var(--card2,rgba(255,255,255,.06));color:var(--text,#e8ecff);'; w.appendChild(node); box.appendChild(w); return w; }
  function sel(opts, val) { var s = el('select'); opts.forEach(function (o) { var op = D.createElement('option'); op.value = o[0]; op.textContent = o[1]; if (String(o[0]) === String(val)) op.selected = true; s.appendChild(op); }); return s; }
  function num(min, max, val) { var i = el('input'); i.type = 'number'; i.min = min; i.max = max; i.value = val; i.inputMode = 'numeric'; return i; }

  var mTimer = null;
  async function openManaged() {
    var box = shell(), body = el('div'); box.appendChild(body);
    var st = null;
    function stop() { if (mTimer) { clearInterval(mTimer); mTimer = null; } }
    async function load(quiet) {
      try { st = await mStatus(); } catch (e) { if (e.missing) return false; if (!quiet) { body.textContent = ''; line(body, '❌ ' + human(e), 'color:#FF6B6B'); body.appendChild(btn('Close', false, close)); } return null; }
      return true;
    }
    body.appendChild(el('div', 'font-size:.82rem;margin:12px 0;color:var(--muted,#9aa3c7);', 'Loading…'));
    var ok = await load(false); if (ok === false) { close(); return false; } if (ok === null) return true;
    async function startAuth() {
      var r = await call('/start', { return_to: C.native ? '' : String(location.href).split('#')[0] });
      if (!r.j || !r.j.ok) { say(mHuman(r.j && r.j.error, r.j && r.j.message)); return; }
      if (C.native) { try { W.open(r.j.url, '_blank'); } catch (e) { location.href = r.j.url; } say('Finish in the browser, then come back here.'); }
      else location.href = r.j.url;
    }
    function render() {
      body.textContent = '';
      var s = st.settings || {};
      if (!st.connected) {
        line(body, 'Save your data to YOUR Google Drive automatically.', 'font-weight:800');
        line(body, 'Pick your Google account on Google’s own page. After that iFiNeX creates the backup files for you and uploads them to a folder called “iFiNeX Backups” in that Drive — daily, weekly, monthly or on your own schedule, even when the app is closed. The app can only see that folder, nothing else in your Drive. Every iFiNeX user connects their own Google account.', 'color:var(--muted,#9aa3c7);font-size:.76rem');
        body.appendChild(btn('Choose Google account & connect', true, async function () { this.disabled = true; this.textContent = 'Opening Google…'; await startAuth(); this.disabled = false; this.textContent = 'Choose Google account & connect'; }));
        if (C.native) line(body, 'Waiting for you to finish in the browser… this screen updates by itself.', 'color:var(--muted,#9aa3c7);font-size:.74rem');
        body.appendChild(btn('Close', false, close)); return;
      }
      line(body, '✅ Connected: ' + (st.google_email || 'Google account'), 'font-weight:800;margin-bottom:2px');
      if (st.needs_reauth) { line(body, '⚠️ Google asked for a new sign-in. Scheduled backups are paused until you reconnect.', 'color:#FFB020;font-weight:700'); body.appendChild(btn('Reconnect Google', true, startAuth)); }
      var last = line(body, s.last_run_at ? ((s.last_status === 'ok' ? 'Last backup: ' : '❌ Last attempt: ') + when(s.last_run_at) + ' · ' + (s.last_message || '') + (s.last_file_name ? ' · ' + s.last_file_name : '')) : 'No backup made yet.', 'font-size:.76rem;color:' + (s.last_status && s.last_status !== 'ok' ? '#FF6B6B' : 'var(--muted,#9aa3c7)'));
      var now = btn('⬆ Back up to Google Drive now', true, async function () {
        var b = this; b.disabled = true; b.textContent = 'Backing up…';
        try { var r = await call('/backup-now', {}); if (r.j && r.j.ok) { say('Backed up to Google Drive ✓'); await load(true); render(); return; } last.textContent = '❌ ' + mHuman(r.j && r.j.error, r.j && r.j.message); last.style.color = '#FF6B6B'; }
        catch (e) { last.textContent = '❌ ' + human(e); last.style.color = '#FF6B6B'; }
        b.disabled = false; b.textContent = '⬆ Back up to Google Drive now';
      }); body.appendChild(now);

      // ----- schedule -----
      var hd = line(body, '⏰ Automatic backup schedule', 'font-weight:800;margin-top:16px;margin-bottom:0');
      var en = el('label', 'display:flex;gap:8px;align-items:center;font-size:.86rem;margin:8px 0 0;'), cb = el('input'); cb.type = 'checkbox'; cb.checked = !!s.enabled && !st.needs_reauth; en.appendChild(cb); en.appendChild(el('span', '', 'Back up automatically')); body.appendChild(en);
      var fq = sel([['daily', 'Every day'], ['weekly', 'Every week'], ['monthly', 'Every month'], ['custom', 'Custom interval']], s.frequency || 'weekly'); var fqW = field(body, 'How often', fq);
      var tm = el('input'); tm.type = 'time'; tm.value = s.at_time || '03:00'; var tmW = field(body, 'At what time (your local time, ' + tzName() + ')', tm);
      var wd = sel(DAYS.map(function (d, i) { return [i, d]; }), s.weekday == null ? 0 : s.weekday); var wdW = field(body, 'On which day', wd);
      var md = sel(Array.apply(null, Array(28)).map(function (_, i) { return [i + 1, 'Day ' + (i + 1)]; }), s.month_day || 1); var mdW = field(body, 'On which day of the month (1–28 so every month has it)', md);
      var ce = num(1, 720, s.custom_every || 1), cu = sel([['hours', 'hours (6 or more)'], ['days', 'days']], s.custom_unit || 'days'); var cw = el('div', 'display:flex;gap:8px;'); var ceW = field(cw, 'Every', ce), cuW = field(cw, 'Unit', cu); ceW.style.flex = '1'; cuW.style.flex = '2'; body.appendChild(cw);
      var kp = num(1, 60, s.keep_last || 10); var kpW = field(body, 'How many backup files to keep in Drive (older ones are removed)', kp);
      function vis() { var f = fq.value; wdW.style.display = f === 'weekly' ? '' : 'none'; mdW.style.display = f === 'monthly' ? '' : 'none'; cw.style.display = f === 'custom' ? 'flex' : 'none'; tmW.style.display = (f === 'custom' && cu.value === 'hours') ? 'none' : ''; }
      fq.addEventListener('change', vis); cu.addEventListener('change', vis); vis();
      var nx = line(body, s.enabled && s.next_run_at && !st.needs_reauth ? 'Next automatic backup: ' + when(s.next_run_at) : 'Automatic backups are OFF.', 'font-size:.78rem;color:var(--muted,#9aa3c7)');
      body.appendChild(btn('Save schedule', false, async function () {
        var b = this; b.disabled = true;
        var args = function (tz) { return { p_enabled: cb.checked, p_frequency: fq.value, p_at_time: tm.value || '03:00', p_weekday: +wd.value, p_month_day: +md.value, p_custom_every: Math.max(1, +ce.value || 1), p_custom_unit: cu.value, p_tz: tz, p_keep_last: Math.min(60, Math.max(1, +kp.value || 10)) }; };
        var r = await sbc().rpc('gdrive_set_schedule', args(tzName()));
        if (r.error && /bad_timezone/.test(r.error.message || '')) r = await sbc().rpc('gdrive_set_schedule', args('UTC'));
        b.disabled = false;
        if (r.error) { nx.textContent = '❌ ' + mHuman(String(r.error.message || '').replace(/^.*?(bad_\w+|not_\w+).*$/, '$1'), r.error.message); nx.style.color = '#FF6B6B'; return; }
        st = r.data; say(cb.checked ? 'Schedule saved ✓' : 'Automatic backups turned off'); render();
      }));

      // ----- restore / account -----
      body.appendChild(btn('⬇ Restore from Google Drive…', false, function () { stop(); restoreManaged(); }));
      body.appendChild(btn('Use a different Google account', false, async function () { if (confirm('Switch Google account?\n\nBackups already in the old Drive stay there. New backups go to the account you pick next.')) await startAuth(); }));
      body.appendChild(btn('Disconnect Google Drive', false, async function () { if (!confirm('Disconnect Google Drive?\n\nAutomatic backups stop. Existing files stay in your Drive.')) return; var r = await call('/disconnect', {}); if (r.j && r.j.ok) { await load(true); render(); say('Disconnected'); } else say(mHuman(r.j && r.j.error, r.j && r.j.message)); }, true));
      line(body, 'Backups are stored as readable .json files in your Drive folder “iFiNeX Backups”. Restoring only adds records that are missing; nothing existing is changed or deleted.', 'color:var(--muted,#9aa3c7);font-size:.72rem');
      body.appendChild(btn('Close', false, function () { stop(); close(); }));
    }
    render();
    stop(); mTimer = setInterval(async function () { if (!ov) { stop(); return; } var was = st.connected; if (await load(true) && (!was && st.connected)) { say('Google Drive connected ✓'); render(); } }, 3000);
    return true;
  }
  async function restoreManaged() {
    var box = shell(), R = W.ifxBR; line(box, 'Choose a backup to restore', 'font-weight:800'); var msg = line(box, 'Loading…', 'color:var(--muted,#9aa3c7)');
    try {
      var r = await call('/files', {}); if (!r.j || !r.j.ok) throw new Error(mHuman(r.j && r.j.error, r.j && r.j.message));
      msg.textContent = r.j.files.length ? '' : 'No backups in Drive yet.';
      r.j.files.forEach(function (f) {
        box.appendChild(btn(when(f.created) + ' · ' + mb(f.size), false, async function () {
          try {
            msg.style.color = ''; msg.textContent = 'Downloading…'; var d = await call('/download', { id: f.id }); if (d.status !== 200) throw new Error(mHuman(d.j && d.j.error, d.j && d.j.message));
            var o = JSON.parse(d.text), err = R.validate(o); if (err) throw new Error(err);
            if (!(wo && wo.welcome) && !confirm('Restore this backup?\n\nMade: ' + when(o.exported_at) + '\nRecords: ' + R.count(o) + '\n\nOnly MISSING records are added back. Nothing existing is changed or deleted.')) { msg.textContent = ''; return; }
            msg.textContent = 'Restoring…'; var rep = await R.restore(o); try { alert(R.reportText(rep)); } catch (e) { } say('Restored ✓ — reloading…'); setTimeout(function () { location.reload(); }, 900);
          } catch (e) { msg.textContent = '❌ ' + (e.message || e); msg.style.color = '#FF6B6B'; }
        }));
      });
    } catch (e) { msg.textContent = '❌ ' + (e.message || e); msg.style.color = '#FF6B6B'; }
    box.appendChild(btn('Back', false, function () { if (wo && wo.welcome && wo.onFresh) wo.onFresh(); else open(); }));
  }
  function hashReturn() {                                      // the browser comes back from Google as  …?gdrive=ok | err_xxx
    var m = /[?#&]gdrive=([\w]+)/.exec((location.search || '') + (location.hash || '')); if (!m) return;
    try { var q = (location.search || '').replace(/([?&])gdrive=\w+&?/, '$1').replace(/[?&]$/, ''); history.replaceState(null, '', location.pathname + q); } catch (e) { }
    var tries = 0, msgShown = false;
    (function wait() {                                         // wait until the app is signed in and showing its main screen
      var app = D.getElementById('screen-app'), ready = useManaged() && (!app || app.classList.contains('active'));
      if (!ready && ++tries < 40) return setTimeout(wait, 500);
      if (!msgShown) { msgShown = true; say(HASHMSG[m[1]] || 'Google Drive: ' + m[1]); }
      if (ready) setTimeout(open, 400);
    })();
  }

  async function open() {
    if (useManaged()) { var mg = await openManaged(); if (mg) return; }
    var box = shell(), p = provider();
    if (!configured()) {
      line(box, 'Google Drive backup is not switched on in this app yet.', 'font-weight:700');
      line(box, C.mode === 'server' ? 'This server has not been updated for Google Drive backup yet. The owner must run the Google Drive SQL (part 1 + part 2), deploy the gdrive-backup function and add the Google secrets (Setup Guide → Google Drive backup). Until then use ☰ → Backup & Restore (file) or Excel/PDF export.' : 'The owner of the app has to create a free Google “client” once and put it into ifinex-config.json (Setup Guide → Google Drive backup). Until then use ☰ → Backup & Restore (file) or Excel/PDF export.', 'color:var(--muted,#9aa3c7)');
      box.appendChild(btn('Close', false, close)); return;
    }
    var t = tok();
    if (!t || !t.refresh) return connectScreen(box, p);
    line(box, '✅ Connected as ' + (t.email || 'your Google account'), 'font-weight:800');
    line(box, 'Backups go to a hidden folder only this app can see, in YOUR Google Drive. ' + (p.canRestore ? 'You can restore any of them here.' : 'Restore is not available here.'), 'color:var(--muted,#9aa3c7);font-size:.76rem');
    var stand = C.mode === 'standalone', st = line(box, 'Last Drive backup: ' + (ls(LAST) ? when(ls(LAST)) : 'never'));
    if (stand) { line(box, '🌙 Automatic backup every night at about 12:00 AM (the newest 14 are kept). Change phone or reinstall → Continue with Google → your latest backup comes back.', 'color:var(--muted,#9aa3c7);font-size:.76rem'); nativeStatus().then(function (ns) { if (ns && ns.lastOkAt) { st.textContent = 'Last backup: ' + when(new Date(Math.max(+new Date(ls(LAST) || 0), ns.lastOkAt)).toISOString()) + (ns.lastError ? ' · ⚠ ' + ns.lastError : ''); } else if (ns && ns.lastError) st.textContent += ' · ⚠ ' + ns.lastError; }); }
    box.appendChild(btn('⬆ Back up to Google Drive now', true, async function () {
      var b = this; b.disabled = true; b.textContent = 'Backing up…';
      try { var r = await backupNow(); st.textContent = 'Last Drive backup: ' + when(ls(LAST)) + ' · ' + r.records + ' records · ' + mb(r.file.size); say('Backed up to Google Drive ✓'); }
      catch (e) { st.textContent = '❌ ' + human(e); st.style.color = '#FF6B6B'; }
      b.disabled = false; b.textContent = '⬆ Back up to Google Drive now';
    }));
    if (p.canRestore && stand) box.appendChild(btn('⬇ Restore latest backup', true, function () { restoreLatest(); }));
    if (p.canRestore) box.appendChild(btn('⬇ Restore from Google Drive…', false, function () { restoreScreen(p); }));
    else box.appendChild(btn('📄 See my Drive backups', false, function () { restoreScreen(p); }));
    var auto = el('label', 'display:flex;gap:8px;align-items:center;font-size:.8rem;margin:12px 2px 0;'), cb = el('input'); cb.type = 'checkbox'; cb.checked = ls(AUTO) !== '0';
    cb.addEventListener('change', function () { ls(AUTO, cb.checked ? '1' : '0'); syncNative(); }); auto.appendChild(cb); auto.appendChild(el('span', '', stand ? 'Back up automatically every night at 12:00 AM' : 'Back up automatically about once a week when the app opens')); box.appendChild(auto);
    box.appendChild(btn('Disconnect Google', false, async function () { if (!confirm('Disconnect Google?\n\nYour existing backups stay in Drive; this app just stops using the account.')) return; await disconnect(); open(); }, true));
    box.appendChild(btn('Close', false, close));
  }
  async function connectScreen(box, p) {
    line(box, 'Save your data to your own Google Drive so a lost or reset phone never means lost data.', 'font-weight:700');
    line(box, 'You sign in on Google’s own page (no password is typed into this app). The app only gets a hidden folder of its own — it cannot see your other Drive files or your e-mail.', 'color:var(--muted,#9aa3c7);font-size:.76rem');
    var area = el('div'); box.appendChild(area);
    area.appendChild(btn('Connect my Google account', true, function () { deviceConnect(area, function () { if (ov) open(); }, open); }));
    box.appendChild(btn('Close', false, close));
  }
  async function restoreScreen(p, wo) {
    var box = shell(); line(box, p.canRestore ? 'Choose a backup to restore' : 'Your Drive backups', 'font-weight:800'); var st = line(box, 'Loading…', 'color:var(--muted,#9aa3c7)');
    try {
      var fs = await list('iFiNeX-' + p.key + '-'); st.textContent = fs.length ? '' : 'No backups in Drive yet.';
      fs.forEach(function (f) {
        box.appendChild(btn((fs.indexOf(f) === 0 ? '⭐ Latest · ' : '') + when(f.createdTime) + ' · ' + mb(f.size), false, async function () {
          if (!p.canRestore) { say('Restore is not available here.'); return; }
          try {
            st.textContent = 'Downloading…'; var o = await fetchBackup(f.id, f.name), err = p.valid(o); if (err) throw new Error(err);
            var cnt = p.count(o);
            if (!confirm('Restore this backup?\n\nMade: ' + when(o.exported_at) + '\nRecords: ' + cnt + '\n\n' + (p.restoreNote || 'Everything currently on this phone will be REPLACED.'))) { st.textContent = ''; return; }
            await doRestore(o, p);
          } catch (e) { st.textContent = '❌ ' + human(e); st.style.color = '#FF6B6B'; }
        }));
      });
    } catch (e) { st.textContent = '❌ ' + human(e); st.style.color = '#FF6B6B'; }
    box.appendChild(btn('Back', false, open));
  }

  // quiet weekly backup
  async function autoRun() {
    try {
      if (!configured() || ls(AUTO) === '0' || !(tok() || {}).refresh) return;
      var last = +new Date(ls(LAST) || 0); if (last && Date.now() - last < 7 * 864e5) return;
      var p = provider(); if (!p.ready) return;
      if (C.mode === 'standalone') { var c = await W.IFX_LOCAL.counts(); var n = (c.bill_expenses || 0) + (c.expenses || 0) + (c.et_entries || 0) + (c.bill_payee_entries || 0) + (c.bp_items || 0); if (n < 3) return; }
      await backupNow(true); say('☁️ Backed up to Google Drive');
    } catch (e) { /* silent: offline or access removed */ }
  }

  function drawer() {
    if (W.ifxSettings) return;   // v8.8: Drive lives inside Settings → Backup & Restore
    var dr = D.getElementById('drawer'); if (!dr || dr.querySelector('.ifx-gd-item')) return;
    var secs = [].slice.call(dr.querySelectorAll('.drawer-sec')), s = secs.filter(function (x) { return /settings/i.test(x.textContent); })[0];
    var b = D.createElement('button'); b.className = 'drawer-item ifx-gd-item'; b.textContent = '☁️ Google Drive backup'; b.addEventListener('click', function () { try { W.closeDrawer(); } catch (e) { } open(); });
    if (s) s.insertAdjacentElement('afterend', b); else dr.appendChild(b);
  }
  W.ifxGDrive = { open: open, welcome: welcome, restoreLatest: restoreLatest, dailyRun: dailyRun, startDaily: startDaily, dataHash: dataHash, managed: useManaged, configured: configured, backupNow: backupNow, list: list, connected: function () { return !!(tok() || {}).refresh; }, _t: { startDevice: startDevice, pollDevice: pollDevice, upload: upload, fetchBackup: fetchBackup, access: access, autoRun: autoRun } };
  function boot() { if (C.mode === 'server') hashReturn();
    if (!C.native && C.mode !== 'standalone') return;   // the website itself: use the app for Drive backup (browsers block Google's device-code calls)
    drawer(); setInterval(drawer, 1500); if (C.mode === 'standalone') setTimeout(startDaily, 6000); else setTimeout(autoRun, 12000); }
  if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', boot); else boot();
})(window, document);
