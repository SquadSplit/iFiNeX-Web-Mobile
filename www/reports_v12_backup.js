/* ============================================================================
   iFiNeX v12.0 — STATEMENTS & REPORTS (one file, used by the Hub, Bill Tracker and Squad Split)
   Open it with:   ifxReports.open('all')   ·   ifxReports.open('bill')   ·   ifxReports.open('squad')   (only the ticked modules differ)
   Four choices, nothing else:
     1 Duration : Weekly · Monthly · All time · Custom dates
     2 Modules  : tick Squad Split · Bill Tracker · EPP & Gold plans · Expense/Trip/Event trackers · Budget planner
     3 Users    : this account (admins / delegates can pick other users)
     4 Report   : "Balances only"  = who pays whom, how much, and the month-by-month balance (opening + new − paid = closing)
                  "Full breakdown" = the same + every share, payment, settlement, instalment and spending line
   The money engine builds ONE ledger of "A owes B" events from Squad Split (expenses, carried-forward balances, settlements),
   Bill Tracker (owed to admin, payments to admin, party ledger) and EPP & Gold plans (instalments), so the same person is
   one line even when you owe them through Squad Split AND a plan. Positive = you pay, "Receive" = they pay you.
   Reads only — nothing is changed in your data. Output: preview · PDF · Excel (.xlsx) · CSV, saved through ifxXfer.saveBlob()
   (Android share sheet, phone and desktop browsers).
   Page globals declared with `let` (sb, me, managing, …) are read by bare name through the g() helper.
   ============================================================================ */
