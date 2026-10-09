/* iFiNeX v8.3 — Bill Tracker import/export data sets (registered into ifxXfer; read bill-tracker.html globals at call time) */
(function () {
  'use strict';
  var X = window.ifxXfer; if (!X) return;
  var CATS = ['food', 'transport', 'shopping', 'bills', 'entertainment', 'health', 'other'];
  var owner = function () { return managing.email; };
  var low = function (s) { return String(s == null ? '' : s).trim().toLowerCase(); };
  var cardByName = function (n, pool) { return (pool || myCards).find(function (c) { return low(c.card_name) === low(n); }); };
  var cardName = function (id) { var c = [].concat(myCards, (typeof sharedCardsForPlans !== 'undefined' ? sharedCardsForPlans : [])).find(function (c) { return c.id === id; }); return c ? c.card_name : ''; };
  var payeeName = function (id) { var p = myPayees.find(function (p) { return p.id === id; }); return p ? p.party_name : ''; };
  var byDate = function (a, b) { return String(a.date || a.entry_date || '') < String(b.date || b.entry_date || '') ? -1 : 1; };

  async function bulk(kind, rows) {
    var n = 0;
    for (var i = 0; i < rows.length; i += 400) {
      var r = await sb.rpc('ifx_bulk_import', { p_kind: kind, p_owner: owner(), p_rows: rows.slice(i, i + 400) });
      if (r.error) return { error: r.error };
      n += (r.data && r.data.inserted) || 0;
    }
    return { n: n };
  }

  // 1) personal spending ------------------------------------------------------------
  X.register({
    id: 'bills', icon: '🧾', title: 'Bills / personal spending', file: 'bills', amountKey: 'amount', subtitle: function () { return managing.name; },
    cols: [
      { k: 'date', label: 'Date', type: 'date', req: true, ex: '2026-10-07' },
      { k: 'description', label: 'Description', type: 'text', req: true, maxLen: 200, ex: 'Lulu groceries' },
      { k: 'amount', label: 'Amount (AED)', type: 'num', req: true, ex: 125.5, alias: ['amount'] },
      { k: 'category', label: 'Category', type: 'enum', enum: CATS, def: 'other', ex: 'food', note: 'one of the list' },
      { k: 'card', label: 'Card name', type: 'text', maxLen: 80, ex: 'ADCB Platinum', note: 'optional — must already exist under Cards' }
    ],
    lists: async function () { return { 'Your cards': myCards.map(function (c) { return c.card_name; }) }; },
    rows: async function () { return myExpenses.slice().sort(byDate).map(function (x) { return { date: x.date, description: x.description, amount: Number(x.amount), category: x.category || 'other', card: cardName(x.card_id) }; }); },
    dupKey: function (r) { return [r.date, low(r.description), Number(r.amount).toFixed(2)].join('|'); },
    check: function (r) { return r.card && !cardByName(r.card) ? 'Card "' + r.card + '" does not exist — add it under Cards first, or leave the cell empty' : null; },
    insert: async function (rows) {
      return bulk('bill_expenses', rows.map(function (r) { var c = r.card ? cardByName(r.card) : null; return { description: r.description, amount: r.amount, card_id: c ? c.id : null, category: r.category || 'other', date: r.date }; }));
    },
    after: async function () { await loadMyData(); }
  });

  // 2) cards -----------------------------------------------------------------------
  X.register({
    id: 'cards', icon: '💳', title: 'Cards', file: 'cards',
    cols: [
      { k: 'card_name', label: 'Card name', type: 'text', req: true, maxLen: 80, ex: 'ADCB Platinum' },
      { k: 'due_day', label: 'Due day (1-31)', type: 'int', min: 1, max: 31, ex: 12, note: 'optional' },
      { k: 'color', label: 'Colour (#RRGGBB)', type: 'text', maxLen: 7, ex: '#4d96ff', note: 'optional' },
      { k: 'reminder', label: 'Reminders on (Yes/No)', type: 'bool', def: true, ex: 'Yes' }
    ],
    rows: async function () { return myCards.map(function (c) { return { card_name: c.card_name, due_day: c.due_day, color: c.color, reminder: c.reminder_enabled !== false }; }); },
    dupKey: function (r) { return low(r.card_name); },
    insert: async function (rows) {
      var COL = typeof CARD_COLORS !== 'undefined' ? CARD_COLORS : ['#4d96ff'];
      var payload = rows.map(function (r, i) { return { user_email: owner(), card_name: r.card_name, due_day: r.due_day || null, color: /^#[0-9a-f]{6}$/i.test(r.color || '') ? r.color : COL[(myCards.length + i) % COL.length], reminder_enabled: r.reminder !== false }; });
      return X.chunk(payload, 200, function (p) { return sb.from('bill_cards').insert(p); });
    },
    after: async function () { await loadMyData(); }
  });

  // 3) owed to admin -----------------------------------------------------------------
  X.register({
    id: 'owed', icon: '🏦', title: 'Owed to admin', file: 'owed-to-admin', amountKey: 'amount',
    canImport: function () { return canManageOwed() ? { ok: true } : { ok: false, why: 'Only the admin (or an admin delegate) can import owed amounts. Export still works.' }; },
    cols: [
      { k: 'month', label: 'Month (YYYY-MM)', type: 'month', req: true, ex: '2026-10' },
      { k: 'amount', label: 'Amount (AED)', type: 'num', req: true, ex: 300 },
      { k: 'note', label: 'Note', type: 'text', maxLen: 200, ex: 'Rent share' }
    ],
    rows: async function () { return myOwed.slice().sort(function (a, b) { return a.month < b.month ? -1 : 1; }).map(function (o) { return { month: o.month, amount: Number(o.amount), note: o.note || '' }; }); },
    dupKey: function (r) { return [r.month, Number(r.amount).toFixed(2), low(r.note)].join('|'); },
    insert: async function (rows) { return bulk('bill_owed', rows.map(function (r) { return { month: r.month, amount: r.amount, note: r.note || '' }; })); },
    after: async function () { await loadMyData(); }
  });

  // 4) party ledger ------------------------------------------------------------------
  X.register({
    id: 'party', icon: '🎉', title: 'Party ledger entries', file: 'party-ledger', amountKey: 'amount',
    cols: [
      { k: 'party', label: 'Party (person)', type: 'text', req: true, maxLen: 80, ex: 'Ahmed', note: 'created automatically if new' },
      { k: 'date', label: 'Date', type: 'date', req: true, ex: '2026-10-07' },
      { k: 'amount', label: 'Amount (AED)', type: 'num', req: true, ex: 80 },
      { k: 'type', label: 'Type', type: 'enum', enum: [{ v: 'owe', l: 'owe' }, { v: 'paid', l: 'paid' }], req: true, ex: 'owe', note: 'owe = I owe them · paid = I paid them' },
      { k: 'method', label: 'Payment method', type: 'enum', enum: ['cash', 'account', 'card'], def: 'cash', ex: 'cash' },
      { k: 'note', label: 'Note', type: 'text', maxLen: 200, ex: 'Dinner' }
    ],
    rows: async function () { return myPayeeEntries.slice().sort(byDate).map(function (e) { return { party: payeeName(e.payee_id), date: e.date, amount: Number(e.amount), type: e.entry_type, method: e.payment_method || 'cash', note: e.note || '' }; }); },
    dupKey: function (r) { return [low(r.party), r.date, Number(r.amount).toFixed(2), r.type, low(r.note)].join('|'); },
    insert: async function (rows) {
      var COL = typeof CARD_COLORS !== 'undefined' ? CARD_COLORS : ['#4d96ff'], map = {}, made = 0;
      myPayees.forEach(function (p) { map[low(p.party_name)] = p.id; });
      var fresh = []; rows.forEach(function (r) { var k = low(r.party); if (!(k in map) && fresh.indexOf(k) < 0) fresh.push(k); });
      for (var i = 0; i < fresh.length; i++) {
        var nm = rows.find(function (r) { return low(r.party) === fresh[i]; }).party;
        var ins = await sb.from('bill_payees').insert({ user_email: owner(), party_name: nm, color: COL[(myPayees.length + made) % COL.length] }).select().maybeSingle();
        if (ins.error || !ins.data) return { error: ins.error || new Error('Could not create party ' + nm) };
        map[fresh[i]] = ins.data.id; made++;
      }
      return bulk('bill_payee_entries', rows.map(function (r) { return { payee_id: map[low(r.party)], amount: r.amount, entry_type: r.type, note: r.note || '', date: r.date, payment_method: r.method || 'cash' }; }));
    },
    after: async function () { await loadMyData(); try { await loadOwedToMe(); } catch (e) {} }
  });

  // 5) settlements (export only) ---------------------------------------------------------
  X.register({
    id: 'settle', icon: '💸', title: 'Payments to admin (settlements)', file: 'settlements', amountKey: 'amount',
    canImport: function () { return { ok: false, why: 'Payments are recorded with “Settle up” so the audit trail stays correct. Export only.' }; },
    cols: [{ k: 'month', label: 'Month', type: 'month' }, { k: 'amount', label: 'Amount (AED)', type: 'num' }, { k: 'created', label: 'Recorded on', type: 'text' }],
    rows: async function () { return mySettlements.map(function (s) { return { month: s.month, amount: Number(s.amount), created: (s.created_at || '').slice(0, 10) }; }); }
  });

  // 6) EPP / Gold plans ------------------------------------------------------------------
  var LEDG = { own: 'own', owe_admin: 'owe_admin', owe_other: 'owe_other', owed_to_you: 'owed_to_you' };
  X.register({
    id: 'plans', icon: '📅', title: 'EPP & Gold plans', file: 'plans', amountKey: 'total', subtitle: function () { return managing.name; },
    cols: [
      { k: 'type', label: 'Plan type', type: 'enum', enum: ['epp', 'gold'], req: true, ex: 'epp' },
      { k: 'event', label: 'Event', type: 'text', maxLen: 80, def: 'General', ex: 'Ramadan' },
      { k: 'title', label: 'Title', type: 'text', req: true, maxLen: 120, ex: 'iPhone 17' },
      { k: 'ledger', label: 'Ledger', type: 'enum', enum: Object.keys(LEDG), def: 'own', ex: 'own', note: 'own · owe_admin · owe_other · owed_to_you' },
      { k: 'party', label: 'Party', type: 'text', maxLen: 80, note: 'required for owe_other / owed_to_you — must already exist' },
      { k: 'card', label: 'Card name', type: 'text', maxLen: 80, note: 'optional' },
      { k: 'total', label: 'Total (AED)', type: 'num', req: true, ex: 3600 },
      { k: 'installments', label: 'Payments', type: 'int', req: true, min: 1, max: 120, ex: 12 },
      { k: 'start_date', label: 'Start date', type: 'date', req: true, ex: '2026-11-01' },
      { k: 'due_day', label: 'Due day (1-31)', type: 'int', req: true, min: 1, max: 31, ex: 5 },
      { k: 'notes', label: 'Notes', type: 'text', maxLen: 300 },
      { k: 'paid', label: 'Paid so far (auto)', type: 'num', zero: true, exportOnly: true },
      { k: 'remaining', label: 'Remaining (auto)', type: 'num', zero: true, exportOnly: true },
      { k: 'end_date', label: 'End date (auto)', type: 'date', exportOnly: true }
    ],
    rows: async function () {
      return myPlans.map(function (p) {
        var s = planStats(p), py = myPayees.find(function (x) { return x.id === p.payee_id; });
        return { type: p.plan_type, event: p.event_name, title: p.title, ledger: p.ledger, party: py ? py.party_name : '', card: cardName(p.card_id), total: Number(p.total_amount), installments: p.installments, start_date: p.start_date, due_day: p.due_day, notes: p.notes || '', paid: s.paidAmt, remaining: s.remain, end_date: p.end_date };
      });
    },
    dupKey: function (r) { return [low(r.title), Number(r.total).toFixed(2), r.start_date].join('|'); },
    check: function (r) {
      if ((r.ledger === 'owe_other' || r.ledger === 'owed_to_you') && !r.party) return 'Party is required for ledger ' + r.ledger;
      if (r.party && !myPayees.some(function (p) { return low(p.party_name) === low(r.party); })) return 'Party "' + r.party + '" does not exist — create it under Party first';
      if (r.card && !cardByName(r.card, usableCards())) return 'Card "' + r.card + '" not found among your / shared cards';
      return null;
    },
    insert: async function (rows) {
      if (rows.length > 30) return { error: new Error('Import at most 30 plans at a time (each plan notifies the people involved).') };
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i], sch = planSchedule(r.total, r.installments, r.start_date, r.due_day), end = sch[sch.length - 1].due_date;
        var py = r.party ? myPayees.find(function (p) { return low(p.party_name) === low(r.party); }) : null, cd = r.card ? cardByName(r.card, usableCards()) : null;
        var ins = await sb.from('bill_plans').insert({ user_email: owner(), plan_type: r.type, event_name: r.event || 'General', title: r.title, ledger: r.ledger || 'own', payee_id: (r.ledger === 'owe_other' || r.ledger === 'owed_to_you') && py ? py.id : null, card_id: cd ? cd.id : null, total_amount: r.total, installments: r.installments, start_date: r.start_date, end_date: end, due_day: r.due_day, notes: r.notes || '', created_by_email: me.email }).select().maybeSingle();
        if (ins.error || !ins.data) return { error: ins.error || new Error('Could not create plan ' + r.title) };
        var pay = await sb.from('bill_plan_payments').insert(sch.map(function (s) { return { seq: s.seq, due_date: s.due_date, amount: s.amount, plan_id: ins.data.id, user_email: owner() }; }));
        if (pay.error) { await sb.from('bill_plans').delete().eq('id', ins.data.id); return { error: pay.error }; }
      }
      return {};
    },
    after: async function () { await loadPlans(); renderPlans(); }
  });

  // 7) Expense Tracker: trackers + entries --------------------------------------------------
  var KIND = [{ v: 'period', l: 'monthly' }, { v: 'occasion', l: 'event' }, { v: 'trip', l: 'trip' }];
  var kindLabel = function (k) { return (KIND.find(function (x) { return x.v === k; }) || { l: k }).l; };
  X.register({
    id: 'et_trackers', icon: '🧾', title: 'Expense trackers (monthly · event · trip)', file: 'expense-trackers',
    cols: [
      { k: 'title', label: 'Title', type: 'text', req: true, maxLen: 120, ex: 'Groceries October 2026' },
      { k: 'kind', label: 'Kind', type: 'enum', enum: KIND, req: true, ex: 'monthly', note: 'monthly · event · trip' },
      { k: 'currency', label: 'Currency', type: 'text', maxLen: 12, def: 'AED', ex: 'AED' },
      { k: 'start_date', label: 'Start date', type: 'date', req: true, ex: '2026-10-01' },
      { k: 'end_date', label: 'End date', type: 'date', req: true, ex: '2026-10-31' },
      { k: 'notes', label: 'Notes', type: 'text', maxLen: 300 },
      { k: 'total', label: 'Total spent (auto)', type: 'num', zero: true, exportOnly: true }
    ],
    rows: async function () { return etTrackers.map(function (t) { return { title: t.title, kind: kindLabel(t.kind), currency: t.currency, start_date: t.start_date, end_date: t.end_date, notes: t.notes || '', total: etEntries.filter(function (e) { return e.tracker_id === t.id; }).reduce(function (a, e) { return a + Number(e.amount); }, 0) }; }); },
    dupKey: function (r) { return [low(r.title), r.kind === 'monthly' ? 'period' : (r.kind === 'event' ? 'occasion' : r.kind), r.start_date].join('|'); },
    check: function (r) { return r.end_date < r.start_date ? 'End date is before start date' : null; },
    insert: async function (rows) {
      return X.chunk(rows.map(function (r) { return { user_email: owner(), kind: r.kind, title: r.title, currency: String(r.currency || 'AED').toUpperCase().replace(/[<>"'&]/g, ''), start_date: r.start_date, end_date: r.end_date, participants: [], notes: r.notes || '', created_by_email: me.email }; }), 100, function (p) { return sb.from('et_trackers').insert(p); });
    },
    after: async function () { await loadEt(); renderEt(); }
  });
  var trackerByTitle = function (t) { return etTrackers.filter(function (x) { return low(x.title) === low(t); }); };
  X.register({
    id: 'et_entries', icon: '🧾', title: 'Expense tracker entries', file: 'expense-entries', amountKey: 'amount',
    cols: [
      { k: 'tracker', label: 'Tracker title', type: 'text', req: true, maxLen: 120, ex: 'Groceries October 2026', note: 'must match an existing tracker' },
      { k: 'date', label: 'Date', type: 'date', req: true, ex: '2026-10-07' },
      { k: 'category', label: 'Category', type: 'text', req: true, maxLen: 60, ex: 'Groceries' },
      { k: 'amount', label: 'Amount', type: 'num', req: true, ex: 45.75 },
      { k: 'note', label: 'Note', type: 'text', maxLen: 200 },
      { k: 'spent_by', label: 'Spent by (e-mail)', type: 'email', note: 'optional — shared trackers only' }
    ],
    lists: async function () { return { 'Your trackers': etTrackers.map(function (t) { return t.title + '  (' + t.start_date + ' → ' + t.end_date + ')'; }), 'Categories': etAllCats().map(function (c) { return c[0]; }) }; },
    rows: async function () { return etEntries.slice().sort(function (a, b) { return a.entry_date < b.entry_date ? -1 : 1; }).map(function (e) { var t = etTrackers.find(function (x) { return x.id === e.tracker_id; }); return { tracker: t ? t.title : '', date: e.entry_date, category: e.category, amount: Number(e.amount), note: e.note || '', spent_by: e.spent_by || '' }; }); },
    dupKey: function (r) { return [low(r.tracker), r.date, low(r.category), Number(r.amount).toFixed(2), low(r.note)].join('|'); },
    check: function (r) {
      var m = trackerByTitle(r.tracker); if (!m.length) return 'Tracker "' + r.tracker + '" not found — create it first (or import it under “Expense trackers”)';
      if (m.length > 1) return 'More than one tracker is titled "' + r.tracker + '" — rename one';
      if (r.date < m[0].start_date || r.date > m[0].end_date) return 'Date is outside the tracker period ' + m[0].start_date + ' → ' + m[0].end_date;
      return null;
    },
    insert: async function (rows) {
      return X.chunk(rows.map(function (r) { var t = trackerByTitle(r.tracker)[0]; return { tracker_id: t.id, user_email: t.user_email, category: r.category, amount: r.amount, entry_date: r.date, note: r.note || '', spent_by: r.spent_by || t.user_email, created_by_email: me.email }; }), 300, function (p) { return sb.from('et_entries').insert(p); });
    },
    after: async function () { await loadEt(); renderEt(); }
  });
})();
