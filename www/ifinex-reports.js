/* ============================================================================
   iFiNeX v9.9 — REPORT CENTER for Bill Tracker and Squad Split (one file, both pages)
   Open it with:   ifxReports.open('bill')   or   ifxReports.open('squad')
   - Period : this month · last month · last 3 months · this year · all time · one chosen month · custom dates
   - Who    : Bill Tracker → my account / all users / chosen users (admins, and delegates for the accounts they manage)
              Squad Split  → all members / chosen members, and one squad / several squads
   - Layout : one section per user (or member) · one combined table · monthly summary
   - Output : on-screen preview · PDF · Excel (.xlsx, one sheet per section) · CSV
   Reads only (no database change). Every file goes through ifxXfer.saveBlob(), which works in the Android app (share sheet), phone
   browsers and desktop browsers — the old doc.save()/XLSX.writeFile() calls were silently ignored by Android's WebView.
   Page globals declared with `let` (sb, me, managing, MEMBERS, …) are read by bare name through the g() helper.
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
  var PRESETS = [['this_month', 'This month'], ['last_month', 'Last month'], ['last_3', 'Last 3 months'], ['this_year', 'This year'], ['all', 'All time'], ['month', 'Pick a month'], ['custom', 'Custom dates']];
  function periodOf(R) {
    var t = today(), ym = t.slice(0, 7), y = +t.slice(0, 4), m = +t.slice(5, 7), a, b;
    switch (R.preset) {
      case 'this_month': a = ym + '-01'; b = ym + '-' + lastDay(y, m); break;
      case 'last_month': var l = shiftMonth(ym, -1); a = l + '-01'; b = l + '-' + lastDay(+l.slice(0, 4), +l.slice(5, 7)); break;
      case 'last_3': var f = shiftMonth(ym, -2); a = f + '-01'; b = ym + '-' + lastDay(y, m); break;
      case 'this_year': a = y + '-01-01'; b = y + '-12-31'; break;
      case 'all': a = '1970-01-01'; b = '2999-12-31'; break;
      case 'month': var mm = R.month || ym; a = mm + '-01'; b = mm + '-' + lastDay(+mm.slice(0, 4), +mm.slice(5, 7)); break;
      default: a = R.from || ym + '-01'; b = R.to || t;
    }
    return { from: a, to: b, label: R.preset === 'all' ? 'All time' : (a + '  →  ' + b) };
  }

  /* ---------- state ---------- */
  var R = null, MODEL = null, busy = false;
  function fresh(mod) {
    var ym = today().slice(0, 7);
    return { mod: mod, preset: 'this_month', month: ym, from: ym + '-01', to: today(), scope: 'me', picked: {}, group: 'user', sec: { a: true, b: true, c: true, d: true, e: true }, squads: {}, users: [], people: [] };
  }

  /* ---------- people lists ---------- */
  async function loadBillUsers() {
    var s = SB(), acc = g(function () { return managing; }, null) || g(function () { return me; }, null), out = [];
    var cur = (acc && acc.email) || g(function () { return currentEmail; }, '');
    if (s) { try { var r = await s.from('app_users').select('id,email,name,emoji,is_admin').order('name'); out = (r.data || []).filter(function (u) { return u.email; }); } catch (e) { } }
    if (!out.length && cur) out = [{ email: cur, name: (acc && acc.name) || cur, emoji: (acc && acc.emoji) || '' }];
    R.cur = String(cur || '').toLowerCase(); R.users = out;
    var admin = g(function () { return canManageOwed(); }, false);
    R.canPick = admin && out.length > 1;
    if (!R.canPick) R.scope = 'me';
    R.picked = {}; R.picked[R.cur] = true;
  }
  function loadSquadPeople() {
    var ms = g(function () { return MEMBERS; }, []) || [], sq = g(function () { return SQUADS; }, []) || [], all = g(function () { return ALL_PEOPLE; }, []) || [];
    R.people = (all.length ? all : ms).slice(); R.squadList = sq.filter(function (x) { return !x.is_archived; });
    R.active = g(function () { return ACTIVE_SQUAD; }, null);
    R.squads = {}; if (R.active != null) R.squads[R.active] = true;
    R.picked = {}; ms.forEach(function (m) { R.picked[m.id] = true; });
    R.members = ms.slice();
  }

  /* ============================== BILL TRACKER DATA ============================== */
  async function billModel(o) {
    var s = SB(); if (!s) throw new Error('Reports need the live database (demo mode has no database).');
    var P = periodOf(R), inR = function (d) { return !!d && d >= P.from && d <= P.to; }, inM = function (m) { return !!m && m >= P.from.slice(0, 7) && m <= P.to.slice(0, 7); };
    var users = R.scope === 'all' ? R.users.slice() : R.scope === 'pick' ? R.users.filter(function (u) { return R.picked[String(u.email).toLowerCase()]; }) : R.users.filter(function (u) { return String(u.email).toLowerCase() === R.cur; });
    if (!users.length) users = [{ email: R.cur, name: R.cur }];
    var lowerUsers = users.map(function (u) { return { email: u.email, name: u.name || u.email }; });
    var per = await Promise.all(lowerUsers.map(async function (u) {
      var em = like(u.email), q = function (t) { return s.from(t).select('*').ilike('user_email', em); };
      var r = await Promise.all([q('bill_expenses'), q('bill_owed'), q('bill_settlements'), q('bill_cards'), q('bill_payees')]);
      var linked = await s.from('bill_payees').select('*').ilike('party_email', em);
      var mine = r[4].data || [], theirs = linked.data || [], ids = mine.map(function (p) { return p.id; }), tids = theirs.map(function (p) { return p.id; });
      var e1 = ids.length ? await s.from('bill_payee_entries').select('*').in('payee_id', ids) : { data: [] };
      var e2 = tids.length ? await s.from('bill_payee_entries').select('*').in('payee_id', tids) : { data: [] };
      var cards = {}; (r[3].data || []).forEach(function (c) { cards[c.id] = c.card_name; });
      var dateOf = function (x) { return x.created_at ? String(x.created_at).slice(0, 10) : (x.month ? x.month + '-01' : ''); };
      var exp = (r[0].data || []).filter(function (x) { return inR(x.date); }).map(function (x) { return { date: x.date, what: x.description, cat: x.category || '', card: x.card_id ? (cards[x.card_id] || '—') : 'Cash / none', amount: Number(x.amount) || 0 }; }).sort(function (a, b) { return a.date < b.date ? -1 : 1; });
      var owedAll = r[1].data || [], setAll = r[2].data || [];
      var tOwed = owedAll.reduce(function (a, x) { return a + Number(x.amount); }, 0), tSet = setAll.reduce(function (a, x) { return a + Number(x.amount); }, 0);
      var owed = owedAll.filter(function (x) { return x.month ? inM(x.month) : inR(dateOf(x)); }).map(function (x) { return { date: dateOf(x), note: x.note || 'Owed amount', amount: Number(x.amount) || 0 }; });
      var pay = setAll.filter(function (x) { return x.month ? inM(x.month) : inR(dateOf(x)); }).map(function (x) { return { date: dateOf(x), what: 'Paid to admin', amount: Number(x.amount) || 0 }; });
      var nameOfPayee = {}; mine.forEach(function (p) { nameOfPayee[p.id] = p.party_name; }); theirs.forEach(function (p) { nameOfPayee[p.id] = p.user_email; });
      var party = (e1.data || []).concat(e2.data || []).filter(function (x) { return inR(x.date); }).map(function (x) { return { date: x.date, who: nameOfPayee[x.payee_id] || '—', type: x.entry_type === 'owe' ? 'owed' : 'paid', note: x.note || '', amount: Number(x.amount) || 0 }; }).sort(function (a, b) { return a.date < b.date ? -1 : 1; });
      var bal = function (list, key) { return list.map(function (p) { var es = (key === 'mine' ? e1.data : e2.data || []).filter(function (e) { return e.payee_id === p.id; }); var b = es.filter(function (e) { return e.entry_type === 'owe'; }).reduce(function (a, x) { return a + Number(x.amount); }, 0) - es.filter(function (e) { return e.entry_type === 'paid'; }).reduce(function (a, x) { return a + Number(x.amount); }, 0); return { who: key === 'mine' ? p.party_name : p.user_email, b: b }; }).filter(function (x) { return x.b > 0; }); };
      var youOwe = bal(mine, 'mine'), owedToYou = bal(theirs, 'theirs');
      return { name: u.name, email: u.email, exp: exp, owed: owed, pay: pay, party: party, owedNow: Math.max(tOwed - tSet, 0), youOwe: youOwe, owedToYou: owedToYou, spent: exp.reduce(function (a, x) { return a + x.amount; }, 0) };
    }));
    var many = per.length > 1, T = [], sheetOf = function (n) { return n; };
    var sum = per.map(function (u) { return [u.name, u.spent, u.owedNow, u.pay.reduce(function (a, x) { return a + x.amount; }, 0), u.youOwe.reduce(function (a, x) { return a + x.b; }, 0), u.owedToYou.reduce(function (a, x) { return a + x.b; }, 0)]; });
    var tot = ['TOTAL'], i; for (i = 1; i < 6; i++) tot.push(sum.reduce(function (a, r) { return a + r[i]; }, 0));
    T.push({ sheet: 'Summary', title: 'Summary — spending and balances', head: ['User', 'Spent in period', 'Owed to admin (now)', 'Paid to admin (period)', 'You owe parties (now)', 'Owed to you (now)'], rows: sum, total: many ? tot : null, num: [1, 2, 3, 4, 5] });
    // monthly
    if (R.group === 'month') {
      var months = {}; per.forEach(function (u, ui) { u.exp.forEach(function (x) { var m = x.date.slice(0, 7); (months[m] = months[m] || per.map(function () { return 0; }))[ui] += x.amount; }); });
      var ml = Object.keys(months).sort(), mr = ml.map(function (m) { var v = months[m]; return [monthLabel(m)].concat(v, many ? [v.reduce(function (a, b) { return a + b; }, 0)] : []); });
      var mt = ['TOTAL']; for (i = 0; i < per.length + (many ? 1 : 0); i++) mt.push(mr.reduce(function (a, r) { return a + r[i + 1]; }, 0));
      T.push({ sheet: 'Monthly', title: 'Spending per month', head: ['Month'].concat(per.map(function (u) { return u.name; }), many ? ['All'] : []), rows: mr, total: mr.length ? mt : null, num: per.map(function (u, k) { return k + 1; }).concat(many ? [per.length + 1] : []) });
    }
    var spec = [
      { key: 'a', t: 'Spending', f: 'exp', head: ['Date', 'What', 'Category', 'Card', 'Amount'], row: function (x) { return [x.date, x.what, x.cat, x.card, x.amount]; }, am: 4 },
      { key: 'b', t: 'Owed to admin — activity', f: 'owed', head: ['Date', 'Note', 'Amount'], row: function (x) { return [x.date, x.note, x.amount]; }, am: 2 },
      { key: 'c', t: 'Payments to admin', f: 'pay', head: ['Date', 'What', 'Amount'], row: function (x) { return [x.date, x.what, x.amount]; }, am: 2 },
      { key: 'd', t: 'Party ledger — activity', f: 'party', head: ['Date', 'Who', 'Type', 'Note', 'Amount'], row: function (x) { return [x.date, x.who, x.type, x.note, x.amount]; }, am: 4 }
    ];
    spec.forEach(function (sp) {
      if (!R.sec[sp.key]) return;
      if (R.group === 'user' && many) {
        per.forEach(function (u) { var rows = u[sp.f].map(sp.row); if (!rows.length && R.scope !== 'me') return; T.push({ sheet: u.name, title: sp.t + ' — ' + u.name, head: sp.head, rows: rows, total: rows.length ? totalOf(rows, sp.am, sp.head.length) : null, num: [sp.am] }); });
      } else {
        var rows = []; per.forEach(function (u) { u[sp.f].forEach(function (x) { rows.push([many ? u.name : null].concat(sp.row(x))); }); });
        rows.sort(function (a, b) { return (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0); });
        var head = many ? ['User'].concat(sp.head) : sp.head; if (!many) rows = rows.map(function (r) { return r.slice(1); });
        T.push({ sheet: sp.t, title: sp.t + (many ? ' — all selected users' : ''), head: head, rows: rows, total: rows.length ? totalOf(rows, sp.am + (many ? 1 : 0), head.length) : null, num: [sp.am + (many ? 1 : 0)] });
      }
    });
    if (R.sec.e) {   // current balances
      var br = []; per.forEach(function (u) { u.youOwe.forEach(function (x) { br.push([u.name, 'You owe', x.who, x.b]); }); u.owedToYou.forEach(function (x) { br.push([u.name, 'Owed to you', x.who, x.b]); }); if (u.owedNow > 0) br.push([u.name, 'Owed to admin', 'Admin', u.owedNow]); });
      T.push({ sheet: 'Balances now', title: 'Balances as of today (running totals, not period activity)', head: ['User', 'Direction', 'With', 'Amount'], rows: br, total: null, num: [3] });
    }
    return { title: 'Bill Tracker report', subtitle: P.label + ' · ' + (many ? per.length + ' users' : per[0].name) + ' · amounts in AED', tables: T, file: 'bill-report_' + (P.from === '1970-01-01' ? 'all' : P.from + '_to_' + P.to) };
  }
  function totalOf(rows, ai, len) { var t = []; for (var i = 0; i < len; i++) t.push(''); t[0] = 'TOTAL'; t[ai] = rows.reduce(function (a, r) { return a + (Number(r[ai]) || 0); }, 0); return t; }

  /* ============================== SQUAD SPLIT DATA ============================== */
  async function squadModel() {
    var s = SB(), P = periodOf(R), inR = function (d) { return !!d && d >= P.from && d <= P.to; }, inM = function (m) { return !!m && m >= P.from.slice(0, 7) && m <= P.to.slice(0, 7); };
    var legacy = g(function () { return SQUAD_LEGACY; }, false), demo = g(function () { return isDemoMode; }, true) || !s;
    var squads = (R.squadList || []).filter(function (x) { return R.squads[x.id]; });
    var sets = [];
    if (legacy || !squads.length || demo) {
      sets.push({ name: g(function () { return (SQUADS.find(function (x) { return x.id === ACTIVE_SQUAD; }) || {}).name; }, '') || 'Squad', members: R.members, exp: g(function () { return expenses; }, []), prev: g(function () { return prevBals; }, []), set: g(function () { return settlements; }, []) });
    } else {
      for (var k = 0; k < squads.length; k++) {
        var sq = squads[k], ids = sq.member_ids || [], mem = R.people.filter(function (m) { return ids.indexOf(m.id) >= 0; });
        if (sq.id === R.active) sets.push({ name: sq.name, members: mem.length ? mem : R.members, exp: g(function () { return expenses; }, []), prev: g(function () { return prevBals; }, []), set: g(function () { return settlements; }, []) });
        else {
          var r = await Promise.all([s.from('expenses').select('*').eq('squad_id', sq.id), s.from('prev_balances').select('*').eq('squad_id', sq.id), s.from('settlements').select('*').eq('squad_id', sq.id)]);
          sets.push({ name: sq.name, members: mem, exp: r[0].data || [], prev: r[1].data || [], set: r[2].data || [] });
        }
      }
    }
    var many = sets.length > 1, nameOf = {}; R.people.concat(R.members).forEach(function (m) { nameOf[m.id] = m.name; });
    var pick = function (id) { return !!R.picked[id]; }, anyPick = Object.keys(R.picked).some(function (k) { return R.picked[k]; });
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
    if (R.group === 'month') {
      var ms = Object.keys(monthly).sort(), cols = R.members.filter(function (m) { return !anyPick || pick(m.id); }), rows = ms.map(function (m) { var v = cols.map(function (x) { return monthly[m][x.id] || 0; }); return [monthLabel(m)].concat(v, [v.reduce(function (a, b) { return a + b; }, 0)]); });
      var tr = ['TOTAL']; for (c = 1; c <= cols.length + 1; c++) tr.push(rows.reduce(function (a, r) { return a + r[c]; }, 0));
      T.push({ sheet: 'Monthly', title: 'Paid per member per month', head: ['Month'].concat(cols.map(function (m) { return m.name; }), ['All']), rows: rows, total: rows.length ? tr : null, num: cols.map(function (m, i) { return i + 1; }).concat([cols.length + 1]) });
    }
    if (R.sec.a) {
      if (R.group === 'user') {
        var who = R.members.filter(function (m) { return !anyPick || pick(m.id); });
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
    if (R.sec.b) T.push({ sheet: 'Settlements', title: 'Payments between members (settlements)', head: ['Date', 'Squad', 'From (paid)', 'To (received)', 'Amount'], rows: setRows, total: setRows.length ? totalOf(setRows, 4, 5) : null, num: [4] });
    if (R.sec.c) T.push({ sheet: 'Carried in', title: 'Balances carried in from the previous month', head: ['Month', 'Squad', 'From (owes)', 'To (is owed)', 'Amount'], rows: prevRows, total: prevRows.length ? totalOf(prevRows, 4, 5) : null, num: [4] });
    if (R.sec.d) T.push({ sheet: 'Who pays whom', title: 'Smallest set of payments that settles the period', head: ['Squad', 'From', 'To', 'Amount'], rows: payRows, total: payRows.length ? totalOf(payRows, 3, 4) : null, num: [3] });
    return { title: 'Squad Split report', subtitle: P.label + ' · ' + (many ? sets.map(function (x) { return x.name; }).join(' + ') : sets[0].name) + (anyPick && Object.keys(R.picked).filter(function (k) { return R.picked[k]; }).length < R.members.length ? ' · selected members only' : '') + ' · amounts in AED', tables: T, file: 'squad-report_' + (P.from === '1970-01-01' ? 'all' : P.from + '_to_' + P.to) };
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

  /* ============================== UI ============================== */
  var OV = null;
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
  function ensureDom() {
    if (OV) return;
    var st = D.createElement('style'); st.textContent = CSS; D.head.appendChild(st);
    OV = D.createElement('div'); OV.id = 'ifx-rep'; OV.setAttribute('role', 'dialog'); OV.setAttribute('aria-modal', 'true'); D.body.appendChild(OV);
    OV.addEventListener('click', onClick); OV.addEventListener('change', onChange);
  }
  var chip = function (k, v, label, on) { return '<button type="button" class="chip' + (on ? ' on' : '') + '" data-k="' + k + '" data-v="' + esc(v) + '">' + esc(label) + '</button>'; };
  function paint() {
    var bill = R.mod === 'bill', P = periodOf(R), h = '<button class="x" data-a="close" aria-label="Close">✕</button><h3>📊 ' + (bill ? 'Bill Tracker' : 'Squad Split') + ' reports</h3><div class="sub">Choose what you want, then preview or download. Nothing is changed in your data.</div>';
    h += '<div class="lab">Period</div><div class="chips">' + PRESETS.map(function (p) { return chip('preset', p[0], p[1], R.preset === p[0]); }).join('') + '</div>';
    if (R.preset === 'month') h += '<div class="row"><input type="month" data-f="month" value="' + esc(R.month) + '" aria-label="Month"></div>';
    if (R.preset === 'custom') h += '<div class="row"><input type="date" data-f="from" value="' + esc(R.from) + '" aria-label="From"><span>→</span><input type="date" data-f="to" value="' + esc(R.to) + '" aria-label="To"></div>';
    h += '<div class="sub" style="margin-top:6px;">Covers: <b>' + esc(P.label) + '</b></div>';
    if (bill) {
      if (R.canPick) {
        h += '<div class="lab">Users</div><div class="chips">' + chip('scope', 'me', 'Only this account', R.scope === 'me') + chip('scope', 'all', 'All users (' + R.users.length + ')', R.scope === 'all') + chip('scope', 'pick', 'Choose users…', R.scope === 'pick') + '</div>';
        if (R.scope === 'pick') h += '<div class="row"><button type="button" class="chip" data-a="allu">Select all</button><button type="button" class="chip" data-a="nou">None</button></div><div class="pk">' + R.users.map(function (u) { var e = String(u.email).toLowerCase(); return '<label class="ck"><input type="checkbox" data-u="' + esc(e) + '"' + (R.picked[e] ? ' checked' : '') + '> ' + esc(u.name || u.email) + '</label>'; }).join('') + '</div>';
      } else h += '<div class="sub" style="margin-top:8px;">Report for your own account. (Admins and delegates can also pick other users.)</div>';
    } else {
      if (R.squadList && R.squadList.length > 1) h += '<div class="lab">Squads</div><div class="chips">' + R.squadList.map(function (s) { return chip('squad', s.id, (s.emoji || '') + ' ' + s.name, !!R.squads[s.id]); }).join('') + '</div>';
      h += '<div class="lab">Members</div><div class="row"><button type="button" class="chip" data-a="allu">All</button><button type="button" class="chip" data-a="nou">None (= all)</button></div><div class="pk">' + R.members.map(function (m) { return '<label class="ck"><input type="checkbox" data-u="' + esc(m.id) + '"' + (R.picked[m.id] ? ' checked' : '') + '> ' + esc((m.emoji || '') + ' ' + m.name) + '</label>'; }).join('') + '</div>';
    }
    h += '<div class="lab">Layout</div><div class="chips">' + chip('group', 'user', bill ? 'One section per user' : 'One section per member', R.group === 'user') + chip('group', 'combined', 'One combined table', R.group === 'combined') + chip('group', 'month', 'Monthly summary + tables', R.group === 'month') + '</div>';
    var secs = bill ? [['a', 'Spending'], ['b', 'Owed to admin'], ['c', 'Payments to admin'], ['d', 'Party ledger'], ['e', 'Balances now']] : [['a', 'Expenses'], ['b', 'Settlements'], ['c', 'Carried-in balances'], ['d', 'Who pays whom']];
    h += '<div class="lab">Include</div><div class="chips">' + secs.map(function (s) { return '<label class="ck"><input type="checkbox" data-s="' + s[0] + '"' + (R.sec[s[0]] ? ' checked' : '') + '> ' + esc(s[1]) + '</label>'; }).join('') + '</div>';
    h += '<div class="acts"><button data-a="prev" ' + (busy ? 'disabled' : '') + '>👁 Preview</button><button data-a="pdf" ' + (busy ? 'disabled' : '') + '>⬇ PDF</button><button data-a="xlsx" ' + (busy ? 'disabled' : '') + '>⬇ Excel</button><button class="g" data-a="csv" ' + (busy ? 'disabled' : '') + '>⬇ CSV</button></div><div class="msg" id="rp-msg" role="status"></div><div id="rp-prev">' + (MODEL ? previewHtml(MODEL) : '') + '</div>';
    var scroll = OV.querySelector('.box') ? OV.querySelector('.box').scrollTop : 0;
    OV.innerHTML = '<div class="box">' + h + '</div>'; var bx = OV.querySelector('.box'); if (bx) bx.scrollTop = scroll;
  }
  var say = function (t, bad) { var m = D.getElementById('rp-msg'); if (m) { m.textContent = t; m.style.color = bad ? '#FF6B6B' : 'var(--muted,#9aa3c7)'; } };
  function onClick(e) {
    var t = e.target.closest ? e.target.closest('[data-k],[data-a]') : null; if (!t) { if (e.target === OV) close(); return; }
    var a = t.getAttribute('data-a'), k = t.getAttribute('data-k'), v = t.getAttribute('data-v');
    if (k) { if (k === 'squad') { var id = isNaN(+v) ? v : +v; R.squads[id] = !R.squads[id]; if (!Object.keys(R.squads).some(function (x) { return R.squads[x]; })) R.squads[id] = true; } else R[k] = v; MODEL = null; return paint(); }
    if (a === 'close') return close();
    if (a === 'allu') { (R.mod === 'bill' ? R.users.map(function (u) { return String(u.email).toLowerCase(); }) : R.members.map(function (m) { return m.id; })).forEach(function (x) { R.picked[x] = true; }); MODEL = null; return paint(); }
    if (a === 'nou') { R.picked = {}; MODEL = null; return paint(); }
    if (a === 'prev' || a === 'pdf' || a === 'xlsx' || a === 'csv') return run(a);
  }
  function onChange(e) {
    var t = e.target; MODEL = null;
    if (t.getAttribute('data-f')) { R[t.getAttribute('data-f')] = t.value; return; }
    if (t.getAttribute('data-u') != null) { R.picked[t.getAttribute('data-u')] = t.checked; return; }
    if (t.getAttribute('data-s')) { R.sec[t.getAttribute('data-s')] = t.checked; }
  }
  async function build() {
    var P = periodOf(R);
    if (P.from > P.to) throw new Error('"From" is after "To" — swap the dates.');
    if (R.mod === 'bill' && R.scope === 'pick' && !R.users.some(function (u) { return R.picked[String(u.email).toLowerCase()]; })) throw new Error('Tick at least one user.');
    if (!Object.keys(R.sec).some(function (k) { return R.sec[k]; })) throw new Error('Tick at least one section to include.');
    return R.mod === 'bill' ? billModel() : squadModel();
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
  async function open(mod) {
    ensureDom(); R = fresh(mod === 'squad' ? 'squad' : 'bill'); MODEL = null; busy = false;
    OV.innerHTML = '<div class="box"><button class="x" data-a="close">✕</button><div class="sub">Loading…</div></div>'; OV.classList.add('open');
    try { if (R.mod === 'bill') await loadBillUsers(); else loadSquadPeople(); } catch (e) { console.error(e); }
    paint();
  }
  function close() { if (OV) OV.classList.remove('open'); }
  D.addEventListener('keydown', function (e) { if (e.key === 'Escape' && OV && OV.classList.contains('open')) close(); });

  W.ifxReports = { open: open, close: close, _periodOf: periodOf, _state: function () { return R; } };

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
