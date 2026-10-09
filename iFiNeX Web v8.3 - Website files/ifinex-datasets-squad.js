/* iFiNeX v8.3 — Squad Split import/export data sets (registered into ifxXfer; read index.html globals at call time) */
(function () {
  'use strict';
  var X = window.ifxXfer; if (!X) return;
  var low = function (s) { return String(s == null ? '' : s).trim().toLowerCase(); };
  var CATS = ['food', 'fuel', 'workshop', 'market', 'drinks', 'maintenance', 'other'];
  var mName = function (id) { var m = MEMBERS.find(function (x) { return x.id === id; }); return m ? m.name : String(id); };
  var mId = function (name) { var m = MEMBERS.find(function (x) { return low(x.name) === low(name) || low(x.id) === low(name); }); return m ? m.id : null; };
  var names = function () { return { 'Squad members': MEMBERS.map(function (m) { return m.name; }) }; };
  var byDate = function (a, b) { return String(a.date || a.month) < String(b.date || b.month) ? -1 : 1; };
  var reload = async function () { await loadAllData(); refresh(); };

  X.register({
    id: 'sq_expenses', icon: '💸', title: 'Squad expenses', file: 'squad-expenses', amountKey: 'amount',
    cols: [
      { k: 'date', label: 'Date', type: 'date', req: true, ex: '2026-10-07' },
      { k: 'name', label: 'Expense', type: 'text', req: true, maxLen: 120, ex: 'Fuel' },
      { k: 'amount', label: 'Amount (AED)', type: 'num', req: true, ex: 50 },
      { k: 'category', label: 'Category', type: 'enum', enum: CATS, def: 'other', ex: 'fuel' },
      { k: 'paid_by', label: 'Paid by (member name)', type: 'text', req: true, maxLen: 60, ex: 'Khan' },
      { k: 'split', label: 'Split between (names, ; separated — empty = everyone)', type: 'list', ex: 'Khan; Naina', alias: ['split between', 'splitbetween'] }
    ],
    lists: async function () { return names(); },
    rows: async function () { return expenses.slice().sort(byDate).map(function (e) { return { date: e.date, name: e.name, amount: Number(e.amount), category: e.category, paid_by: mName(e.paid_by), split: (e.split_between || []).map(mName) }; }); },
    dupKey: function (r) { return [r.date, low(r.name), Number(r.amount).toFixed(2), low(r.paid_by)].join('|'); },
    check: function (r) {
      if (!mId(r.paid_by)) return 'Paid by "' + r.paid_by + '" is not a squad member';
      var bad = (r.split || []).filter(function (n) { return !mId(n); }); return bad.length ? 'Unknown member(s) in split: ' + bad.join(', ') : null;
    },
    insert: async function (rows) {
      var payload = rows.map(function (r) { return { name: r.name, amount: r.amount, paid_by: mId(r.paid_by), split_between: (r.split && r.split.length ? r.split : MEMBERS.map(function (m) { return m.name; })).map(mId), date: r.date, category: r.category || 'other', month: r.date.slice(0, 7) }; });
      return X.chunk(payload, 200, function (p) { return sb.from('expenses').insert(p); });
    },
    after: reload
  });
  var pair = function (id, title, file, table, monthOf) {
    X.register({
      id: id, icon: id === 'sq_settle' ? '✅' : '⏮️', title: title, file: file, amountKey: 'amount',
      cols: [
        { k: 'from', label: 'From (member)', type: 'text', req: true, maxLen: 60, ex: 'Naina' },
        { k: 'to', label: 'To (member)', type: 'text', req: true, maxLen: 60, ex: 'Khan' },
        { k: 'amount', label: 'Amount (AED)', type: 'num', req: true, ex: 120 },
        { k: 'month', label: 'Month (YYYY-MM)', type: 'month', req: true, ex: '2026-10' }
      ],
      lists: async function () { return names(); },
      rows: async function () { return (id === 'sq_settle' ? settlements : prevBals).slice().sort(byDate).map(function (s) { return { from: mName(s.from_member), to: mName(s.to_member), amount: Number(s.amount), month: s.month }; }); },
      dupKey: function (r) { return [low(r.from), low(r.to), Number(r.amount).toFixed(2), r.month].join('|'); },
      check: function (r) { if (!mId(r.from)) return 'From "' + r.from + '" is not a squad member'; if (!mId(r.to)) return 'To "' + r.to + '" is not a squad member'; return mId(r.from) === mId(r.to) ? 'From and To must differ' : null; },
      insert: async function (rows) { return X.chunk(rows.map(function (r) { return { from_member: mId(r.from), to_member: mId(r.to), amount: r.amount, month: r.month }; }), 200, function (p) { return sb.from(table).insert(p); }); },
      after: reload
    });
  };
  pair('sq_settle', 'Squad settlements (paid)', 'squad-settlements', 'settlements');
  pair('sq_prev', 'Squad carry-forward balances', 'squad-carry-forward', 'prev_balances');
})();
