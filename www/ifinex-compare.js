/* ============================================================================
   iFiNeX v14.0 — COMPARE PERIODS  (Bill Tracker · Expense / Event / Trip trackers · Budget planner)
   Put 2, 3, 4 … (up to 8) periods side by side — each one a whole month or any custom dates — and export the comparison as
   preview · PDF · Excel (.xlsx) · CSV.  Every table has one column per period and (optionally) the CHANGE between periods.
   Open with:  ifxCompare.open('all' | 'bill' | 'et' | 'bp', { kind: 'trip' | 'occasion' | 'period' })
   Reads only — nothing in your data is changed. Uses the table renderers of ifinex-reports.js (ifxReports.render) so the files look the same.
   Page globals declared with `let` (sb, me, managing …) are read by bare name through g().
   ============================================================================ */
(function () {
  'use strict';
  var W = window, D = document;
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var p2 = function (n) { return String(n).padStart(2, '0'); };
  var g = function (fn, d) { try { var v = fn(); return v === undefined ? d : v; } catch (e) { return d; } };
  var low = function (s) { return String(s || '').trim().toLowerCase(); };
  var like = function (s) { return String(s || '').replace(/[%_\\]/g, function (m) { return '\\' + m; }); };
  var r2 = function (n) { return Math.round((Number(n) || 0) * 100) / 100; };
  var iso = function (d) { return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); };
  var today = function () { return iso(new Date()); };
  var lastDay = function (y, m) { return new Date(y, m, 0).getDate(); };
  var monthEnd = function (m) { return m + '-' + p2(lastDay(+m.slice(0, 4), +m.slice(5, 7))); };
  var shiftMonth = function (m, d) { var p = m.split('-').map(Number), x = new Date(p[0], p[1] - 1 + d, 1); return x.getFullYear() + '-' + p2(x.getMonth() + 1); };
  var monthLabel = function (m) { var p = String(m).split('-').map(Number); return new Date(p[0], p[1] - 1, 1).toLocaleString('en', { month: 'short', year: 'numeric' }); };
  var SB = function () { return g(function () { return sb; }, null); };
  var toast = function (m) { try { (W.toast || W.showToast)(m); } catch (e) { alert(m); } };
  var MAXP = 8, MINP = 2;
  var KINDS = { period: 'Expense trackers', occasion: 'Event trackers', trip: 'Trip trackers' };

  /* ---------- state ---------- */
  var C = null, MODEL = null, busy = false, OV = null;
  function monthPeriod(m) { return { mode: 'month', month: m, from: m + '-01', to: monthEnd(m), label: '' }; }
  function fresh() {
    var ym = today().slice(0, 7);
    return { entry: 'all', kind: '', periods: [monthPeriod(shiftMonth(ym, -1)), monthPeriod(ym)], mods: { bill: true, et: true, bp: true }, scope: 'me', delta: 'prev', detail: 'cats', users: [], cur: '', canPick: false };
  }
  function norm(p) {   // -> { from, to, label }
    var from, to;
    if (p.mode === 'month') { var m = p.month || today().slice(0, 7); from = m + '-01'; to = monthEnd(m); } else { from = p.from; to = p.to; }
    var label = (p.label || '').trim() || (p.mode === 'month' ? monthLabel(p.month) : from + ' → ' + to);
    return { from: from, to: to, label: label, mode: p.mode, month: p.month };
  }
  async function loadUsers() {
    var s = SB(), out = [], acc = g(function () { return managing; }, null) || g(function () { return me; }, null), cur = String((acc && acc.email) || '').toLowerCase();
    if (s) { try { var r = await s.from('app_users').select('id,email,name,is_admin').order('name'); out = (r.data || []).filter(function (u) { return u.email; }); } catch (e) { } }
    if (!out.length && cur) out = [{ email: cur, name: (acc && acc.name) || cur }];
    var row = out.filter(function (u) { return String(u.email).toLowerCase() === cur; })[0], admin = g(function () { return canManageOwed(); }, null); if (admin === null) admin = !!(row && row.is_admin);
    C.cur = cur; C.users = out; C.canPick = !!admin && out.length > 1; if (!C.canPick) C.scope = 'me';
  }
  function usersOf() {
    if (C.scope === 'all' && C.canPick) return C.users;
    var u = C.users.filter(function (x) { return String(x.email).toLowerCase() === C.cur; }); return u.length ? u : [{ email: C.cur, name: C.cur }];
  }

  /* ---------- data ---------- */
  async function fetchAll(s, table, qf) {
    var out = [], from = 0, step = 1000;
    for (; ;) {
      var q = s.from(table).select('*'); if (qf) q = qf(q); if (q.order) q = q.order('id');
      var r = q.range ? await q.range(from, from + step - 1) : await q; if (!r || r.error) break;
      var d = r.data || []; out = out.concat(d); if (d.length < step || from > 40000) break; from += step;
    }
    return out;
  }
  var rowDate = function (x) {   // month-based rows (owed / settlements): their real date when saved inside that month, else the last day of the month (never in the future)
    var c = x.created_at ? String(x.created_at).slice(0, 10) : '', m = x.month || '', t = today();
    if (!m) return c; if (c && c.slice(0, 7) === m) return c; var e = monthEnd(m); return e > t && m <= t.slice(0, 7) ? t : e;
  };
  function which(P, d) { for (var i = 0; i < P.length; i++) if (d && d >= P[i].from && d <= P[i].to) return i; return -1; }   // first period containing the date (periods may overlap: use whichAll)
  function whichAll(P, d) { var o = []; for (var i = 0; i < P.length; i++) if (d && d >= P[i].from && d <= P[i].to) o.push(i); return o; }
  function mget(map, key, n) { return map[key] || (map[key] = new Array(n).fill(0)); }
  var sumv = function (a) { return a.reduce(function (t, x) { return t + x; }, 0); };

  async function loadBill(users, P) {
    var s = SB(), n = P.length, cat = {}, tot = new Array(n).fill(0), cnt = new Array(n).fill(0), chg = new Array(n).fill(0), pay = new Array(n).fill(0);
    await Promise.all(users.map(async function (u) {
      var em = like(u.email), r = await Promise.all([fetchAll(s, 'bill_expenses', function (q) { return q.ilike('user_email', em); }), fetchAll(s, 'bill_owed', function (q) { return q.ilike('user_email', em); }), fetchAll(s, 'bill_settlements', function (q) { return q.ilike('user_email', em); })]);
      r[0].forEach(function (x) { var a = Number(x.amount) || 0, k = (x.category || '').trim() || 'Uncategorised'; whichAll(P, x.date).forEach(function (i) { mget(cat, k, n)[i] += a; tot[i] += a; cnt[i]++; }); });
      r[1].forEach(function (x) { whichAll(P, rowDate(x)).forEach(function (i) { chg[i] += Number(x.amount) || 0; }); });
      r[2].forEach(function (x) { whichAll(P, rowDate(x)).forEach(function (i) { pay[i] += Number(x.amount) || 0; }); });
    }));
    return { cat: cat, tot: tot, cnt: cnt, chg: chg, pay: pay };
  }
  async function loadEt(users, P) {
    var s = SB(), n = P.length, cat = {}, kind = {}, trk = {}, tot = new Array(n).fill(0), cnt = new Array(n).fill(0), live = P.map(function () { return {}; }), trs = [];
    await Promise.all(users.map(async function (u) { var r = await s.from('et_trackers').select('*').ilike('user_email', like(u.email)); (r.data || []).forEach(function (t) { if (C.kind && t.kind !== C.kind) return; trs.push(t); }); }));
    var byId = {}; trs.forEach(function (t) { byId[t.id] = t; });
    var ids = trs.map(function (t) { return t.id; }), ents = [];
    for (var i = 0; i < ids.length; i += 100) { var r2 = await s.from('et_entries').select('*').in('tracker_id', ids.slice(i, i + 100)); ents = ents.concat(r2.data || []); }
    ents.forEach(function (e) {
      var a = Number(e.amount) || 0, t = byId[e.tracker_id]; if (!t) return;
      whichAll(P, e.entry_date).forEach(function (pi) {
        mget(cat, (e.category || '').trim() || 'Uncategorised', n)[pi] += a; mget(kind, KINDS[t.kind] || ('Tracker type: ' + t.kind), n)[pi] += a; mget(trk, t.title || 'Tracker', n)[pi] += a;
        tot[pi] += a; cnt[pi]++; live[pi][t.id] = 1;
      });
    });
    return { cat: cat, kind: kind, trk: trk, tot: tot, cnt: cnt, trackers: live.map(function (o) { return Object.keys(o).length; }) };
  }
  async function loadBp(users, P) {
    var s = SB(), n = P.length, inc = {}, bucket = {}, line = {}, income = new Array(n).fill(0), planned = new Array(n).fill(0), sav = new Array(n).fill(0);
    var inP = function (m) { var o = []; for (var i = 0; i < P.length; i++) if (m && m >= P[i].from.slice(0, 7) && m <= P[i].to.slice(0, 7)) o.push(i); return o; };
    await Promise.all(users.map(async function (u) {
      var q = function (t) { return s.from(t).select('*').ilike('user_email', like(u.email)); }, r = await Promise.all([q('bp_income'), q('bp_items')]);
      (r[0].data || []).forEach(function (x) { var m = x.month || String(x.pay_date || '').slice(0, 7), a = Number(x.amount) || 0; inP(m).forEach(function (i) { mget(inc, (x.source || '').trim() || 'Income', n)[i] += a; income[i] += a; }); });
      (r[1].data || []).forEach(function (x) { var a = Number(x.planned) || 0, bk = x.bucket || 'other'; inP(x.month).forEach(function (i) { mget(line, (x.category || '').trim() || 'Other', n)[i] += a; mget(bucket, bk.charAt(0).toUpperCase() + bk.slice(1), n)[i] += a; planned[i] += a; if (bk === 'savings') sav[i] += a; }); });
    }));
    return { inc: inc, bucket: bucket, line: line, income: income, planned: planned, sav: sav, months: P.map(function (p) { return Math.max(1, (+p.to.slice(0, 4) * 12 + +p.to.slice(5, 7)) - (+p.from.slice(0, 4) * 12 + +p.from.slice(5, 7)) + 1); }) };
  }

  /* ---------- tables ---------- */
  var sg = function (x) { return (x > 0 ? '+' : '') + money(x); };
  var money = function (n) { return (Math.round((Number(n) || 0) * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  function deltas(v, mode) {
    var d = [], n = v.length, i;
    if (mode === 'prev') for (i = 1; i < n; i++) d.push(r2(v[i] - v[i - 1])); else if (mode === 'first') for (i = 1; i < n; i++) d.push(r2(v[i] - v[0]));
    return d;
  }
  var pctOf = function (a, b) { if (!(Math.abs(a) > 0.004)) return Math.abs(b) > 0.004 ? 'new' : '—'; var p = (b - a) / Math.abs(a) * 100; return (p > 0 ? '+' : '') + p.toFixed(1) + '%'; };
  function heads(L, first, mode) {
    var h = [first].concat(L), i;
    if (mode === 'prev') for (i = 1; i < L.length; i++) h.push(L[i] + ' vs ' + L[i - 1]); else if (mode === 'first') for (i = 1; i < L.length; i++) h.push(L[i] + ' vs ' + L[0]);
    if (mode !== 'none') h.push('% ' + L[L.length - 1] + ' vs ' + L[0]);
    return h;
  }
  /* one money table: map = { rowName: [v per period] } */
  function table(title, sheet, first, map, L, mode, order) {
    var keys = Object.keys(map); keys.sort(order || function (a, b) { return sumv(map[b]) - sumv(map[a]); });
    keys = keys.filter(function (k) { return map[k].some(function (x) { return Math.abs(x) > 0.004; }); });
    var n = L.length, num = [], k; for (k = 1; k < 1 + n + (mode === 'none' ? 0 : n - 1); k++) num.push(k);
    var rows = keys.map(function (key) { var v = map[key].map(r2); return [key].concat(v, deltas(v, mode), mode === 'none' ? [] : [pctOf(v[0], v[n - 1])]); });
    var tv = new Array(n).fill(0); keys.forEach(function (key) { map[key].forEach(function (x, i) { tv[i] += x; }); }); tv = tv.map(r2);
    var total = ['TOTAL'].concat(tv, deltas(tv, mode), mode === 'none' ? [] : [pctOf(tv[0], tv[n - 1])]);
    return { sheet: sheet, title: title, head: heads(L, first, mode), rows: rows, total: rows.length ? total : null, num: num };
  }
  /* summary rows: kind money | count | pct */
  function summary(L, mode, defs) {
    var n = L.length, num = []; for (var k = 1; k < 1 + n + (mode === 'none' ? 0 : n - 1); k++) num.push(k);
    var rows = defs.map(function (d) {
      var v = d.v, out = [d.label], dl = deltas(v, mode);
      if (d.kind === 'count') { out = out.concat(v.map(function (x) { return String(Math.round(x)); }), dl.map(function (x) { return (x > 0 ? '+' : '') + Math.round(x); })); }
      else if (d.kind === 'pct') { out = out.concat(v.map(function (x) { return x.toFixed(1) + '%'; }), dl.map(function (x) { return (x > 0 ? '+' : '') + x.toFixed(1) + ' pts'; })); }
      else out = out.concat(v.map(r2), dl);
      if (mode !== 'none') out.push(d.kind === 'pct' ? '' : pctOf(v[0], v[n - 1]));
      return out;
    });
    return { sheet: 'Summary', title: 'Summary — each period side by side', head: heads(L, 'What', mode), rows: rows, total: null, num: num, bold: [] };
  }

  async function buildModel() {
    var s = SB(); if (!s) throw new Error('Comparison needs the live database (demo mode has no database).');
    var P = C.periods.map(norm), i, j;
    for (i = 0; i < P.length; i++) { if (!P[i].from || !P[i].to) throw new Error('Period ' + (i + 1) + ': fill in the ' + (P[i].mode === 'month' ? 'month' : 'dates') + '.'); if (P[i].from > P[i].to) throw new Error('Period ' + (i + 1) + ': “From” is after “To”.'); }
    var seen = {}; P.forEach(function (p) { var k = p.label; seen[k] = (seen[k] || 0) + 1; }); P.forEach(function (p) { if (seen[p.label] > 1) { var c = 0; P.forEach(function (q) { if (q.label === p.label) { c++; if (c > 1 || true) q.label = q.label + ' (#' + (P.indexOf(q) + 1) + ')'; } }); } });
    if (!C.mods.bill && !C.mods.et && !C.mods.bp) throw new Error('Tick at least one thing to compare.');
    var users = usersOf(), L = P.map(function (p) { return p.label; }), mode = C.delta, det = C.detail === 'cats', T = [], defs = [], B = null, E = null, G = null;
    if (C.mods.bill) B = await loadBill(users, P);
    if (C.mods.et) E = await loadEt(users, P);
    if (C.mods.bp) G = await loadBp(users, P);
    if (B) { defs.push({ label: '🧾 Bill Tracker — spending', v: B.tot }, { label: '🧾 Bill Tracker — number of expenses', v: B.cnt, kind: 'count' }, { label: '🧾 Owed to admin — new charges', v: B.chg }, { label: '🧾 Paid to admin', v: B.pay }); }
    if (E) { defs.push({ label: '🪙 Trackers — spent', v: E.tot }, { label: '🪙 Trackers — entries', v: E.cnt, kind: 'count' }, { label: '🪙 Trackers — active trackers', v: E.trackers, kind: 'count' }); }
    if (G) {
      defs.push({ label: '📈 Budget — income', v: G.income }, { label: '📈 Budget — planned', v: G.planned }, { label: '📈 Budget — left to plan (income − planned)', v: G.income.map(function (x, k) { return x - G.planned[k]; }) }, { label: '📈 Budget — planned savings', v: G.sav },
        { label: '📈 Budget — planned savings % of income', v: G.income.map(function (x, k) { return x > 0 ? G.sav[k] / x * 100 : 0; }), kind: 'pct' });
      if (G.months.some(function (m) { return m > 1; })) defs.push({ label: '📈 Budget — months covered', v: G.months, kind: 'count' });
    }
    T.push(summary(L, mode, defs));
    if (det) {
      if (B) {
        T.push(table('Bill Tracker — spending by category', 'Bill by category', 'Category', B.cat, L, mode));
        if (B.chg.some(function (x) { return x; }) || B.pay.some(function (x) { return x; })) { var ow = {}; ow['New charges (owed to admin)'] = B.chg; ow['Payments to admin'] = B.pay; ow['Net change in what you owe'] = B.chg.map(function (x, k) { return x - B.pay[k]; }); T.push(table('Bill Tracker — owed to admin', 'Bill owed', 'Item', ow, L, mode, function (a, b) { return Object.keys(ow).indexOf(a) - Object.keys(ow).indexOf(b); })); }
      }
      if (E) {
        T.push(table('Expense / Event / Trip trackers — spent by category', 'Tracker categories', 'Category', E.cat, L, mode));
        T.push(table('Trackers — spent by tracker type', 'Tracker types', 'Type', E.kind, L, mode));
        T.push(table('Trackers — spent by tracker', 'Trackers', 'Tracker', E.trk, L, mode));
      }
      if (G) {
        T.push(table('Budget — income by source', 'Budget income', 'Source', G.inc, L, mode));
        T.push(table('Budget — planned by group', 'Budget groups', 'Group', G.bucket, L, mode));
        T.push(table('Budget — planned by budget line', 'Budget lines', 'Budget line', G.line, L, mode));
      }
    }
    var names = []; if (B) names.push('Bill Tracker'); if (E) names.push(C.kind ? KINDS[C.kind] : 'Expense / Event / Trip trackers'); if (G) names.push('Budget planner');
    var cover = P.map(function (p) { return p.label + ' (' + p.from + ' → ' + p.to + ')'; }).join('  |  ');
    return { title: 'iFiNeX comparison — ' + P.length + ' periods', subtitle: names.join(' + ') + ' · ' + (users.length > 1 ? users.length + ' users' : users[0].name || users[0].email) + ' · amounts in AED · ' + (mode === 'prev' ? 'change between neighbouring periods' : mode === 'first' ? 'change against the first period' : 'no change columns') + ' · ' + cover, tables: T, file: 'ifinex-comparison_' + P.length + '-periods_' + P[0].from + '_to_' + P[P.length - 1].to };
  }

  /* ---------- UI ---------- */
  var CSS = '#ifx-cmp{position:fixed;inset:0;z-index:9650;background:rgba(0,0,0,.62);display:none;align-items:flex-end;justify-content:center;}#ifx-cmp.open{display:flex;}' +
    '#ifx-cmp .box{width:min(820px,100%);max-height:94vh;overflow:auto;background:var(--card,#151528);color:var(--text,#e8ecff);border:1px solid var(--border,rgba(255,255,255,.15));border-radius:20px 20px 0 0;padding:16px 16px calc(18px + env(safe-area-inset-bottom,0px));}' +
    '@media(min-width:760px){#ifx-cmp{align-items:center}#ifx-cmp .box{border-radius:20px}}' +
    '#ifx-cmp h3{margin:0 0 2px;font-size:1.08rem;}#ifx-cmp .x{float:right;background:none;border:0;color:inherit;font-size:1.25rem;cursor:pointer;}' +
    '#ifx-cmp .sub{font-size:.7rem;color:var(--muted,#9aa3c7);margin-bottom:8px;line-height:1.45}#ifx-cmp .rstep{font-size:.7rem;font-weight:900;color:var(--accent,#4d96ff);margin:12px 0 4px;text-transform:uppercase;letter-spacing:.05em;}' +
    '#ifx-cmp .chips{display:flex;flex-wrap:wrap;gap:6px;}#ifx-cmp .chip{border:1px solid var(--border,rgba(255,255,255,.2));background:var(--card2,rgba(255,255,255,.06));color:inherit;border-radius:999px;padding:7px 12px;font-size:.74rem;font-weight:700;cursor:pointer;}#ifx-cmp .chip.on{background:var(--accent,#4d96ff);border-color:var(--accent,#4d96ff);color:#fff;}' +
    '#ifx-cmp input,#ifx-cmp select{padding:9px;border-radius:10px;border:1px solid var(--border,rgba(255,255,255,.2));background:var(--card2,rgba(255,255,255,.06));color:inherit;font-size:.82rem;max-width:100%;box-sizing:border-box;}' +
    '#ifx-cmp .prow{display:flex;gap:6px;align-items:center;flex-wrap:wrap;padding:8px;border:1px solid var(--border,rgba(255,255,255,.15));border-radius:12px;margin-top:6px;background:var(--card2,rgba(255,255,255,.04));}#ifx-cmp .prow b{min-width:22px;height:22px;border-radius:50%;background:var(--accent,#4d96ff);color:#fff;font-size:.72rem;display:inline-flex;align-items:center;justify-content:center;}#ifx-cmp .prow input.lab{flex:1;min-width:90px;}' +
    '#ifx-cmp .mods{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:6px;}#ifx-cmp label.ck{display:flex;gap:6px;align-items:center;font-size:.78rem;padding:6px 8px;border-radius:8px;background:var(--card2,rgba(255,255,255,.05));cursor:pointer;}' +
    '#ifx-cmp .acts{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:14px;}#ifx-cmp .acts button{padding:12px 6px;border-radius:12px;border:0;font-weight:900;font-size:.8rem;color:#fff;background:linear-gradient(135deg,#4D96FF,#B06AFF);cursor:pointer;}#ifx-cmp .acts button[disabled]{opacity:.5}#ifx-cmp .acts button.g{background:var(--card2,rgba(255,255,255,.1));color:inherit;border:1px solid var(--border,rgba(255,255,255,.2));}#ifx-cmp .msg{font-size:.78rem;margin-top:8px;min-height:1.1em;}' +
    '#ifx-cmp table.rp-t{width:100%;border-collapse:collapse;font-size:.7rem;}#ifx-cmp .rp-t th{text-align:left;color:var(--muted,#9aa3c7);padding:4px 5px;border-bottom:1px solid var(--border,rgba(255,255,255,.2));white-space:nowrap;}#ifx-cmp .rp-t td{padding:4px 5px;border-bottom:1px solid var(--border,rgba(255,255,255,.08));}#ifx-cmp #cp-prev{margin-top:12px;border-top:1px solid var(--border,rgba(255,255,255,.15));padding-top:6px;}';
  function ensureDom() {
    if (OV) return;
    var st = D.createElement('style'); st.textContent = CSS; D.head.appendChild(st);
    OV = D.createElement('div'); OV.id = 'ifx-cmp'; OV.setAttribute('role', 'dialog'); OV.setAttribute('aria-modal', 'true'); D.body.appendChild(OV);
    OV.addEventListener('click', onClick); OV.addEventListener('change', onChange);
  }
  var chip = function (k, v, label, on) { return '<button type="button" class="chip' + (on ? ' on' : '') + '" data-k="' + k + '" data-v="' + esc(v) + '">' + esc(label) + '</button>'; };
  function periodRow(p, i) {
    var h = '<div class="prow"><b>' + (i + 1) + '</b><select data-pm="' + i + '" aria-label="Period type"><option value="month"' + (p.mode === 'month' ? ' selected' : '') + '>Month</option><option value="custom"' + (p.mode === 'custom' ? ' selected' : '') + '>Custom dates</option></select>';
    h += p.mode === 'month' ? '<input type="month" data-pf="month" data-i="' + i + '" value="' + esc(p.month) + '" aria-label="Month">' : '<input type="date" data-pf="from" data-i="' + i + '" value="' + esc(p.from) + '" aria-label="From"><span>→</span><input type="date" data-pf="to" data-i="' + i + '" value="' + esc(p.to) + '" aria-label="To">';
    h += '<input class="lab" data-pf="label" data-i="' + i + '" value="' + esc(p.label) + '" placeholder="Name (optional)" aria-label="Name of this period">';
    if (C.periods.length > MINP) h += '<button type="button" class="chip" data-a="delp" data-i="' + i + '" aria-label="Remove period ' + (i + 1) + '">✕</button>';
    return h + '</div>';
  }
  function paint() {
    var kinds = []; g(function () { return etTrackers; }, []).forEach(function (t) { if (kinds.indexOf(t.kind) < 0) kinds.push(t.kind); }); Object.keys(KINDS).forEach(function (k) { if (kinds.indexOf(k) < 0) kinds.push(k); });
    var kname = function (k) { return KINDS[k] || g(function () { return ETK_NAME[k]; }, k) || k; };
    var h = '<button class="x" data-a="close" aria-label="Close">✕</button><h3>🔀 Compare periods</h3><div class="sub">Put 2, 3, 4 … periods side by side — whole months or any dates — and download the comparison. Nothing in your data is changed.</div>';
    h += '<div class="rstep">1 · Periods (' + C.periods.length + ')</div><div class="chips"><button type="button" class="chip" data-a="preset" data-v="m2">Last 2 months</button><button type="button" class="chip" data-a="preset" data-v="m3">Last 3 months</button><button type="button" class="chip" data-a="preset" data-v="m4">Last 4 months</button><button type="button" class="chip" data-a="preset" data-v="m6">Last 6 months</button><button type="button" class="chip" data-a="preset" data-v="yoy">This month vs same month last year</button></div>';
    h += C.periods.map(periodRow).join('') + '<div class="row" style="margin-top:8px;">' + (C.periods.length < MAXP ? '<button type="button" class="chip" data-a="addp">＋ Add another period</button>' : '<span class="sub">Maximum ' + MAXP + ' periods.</span>') + '</div>';
    h += '<div class="rstep">2 · What to compare</div><div class="mods">' + [['bill', '🧾 Bill Tracker (spending, owed to admin)'], ['et', '🪙 Expense / Event / Trip trackers'], ['bp', '📈 Budget planner (income, planned)']].map(function (m) { return '<label class="ck"><input type="checkbox" data-m="' + m[0] + '"' + (C.mods[m[0]] ? ' checked' : '') + '> ' + esc(m[1]) + '</label>'; }).join('') + '</div>';
    if (C.mods.et) h += '<div class="sub" style="margin-top:6px;">Tracker type:</div><div class="chips">' + chip('kind', '', 'All types', !C.kind) + kinds.map(function (k) { return chip('kind', k, kname(k), C.kind === k); }).join('') + '</div>';
    h += '<div class="rstep">3 · Users</div>' + (C.canPick ? '<div class="chips">' + chip('scope', 'me', 'Only this account', C.scope === 'me') + chip('scope', 'all', 'All users combined (' + C.users.length + ')', C.scope === 'all') + '</div>' : '<div class="sub">Comparison for your own account. (Admins can also combine all users.)</div>');
    h += '<div class="rstep">4 · Show the change</div><div class="chips">' + chip('delta', 'prev', 'Between neighbouring periods', C.delta === 'prev') + chip('delta', 'first', 'Against the first period', C.delta === 'first') + chip('delta', 'none', 'No change columns', C.delta === 'none') + '</div>';
    h += '<div class="rstep">5 · Detail</div><div class="chips">' + chip('detail', 'cats', 'With categories, sources and trackers', C.detail === 'cats') + chip('detail', 'tot', 'Summary only', C.detail === 'tot') + '</div>';
    h += '<div class="acts"><button data-a="prev"' + (busy ? ' disabled' : '') + '>👁 Preview</button><button data-a="pdf"' + (busy ? ' disabled' : '') + '>⬇ PDF</button><button data-a="xlsx"' + (busy ? ' disabled' : '') + '>⬇ Excel</button><button class="g" data-a="csv"' + (busy ? ' disabled' : '') + '>⬇ CSV</button></div><div class="msg" id="cp-msg" role="status"></div><div id="cp-prev">' + (MODEL && RN() ? RN().previewHtml(MODEL) : '') + '</div>';
    var bx = OV.querySelector('.box'), sc = bx ? bx.scrollTop : 0; OV.innerHTML = '<div class="box">' + h + '</div>'; bx = OV.querySelector('.box'); if (bx) bx.scrollTop = sc;
  }
  var RN = function () { return g(function () { return W.ifxReports.render; }, null); };
  var say = function (t, bad) { var m = D.getElementById('cp-msg'); if (m) { m.textContent = t; m.style.color = bad ? '#FF6B6B' : 'var(--muted,#9aa3c7)'; } };
  function preset(v) {
    var ym = today().slice(0, 7), n = v === 'yoy' ? 0 : +v.slice(1);
    if (v === 'yoy') C.periods = [monthPeriod(shiftMonth(ym, -12)), monthPeriod(ym)];
    else { C.periods = []; for (var i = n - 1; i >= 0; i--) C.periods.push(monthPeriod(shiftMonth(ym, -i))); }
    MODEL = null; paint();
  }
  function onClick(e) {
    var t = e.target.closest ? e.target.closest('[data-k],[data-a]') : null; if (!t) { if (e.target === OV) close(); return; }
    var a = t.getAttribute('data-a'), k = t.getAttribute('data-k'), v = t.getAttribute('data-v');
    if (k) { C[k] = v; MODEL = null; return paint(); }
    if (a === 'close') return close();
    if (a === 'preset') return preset(v);
    if (a === 'addp') { var last = C.periods[C.periods.length - 1], nx = norm(last); C.periods.push(last.mode === 'month' ? monthPeriod(shiftMonth(last.month, 1)) : { mode: 'custom', month: '', from: nx.to, to: nx.to, label: '' }); MODEL = null; return paint(); }
    if (a === 'delp') { C.periods.splice(+t.getAttribute('data-i'), 1); MODEL = null; return paint(); }
    if (a === 'prev' || a === 'pdf' || a === 'xlsx' || a === 'csv') return run(a);
  }
  function onChange(e) {
    var t = e.target; MODEL = null;
    if (t.getAttribute('data-pm') != null) { var i = +t.getAttribute('data-pm'), p = C.periods[i], cur = norm(p); if (t.value === 'month') { var m = (cur.from || today()).slice(0, 7); C.periods[i] = monthPeriod(m); C.periods[i].label = p.label; } else { C.periods[i] = { mode: 'custom', month: '', from: cur.from, to: cur.to, label: p.label }; } return paint(); }
    if (t.getAttribute('data-pf')) { var pi = +t.getAttribute('data-i'), f = t.getAttribute('data-pf'); C.periods[pi][f] = t.value; if (f === 'month' && t.value) { C.periods[pi].from = t.value + '-01'; C.periods[pi].to = monthEnd(t.value); } return; }
    if (t.getAttribute('data-m')) { C.mods[t.getAttribute('data-m')] = t.checked; return paint(); }
  }
  async function run(kind) {
    if (busy) return; busy = true; var btns = OV.querySelectorAll('.acts button'); btns.forEach(function (b) { b.disabled = true; }); say('Working…');
    try {
      var R = RN(); if (!R) throw new Error('ifinex-reports.js did not load');
      if (!MODEL) MODEL = await buildModel();
      var pv = D.getElementById('cp-prev'); if (pv) pv.innerHTML = R.previewHtml(MODEL);
      if (kind === 'prev') say('Preview ready — scroll down. Use PDF / Excel / CSV to download.');
      else {
        var blob = kind === 'pdf' ? await R.toPdf(MODEL) : kind === 'xlsx' ? await R.toXlsx(MODEL) : R.toCsv(MODEL), name = MODEL.file + '.' + kind, how = await R.saveBlob(blob, name);
        say(how === 'cancelled' ? 'Cancelled.' : how === 'shared' ? '✅ ' + name + ' is ready — choose where to save or share it.' : how === 'fallback' ? 'Use the download button that appeared.' : '✅ ' + name + ' downloaded.');
      }
    } catch (err) { console.error(err); say('❌ ' + (err && err.message ? err.message : 'Could not build the comparison'), true); }
    busy = false; btns = OV.querySelectorAll('.acts button'); btns.forEach(function (b) { b.disabled = false; });
  }
  async function open(entry, opts) {
    ensureDom(); C = fresh(); entry = entry || 'all'; C.entry = entry; MODEL = null; busy = false;
    if (entry === 'bill' || entry === 'et' || entry === 'bp') C.mods = { bill: entry === 'bill', et: entry === 'et', bp: entry === 'bp' };
    if (entry === 'et' && opts && KINDS[opts.kind]) C.kind = opts.kind;
    OV.innerHTML = '<div class="box"><button class="x" data-a="close">✕</button><div class="sub">Loading…</div></div>'; OV.classList.add('open');
    try { await loadUsers(); } catch (e) { console.error(e); }
    paint();
  }
  function close() { if (OV) OV.classList.remove('open'); }
  D.addEventListener('keydown', function (e) { if (e.key === 'Escape' && OV && OV.classList.contains('open')) close(); });
  W.ifxCompare = { open: open, close: close, _state: function () { return C; }, _build: function () { return buildModel(); } };
})();
