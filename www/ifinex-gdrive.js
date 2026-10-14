/* iFiNeX v8.7 — Google Drive backup (optional).  Settings ☰ → 💾 Backup & Restore → ☁️ Google Drive backup
   • Stores backups in the HIDDEN app-data folder of the user's OWN Google Drive (scope drive.appdata — the app can see nothing else in Drive, and the user cannot clutter/see the files in "My Drive").
   • Sign-in uses Google's "device code" flow (works the same on Android, iOS and in a browser, no Google SDK, no embedded sign-in page): the app shows a short code, the user approves it on google.com/device.
   • Standalone mode: backup AND restore (full).  Server mode (v8.8): backup AND restore — restore only re-adds MISSING rows through the ifx_restore_rows database function (never overwrites).
   • Needs a Google "TVs and Limited Input devices" OAuth client (id + secret) in ifinex-config.json → "google": {clientId, clientSecret}. Without it the screen explains what is missing. Nothing else in the app changes.
   • The only network addresses used: oauth2.googleapis.com (sign-in) and www.googleapis.com (Drive). Tokens stay on this device. */
(function (W, D) {
  'use strict';
  var C = W.IFX_CFG || {}, G = C.google || null;
  var LSK = 'ifx_gd', LAST = 'ifx_gd_last', AUTO = 'ifx_gd_auto';
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
    ls(LSK, JSON.stringify(t)); return t;
  }
  async function access() {
    var t = tok(); if (!t || !t.refresh) throw new Error('not_connected');
    if (t.access && t.exp > Date.now()) return t.access;
    var r = await post(OAUTH + '/token', { client_id: G.clientId, client_secret: G.clientSecret, refresh_token: t.refresh, grant_type: 'refresh_token' });
    if (r.status !== 200 || !r.json.access_token) { if (r.json.error === 'invalid_grant') { ls(LSK, null); throw new Error('not_connected'); } throw new Error('refresh:' + (r.json.error || r.status)); }
    return saveTokens(r.json, t).access;
  }
  async function disconnect() {
    var t = tok(); ls(LSK, null);
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
    try { var fs = await list(prefix), tk = await access(); for (var i = MAX_KEEP; i < fs.length; i++) await fetch(DRIVE + '/drive/v3/files/' + encodeURIComponent(fs[i].id), { method: 'DELETE', headers: { Authorization: 'Bearer ' + tk }, credentials: 'omit' }); } catch (e) { }
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
    ls(LAST, new Date().toISOString()); prune('iFiNeX-' + p.key + '-');
    return { file: f, records: n };
  }

  // ---------- UI ----------
  var ov = null, cancelFlag = false;
  function el(t, css, txt) { var n = D.createElement(t); if (css) n.style.cssText = css; if (txt != null) n.textContent = txt; return n; }
  function btn(label, primary, fn, danger) {
    var b = el('button', 'width:100%;padding:13px;border-radius:12px;margin-top:8px;font-weight:800;font-size:.9rem;cursor:pointer;border:1px solid var(--border,rgba(255,255,255,.2));' + (primary ? 'background:var(--accent,#4d96ff);color:#fff;border-color:transparent;' : 'background:var(--card2,rgba(255,255,255,.06));color:' + (danger ? '#FF6B6B' : 'var(--text,inherit)') + ';'), label);
    b.addEventListener('click', fn); return b;
  }
  function close() { cancelFlag = true; if (ov) { ov.remove(); ov = null; } }
  function line(box, t, css) { var d = el('div', 'font-size:.82rem;line-height:1.5;margin:10px 0;' + (css || ''), t); box.appendChild(d); return d; }
  function shell() {
    close(); cancelFlag = false;
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

  async function open() {
    var box = shell(), p = provider();
    if (!configured()) {
      line(box, 'Google Drive backup is not switched on in this app yet.', 'font-weight:700');
      line(box, 'The owner of the app/server has to create a free Google “client” once and put it into ifinex-config.json (Setup Guide → Google Drive backup). Until then use ☰ → Backup & Restore (file) or Excel/PDF export.', 'color:var(--muted,#9aa3c7)');
      box.appendChild(btn('Close', false, close)); return;
    }
    var t = tok();
    if (!t || !t.refresh) return connectScreen(box, p);
    line(box, '✅ Connected as ' + (t.email || 'your Google account'), 'font-weight:800');
    line(box, 'Backups go to a hidden folder only this app can see, in YOUR Google Drive. ' + (p.canRestore ? 'You can restore any of them here.' : 'Restore is not available here.'), 'color:var(--muted,#9aa3c7);font-size:.76rem');
    var st = line(box, 'Last Drive backup: ' + (ls(LAST) ? when(ls(LAST)) : 'never'));
    box.appendChild(btn('⬆ Back up to Google Drive now', true, async function () {
      var b = this; b.disabled = true; b.textContent = 'Backing up…';
      try { var r = await backupNow(); st.textContent = 'Last Drive backup: ' + when(ls(LAST)) + ' · ' + r.records + ' records · ' + mb(r.file.size); say('Backed up to Google Drive ✓'); }
      catch (e) { st.textContent = '❌ ' + human(e); st.style.color = '#FF6B6B'; }
      b.disabled = false; b.textContent = '⬆ Back up to Google Drive now';
    }));
    if (p.canRestore) box.appendChild(btn('⬇ Restore from Google Drive…', false, function () { restoreScreen(p); }));
    else box.appendChild(btn('📄 See my Drive backups', false, function () { restoreScreen(p); }));
    var auto = el('label', 'display:flex;gap:8px;align-items:center;font-size:.8rem;margin:12px 2px 0;'), cb = el('input'); cb.type = 'checkbox'; cb.checked = ls(AUTO) !== '0';
    cb.addEventListener('change', function () { ls(AUTO, cb.checked ? '1' : '0'); }); auto.appendChild(cb); auto.appendChild(el('span', '', 'Back up automatically about once a week when the app opens')); box.appendChild(auto);
    box.appendChild(btn('Disconnect Google', false, async function () { if (!confirm('Disconnect Google?\n\nYour existing backups stay in Drive; this app just stops using the account.')) return; await disconnect(); open(); }, true));
    box.appendChild(btn('Close', false, close));
  }
  async function connectScreen(box, p) {
    line(box, 'Save your data to your own Google Drive so a lost or reset phone never means lost data.', 'font-weight:700');
    line(box, 'You sign in on Google’s own page (no password is typed into this app). The app only gets a hidden folder of its own — it cannot see your other Drive files or your e-mail.', 'color:var(--muted,#9aa3c7);font-size:.76rem');
    var area = el('div'); box.appendChild(area);
    area.appendChild(btn('Connect my Google account', true, async function () {
      area.textContent = ''; var msg = line(area, 'Contacting Google…');
      try {
        var d = await startDevice(); msg.textContent = '';
        line(area, '1) Open this page on this phone (or any device):'); var lk = btn(d.verification_url || 'google.com/device', false, function () { try { W.open(d.verification_url || 'https://www.google.com/device', '_blank'); } catch (e) { } }); area.appendChild(lk);
        line(area, '2) Enter this code and approve:'); var code = el('div', 'font-size:1.7rem;font-weight:900;letter-spacing:3px;text-align:center;background:var(--card2,rgba(255,255,255,.06));border-radius:12px;padding:12px;', d.user_code); area.appendChild(code);
        area.appendChild(btn('Copy code', false, function () { try { navigator.clipboard.writeText(d.user_code); say('Code copied'); } catch (e) { } }));
        var wait = line(area, 'Waiting for your approval…', 'color:var(--muted,#9aa3c7);font-size:.76rem'); area.appendChild(btn('Cancel', false, function () { cancelFlag = true; open(); }));
        var j = await pollDevice(d, function () { return cancelFlag; }, function (s) { wait.textContent = 'Waiting for your approval… ' + Math.floor(s / 60) + ':' + pad(s % 60) + ' left'; });
        saveTokens(j, null); say('Google connected ✓'); if (ov) open();
      } catch (e) { if (/cancelled/.test(String(e && e.message))) return; area.textContent = ''; line(area, '❌ ' + human(e), 'color:#FF6B6B'); area.appendChild(btn('Try again', true, function () { open(); })); }
    }));
    box.appendChild(btn('Close', false, close));
  }
  async function restoreScreen(p) {
    var box = shell(); line(box, p.canRestore ? 'Choose a backup to restore' : 'Your Drive backups', 'font-weight:800'); var st = line(box, 'Loading…', 'color:var(--muted,#9aa3c7)');
    try {
      var fs = await list('iFiNeX-' + p.key + '-'); st.textContent = fs.length ? '' : 'No backups in Drive yet.';
      fs.forEach(function (f) {
        box.appendChild(btn(when(f.createdTime) + ' · ' + mb(f.size), false, async function () {
          if (!p.canRestore) { say('Restore is not available here.'); return; }
          try {
            st.textContent = 'Downloading…'; var o = await fetchBackup(f.id, f.name), err = p.valid(o); if (err) throw new Error(err);
            var cnt = p.count(o);
            if (!confirm('Restore this backup?\n\nMade: ' + when(o.exported_at) + '\nRecords: ' + cnt + '\n\n' + (p.restoreNote || 'Everything currently on this phone will be REPLACED.'))) { st.textContent = ''; return; }
            await p.restore(o); say('Restored ✓ — reloading…'); setTimeout(function () { location.reload(); }, 900);
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
  W.ifxGDrive = { open: open, configured: configured, backupNow: backupNow, list: list, connected: function () { return !!(tok() || {}).refresh; }, _t: { startDevice: startDevice, pollDevice: pollDevice, upload: upload, fetchBackup: fetchBackup, access: access, autoRun: autoRun } };
  function boot() { if (!C.native && C.mode !== 'standalone') return;   // the website itself: use the app for Drive backup (browsers block Google's device-code calls)
    drawer(); setInterval(drawer, 1500); setTimeout(autoRun, 12000); }
  if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', boot); else boot();
})(window, document);