(function () {
  'use strict';
  var W = window, D = document;
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var p2 = function (n) { return String(n).padStart(2, '0'); };
  var g = function (fn, d) { try { var v = fn(); return v === undefined ? d : v; } catch (e) { return d; } };
  var toast = function (m) { try { if (W.toast) return W.toast(m); if (W.showToast) return W.showToast(m); } catch (e) { } try { alert(m); } catch (e2) { } };
  var today = function () { var d = new Date(); return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); };
  var like = function (s) { return String(s || '').replace(/[%_\\]/g, function (m) { return '\\' + m; }); };
  var money = function (n) { return (Math.round((Number(n) || 0) * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  var lastDay = function (y, m) { return new Date(y, m, 0).getDate(); };
  var monthLabel = function (m) { var p = String(m).split('-').map(Number); return new Date(p[0], p[1] - 1, 1).toLocaleString('en', { month: 'short', year: 'numeric' }); };
  var shiftMonth = function (m, d) { var p = m.split('-').map(Number), x = new Date(p[0], p[1] - 1 + d, 1); return x.getFullYear() + '-' + p2(x.getMonth() + 1); };
  var SB = function () { return g(function () { return sb; }, null); };

  /* ---------- period ---------- */
  var iso = function (d) { return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); };
  var addDays = function (s, n) { var d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() + n); return iso(d); };
  var mondayOf = function (s) { var d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return iso(d); };
  function periodOf(R) {
    var t = today(), ym = t.slice(0, 7), a, b, label;
    if (R.dur === 'week') { a = mondayOf(R.wkDate || t); b = addDays(a, 6); label = 'Week ' + a + '  →  ' + b; }
    else if (R.dur === 'all') { a = '1970-01-01'; b = '2999-12-31'; label = 'All time'; }
    else if (R.dur === 'custom') { a = R.from || ym + '-01'; b = R.to || t; label = a + '  →  ' + b; }
    else { var mm = R.month || ym; a = mm + '-01'; b = mm + '-' + p2(lastDay(+mm.slice(0, 4), +mm.slice(5, 7))); label = monthLabel(mm) + '  (' + a + '  →  ' + b + ')'; }
    return { from: a, to: b, label: label };
  }

  /* ---------- state ---------- */
  var R = null, MODEL = null, busy = false;
  function fresh() {
    var ym = today().slice(0, 7);
    return { dur: 'month', month: ym, wkDate: today(), from: ym + '-01', to: today(), mode: 'bal', scope: 'me', picked: {}, mods: { squad: true, bill: true, plan: true, card: false, et: false, bp: false }, kind: '', events: {}, trackers: [], users: [], group: 'combined', xs: {} };
  }

  /* ---------- people ---------- */
  async function loadUsers() {
    var s = SB(), out = [], acc = g(function () { return managing; }, null) || g(function () { return me; }, null);
    var cur = (acc && acc.email) || g(function () { return currentEmail; }, '') || '';
    if (s && !cur) { try { var gu = await s.auth.getUser(); cur = (gu && gu.data && gu.data.user && gu.data.user.email) || ''; } catch (e) { } }
    if (s) { try { var r = await s.from('app_users').select('id,email,name,emoji,is_admin').order('name'); out = (r.data || []).filter(function (u) { return u.email; }); } catch (e) { } }
    cur = String(cur || '').toLowerCase();
    if (!out.length && cur) out = [{ email: cur, name: (acc && acc.name) || cur }];
    var row = out.filter(function (u) { return String(u.email).toLowerCase() === cur; })[0];
    var admin = g(function () { return canManageOwed(); }, null); if (admin === null) admin = !!(row && row.is_admin);
    R.cur = cur; R.users = out; R.canPick = !!admin && out.length > 1; if (!R.canPick) R.scope = 'me';
    R.picked = {}; R.picked[cur] = true;
  }


  function totalOf(rows, ai, len) { var t = []; for (var i = 0; i < len; i++) t.push(''); t[0] = 'TOTAL'; t[ai] = rows.reduce(function (a, r) { return a + (Number(r[ai]) || 0); }, 0); return t; }

  /* ============================== SQUAD SPLIT DATA ============================== */
  function squadTables(sets, ctx) {
    var P = ctx.P, inR = function (d) { return !!d && d >= P.from && d <= P.to; }, inM = function (m) { return !!m && m >= P.from.slice(0, 7) && m <= P.to.slice(0, 7); };
    var many = sets.length > 1, nameOf = {}; ctx.people.concat(ctx.members).forEach(function (m) { nameOf[m.id] = m.name; });
    var pick = function (id) { return !!ctx.picked[id]; }, anyPick = Object.keys(ctx.picked).some(function (k) { return ctx.picked[k]; });
    var T = [], sumRows = [], expRows = [], setRows = [], prevRows = [], payRows = [], monthly = {}, perMember = {};
    var dateOfS = function (x) { return x.created_at ? String(x.created_at).slice(0, 10) : (x.month ? x.month + '-01' : ''); };
    sets.forEach(function (S) {
      var mem = S.members, net = {}, paid = {}, share = {}, prevAmt = {}, setAmt = {};
      mem.forEach(function (m) { net[m.id] = 0; paid[m.id] = 0; share[m.id] = 0; prevAmt[m.id] = 0; setAmt[m.id] = 0; });
      var exps = S.exp.filter(function (e) { return e.date ? inR(e.date) : inM(e.month); });
      var carryFrom = shiftMonth(P.from.slice(0, 7), -1), carryTo = shiftMonth(P.to.slice(0, 7), -1);
      var prevs = S.prev.filter(function (b) { return b.month >= carryFrom && b.month <= carryTo; });
      var setts = S.set.filter(function (x) { return x.month ? inM(x.month) : inR(dateOfS(x)); });
      prevs.forEach(function (b) { if (net[b.from_member] !== undefined) { net[b.from_member] -= b.amount; prevAmt[b.from_member] -= b.amount; } if (net[b.to_member] !== undefined) { net[b.to_member] += b.amount; prevAmt[b.to_member] += b.amount; } });
      exps.forEach(function (e) {
        var n = (e.split_between || []).length || 1, sh = e.amount / n;
        if (net[e.paid_by] !== undefined) { net[e.paid_by] += e.amount; paid[e.paid_by] += e.amount; }
        (e.split_between || []).forEach(function (id) { if (net[id] !== undefined) { net[id] -= sh; share[id] += sh; } });
      });
      setts.forEach(function (x) { if (net[x.from_member] !== undefined) { net[x.from_member] += x.amount; setAmt[x.from_member] += x.amount; } if (net[x.to_member] !== undefined) { net[x.to_member] -= x.amount; setAmt[x.to_member] -= x.amount; } });
      mem.forEach(function (m) { if (!pick(m.id) && anyPick) return; sumRows.push([many ? S.name : null, m.name, paid[m.id], share[m.id], prevAmt[m.id], setAmt[m.id], net[m.id]]); });
      var involves = function (e) { if (!anyPick) return true; return pick(e.paid_by) || (e.split_between || []).some(pick); };
      exps.filter(involves).forEach(function (e) {
        var n = (e.split_between || []).length || 1;
        expRows.push({ date: e.date || (e.month + '-01'), sq: S.name, what: e.name, cat: e.category || '', by: nameOf[e.paid_by] || e.paid_by, amount: Number(e.amount) || 0, split: (e.split_between || []).map(function (i) { return nameOf[i] || i; }).join(', '), each: (Number(e.amount) || 0) / n, e: e });
        var mo = (e.date || e.month + '-01').slice(0, 7); monthly[mo] = monthly[mo] || {}; if (!anyPick || pick(e.paid_by)) monthly[mo][e.paid_by] = (monthly[mo][e.paid_by] || 0) + e.amount;
      });
      setts.filter(function (x) { return !anyPick || pick(x.from_member) || pick(x.to_member); }).forEach(function (x) { setRows.push([dateOfS(x), S.name, nameOf[x.from_member] || x.from_member, nameOf[x.to_member] || x.to_member, Number(x.amount) || 0]); });
      prevs.filter(function (x) { return !anyPick || pick(x.from_member) || pick(x.to_member); }).forEach(function (x) { prevRows.push([x.month, S.name, nameOf[x.from_member] || x.from_member, nameOf[x.to_member] || x.to_member, Number(x.amount) || 0]); });
      var simp = g(function () { return simplify(net); }, []);
      (simp || []).filter(function (t) { return !anyPick || pick(t.from) || pick(t.to); }).forEach(function (t) { payRows.push([S.name, nameOf[t.from] || t.from, nameOf[t.to] || t.to, t.amount]); });
      mem.forEach(function (m) { if (anyPick && !pick(m.id)) return; var key = m.id; perMember[key] = perMember[key] || { name: m.name, rows: [] }; });
    });
    // summary
    var off = many ? 0 : 1, head = (many ? ['Squad'] : []).concat(['Member', 'Paid', 'Share', 'Carried in', 'Settled', 'NET (+ gets / − owes)']);
    var sr = sumRows.map(function (r) { return many ? r : r.slice(1); }), nCols = head.length, st = ['TOTAL']; for (var c = 1; c < nCols; c++) st.push(''); for (c = (many ? 2 : 1); c < nCols; c++) st[c] = sr.reduce(function (a, r) { return a + (Number(r[c]) || 0); }, 0);
    var numIdx = []; for (c = (many ? 2 : 1); c < nCols; c++) numIdx.push(c);
    T.push({ sheet: 'Summary', title: 'Members — paid, share and net for the period', head: head, rows: sr, total: sr.length ? st : null, num: numIdx });
    if (ctx.group === 'month') {
      var ms = Object.keys(monthly).sort(), cols = ctx.members.filter(function (m) { return !anyPick || pick(m.id); }), rows = ms.map(function (m) { var v = cols.map(function (x) { return monthly[m][x.id] || 0; }); return [monthLabel(m)].concat(v, [v.reduce(function (a, b) { return a + b; }, 0)]); });
      var tr = ['TOTAL']; for (c = 1; c <= cols.length + 1; c++) tr.push(rows.reduce(function (a, r) { return a + r[c]; }, 0));
      T.push({ sheet: 'Monthly', title: 'Paid per member per month', head: ['Month'].concat(cols.map(function (m) { return m.name; }), ['All']), rows: rows, total: rows.length ? tr : null, num: cols.map(function (m, i) { return i + 1; }).concat([cols.length + 1]) });
    }
    if (ctx.sec.a) {
      if (ctx.group === 'user') {
        var who = ctx.members.filter(function (m) { return !anyPick || pick(m.id); });
        who.forEach(function (m) {
          var rows = expRows.filter(function (x) { return x.e.paid_by === m.id || (x.e.split_between || []).indexOf(m.id) >= 0; }).map(function (x) { var inSplit = (x.e.split_between || []).indexOf(m.id) >= 0; return [x.date].concat(many ? [x.sq] : [], [x.what, x.cat, x.by, x.amount, inSplit ? x.each : 0, x.e.paid_by === m.id ? 'yes' : '']); });
          var h = ['Date'].concat(many ? ['Squad'] : [], ['What', 'Category', 'Paid by', 'Amount', 'Your share', 'You paid']);
          T.push({ sheet: m.name, title: 'Expenses — ' + m.name, head: h, rows: rows, total: rows.length ? (function () { var t = h.map(function () { return ''; }); t[0] = 'TOTAL'; var ai = h.indexOf('Amount'), si = h.indexOf('Your share'); t[ai] = rows.reduce(function (a, r) { return a + r[ai]; }, 0); t[si] = rows.reduce(function (a, r) { return a + r[si]; }, 0); return t; })() : null, num: [h.indexOf('Amount'), h.indexOf('Your share')] });
        });
      } else {
        var h2 = ['Date'].concat(many ? ['Squad'] : [], ['What', 'Category', 'Paid by', 'Amount', 'Split between', 'Share each']), rows2 = expRows.sort(function (a, b) { return a.date < b.date ? -1 : 1; }).map(function (x) { return [x.date].concat(many ? [x.sq] : [], [x.what, x.cat, x.by, x.amount, x.split, x.each]); });
        var ai2 = h2.indexOf('Amount'), t2 = h2.map(function () { return ''; }); t2[0] = 'TOTAL'; t2[ai2] = rows2.reduce(function (a, r) { return a + r[ai2]; }, 0);
        T.push({ sheet: 'Expenses', title: 'Expenses in the period', head: h2, rows: rows2, total: rows2.length ? t2 : null, num: [ai2, h2.indexOf('Share each')] });
      }
    }
    if (ctx.sec.b) T.push({ sheet: 'Settlements', title: 'Payments between members (settlements)', head: ['Date', 'Squad', 'From (paid)', 'To (received)', 'Amount'], rows: setRows, total: setRows.length ? totalOf(setRows, 4, 5) : null, num: [4] });
    if (ctx.sec.c) T.push({ sheet: 'Carried in', title: 'Balances carried in from the previous month', head: ['Month', 'Squad', 'From (owes)', 'To (is owed)', 'Amount'], rows: prevRows, total: prevRows.length ? totalOf(prevRows, 4, 5) : null, num: [4] });
    if (ctx.sec.d) T.push({ sheet: 'Who pays whom', title: 'Smallest set of payments that settles the period', head: ['Squad', 'From', 'To', 'Amount'], rows: payRows, total: payRows.length ? totalOf(payRows, 3, 4) : null, num: [3] });
    return { T: T, many: many, anyPick: anyPick, monthly: monthly };
  }

  function usersOf() {
    var us = R.scope === 'all' ? R.users.slice() : R.scope === 'pick' ? R.users.filter(function (u) { return R.picked[String(u.email).toLowerCase()]; }) : R.users.filter(function (u) { return String(u.email).toLowerCase() === R.cur; });
    if (!us.length) us = [{ email: R.cur, name: R.cur }];
    return us.map(function (u) { return { email: u.email, name: u.name || u.email }; });
  }
  /* table whose rows carry the owner name at index 0; the User column is shown only when several users are included. num / sum are column indexes WITHOUT the User column */
  function tbl(many, sheet, title, head, rows, num, sum) {
    var sh = many ? 1 : 0, h = many ? ['User'].concat(head) : head, rr = rows.map(function (r) { return many ? r : r.slice(1); });
    var nn = num.map(function (i) { return i + sh; }), sc = (sum || []).map(function (i) { return i + sh; }), total = null;
    if (rr.length && sc.length) { total = h.map(function () { return ''; }); total[0] = 'TOTAL'; sc.forEach(function (i) { total[i] = rr.reduce(function (a, r) { return a + (Number(r[i]) || 0); }, 0); }); }
    return { sheet: sheet, title: title, head: h, rows: rr, total: total, num: nn };
  }
  function effOf(kind, r, allPaid) {
    if (!r) return 'active'; if (r.status === 'completed') return 'completed'; if (r.auto_complete === false) return 'active';
    var t = today(), ym = t.slice(0, 7);
    switch (kind) {
      case 'et': return r.end_date && r.end_date < t ? 'completed' : 'active';
      case 'plan': return allPaid ? 'completed' : 'active';
      case 'item': return r.month && r.month < ym ? 'completed' : 'active';
      case 'income': return (r.month && r.month < ym) || (r.pay_date && r.pay_date <= t) ? 'completed' : 'active';
      case 'goal': return Number(r.target) > 0 && Number(r.saved) >= Number(r.target) ? 'completed' : 'active';
    }
    return 'active';
  }
  var chunks = function (a, n) { var o = []; for (var i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };
  async function byIds(s, table, col, ids) { var out = []; var cs = chunks(ids, 100); for (var i = 0; i < cs.length; i++) { var r = await s.from(table).select('*').in(col, cs[i]); out = out.concat(r.data || []); } return out; }
  var sumBy = function (o, k, v) { o[k] = (o[k] || 0) + v; };

  /* ============================== LEDGER ENGINE ============================== */
  var EPS = 0.005, r2 = function (n) { return Math.round((Number(n) || 0) * 100) / 100; }, nz = function (n) { return Math.abs(n) >= EPS; };
  var monthEnd = function (m) { return m + '-' + p2(lastDay(+m.slice(0, 4), +m.slice(5, 7))); };
  var lower = function (s) { return String(s || '').trim().toLowerCase(); };
  /* the date a month-based row belongs to: its real date when it was saved inside that month, otherwise the last day of that month (never later than today) */
  var rowDate = function (x) {
    var c = x.created_at ? String(x.created_at).slice(0, 10) : '', m = x.month || '', t = today();
    if (!m) return c;
    if (c && c.slice(0, 7) === m) return c;
    var e = monthEnd(m); return e > t && m <= t.slice(0, 7) ? t : e;
  };
  async function fetchAll(s, table, qf, noOrder) {
    var out = [], from = 0, step = 1000;
    for (; ;) {
      var q = s.from(table).select('*'); if (qf) q = qf(q); if (!noOrder && q.order) q = q.order('id');
      var r = q.range ? await q.range(from, from + step - 1) : await q;
      if (!r || r.error) break;
      var d = r.data || []; out = out.concat(d); if (d.length < step || from > 40000) break; from += step;
    }
    return out;
  }
  var MODL = { squad: 'Squad Split', admin: 'Bill Tracker — owed to admin', party: 'Bill Tracker — party ledger', plan: 'EPP & Gold plans', own: 'EPP & Gold — own plans (card / bank)' };

  /* every "D owes C" fact the selected modules know about: kind = charge (D owes more) · paid (D paid C) · carry (balance carried forward into a month) */
  async function loadEvents(s) {
    var EV = [], nm = {}, sets = [], people = [], M = R.mods;
    var keyOf = function (email, name) { var e = lower(email); return e || ('n:' + lower(name)); };
    var setName = function (k, n, strong) { if (n && (strong || !nm[k])) nm[k] = n; };
    R.users.forEach(function (u) { setName(lower(u.email), u.name, true); });
    var adm = R.users.filter(function (u) { return u.is_admin; }), admU = adm.filter(function (u) { return lower(u.email) === R.cur; })[0] || adm[0];
    var adminKey = admU ? lower(admU.email) : 'n:admin'; if (!admU) nm[adminKey] = 'Admin';
    var add = function (o) { if (o.D && o.C && o.D !== o.C && o.d && Number(o.amt)) { o.amt = Number(o.amt); EV.push(o); } };

    if (M.squad) {
      var q = await Promise.all([fetchAll(s, 'members_config'), s.from('squads').select('*'), s.from('squad_members').select('squad_id,member_id'), fetchAll(s, 'expenses'), fetchAll(s, 'prev_balances'), fetchAll(s, 'settlements')]);
      people = q[0]; var legacy = !!(q[1] && q[1].error), byId = {};
      people.forEach(function (m) { byId[m.id] = m; setName(keyOf(m.email, m.name), m.name, false); });
      var pk = function (id) { var m = byId[id]; return m ? keyOf(m.email, m.name) : 'n:' + lower(id); };
      if (legacy) sets.push({ id: null, name: 'Squad', members: people, exp: q[3], prev: q[4], set: q[5] });
      else {
        var sm = (q[2] && q[2].data) || [];
        ((q[1] && q[1].data) || []).filter(function (x) { return !x.is_archived; }).forEach(function (sq) {
          var ids = sm.filter(function (x) { return x.squad_id === sq.id; }).map(function (x) { return x.member_id; }), by = function (a) { return a.filter(function (x) { return x.squad_id === sq.id; }); };
          sets.push({ id: sq.id, name: sq.name, members: people.filter(function (m) { return ids.indexOf(m.id) >= 0; }), exp: by(q[3]), prev: by(q[4]), set: by(q[5]) });
        });
      }
      sets.forEach(function (S) {
        S.exp.forEach(function (e) {
          var d = e.date || (e.month ? e.month + '-01' : ''), sp = e.split_between || [], n = sp.length, amt = Number(e.amount) || 0; if (!d || !n) return;
          sp.forEach(function (id) { if (id !== e.paid_by) add({ D: pk(id), C: pk(e.paid_by), mod: 'squad', sub: S.name, kind: 'charge', amt: amt / n, d: d, what: (e.name || 'Expense') + ' · ' + money(amt) + ' split ' + n + ' ways' }); });
        });
        S.set.forEach(function (x) { add({ D: pk(x.from_member), C: pk(x.to_member), mod: 'squad', sub: S.name, kind: 'paid', amt: x.amount, d: rowDate(x), what: 'Settlement' }); });
        S.prev.forEach(function (b) { if (b.month) add({ D: pk(b.from_member), C: pk(b.to_member), mod: 'squad', sub: S.name, kind: 'carry', amt: b.amount, d: shiftMonth(b.month, 1) + '-01', what: 'Balance carried forward from ' + monthLabel(b.month) }); });
      });
    }

    var payees = [], pById = {};
    if (M.bill || M.plan) { payees = await fetchAll(s, 'bill_payees'); payees.forEach(function (p) { pById[p.id] = p; setName(keyOf(p.party_email, p.party_name), p.party_name, false); }); }
    var pKey = function (p) { return keyOf(p.party_email, p.party_name); };

    if (M.bill) {
      var br = await Promise.all([fetchAll(s, 'bill_owed'), fetchAll(s, 'bill_settlements'), fetchAll(s, 'bill_payee_entries')]);
      br[0].forEach(function (x) { add({ D: lower(x.user_email), C: adminKey, mod: 'admin', sub: 'Owed to admin', kind: 'charge', amt: x.amount, d: rowDate(x), what: x.note || 'Owed amount' }); });
      br[1].forEach(function (x) { add({ D: lower(x.user_email), C: adminKey, mod: 'admin', sub: 'Owed to admin', kind: 'paid', amt: x.amount, d: rowDate(x), what: x.note || 'Paid to admin' }); });
      br[2].forEach(function (e) {
        var p = pById[e.payee_id]; if (!p) return; var d = e.date || rowDate(e), what = (e.note || '') + (e.payment_type ? (e.note ? ' · ' : '') + e.payment_type : '');
        if (e.entry_type === 'owe') add({ D: lower(p.user_email), C: pKey(p), mod: 'party', sub: 'Party ledger', kind: 'charge', amt: e.amount, d: d, what: what || 'Owed' });
        else if (e.entry_type === 'paid') add({ D: lower(p.user_email), C: pKey(p), mod: 'party', sub: 'Party ledger', kind: 'paid', amt: e.amount, d: d, what: what || 'Paid' });
      });
    }

    if (M.plan) {
      var pr = await Promise.all([fetchAll(s, 'bill_plans'), fetchAll(s, 'bill_plan_payments'), fetchAll(s, 'bill_cards')]), cardOwner = {};
      pr[2].forEach(function (c) { cardOwner[c.id] = lower(c.user_email); });
      var planBy = {}; pr[0].forEach(function (pl) { planBy[pl.id] = pl; });
      pr[1].forEach(function (x) {
        var pl = planBy[x.plan_id]; if (!pl || !x.due_date) return;
        var owner = lower(pl.user_email), py = pById[pl.payee_id], other = py ? pKey(py) : (pl.card_id && cardOwner[pl.card_id] && cardOwner[pl.card_id] !== owner ? cardOwner[pl.card_id] : ''), D, C, mod = 'plan';
        if (pl.ledger === 'owe_other') { D = owner; C = other; }
        else if (pl.ledger === 'owe_admin') { D = owner; C = adminKey; }
        else if (pl.ledger === 'owed_to_you') { D = other; C = owner; }
        else { D = owner; C = '~own'; mod = 'own'; nm['~own'] = 'Own plans (card / bank)'; }
        var paid = x.status === 'paid', pd = paid ? String(x.paid_at || x.due_date).slice(0, 10) : '', cd = paid && pd < x.due_date ? pd : x.due_date, tag = (pl.title || 'Plan') + ' #' + x.seq + (pl.installments ? '/' + pl.installments : '');
        add({ D: D, C: C, mod: mod, sub: pl.title || 'Plan', kind: 'charge', amt: x.amount, d: cd, what: tag + ' · due ' + x.due_date });
        if (paid) add({ D: D, C: C, mod: mod, sub: pl.title || 'Plan', kind: 'paid', amt: x.amount, d: pd, what: tag + ' · paid' });
      });
    }
    var nameOf = function (k) { return nm[k] || (k.indexOf('n:') === 0 ? k.slice(2).replace(/\b\w/g, function (c) { return c.toUpperCase(); }) : k.split('@')[0]); };
    return { EV: EV, nameOf: nameOf, sets: sets, people: people };
  }

  /* balance of one ledger line (a person + a module) over the window [a,b].  carry = Squad Split (a month starts from the balance carried forward into it, exactly like the Squad page);
     cumul = everything else (opening = every earlier charge − every earlier payment) */
  function bucket(G, a, b) {
    var open = 0, ch = 0, pd = 0, ms = a.slice(0, 7), i, e, c;
    for (i = 0; i < G.ev.length; i++) {
      e = G.ev[i]; c = e.kind === 'paid' ? -e.a : e.a;
      if (G.mode === 'carry') { if (e.d.slice(0, 7) !== ms) continue; if (e.kind === 'carry') { open += c; continue; } if (e.d < a) { open += c; continue; } }
      else if (e.d < a) { open += c; continue; }
      if (e.d > b) continue;
      if (e.kind === 'paid') pd += e.a; else if (e.kind === 'charge') ch += e.a;
    }
    return { open: open, ch: ch, pd: pd, close: open + ch - pd };
  }

  function ledgerTables(users, L, P, many, full) {
    var td = today(), endEff = P.to < td ? P.to : td, nameOf = L.nameOf, uk = users.map(function (u) { return { k: lower(u.email), name: u.name }; }), groups = {}, per = {};
    L.EV.forEach(function (ev) {
      uk.forEach(function (u) {
        var x, s; if (ev.D === u.k) { x = ev.C; s = 1; } else if (ev.C === u.k) { x = ev.D; s = -1; } else return;
        var gk = u.k + '|' + x + '|' + ev.mod, G = groups[gk] || (groups[gk] = { u: u, x: x, mod: ev.mod, mode: ev.mod === 'squad' ? 'carry' : 'cumul', ev: [] });
        G.ev.push({ d: ev.d, kind: ev.kind, a: s * ev.amt, abs: ev.amt, s: s, sub: ev.sub, what: ev.what });
      });
    });
    var gl = Object.keys(groups).map(function (k) { return groups[k]; });
    gl.sort(function (p, q) { return p.u.name < q.u.name ? -1 : p.u.name > q.u.name ? 1 : (nameOf(p.x).toLowerCase() < nameOf(q.x).toLowerCase() ? -1 : nameOf(p.x).toLowerCase() > nameOf(q.x).toLowerCase() ? 1 : (p.mod < q.mod ? -1 : 1)); });
    var hist = [], paidR = [], det = { squad: [], admin: [], party: [], plan: [], own: [] };
    gl.forEach(function (G) {
      G.ev.sort(function (p, q) { return p.d < q.d ? -1 : p.d > q.d ? 1 : (p.kind === 'carry' ? -1 : q.kind === 'carry' ? 1 : 0); });
      var first = G.ev[0].d.slice(0, 7), startM = P.from <= '1970-01-01' ? first : P.from.slice(0, 7), endM = endEff.slice(0, 7), months = [], m = startM;
      while (startM <= endM && m <= endM && months.length < 150) { months.push(m); m = shiftMonth(m, 1); }
      var trail = months.map(function (mm) { var a = P.from > mm + '-01' ? P.from : mm + '-01', b = endEff < monthEnd(mm) ? endEff : monthEnd(mm), k = bucket(G, a, b); k.m = mm; k.a = a; k.b = b; return k; });
      var now = trail.length ? trail[trail.length - 1] : { open: 0, ch: 0, pd: 0, close: 0 }, or = 1, i;
      if (now.close < -EPS) or = -1; else if (now.close <= EPS) { for (i = trail.length - 1; i >= 0; i--) if (nz(trail[i].close)) { or = trail[i].close > 0 ? 1 : -1; break; } }
      G.now = now; G.or = or;
      G.up = G.ev.filter(function (e) { return e.kind === 'charge' && e.d > td && e.d <= P.to; }).reduce(function (a, e) { return a + e.a; }, 0);
      trail.forEach(function (k) {
        if (!(nz(k.open) || nz(k.ch) || nz(k.pd) || nz(k.close))) return;
        var part = (k.a !== k.m + '-01' || k.b !== monthEnd(k.m)) ? ' (' + k.a.slice(8) + '–' + k.b.slice(8) + ')' : '';
        hist.push([G.u.name, monthLabel(k.m) + part, nameOf(G.x), MODL[G.mod], or > 0 ? 'Pay' : 'Receive', r2(or * k.open), r2(or * k.ch), r2(or * k.pd), r2(or * k.close)]);
      });
      var pa = {};
      G.ev.forEach(function (e) {
        if (e.kind !== 'paid' || e.d > td) return;
        var o = pa[e.s] || (pa[e.s] = { per: 0, tot: 0, n: 0, last: '', amt: 0 }); o.tot += e.abs;
        if (e.d >= P.from && e.d <= endEff) { o.per += e.abs; o.n++; }
        if (e.d >= o.last) { o.last = e.d; o.amt = e.abs; }
      });
      G.paid = pa;
      Object.keys(pa).forEach(function (sg) { var o = pa[sg]; paidR.push([G.u.name, nameOf(G.x), MODL[G.mod], sg === '1' ? 'You paid' : 'You received', r2(o.per), r2(o.tot), o.last, r2(o.amt), o.n]); });
      if (full) {
        var a0 = P.from <= '1970-01-01' ? first + '-01' : P.from, bal = or * bucket(G, a0, endEff).open, rows = det[G.mod], lastCarry = '';
        if (nz(bal)) rows.push([G.u.name, a0, nameOf(G.x), 'Opening balance (brought forward)', '', '', r2(bal)]);
        G.ev.forEach(function (e) {
          if (e.d < a0 || e.d > P.to) return;
          if (e.d > td) { rows.push([G.u.name, e.d, nameOf(G.x), '(upcoming) ' + e.sub + ' · ' + e.what, r2(or * e.a), '', '']); return; }
          if (e.kind === 'carry') {
            if (e.d.slice(0, 7) === a0.slice(0, 7)) return;
            bal = (lastCarry === e.d ? bal : 0) + or * e.a; lastCarry = e.d;
            rows.push([G.u.name, e.d, nameOf(G.x), e.what + ' (balance restarts from this amount)', '', '', r2(bal)]); return;
          }
          if (e.kind === 'charge') { bal += or * e.a; rows.push([G.u.name, e.d, nameOf(G.x), e.sub + ' · ' + e.what, r2(or * e.a), '', r2(bal)]); }
          else { bal -= or * e.a; rows.push([G.u.name, e.d, nameOf(G.x), e.sub + ' · ' + e.what, '', r2(or * e.a), r2(bal)]); }
        });
      }
    });
    /* totals per person, then per module (a person counts once, on the side of their net balance, so "Total to pay" and the module summary always agree) */
    gl.forEach(function (G) {
      var U = per[G.u.k] || (per[G.u.k] = { name: G.u.name, cp: {}, mod: {} });
      var cp = U.cp[G.x] || (U.cp[G.x] = { squad: 0, bill: 0, plan: 0, own: 0, up: 0 }), col = G.mod === 'squad' ? 'squad' : (G.mod === 'admin' || G.mod === 'party') ? 'bill' : G.mod === 'own' ? 'own' : 'plan';
      cp[col] += G.now.close; if (G.up > EPS) cp.up += G.up;
    });
    var sumR = [], payR = [], recR = [], mods = []; if (R.mods.squad) mods.push('squad'); if (R.mods.bill) mods.push('admin', 'party'); if (R.mods.plan) mods.push('plan', 'own');
    uk.forEach(function (u) {
      var U = per[u.k] || { name: u.name, cp: {}, mod: {} }, M = {}; mods.forEach(function (m) { M[m] = { pay: 0, rec: 0, paid: 0, rcvd: 0, up: 0 }; });
      var netOf = function (x) { var c = U.cp[x]; return c.squad + c.bill + c.plan + c.own; };
      gl.forEach(function (G) {
        if (G.u.k !== u.k || !M[G.mod]) return; var net = netOf(G.x), m = M[G.mod];
        if (net > EPS) m.pay += G.now.close; else if (net < -EPS) m.rec += -G.now.close;
        if (G.up > EPS) m.up += G.up;
        Object.keys(G.paid).forEach(function (sg) { if (sg === '1') m.paid += G.paid[sg].per; else m.rcvd += G.paid[sg].per; });
      });
      var all = { pay: 0, rec: 0, paid: 0, rcvd: 0, up: 0 };
      mods.forEach(function (m) { var o = M[m]; sumR.push([u.name, MODL[m], r2(o.pay), r2(o.rec), r2(o.paid), r2(o.rcvd), r2(o.up)]); Object.keys(all).forEach(function (k) { all[k] += o[k]; }); });
      sumR.push([u.name, '▶ ALL MODULES', r2(all.pay), r2(all.rec), r2(all.paid), r2(all.rcvd), r2(all.up)]);
      Object.keys(U.cp).forEach(function (x) {
        var c = U.cp[x], net = netOf(x);
        if (net > EPS || (c.up > EPS && net > -EPS)) payR.push([u.name, nameOf(x), r2(net), r2(c.squad), r2(c.bill), r2(c.plan), r2(c.own), r2(c.up)]);
        else if (net < -EPS) recR.push([u.name, nameOf(x), r2(-net), r2(-c.squad), r2(-c.bill), r2(-c.plan), r2(-c.own)]);
      });
    });
    payR.sort(function (p, q) { return p[0] < q[0] ? -1 : p[0] > q[0] ? 1 : q[2] - p[2]; }); recR.sort(function (p, q) { return p[0] < q[0] ? -1 : p[0] > q[0] ? 1 : q[2] - p[2]; });
    paidR.sort(function (p, q) { return p[0] < q[0] ? -1 : p[0] > q[0] ? 1 : (p[6] < q[6] ? 1 : -1); });
    var T = [], showMods = { squad: R.mods.squad, bill: R.mods.bill, plan: R.mods.plan };
    T.push(tbl(many, 'Summary', 'Summary — what you pay and what you receive, by module', ['Module', 'You pay (balance)', 'You receive (balance)', 'You paid in period', 'You received in period', 'Upcoming (due later)'], sumR, [1, 2, 3, 4, 5], []));
    T.push(tbl(many, 'Total to pay', 'TOTAL TO PAY — who you pay (one line per person, all modules together; a − inside a column means that part is owed to you)', ['Pay to', 'TOTAL TO PAY', 'Squad Split', 'Bill Tracker', 'EPP & Gold', 'Own plans', 'Upcoming (due later)'], payR, [1, 2, 3, 4, 5, 6], [1, 2, 3, 4, 5, 6]));
    T.push(tbl(many, 'Owed to you', 'OWED TO YOU — who needs to pay you (a − inside a column means that part is owed by you)', ['Receive from', 'TOTAL OWED TO YOU', 'Squad Split', 'Bill Tracker', 'EPP & Gold', 'Own plans'], recR, [1, 2, 3, 4, 5], [1, 2, 3, 4, 5]));
    T.push(tbl(many, 'Paid so far', 'Paid so far — to whom, how much and when', ['With', 'Module', 'Direction', 'Paid in period', 'Paid to date (all time)', 'Last payment on', 'Last amount', 'Payments in period'], paidR, [3, 4, 6], [3, 4]));
    T.push(tbl(many, 'Balance history', 'Balance history by month — opening + new charges − paid = closing', ['Month', 'With', 'Module', 'Direction', 'Opening (brought forward)', 'New charges', 'Paid / settled', 'Closing balance'], hist, [4, 5, 6, 7], []));
    if (full) {
      var dh = ['Date', 'With', 'Detail', 'Charge', 'Paid', 'Balance'], dn = { squad: 'Squad Split — every share, carried-forward balance and settlement', admin: 'Bill Tracker — amounts owed to admin and payments to admin', party: 'Bill Tracker — party ledger entries', plan: 'EPP & Gold plans — instalments due and paid', own: 'EPP & Gold — own plans (instalments to your card / bank)' }, ds = { squad: 'Squad details', admin: 'Admin details', party: 'Party details', plan: 'Plan details', own: 'Own plan details' };
      mods.forEach(function (m) { T.push(tbl(many, ds[m], dn[m], dh, det[m], [3, 4, 5], [3, 4])); });
    }
    return { T: T, hasAny: gl.length > 0 };
  }


  async function etPart(users, P, s, many) {
    var inR = function (d) { return !!d && d >= P.from && d <= P.to; }, trs = [];
    await Promise.all(users.map(async function (u) { var r = await s.from('et_trackers').select('*').ilike('user_email', like(u.email)); (r.data || []).forEach(function (t) { if (R.kind && t.kind !== R.kind) return; t.__o = u.name; trs.push(t); }); }));
    var pickedEv = Object.keys(R.events).filter(function (k) { return R.events[k]; });
    var cand = trs.filter(function (t) { return pickedEv.length ? R.events[t.id] : ((!t.start_date || t.start_date <= P.to) && (!t.end_date || t.end_date >= P.from)); });
    cand.sort(function (a, b) { return String(a.start_date || '') < String(b.start_date || '') ? -1 : 1; });
    var ents = (await byIds(s, 'et_entries', 'tracker_id', cand.map(function (t) { return t.id; }))).filter(function (e) { return inR(e.entry_date); });
    var T = [], monthly = {}, nm = {}; cand.forEach(function (t) { nm[t.id] = t; });
    ents.forEach(function (e) { sumBy(monthly, String(e.entry_date).slice(0, 7), Number(e.amount) || 0); });
    if (R.xs.et_a) T.push(tbl(many, 'Trackers', 'Expense / Trip / Event trackers in the period', ['Tracker', 'Type', 'From', 'To', 'Status', 'Entries', 'Spent'], cand.map(function (t) { var es = ents.filter(function (e) { return e.tracker_id === t.id; }); return [t.__o, t.title, t.kind, t.start_date || '', t.end_date || '', effOf('et', t), es.length, es.reduce(function (a, e) { return a + (Number(e.amount) || 0); }, 0)]; }), [6], [5, 6]));
    if (R.xs.et_b) {
      var row = function (e) { var t = nm[e.tracker_id] || {}; return [t.__o, e.entry_date, t.title || '', e.category || '', e.spent_by || '', e.note || '', Number(e.amount) || 0]; };
      if (R.group === 'user') cand.forEach(function (t) { var es = ents.filter(function (e) { return e.tracker_id === t.id; }).sort(function (a, b) { return a.entry_date < b.entry_date ? -1 : 1; }); T.push(tbl(many, t.title, 'Entries — ' + t.title, ['Date', 'Tracker', 'Category', 'Spent by', 'Note', 'Amount'], es.map(row), [5], [5])); });
      else T.push(tbl(many, 'Tracker entries', 'Tracker entries in the period', ['Date', 'Tracker', 'Category', 'Spent by', 'Note', 'Amount'], ents.slice().sort(function (a, b) { return a.entry_date < b.entry_date ? -1 : 1; }).map(row), [5], [5]));
    }
    if (R.xs.et_c) {
      var agg = {}; ents.forEach(function (e) { var t = nm[e.tracker_id] || {}, k = e.tracker_id + '|' + (e.spent_by || '—'); (agg[k] = agg[k] || { o: t.__o, t: t.title || '', p: e.spent_by || '—', n: 0, a: 0 }); agg[k].n++; agg[k].a += Number(e.amount) || 0; });
      T.push(tbl(many, 'Spent by person', 'Who spent what (per tracker)', ['Tracker', 'Person', 'Entries', 'Spent'], Object.keys(agg).map(function (k) { var x = agg[k]; return [x.o, x.t, x.p, x.n, x.a]; }), [3], [2, 3]));
    }
    return { T: T, monthly: monthly };
  }

  async function bpPart(users, P, s, many) {
    var inM = function (m) { return !!m && m >= P.from.slice(0, 7) && m <= P.to.slice(0, 7); }, inR = function (d) { return !!d && d >= P.from && d <= P.to; };
    var inc = [], itm = [], gl = [];
    await Promise.all(users.map(async function (u) {
      var q = function (t) { return s.from(t).select('*').ilike('user_email', like(u.email)); }, r = await Promise.all([q('bp_income'), q('bp_items'), q('bp_goals')]);
      (r[0].data || []).forEach(function (x) { if (x.month ? inM(x.month) : inR(x.pay_date)) { x.__o = u.name; inc.push(x); } });
      (r[1].data || []).forEach(function (x) { if (inM(x.month)) { x.__o = u.name; itm.push(x); } });
      (r[2].data || []).forEach(function (x) { x.__o = u.name; gl.push(x); });
    }));
    var T = [], mi = {}, mp = {}, sm = {};
    inc.forEach(function (x) { var m = x.month || String(x.pay_date).slice(0, 7); sumBy(mi, m, Number(x.amount) || 0); var k = x.__o + '|' + m; (sm[k] = sm[k] || { o: x.__o, m: m, i: 0, p: 0 }).i += Number(x.amount) || 0; });
    itm.forEach(function (x) { sumBy(mp, x.month, Number(x.planned) || 0); var k = x.__o + '|' + x.month; (sm[k] = sm[k] || { o: x.__o, m: x.month, i: 0, p: 0 }).p += Number(x.planned) || 0; });
    if (R.xs.bp_a) T.push(tbl(many, 'Budget summary', 'Budget — income vs planned per month', ['Month', 'Income', 'Planned', 'Left'], Object.keys(sm).sort(function (a, b) { return sm[a].m < sm[b].m ? -1 : sm[a].m > sm[b].m ? 1 : 0; }).map(function (k) { var x = sm[k]; return [x.o, monthLabel(x.m), x.i, x.p, x.i - x.p]; }), [1, 2, 3], [1, 2, 3]));
    if (R.xs.bp_b) {
      T.push(tbl(many, 'Budget income', 'Budget — income', ['Month', 'Source', 'Type', 'Pay date', 'Amount', 'Status'], inc.sort(function (a, b) { return String(a.month) < String(b.month) ? -1 : 1; }).map(function (x) { return [x.__o, x.month || '', x.source || '', x.kind || '', x.pay_date || '', Number(x.amount) || 0, effOf('income', x)]; }), [4], [4]));
      T.push(tbl(many, 'Budget lines', 'Budget — planned lines', ['Month', 'Category', 'Bucket', 'Planned', 'Status'], itm.sort(function (a, b) { return a.month < b.month ? -1 : 1; }).map(function (x) { return [x.__o, x.month, x.category || '', x.bucket || '', Number(x.planned) || 0, effOf('item', x)]; }), [3], [3]));
    }
    if (R.xs.bp_c) T.push(tbl(many, 'Budget goals', 'Savings goals (all, with progress)', ['Goal', 'Target', 'Saved', 'Progress %', 'Due', 'Status'], gl.map(function (x) { var tg = Number(x.target) || 0, sv = Number(x.saved) || 0; return [x.__o, x.name || '', tg, sv, tg > 0 ? Math.round(sv / tg * 100) : 0, x.due_date || '', effOf('goal', x)]; }), [1, 2, 3], [1, 2]));
    return { T: T, inc: mi, plan: mp };
  }

  async function plPart(users, P, s, many) {
    var inR = function (d) { return !!d && d >= P.from && d <= P.to; }, plans = [];
    await Promise.all(users.map(async function (u) { var r = await s.from('bill_plans').select('*').ilike('user_email', like(u.email)); (r.data || []).forEach(function (x) { x.__o = u.name; plans.push(x); }); }));
    var pays = await byIds(s, 'bill_plan_payments', 'plan_id', plans.map(function (x) { return x.id; }));
    var keep = plans.filter(function (pl) { return ((!pl.start_date || pl.start_date <= P.to) && (!pl.end_date || pl.end_date >= P.from)) || pays.some(function (x) { return x.plan_id === pl.id && inR(x.due_date); }); });
    var T = [], monthly = {}, nm = {}; keep.forEach(function (x) { nm[x.id] = x; });
    var inst = pays.filter(function (x) { return nm[x.plan_id] && inR(x.due_date); }).sort(function (a, b) { return a.due_date < b.due_date ? -1 : 1; });
    inst.forEach(function (x) { sumBy(monthly, String(x.due_date).slice(0, 7), Number(x.amount) || 0); });
    if (R.xs.pl_a) T.push(tbl(many, 'Plans', 'EPP & Gold plans', ['Type', 'Plan', 'Event', 'Total', 'Instalments', 'Paid', 'Left to pay', 'Start', 'End', 'Status'], keep.map(function (pl) { var ps = pays.filter(function (x) { return x.plan_id === pl.id; }), paid = ps.filter(function (x) { return x.status === 'paid'; }), left = ps.filter(function (x) { return x.status !== 'paid'; }).reduce(function (a, x) { return a + (Number(x.amount) || 0); }, 0); return [pl.__o, pl.plan_type || '', pl.title || '', pl.event_name || '', Number(pl.total_amount) || 0, pl.installments || ps.length, paid.length, left, pl.start_date || '', pl.end_date || '', effOf('plan', pl, ps.length > 0 && paid.length === ps.length)]; }), [3, 6], [3, 6]));
    if (R.xs.pl_b) T.push(tbl(many, 'Instalments', 'Instalments due in the period', ['Plan', '#', 'Due', 'Amount', 'Status', 'Paid on'], inst.map(function (x) { var pl = nm[x.plan_id]; return [pl.__o, pl.title || '', x.seq, x.due_date, Number(x.amount) || 0, x.status || '', x.paid_at ? String(x.paid_at).slice(0, 10) : '']; }), [3], [3]));
    return { T: T, monthly: monthly };
  }

  /* ============================== OTHER PARTS + THE REPORT ============================== */
  async function spendPart(users, P, s, many, full) {
    var rows = [], agg = [], inR = function (d) { return !!d && d >= P.from && d <= P.to; };
    await Promise.all(users.map(async function (u) {
      var em = like(u.email), r = await Promise.all([fetchAll(s, 'bill_expenses', function (q) { return q.ilike('user_email', em); }), fetchAll(s, 'bill_cards', function (q) { return q.ilike('user_email', em); })]), cn = {};
      r[1].forEach(function (c) { cn[c.id] = c.card_name; });
      var list = r[0].filter(function (x) { return inR(x.date); }).sort(function (a, b) { return a.date < b.date ? -1 : 1; });
      agg.push([u.name, list.length, list.reduce(function (a, x) { return a + (Number(x.amount) || 0); }, 0)]);
      list.forEach(function (x) { rows.push([u.name, x.date, x.description || '', x.category || '', x.card_id ? (cn[x.card_id] || '—') : 'Cash / none', Number(x.amount) || 0]); });
    }));
    var T = [tbl(many, 'Bill spending', 'Bill Tracker — personal spending in the period', ['Expenses (count)', 'Spent'], agg, [1], [1])];
    if (full) T.push(tbl(many, 'Bill spending list', 'Bill Tracker — every expense in the period', ['Date', 'What', 'Category', 'Card', 'Amount'], rows, [4], [4]));
    return T;
  }
  function squadExtras(users, L, P) {
    var emails = users.map(function (u) { return lower(u.email); }), picked = {};
    L.people.forEach(function (m) { if (m.email && emails.indexOf(lower(m.email)) >= 0) picked[m.id] = true; });
    var sets = L.sets.filter(function (S) { return S.members.some(function (m) { return picked[m.id]; }); });
    if (!sets.length) return [];
    var res = squadTables(sets, { P: P, people: L.people, members: L.people, picked: picked, sec: { a: true, b: false, c: false, d: false }, group: 'combined' });
    return res.T.filter(function (t) { return t.sheet === 'Summary' || t.sheet === 'Expenses'; }).map(function (t) { t.title = 'Squad Split — ' + t.title; t.sheet = t.sheet === 'Summary' ? 'Squad summary' : 'Squad expenses'; return t; });
  }
  var KINDLBL = { period: 'Expense trackers', occasion: 'Event trackers', trip: 'Trip trackers' };
  var MODNAME = { squad: 'Squad Split', bill: 'Bill Tracker', plan: 'EPP & Gold plans', card: 'Shared card payments', et: 'Trackers', bp: 'Budget' };
  async function cardPart(users, P, s, many, full) {
    var td = today(), cards = [], pays = [], shares = [], inR = function (d) { return !!d && d >= P.from && d <= P.to; };
    await Promise.all(users.map(async function (u) {
      var em = like(u.email), r = await Promise.all([fetchAll(s, 'bill_cards', function (q) { return q.ilike('user_email', em); }), fetchAll(s, 'bill_card_payments', function (q) { return q.ilike('user_email', em); }), fetchAll(s, 'bill_card_shares', function (q) { return q.ilike('owner_email', em); })]);
      r[0].forEach(function (c) { c.__o = u.name; cards.push(c); }); r[1].forEach(function (x) { x.__o = u.name; pays.push(x); }); shares = shares.concat(r[2]);
    }));
    var byId = {}; cards.forEach(function (c) { byId[c.id] = c; });
    var nameByEmail = {}; R.users.forEach(function (u) { nameByEmail[lower(u.email)] = u.name; });
    var shared = function (id) { return shares.filter(function (x) { return x.card_id === id; }).map(function (x) { return nameByEmail[lower(x.shared_with_email)] || x.shared_with_email; }).join(', '); };
    var isPaid = function (x) { return x.status === 'paid'; }, amt = function (x) { return Number(x.amount_due) || 0; }, dueOf = function (x) { return x.due_date || (x.month ? x.month + '-01' : ''); };
    var rows = cards.map(function (c) {
      var mine = pays.filter(function (x) { return x.card_id === c.id; }), per = mine.filter(function (x) { return inR(dueOf(x)); });
      var sum = function (a) { return a.reduce(function (t, x) { return t + amt(x); }, 0); };
      return [c.__o, c.card_name, shared(c.id) || '—', per.length, sum(per), sum(per.filter(isPaid)), sum(per.filter(function (x) { return !isPaid(x); })), sum(mine.filter(function (x) { return !isPaid(x) && dueOf(x) <= td; }))];
    });
    var T = [tbl(many, 'Card payments', 'Shared card payments — dues per card', ['Card', 'Shared with', 'Dues in period', 'Amount due', 'Paid', 'Unpaid', 'Unpaid overall (due up to today)'], rows, [3, 4, 5, 6], [2, 3, 4, 5, 6])];
    if (full) {
      var list = pays.filter(function (x) { return inR(dueOf(x)); }).sort(function (a, b) { return dueOf(a) < dueOf(b) ? -1 : 1; });
      T.push(tbl(many, 'Card payment lines', 'Shared card payments — every due in the period', ['Card', 'Month', 'Due date', 'Amount due', 'Status', 'Paid on'], list.map(function (x) { return [x.__o, (byId[x.card_id] || {}).card_name || '—', x.month || '', x.due_date || '', amt(x), isPaid(x) ? 'paid' : (dueOf(x) < td ? 'overdue' : 'pending'), x.paid_at ? String(x.paid_at).slice(0, 10) : '']; }), [3], [3]));
    }
    return T;
  }
  async function allModel() {
    var s = SB(); if (!s) throw new Error('Reports need the live database (demo mode has no database).');
    var P = periodOf(R), users = usersOf(), many = users.length > 1, full = R.mode === 'full', T = [], M = R.mods;
    R.group = full ? 'user' : 'combined'; R.xs = { et_a: true, et_b: full, et_c: full, bp_a: true, bp_b: full, bp_c: full, pl_a: full, pl_b: false };
    var L = null;
    if (M.squad || M.bill || M.plan) {
      L = await loadEvents(s); var led = ledgerTables(users, L, P, many, full); T = T.concat(led.T);
      if (!led.hasAny) T.unshift({ sheet: 'Summary', title: 'Nothing owed between the selected people for the selected modules.', head: ['Info'], rows: [], total: null, num: [] });
    }
    if (M.bill) T = T.concat(await spendPart(users, P, s, many, full));
    if (full && M.squad && L) T = T.concat(squadExtras(users, L, P));
    if (full && M.plan) T = T.concat((await plPart(users, P, s, many)).T);
    if (M.card) T = T.concat(await cardPart(users, P, s, many, full));
    if (M.et) T = T.concat((await etPart(users, P, s, many)).T);
    if (M.bp) T = T.concat((await bpPart(users, P, s, many)).T);
    var names = Object.keys(MODNAME).filter(function (k) { return M[k]; }).map(function (k) { return k === 'et' && R.kind ? KINDLBL[R.kind] : MODNAME[k]; });
    return { title: 'iFiNeX statement' + (full ? ' — full breakdown' : ' — balances'), subtitle: P.label + ' · ' + names.join(' + ') + ' · ' + (many ? users.length + ' users' : users[0].name) + ' · amounts in AED · Pay = you owe them, Receive = they owe you', tables: T, file: 'ifinex-' + (full ? 'breakdown' : 'balances') + '_' + (P.from === '1970-01-01' ? 'all-time' : P.from + '_to_' + P.to) };
  }


  /* ============================== RENDER / EXPORT ============================== */
  var cellStr = function (v, isNum) { return v == null ? '' : (isNum && typeof v === 'number') ? money(v) : String(v); };
  function previewHtml(M) {
    var h = '<div style="font-weight:800;font-size:1rem;">' + esc(M.title) + '</div><div style="font-size:.72rem;color:var(--muted,#9aa3c7);margin:2px 0 10px;">' + esc(M.subtitle) + '</div>';
    M.tables.forEach(function (t) {
      var cap = t.rows.length > 300, rows = cap ? t.rows.slice(0, 300) : t.rows;
      h += '<div style="font-weight:800;font-size:.78rem;margin:12px 0 4px;">' + esc(t.title) + ' <span style="font-weight:600;color:var(--muted,#9aa3c7);">(' + t.rows.length + ')</span></div><div style="overflow-x:auto;"><table class="rp-t"><tr>' + t.head.map(function (x) { return '<th>' + esc(x) + '</th>'; }).join('') + '</tr>';
      if (!rows.length) h += '<tr><td colspan="' + t.head.length + '" style="color:var(--muted,#9aa3c7);">Nothing in this period.</td></tr>';
      rows.forEach(function (r) { h += '<tr>' + r.map(function (v, i) { var n = t.num.indexOf(i) >= 0; return '<td' + (n ? ' style="text-align:right;white-space:nowrap;"' : '') + '>' + esc(cellStr(v, n)) + '</td>'; }).join('') + '</tr>'; });
      if (t.total) h += '<tr style="font-weight:800;background:rgba(255,217,61,.14);">' + t.total.map(function (v, i) { var n = t.num.indexOf(i) >= 0; return '<td' + (n ? ' style="text-align:right;white-space:nowrap;"' : '') + '>' + esc(cellStr(v, n)) + '</td>'; }).join('') + '</tr>';
      h += '</table></div>' + (cap ? '<div style="font-size:.66rem;color:var(--muted,#9aa3c7);">First 300 rows shown — the PDF / Excel / CSV contain all ' + t.rows.length + '.</div>' : '');
    });
    return h;
  }
  function loadScript(src) { return new Promise(function (ok, no) { var s = D.createElement('script'); s.src = src; s.onload = ok; s.onerror = function () { no(new Error('Could not load ' + src)); }; D.head.appendChild(s); }); }
  async function needXlsx() { if (!W.XLSX) await loadScript('vendor/xlsx.full.min.js'); if (!W.XLSX) throw new Error('Excel library missing'); }
  async function needPdf() { if (!W.jspdf) await loadScript('vendor/jspdf.umd.min.js'); if (!(W.jspdf && W.jspdf.jsPDF.API.autoTable)) await loadScript('vendor/jspdf.plugin.autotable.min.js'); if (!W.jspdf) throw new Error('PDF library missing'); }
  var saveBlob = function (b, n) { return W.ifxXfer && W.ifxXfer.saveBlob ? W.ifxXfer.saveBlob(b, n) : Promise.reject(new Error('ifinex-tools.js did not load')); };
  async function toPdf(M) {
    await needPdf();
    var wide = M.tables.some(function (t) { return t.head.length > 6; }), doc = new W.jspdf.jsPDF({ orientation: wide ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
    doc.setFontSize(16); doc.text(M.title, 14, 15); doc.setFontSize(9); doc.setTextColor(110); doc.text(doc.splitTextToSize(M.subtitle + '   |   Generated ' + new Date().toLocaleString(), wide ? 265 : 180), 14, 21); doc.setTextColor(0);
    var y = 30;
    M.tables.forEach(function (t) {
      var H = doc.internal.pageSize.getHeight(); if (y > H - 40) { doc.addPage(); y = 16; }
      doc.setFontSize(11); doc.text(t.title, 14, y);
      var body = t.rows.map(function (r) { return r.map(function (v, i) { return cellStr(v, t.num.indexOf(i) >= 0); }); }); if (t.total) body.push(t.total.map(function (v, i) { return cellStr(v, t.num.indexOf(i) >= 0); }));
      if (!t.rows.length) body = [[{ content: 'Nothing in this period.', colSpan: t.head.length }]];
      var right = {}; t.num.forEach(function (i) { right[i] = { halign: 'right' }; });
      doc.autoTable({ startY: y + 3, head: [t.head], body: body, styles: { fontSize: 8, cellPadding: 1.5 }, headStyles: { fillColor: [77, 150, 255] }, alternateRowStyles: { fillColor: [244, 247, 255] }, columnStyles: right,
        didParseCell: function (d) { if (t.total && t.rows.length && d.section === 'body' && d.row.index === body.length - 1) { d.cell.styles.fontStyle = 'bold'; d.cell.styles.fillColor = [255, 244, 200]; } } });
      y = doc.lastAutoTable.finalY + 9;
    });
    var n = doc.internal.getNumberOfPages(); for (var i = 1; i <= n; i++) { doc.setPage(i); doc.setFontSize(8); doc.setTextColor(140); doc.text('iFiNeX · page ' + i + '/' + n, 14, doc.internal.pageSize.getHeight() - 7); }
    return doc.output('blob');
  }
  async function toXlsx(M) {
    await needXlsx();
    var wb = XLSX.utils.book_new(), sheets = {}, order = [], used = {};
    M.tables.forEach(function (t) { var nm = String(t.sheet || 'Sheet').replace(/[\[\]:*?\/\\]/g, ' ').trim().slice(0, 31) || 'Sheet'; if (!sheets[nm]) { sheets[nm] = []; order.push(nm); } sheets[nm].push(t); });
    order.forEach(function (nm) {
      var aoa = [], widths = [];
      sheets[nm].forEach(function (t) {
        aoa.push([t.title]); aoa.push(t.head);
        t.rows.forEach(function (r) { aoa.push(r.map(function (v) { return v == null ? '' : v; })); });
        if (t.total) aoa.push(t.total); aoa.push([]);
        t.head.forEach(function (h, i) { widths[i] = Math.min(42, Math.max(widths[i] || 10, String(h).length + 4)); });
        t.rows.slice(0, 200).forEach(function (r) { r.forEach(function (v, i) { widths[i] = Math.min(42, Math.max(widths[i] || 10, String(v == null ? '' : v).length + 2)); }); });
      });
      var ws = XLSX.utils.aoa_to_sheet(aoa); ws['!cols'] = widths.map(function (w) { return { wch: w }; });
      var u = nm, k = 2; while (used[u.toLowerCase()]) u = nm.slice(0, 28) + ' ' + (k++); used[u.toLowerCase()] = 1;
      XLSX.utils.book_append_sheet(wb, ws, u);
    });
    return new Blob([XLSX.write(wb, { bookType: 'xlsx', type: 'array' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }
  function toCsv(M) {
    var q = function (v) { v = v == null ? '' : String(v); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }, out = [q(M.title), q(M.subtitle), ''];
    M.tables.forEach(function (t) { out.push(q(t.title)); out.push(t.head.map(q).join(',')); t.rows.forEach(function (r) { out.push(r.map(q).join(',')); }); if (t.total) out.push(t.total.map(q).join(',')); out.push(''); });
    return new Blob(['﻿' + out.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  }

  var CSS = '#ifx-rep{position:fixed;inset:0;z-index:9600;background:rgba(0,0,0,.62);display:none;align-items:flex-end;justify-content:center;}#ifx-rep.open{display:flex;}' +
    '#ifx-rep .box{width:min(760px,100%);max-height:94vh;overflow:auto;background:var(--card,#151528);color:var(--text,#e8ecff);border:1px solid var(--border,rgba(255,255,255,.15));border-radius:20px 20px 0 0;padding:16px 16px calc(18px + env(safe-area-inset-bottom,0px));}' +
    '@media(min-width:760px){#ifx-rep{align-items:center}#ifx-rep .box{border-radius:20px}}' +
    '#ifx-rep h3{margin:0 0 2px;font-size:1.08rem;}#ifx-rep .x{float:right;background:none;border:0;color:inherit;font-size:1.25rem;cursor:pointer;}' +
    '#ifx-rep .sub{font-size:.7rem;color:var(--muted,#9aa3c7);margin-bottom:8px;}#ifx-rep .lab{font-size:.7rem;font-weight:800;color:var(--muted,#9aa3c7);margin:10px 0 4px;text-transform:uppercase;letter-spacing:.04em;}' +
    '#ifx-rep .chips{display:flex;flex-wrap:wrap;gap:6px;}#ifx-rep .chip{border:1px solid var(--border,rgba(255,255,255,.2));background:var(--card2,rgba(255,255,255,.06));color:inherit;border-radius:999px;padding:7px 12px;font-size:.74rem;font-weight:700;cursor:pointer;}' +
    '#ifx-rep .chip.on{background:var(--accent,#4d96ff);border-color:var(--accent,#4d96ff);color:#fff;}' +
    '#ifx-rep input[type=date],#ifx-rep input[type=month]{padding:9px;border-radius:10px;border:1px solid var(--border,rgba(255,255,255,.2));background:var(--card2,rgba(255,255,255,.06));color:inherit;font-size:.82rem;}' +
    '#ifx-rep .row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:6px;}#ifx-rep .pk{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:4px;margin-top:6px;max-height:170px;overflow:auto;}' +
    '#ifx-rep label.ck{display:flex;gap:6px;align-items:center;font-size:.78rem;padding:4px 6px;border-radius:8px;background:var(--card2,rgba(255,255,255,.05));cursor:pointer;}' +
    '#ifx-rep .acts{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:14px;}#ifx-rep .acts button{padding:12px 6px;border-radius:12px;border:0;font-weight:900;font-size:.8rem;color:#fff;background:linear-gradient(135deg,#4D96FF,#B06AFF);cursor:pointer;}#ifx-rep .acts button[disabled]{opacity:.5}' +
    '#ifx-rep .acts button.g{background:var(--card2,rgba(255,255,255,.1));color:inherit;border:1px solid var(--border,rgba(255,255,255,.2));}#ifx-rep .msg{font-size:.78rem;margin-top:8px;min-height:1.1em;}' +
    '#ifx-rep table.rp-t{width:100%;border-collapse:collapse;font-size:.7rem;}#ifx-rep .rp-t th{text-align:left;color:var(--muted,#9aa3c7);padding:4px 5px;border-bottom:1px solid var(--border,rgba(255,255,255,.2));white-space:nowrap;}#ifx-rep .rp-t td{padding:4px 5px;border-bottom:1px solid var(--border,rgba(255,255,255,.08));}' +
    '#ifx-rep #rp-prev{margin-top:12px;border-top:1px solid var(--border,rgba(255,255,255,.15));padding-top:6px;}';

  /* ============================== UI ============================== */
  var OV = null;
  var CSS_EXTRA = '#ifx-rep .rstep{font-size:.7rem;font-weight:900;color:var(--accent,#4d96ff);margin:12px 0 4px;text-transform:uppercase;letter-spacing:.05em;}' +
    '#ifx-rep .rts{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:4px;}#ifx-rep .rt{border:2px solid var(--border,rgba(255,255,255,.2));background:var(--card2,rgba(255,255,255,.05));color:inherit;border-radius:14px;padding:10px;text-align:left;cursor:pointer;font-size:.72rem;line-height:1.35;}' +
    '#ifx-rep .rt b{display:block;font-size:.84rem;margin-bottom:2px;}#ifx-rep .rt.on{border-color:var(--accent,#4d96ff);background:rgba(77,150,255,.16);}' +
    '#ifx-rep .mods{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:6px;}';
  function ensureDom() {
    if (OV) return;
    var st = D.createElement('style'); st.textContent = CSS + CSS_EXTRA; D.head.appendChild(st);
    OV = D.createElement('div'); OV.id = 'ifx-rep'; OV.setAttribute('role', 'dialog'); OV.setAttribute('aria-modal', 'true'); D.body.appendChild(OV);
    OV.addEventListener('click', onClick); OV.addEventListener('change', onChange);
  }
  var chip = function (k, v, label, on) { return '<button type="button" class="chip' + (on ? ' on' : '') + '" data-k="' + k + '" data-v="' + esc(v) + '">' + esc(label) + '</button>'; };
  var MODS = [['squad', '👥 Squad Split'], ['bill', '🧾 Bill Tracker'], ['plan', '📅 EPP & Gold plans'], ['card', '💳 Shared card payments'], ['et', '🪙 Expense / Trip / Event trackers'], ['bp', '📈 Budget planner']];
  var ENTRYLBL = { all: 'the iFiNeX Hub (all modules)', bill: 'Bill Tracker', squad: 'Squad Split', plan: 'EPP & Gold plans', card: 'Shared card payments', et: 'the trackers', bp: 'the Budget planner' };
  function paint() {
    var P = periodOf(R), h = '<button class="x" data-a="close" aria-label="Close">✕</button><h3>📊 Statements & reports</h3><div class="sub">Started from <b>' + esc((R.kind && KINDLBL[R.kind]) || ENTRYLBL[R.entry] || ENTRYLBL.all) + '</b>' + (R.entry === 'all' ? '' : ' — you can still tick other modules below') + '. Four choices, then preview or download. Nothing in your data is changed.</div>';
    h += '<div class="rstep">1 · Duration</div><div class="chips">' + chip('dur', 'week', 'Weekly', R.dur === 'week') + chip('dur', 'month', 'Monthly', R.dur === 'month') + chip('dur', 'all', 'All time', R.dur === 'all') + chip('dur', 'custom', 'Custom dates', R.dur === 'custom') + '</div>';
    if (R.dur === 'week') h += '<div class="row">' + chip('wk', '0', 'This week', mondayOf(R.wkDate) === mondayOf(today())) + chip('wk', '-1', 'Last week', mondayOf(R.wkDate) === mondayOf(addDays(today(), -7))) + '<input type="date" data-f="wkDate" value="' + esc(R.wkDate) + '" aria-label="Any day of the week"></div>';
    if (R.dur === 'month') h += '<div class="row"><button type="button" class="chip" data-a="mprev" aria-label="Previous month">‹</button><input type="month" data-f="month" value="' + esc(R.month) + '" aria-label="Month"><button type="button" class="chip" data-a="mnext" aria-label="Next month">›</button></div>';
    if (R.dur === 'custom') h += '<div class="row"><input type="date" data-f="from" value="' + esc(R.from) + '" aria-label="From"><span>→</span><input type="date" data-f="to" value="' + esc(R.to) + '" aria-label="To"></div>';
    h += '<div class="sub" style="margin-top:6px;">Covers: <b>' + esc(P.label) + '</b></div>';
    h += '<div class="rstep">2 · Modules (tick what you want)</div><div class="mods">' + MODS.map(function (m) { return '<label class="ck"><input type="checkbox" data-m="' + m[0] + '"' + (R.mods[m[0]] ? ' checked' : '') + '> ' + esc(m[1]) + '</label>'; }).join('') + '</div><div class="row"><button type="button" class="chip" data-a="allm">Select all modules</button>' + (R.kind ? '<button type="button" class="chip on" data-a="clearkind">Only ' + esc(KINDLBL[R.kind]) + ' ✕ (tap for all tracker types)</button>' : '') + '</div>';
    h += '<div class="rstep">3 · Users</div>';
    if (R.canPick) {
      h += '<div class="chips">' + chip('scope', 'me', 'Only this account', R.scope === 'me') + chip('scope', 'all', 'All users (' + R.users.length + ')', R.scope === 'all') + chip('scope', 'pick', 'Choose users…', R.scope === 'pick') + '</div>';
      if (R.scope === 'pick') h += '<div class="row"><button type="button" class="chip" data-a="allu">Select all</button><button type="button" class="chip" data-a="nou">None</button></div><div class="pk">' + R.users.map(function (u) { var e = lower(u.email); return '<label class="ck"><input type="checkbox" data-u="' + esc(e) + '"' + (R.picked[e] ? ' checked' : '') + '> ' + esc(u.name || u.email) + '</label>'; }).join('') + '</div>';
    } else h += '<div class="sub">Report for your own account. (Admins and delegates can also pick other users.)</div>';
    if (R.mods.et) {
      var scopeEm = R.scope === 'all' ? null : R.scope === 'pick' ? Object.keys(R.picked).filter(function (k) { return R.picked[k]; }) : [R.cur];
      var tl = (R.trackers || []).filter(function (t) { return (!R.kind || t.kind === R.kind) && (!scopeEm || scopeEm.indexOf(lower(t.user_email)) >= 0); }).slice(0, 120), ico = { trip: '✈️', occasion: '🎟️', period: '🪙' };
      h += '<div class="rstep">Trackers / events</div><div class="sub">Nothing ticked = every tracker in the period. Tick one or more to report only that trip, event or tracker.</div>';
      h += tl.length ? '<div class="pk">' + tl.map(function (t) { return '<label class="ck"><input type="checkbox" data-e="' + esc(t.id) + '"' + (R.events[t.id] ? ' checked' : '') + '> ' + esc((ico[t.kind] || '🪙') + ' ' + t.title) + '</label>'; }).join('') + '</div>' : '<div class="sub">No trackers found for the selected users.</div>';
    }
    h += '<div class="rstep">4 · Report type</div><div class="rts"><button type="button" class="rt' + (R.mode === 'bal' ? ' on' : '') + '" data-k="mode" data-v="bal"><b>Balances only</b>Who you pay, how much, and the month-by-month balance: brought forward + new − paid = closing.</button><button type="button" class="rt' + (R.mode === 'full' ? ' on' : '') + '" data-k="mode" data-v="full"><b>Full breakdown</b>Balances plus every expense share, payment, settlement, instalment and spending line.</button></div>';
    h += '<div class="acts"><button data-a="prev" ' + (busy ? 'disabled' : '') + '>👁 Preview</button><button data-a="pdf" ' + (busy ? 'disabled' : '') + '>⬇ PDF</button><button data-a="xlsx" ' + (busy ? 'disabled' : '') + '>⬇ Excel</button><button class="g" data-a="csv" ' + (busy ? 'disabled' : '') + '>⬇ CSV</button></div><div class="msg" id="rp-msg" role="status"></div><div id="rp-prev">' + (MODEL ? previewHtml(MODEL) : '') + '</div>';
    var scroll = OV.querySelector('.box') ? OV.querySelector('.box').scrollTop : 0;
    OV.innerHTML = '<div class="box">' + h + '</div>'; var bx = OV.querySelector('.box'); if (bx) bx.scrollTop = scroll;
  }
  var say = function (t, bad) { var m = D.getElementById('rp-msg'); if (m) { m.textContent = t; m.style.color = bad ? '#FF6B6B' : 'var(--muted,#9aa3c7)'; } };
  function onClick(e) {
    var t = e.target.closest ? e.target.closest('[data-k],[data-a]') : null; if (!t) { if (e.target === OV) close(); return; }
    var a = t.getAttribute('data-a'), k = t.getAttribute('data-k'), v = t.getAttribute('data-v');
    if (k === 'wk') { R.wkDate = addDays(today(), 7 * Number(v)); MODEL = null; return paint(); }
    if (k) { R[k] = v; MODEL = null; return paint(); }
    if (a === 'close') return close();
    if (a === 'mprev' || a === 'mnext') { R.month = shiftMonth(R.month || today().slice(0, 7), a === 'mprev' ? -1 : 1); MODEL = null; return paint(); }
    if (a === 'clearkind') { R.kind = ''; MODEL = null; return paint(); }
    if (a === 'allm') { MODS.forEach(function (m) { R.mods[m[0]] = true; }); MODEL = null; return paint(); }
    if (a === 'allu') { R.users.forEach(function (u) { R.picked[lower(u.email)] = true; }); MODEL = null; return paint(); }
    if (a === 'nou') { R.picked = {}; MODEL = null; return paint(); }
    if (a === 'prev' || a === 'pdf' || a === 'xlsx' || a === 'csv') return run(a);
  }
  function onChange(e) {
    var t = e.target; MODEL = null;
    if (t.getAttribute('data-f')) { R[t.getAttribute('data-f')] = t.value; if (t.getAttribute('data-f') === 'wkDate' || t.getAttribute('data-f') === 'month') paint(); return; }
    if (t.getAttribute('data-m')) { R.mods[t.getAttribute('data-m')] = t.checked; paint(); return; }
    if (t.getAttribute('data-u') != null) { R.picked[t.getAttribute('data-u')] = t.checked; return; }
    if (t.getAttribute('data-e')) { R.events[t.getAttribute('data-e')] = t.checked; }
  }
  async function build() {
    var P = periodOf(R);
    if (P.from > P.to) throw new Error('"From" is after "To" — swap the dates.');
    if (!MODS.some(function (m) { return R.mods[m[0]]; })) throw new Error('Tick at least one module.');
    if (R.scope === 'pick' && !R.users.some(function (u) { return R.picked[lower(u.email)]; })) throw new Error('Tick at least one user.');
    return allModel();
  }
  async function run(kind) {
    if (busy) return; busy = true; var btns = OV.querySelectorAll('.acts button'); btns.forEach(function (b) { b.disabled = true; }); say('Working…');
    try {
      if (!MODEL) MODEL = await build();
      var pv = D.getElementById('rp-prev'); if (pv) pv.innerHTML = previewHtml(MODEL);
      if (kind === 'prev') say('Preview ready — scroll down. Use PDF / Excel / CSV to download.');
      else {
        var blob = kind === 'pdf' ? await toPdf(MODEL) : kind === 'xlsx' ? await toXlsx(MODEL) : toCsv(MODEL), name = MODEL.file + '.' + kind, how = await saveBlob(blob, name);
        say(how === 'cancelled' ? 'Cancelled.' : how === 'shared' ? '✅ ' + name + ' is ready — choose where to save or share it.' : how === 'fallback' ? 'Use the download button that appeared.' : '✅ ' + name + ' downloaded.');
      }
    } catch (err) { console.error(err); say('❌ ' + (err && err.message ? err.message : 'Could not build the report'), true); }
    busy = false; btns = OV.querySelectorAll('.acts button'); btns.forEach(function (b) { b.disabled = false; });
  }
  /* every module page opens the SAME center with only its own module ticked; the Hub opens it with everything ticked.  opts.kind = 'trip' | 'occasion' | 'period' limits the trackers */
  async function open(entry, opts) {
    ensureDom(); R = fresh(); entry = entry || 'all'; R.entry = entry; MODEL = null; busy = false;
    var none = { squad: false, bill: false, plan: false, card: false, et: false, bp: false }, only = function (k) { var m = Object.assign({}, none); m[k] = true; return m; };
    if (entry === 'all') R.mods = { squad: true, bill: true, plan: true, card: true, et: true, bp: true };
    else if (none.hasOwnProperty(entry)) R.mods = only(entry);
    else R.mods = only('bill');
    if (entry === 'et' && opts && KINDLBL[opts.kind]) R.kind = opts.kind;
    if (entry === 'et' && opts && opts.tracker != null) R.events[opts.tracker] = true;
    OV.innerHTML = '<div class="box"><button class="x" data-a="close">✕</button><div class="sub">Loading…</div></div>'; OV.classList.add('open');
    try { await loadUsers(); try { var tr = await SB().from('et_trackers').select('id,user_email,kind,title,start_date,end_date,status').order('created_at', { ascending: false }).limit(300); R.trackers = tr.data || []; } catch (e3) { R.trackers = []; } } catch (e) { console.error(e); }
    paint();
  }
  function close() { if (OV) OV.classList.remove('open'); }
  D.addEventListener('keydown', function (e) { if (e.key === 'Escape' && OV && OV.classList.contains('open')) close(); });

  W.ifxReports = { open: open, close: close, _periodOf: periodOf, _state: function () { return R; }, _build: function () { return build(); } };


  /* old buttons keep working: the Bill Tracker "View report" button and the old on-screen report's PDF / Excel use the safe saver */
  W.openReportPeriodModal = function () { open('bill'); };
  W.exportReportPDF = async function () {
    try { var d = g(function () { return _lastReportData; }, null); if (!d) return toast('Generate the report first');
      await needPdf(); var doc = new W.jspdf.jsPDF(), y = 14; doc.setFontSize(14); doc.text('Statement — ' + d.name, 14, y); y += 6; doc.setFontSize(9); doc.text(d.fromDate + ' to ' + d.toDate, 14, y); y += 8;
      var add = function (t, hd, rows) { doc.setFontSize(11); doc.text(t, 14, y); y += 4; doc.autoTable({ startY: y, head: [hd], body: rows, styles: { fontSize: 8 }, margin: { left: 14, right: 14 } }); y = doc.lastAutoTable.finalY + 8; if (y > 260) { doc.addPage(); y = 14; } };
      if (d.squad) add('Squad Split — expenses in period', ['Date', 'What', 'Paid by', 'Amount'], d.squad.periodRows.map(function (r) { return [r.date, r.what, r.paidBy, r.amount.toFixed(2)]; }));
      add('Bill Tracker — spending in period', ['Date', 'What', 'Card', 'Amount'], d.bill.periodExpRows.map(function (x) { return [x.date, x.what, x.card, x.amount.toFixed(2)]; }));
      add('Bill Tracker — owed-to-admin activity', ['Date', 'Note', 'Amount'], d.bill.periodOwedRows.map(function (o) { return [o.date, o.note, o.amount.toFixed(2)]; }));
      add('Bill Tracker — payments to admin', ['Date', 'Amount'], d.bill.periodSettleRows.map(function (s) { return [s.date, s.amount.toFixed(2)]; }));
      add('Party Ledger — activity in period', ['Date', 'Who', 'Type', 'Amount'], d.party.periodPartyRows.map(function (r) { return [r.date, r.who, r.type, r.amount.toFixed(2)]; }));
      await saveBlob(doc.output('blob'), 'statement_' + String(d.email || 'user').split('@')[0] + '_' + d.fromDate + '_to_' + d.toDate + '.pdf');
    } catch (e) { toast('PDF failed: ' + (e && e.message || e)); }
  };
  W.exportReportExcel = async function () {
    try { var d = g(function () { return _lastReportData; }, null); if (!d) return toast('Generate the report first');
      await needXlsx(); var wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Statement for', d.name], ['Period', d.fromDate + ' to ' + d.toDate], [], ['Bill Tracker — spent in period', d.bill.periodSpent], ['Bill Tracker — owed to admin (current)', d.bill.currentOwedToAdmin]].concat(d.squad ? [['Squad Split — current balance', d.squad.currentNet]] : [])), 'Summary');
      var add = function (rows, nm) { if (rows && rows.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), nm); };
      if (d.squad) add(d.squad.periodRows, 'Squad Split'); add(d.bill.periodExpRows, 'Bill Tracker Spend'); add(d.bill.periodOwedRows, 'Owed to Admin'); add(d.bill.periodSettleRows, 'Payments to Admin'); add(d.party.periodPartyRows, 'Party Ledger');
      await saveBlob(new Blob([XLSX.write(wb, { bookType: 'xlsx', type: 'array' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'statement_' + String(d.email || 'user').split('@')[0] + '_' + d.fromDate + '_to_' + d.toDate + '.xlsx');
    } catch (e) { toast('Excel failed: ' + (e && e.message || e)); }
  };
})();
