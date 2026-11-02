/* iFiNeX v8.8 — Backup & Restore for SERVER mode (website, and the app connected to a server). Loaded on both pages.
   ifxBR.open()  → ONE entry for every mode: standalone → the on-device panel (ifxBackup), server → the panel below.
   Backup  = a .json file with every row your login may read (paged, so nothing is cut at 1000 rows).
   Restore = adds the rows that are MISSING through the database function ifx_restore_rows. It never overwrites or deletes existing rows,
             and row-level security still decides what you may write (a member restores their own data, an admin everything). */
(function (W, D) {
  'use strict';
  var C = W.IFX_CFG || {}, PAGE = 1000, CHUNK = 200;
  // order matters for restore: parents before children
  var TABLES = [['bill_cards', 'user_email'], ['bill_card_shares', 'owner_email'], ['bill_card_payments', 'user_email'], ['bill_payees', 'user_email'], ['bill_expenses', 'user_email'], ['bill_owed', 'user_email'], ['bill_settlements', 'user_email'], ['bill_payee_entries', 'user_email'], ['bill_plans', 'user_email'], ['bill_plan_payments', 'user_email'], ['bill_user_prefs', 'user_email'], ['et_groups', 'user_email'], ['et_trackers', 'user_email'], ['et_entries', 'user_email'], ['et_categories', 'user_email'], ['et_kinds', 'user_email'], ['bp_income', 'user_email'], ['bp_items', 'user_email'], ['bp_goals', 'user_email'], ['squads', null], ['members_config', null], ['squad_members', null], ['expenses', null], ['settlements', null], ['prev_balances', null]];
  var FORMATS = ['ifinex-server-backup', 'ifinex-server-snapshot'];
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function say(m) { try { (W.toast || W.showToast)(m); } catch (e) { alert(m); } }
  function pad(x) { return String(x).padStart(2, '0'); }
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { } return null; }
  function client() { try { return W.sb || (typeof sb !== 'undefined' ? sb : null); } catch (e) { return null; } }
  function who() { try { return { me: (typeof me !== 'undefined' && me) || null, managing: (typeof managing !== 'undefined' && managing) || null }; } catch (e) { return {}; } }
  function accountEmail() { var w = who(), a = w.managing || w.me; if (a && a.email) return String(a.email).toLowerCase(); try { return (W.currentEmail || (typeof currentEmail !== 'undefined' ? currentEmail : '') || '').toLowerCase(); } catch (e) { return ''; } }
  function isAdmin() { var w = who(); return !!((w.me && w.me.is_admin) || (typeof iAmAdminDelegate !== 'undefined' && iAmAdminDelegate)); }
  function likeEsc(e) { return String(e).replace(/[%_\\]/g, '\\$&'); }
  function count(o) { return Object.keys((o && o.tables) || {}).reduce(function (t, k) { return t + (o.tables[k] || []).length; }, 0); }

  // ---------- backup ----------
  async function make(opt, progress) {
    opt = opt || {}; var s = client(); if (!s) throw new Error('not_ready');
    var em = accountEmail(), all = opt.scope === 'all';
    var out = { format: 'ifinex-server-backup', version: 1, app: 'iFiNeX', exported_at: new Date().toISOString(), server: C.host || '', server_name: C.name || '', account: all ? '*' : em, by: ((typeof currentEmail !== 'undefined' && currentEmail) || em || ''), tables: {}, counts: {}, unavailable: [] };
    for (var i = 0; i < TABLES.length; i++) {
      var t = TABLES[i][0], col = TABLES[i][1], pk = t === 'bill_user_prefs' ? 'user_email' : 'id', from = 0, rows = [], bad = null;
      if (progress) progress('Reading ' + t + '…');
      for (;;) {
        var q = s.from(t).select('*');
        if (col && !all && em) q = q.ilike(col, likeEsc(em));
        var r = await q.order(pk, { ascending: true }).range(from, from + PAGE - 1);
        if (r.error) { bad = r.error.message || String(r.error); break; }
        var d = r.data || []; rows = rows.concat(d);
        if (d.length < PAGE) break; from += PAGE;
        if (from > 500000) break;
      }
      if (bad) out.unavailable.push(t + ': ' + bad); else { out.tables[t] = rows; out.counts[t] = rows.length; }
    }
    return out;
  }
  function validate(o) {
    if (!o || typeof o !== 'object' || FORMATS.indexOf(o.format) < 0) return 'This is not an iFiNeX server backup file.';
    if (!o.tables || typeof o.tables !== 'object') return 'The backup file has no data.';
    return '';
  }
  function fname(o) { var d = new Date(); return 'iFiNeX-server-backup' + (o.account === '*' ? '-all' : '') + '-' + d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + '_' + pad(d.getHours()) + pad(d.getMinutes()) + '.json'; }

  // ---------- restore ----------
  async function restore(o, progress) {
    var s = client(); if (!s) throw new Error('not_ready');
    var err = validate(o); if (err) throw new Error(err);
    var rep = { inserted: 0, skipped: 0, failed: 0, errors: [], per: {} };
    for (var i = 0; i < TABLES.length; i++) {
      var t = TABLES[i][0], rows = o.tables[t]; if (!Array.isArray(rows) || !rows.length) continue;
      var P = rep.per[t] = { inserted: 0, skipped: 0, failed: 0 };
      for (var k = 0; k < rows.length; k += CHUNK) {
        if (progress) progress('Restoring ' + t + ' ' + Math.min(k + CHUNK, rows.length) + '/' + rows.length + '…');
        var r = await s.rpc('ifx_restore_rows', { p_table: t, p_rows: rows.slice(k, k + CHUNK) });
        if (r.error) { P.failed += Math.min(CHUNK, rows.length - k); rep.errors.push(t + ': ' + (r.error.message || r.error)); if (/not_signed_in|function .* does not exist|schema cache/i.test(r.error.message || '')) { i = TABLES.length; break; } continue; }
        var d = r.data || {}; P.inserted += d.inserted | 0; P.skipped += d.skipped | 0; P.failed += d.failed | 0;
        if (d.error && rep.errors.length < 6) rep.errors.push(t + ': ' + d.error);
      }
      rep.inserted += P.inserted; rep.skipped += P.skipped; rep.failed += P.failed;
    }
    return rep;
  }
  function reportText(rep) {
    var t = '✅ Restored: ' + rep.inserted + ' record(s) added back\n↪ Already there (left untouched): ' + rep.skipped + '\n' + (rep.failed ? '⚠️ Not allowed / failed: ' + rep.failed + '\n' : '');
    if (rep.errors.length) t += '\nFirst messages:\n• ' + rep.errors.slice(0, 4).join('\n• ').slice(0, 600);
    if (rep.failed && !rep.inserted && /not_signed_in|does not exist|schema cache/i.test(rep.errors.join(' '))) t += '\n\nThe server has not got the v8.8 restore function yet — the server owner must run the "UPGRADE" SQL once.';
    return t;
  }

  // ---------- UI ----------
  var css = D.createElement('style');
  css.textContent = '#ifx-br{position:fixed;inset:0;z-index:99990;background:rgba(0,0,0,.6);display:none;align-items:flex-end;justify-content:center}#ifx-br.open{display:flex}' +
    '#ifx-br .box{width:min(560px,100%);max-height:92vh;overflow:auto;background:var(--card,#151528);color:var(--text,#e8ecff);border:1px solid var(--border,rgba(255,255,255,.15));border-radius:22px 22px 0 0;padding:18px 16px 24px;box-sizing:border-box}' +
    '@media(min-width:700px){#ifx-br{align-items:center}#ifx-br .box{border-radius:22px}}' +
    '#ifx-br h3{margin:0 0 4px;font-size:1.1rem}#ifx-br .sub{font-size:.74rem;color:var(--muted,#9aa3c7);margin-bottom:10px;line-height:1.5}' +
    '#ifx-br .act{display:block;width:100%;padding:13px;border-radius:13px;border:1px solid var(--border,rgba(255,255,255,.2));background:var(--card2,rgba(255,255,255,.06));color:inherit;font-weight:800;font-size:.9rem;margin-top:9px;cursor:pointer;text-align:left}' +
    '#ifx-br .act.p{background:linear-gradient(135deg,#4D96FF,#B06AFF);color:#fff;border:0}#ifx-br .act small{display:block;font-weight:500;font-size:.68rem;opacity:.8;margin-top:2px}#ifx-br .act[disabled]{opacity:.5}' +
    '#ifx-br .x{float:right;background:none;border:0;color:inherit;font-size:1.3rem;cursor:pointer}' +
    '#ifx-br pre{white-space:pre-wrap;font:inherit;font-size:.78rem;line-height:1.5;background:var(--card2,rgba(255,255,255,.06));border-radius:12px;padding:10px 12px;margin:10px 0 0}';
  D.head.appendChild(css);
  var ov, busy = false;
  function box() { if (!ov) { ov = D.createElement('div'); ov.id = 'ifx-br'; ov.innerHTML = '<div class="box" id="ifx-br-box"></div>'; ov.addEventListener('click', function (e) { if (e.target === ov && !busy) close(); }); D.body.appendChild(ov); } return D.getElementById('ifx-br-box'); }
  function close() { if (ov) ov.classList.remove('open'); }
  function dateTxt(iso) { if (!iso) return 'never'; var d = new Date(iso); return isNaN(d) ? 'never' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function paint(msg) {
    var b = box(), w = who(), a = w.managing || w.me || {}, em = accountEmail(), adm = isAdmin();
    var gd = !!W.ifxGDrive;
    b.innerHTML = '<button class="x" aria-label="Close" data-a="close">✕</button><h3>💾 Backup &amp; Restore</h3>' +
      '<div class="sub">Your data lives on the server <b>' + esc(C.name || 'your server') + '</b>. A backup file is your own extra copy: keep it somewhere safe (Drive, e-mail to yourself, a computer).</div>' +
      '<div class="sub">Account: <b>' + esc(a.name || em) + '</b> · ' + esc(em) + '<br>Last backup made here: <b>' + esc(dateTxt(ls('ifx_br_last'))) + '</b></div>' +
      '<button class="act p" data-a="bk-acc">⬇ Create backup file<small>Everything of ' + esc(a.name || 'this account') + ' (all trackers, bills, cards, plans, budget, theme) as one .json file</small></button>' +
      (adm || (W._accountOptions && W._accountOptions.length > 1) ? '<button class="act" data-a="bk-all">⬇ Back up everything I can access<small>' + (adm ? 'Admin: ALL accounts and the whole squad' : 'Your account and every account you manage') + '</small></button>' : '') +
      '<button class="act" data-a="rs">⬆ Restore from a backup file<small>Puts back anything that is missing. Existing data is never changed or deleted. You can only restore what your login may write.</small></button>' +
      '<input type="file" id="ifx-br-file" accept=".json,application/json" style="display:none">' +
      (gd ? '<button class="act" data-a="gd">☁️ Google Drive backup<small>Back up to / restore from a hidden folder in YOUR Google Drive</small></button>' : '') +
      '<pre id="ifx-br-out" style="' + (msg ? '' : 'display:none') + '">' + esc(msg || '') + '</pre>';
  }
  function out(t) { var p = D.getElementById('ifx-br-out'); if (p) { p.style.display = ''; p.textContent = t; } }
  function lock(on) { busy = on; [].forEach.call(D.querySelectorAll('#ifx-br .act'), function (x) { x.disabled = on; }); }
  async function doBackup(scope) {
    lock(true);
    try {
      var o = await make({ scope: scope }, out);
      await W.ifxXfer.saveBlob(new Blob([JSON.stringify(o)], { type: 'application/json' }), fname(o));
      ls('ifx_br_last', new Date().toISOString());
      lock(false); paint('✅ Backup created: ' + count(o) + ' records in ' + Object.keys(o.tables).length + ' tables.' + (o.unavailable.length ? '\n(Not on this server yet: ' + o.unavailable.map(function (x) { return x.split(':')[0]; }).join(', ') + ')' : '') + '\nKeep the file safe.');
    } catch (e) { lock(false); out('❌ Could not create the backup: ' + (e && e.message || e)); }
  }
  async function doRestoreFile(f) {
    var o; try { o = JSON.parse(await f.text()); } catch (e) { return out('❌ That file cannot be read as a backup.'); }
    var err = validate(o); if (err) return out('❌ ' + err);
    var other = o.server && C.host && o.server !== C.host;
    var msg = 'Restore from ' + f.name + '?\n\nMade: ' + dateTxt(o.exported_at) + '\nAccount: ' + (o.account === '*' ? 'everything' : o.account) + '\nRecords: ' + count(o) +
      '\n\nOnly MISSING records are added back. Nothing existing is changed or deleted.' + (other ? '\n\n⚠️ This backup was made on a DIFFERENT server (' + (o.server_name || 'another server') + '). You are connected to ' + (C.name || 'this server') + '. Continue only if you moved servers on purpose.' : '');
    if (!confirm(msg)) return;
    lock(true);
    try { var rep = await restore(o, out); lock(false); paint(reportText(rep)); if (rep.inserted) say('Restored ✓'); }
    catch (e) { lock(false); out('❌ Restore stopped: ' + (e && e.message || e)); }
  }
  function open() {
    if (W.IFX_STANDALONE && W.ifxBackup) return W.ifxBackup.open();
    if (C.mode === 'standalone' && W.ifxBackup) return W.ifxBackup.open();
    paint(); box(); ov.classList.add('open');
    if (!ov._wired) {
      ov._wired = true;
      ov.addEventListener('click', function (e) { var a = e.target.closest && e.target.closest('[data-a]'); if (!a || busy) return; var k = a.getAttribute('data-a');
        if (k === 'close') close(); else if (k === 'bk-acc') doBackup('account'); else if (k === 'bk-all') doBackup('all');
        else if (k === 'rs') D.getElementById('ifx-br-file').click(); else if (k === 'gd') { close(); W.ifxGDrive && W.ifxGDrive.open(); } });
      ov.addEventListener('change', function (e) { if (e.target && e.target.id === 'ifx-br-file') { var f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) doRestoreFile(f); } });
    }
  }
  W.ifxBR = { open: open, close: close, make: make, restore: restore, validate: validate, count: count, reportText: reportText, TABLES: TABLES.map(function (x) { return x[0]; }) };
})(window, document);
