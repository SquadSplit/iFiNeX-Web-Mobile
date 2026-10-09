/* ============================================================================
   iFiNeX Budget & Salary Planner (v8.3) — page "page-budget" inside bill-tracker.html
   Tables: bp_income (salary & other income / month), bp_items (budget lines / month), bp_goals (savings goals)
   Actual spending is read automatically from the Expense Tracker entries + personal spend of the same month and category.
   All user text goes through esc(); buttons use data-act + one delegated click handler (no inline JS built from user data).
   ============================================================================ */
(function () {
  'use strict';
  var W = window, D = document, X = W.ifxXfer;
  var esc = X.esc, fmt = X.fmt;
  var BUCKETS = { needs: ['🏠', 'Needs'], wants: ['🎈', 'Wants'], savings: ['🏦', 'Savings'], debt: ['💳', 'Debt'], other: ['📦', 'Other'] };
  var KINDS = ['salary', 'bonus', 'allowance', 'freelance', 'other'];
  // default split + the lines each bucket is spread across (names match Expense Tracker categories so "actual" fills in by itself)
  var SPLIT = { needs: 50, wants: 30, savings: 20, debt: 0 };
  var LINES = {
    needs: [['Rent', 40], ['Groceries', 25], ['Utilities', 12], ['Transport', 15], ['Medical', 8]],
    wants: [['Outing', 35], ['Shopping', 30], ['Lifestyle', 20], ['Gifts', 15]],
    savings: [['Savings', 60], ['Emergency fund', 40]],
    debt: [['Debt payments', 100]]
  };
  var S = { month: '', tab: 'overview', income: [], items: [], goals: [], split: Object.assign({}, SPLIT), ready: false, loading: false };
  var root = null, owner = function () { return managing.email; }, actor = function () { return me.email; };
  var low = function (s) { return String(s == null ? '' : s).trim().toLowerCase(); };
  var thisMonth = function () { return localMonthStr(new Date()); };
  function shiftMonth(m, d) { var p = m.split('-').map(Number), x = new Date(p[0], p[1] - 1 + d, 1); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0'); }
  function monthLabel(m) { var p = m.split('-').map(Number); return new Date(p[0], p[1] - 1, 1).toLocaleString('en', { month: 'long', year: 'numeric' }); }
  function toast(m) { if (W.toast) W.toast(m); }
  var money = function (n) { return 'AED ' + fmt(n); };

  // ---------- tiny form dialog ----------
  function ask(title, fields, okLabel) {
    return new Promise(function (res) {
      var o = D.createElement('div'); o.style.cssText = 'position:fixed;inset:0;z-index:9800;background:rgba(0,0,0,.6);display:flex;align-items:flex-end;justify-content:center;';
      var h = '<div style="width:min(520px,100%);background:var(--card,#151528);color:var(--text,#e8ecff);border:1px solid var(--border,rgba(255,255,255,.15));border-radius:20px 20px 0 0;padding:16px 16px calc(18px + env(safe-area-inset-bottom,0px));max-height:90vh;overflow:auto;"><h3 style="margin:0 0 10px;font-size:1.02rem;">' + esc(title) + '</h3>';
      fields.forEach(function (f, i) {
        h += '<label style="font-size:.7rem;color:var(--muted,#9aa3c7);display:block;margin:8px 0 3px;">' + esc(f.label) + '</label>';
        var st = 'width:100%;padding:11px;border-radius:10px;border:1px solid var(--border,rgba(255,255,255,.2));background:var(--card2,rgba(255,255,255,.06));color:inherit;font-size:.9rem;';
        if (f.options) h += '<select data-i="' + i + '" style="' + st + '">' + f.options.map(function (op) { var v = Array.isArray(op) ? op[0] : op, l = Array.isArray(op) ? op[1] : op; return '<option value="' + esc(v) + '"' + (String(v) === String(f.val) ? ' selected' : '') + '>' + esc(l) + '</option>'; }).join('') + '</select>';
        else h += '<input data-i="' + i + '" type="' + (f.type || 'text') + '" ' + (f.type === 'number' ? 'step="0.01" min="0" inputmode="decimal"' : '') + ' value="' + esc(f.val == null ? '' : f.val) + '" placeholder="' + esc(f.ph || '') + '" style="' + st + '">';
      });
      h += '<div style="display:flex;gap:8px;margin-top:14px;"><button data-x="no" style="flex:1;padding:12px;border-radius:12px;border:1px solid var(--border,rgba(255,255,255,.2));background:none;color:inherit;font-weight:800;">Cancel</button><button data-x="ok" style="flex:2;padding:12px;border:0;border-radius:12px;font-weight:900;color:#fff;background:linear-gradient(135deg,#4D96FF,#B06AFF);">' + esc(okLabel || 'Save') + '</button></div></div>';
      o.innerHTML = h; D.body.appendChild(o);
      var done = function (v) { o.remove(); res(v); };
      o.addEventListener('click', function (e) { if (e.target === o) done(null); var x = e.target.getAttribute && e.target.getAttribute('data-x'); if (x === 'no') done(null); if (x === 'ok') { var out = {}; o.querySelectorAll('[data-i]').forEach(function (el) { out[fields[+el.getAttribute('data-i')].k] = el.value.trim(); }); done(out); } });
      var first = o.querySelector('[data-i]'); if (first && first.tagName === 'INPUT') setTimeout(function () { try { first.focus(); } catch (e) {} }, 60);
    });
  }

  // ---------- data ----------
  async function load() {
    S.loading = true; paint();
    var q = function (t, ord) { return sb.from(t).select('*').ilike('user_email', escLike(owner())).order(ord, { ascending: false }); };
    var r = await Promise.all([q('bp_income', 'month'), q('bp_items', 'month'), q('bp_goals', 'created_at')]);
    var err = r.find(function (x) { return x.error; });
    if (err) { S.loading = false; root.innerHTML = '<div class="card"><p style="color:#FF6B6B;">Could not load the planner: ' + esc(err.error.message) + '</p></div>'; return; }
    S.income = r[0].data || []; S.items = r[1].data || []; S.goals = r[2].data || [];
    try { if (typeof loadEt === 'function') await loadEt(); } catch (e) {}
    S.ready = true; S.loading = false; paint();
  }
  // actual spending in a month, per lower-case category: Expense Tracker entries (own trackers) + personal spend
  function actuals(month) {
    var by = {}, total = 0, own = low(owner());
    (typeof etEntries !== 'undefined' ? etEntries : []).forEach(function (e) {
      var t = etTrackers.find(function (x) { return x.id === e.tracker_id; }); if (!t || low(t.user_email) !== own) return;
      if (String(e.entry_date).slice(0, 7) !== month) return;
      var who = low(e.spent_by || t.user_email); if (who !== own) return;      // only what THIS person spent
      by[low(e.category)] = (by[low(e.category)] || 0) + Number(e.amount); total += Number(e.amount);
    });
    (typeof myExpenses !== 'undefined' ? myExpenses : []).forEach(function (x) { if (x.month !== month) return; by[low(x.category)] = (by[low(x.category)] || 0) + Number(x.amount); total += Number(x.amount); });
    return { by: by, total: total };
  }
  function planDue(month) {
    var due = 0, paid = 0; (typeof myPlanPays !== 'undefined' ? myPlanPays : []).forEach(function (p) { if (String(p.due_date).slice(0, 7) !== month) return; due += Number(p.amount); if (p.status === 'paid') paid += Number(p.amount); }); return { due: due, paid: paid };
  }
  var sum = function (a, k) { return a.reduce(function (t, x) { return t + (Number(x[k]) || 0); }, 0); };

  // ---------- paint ----------
  function paint() {
    if (!root) return; if (S.loading && !S.ready) { root.innerHTML = '<div class="card"><p style="color:var(--muted);">Loading…</p></div>'; return; }
    var m = S.month, inc = S.income.filter(function (x) { return x.month === m; }), its = S.items.filter(function (x) { return x.month === m; });
    var head = '<div class="section-title">💰 Budget &amp; Salary Planner</div>' +
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px;"><button class="btn-tiny" data-act="m-" aria-label="Previous month">‹</button><b style="font-size:.95rem;">' + esc(monthLabel(m)) + '</b><button class="btn-tiny" data-act="m+" aria-label="Next month">›</button></div>' +
      '<div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap;">' + X.button('bp_income', 'Import / Export') + '</div>' +
      '<div class="ptabs">' + [['overview', '📊 Overview'], ['salary', '💼 Salary'], ['budget', '🎯 Budget'], ['goals', '🏆 Goals']].map(function (t) { return '<button class="ptab ' + (S.tab === t[0] ? 'on' : '') + '" data-act="tab" data-v="' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</div>';
    root.innerHTML = head + (S.tab === 'overview' ? vOverview(inc, its) : S.tab === 'salary' ? vSalary(inc) : S.tab === 'budget' ? vBudget(its) : vGoals());
  }
  function bar(pct, over) { return '<div class="et-bar" style="height:8px;"><i style="width:' + Math.min(100, Math.max(0, pct)) + '%;' + (over ? 'background:linear-gradient(90deg,#FF6B6B,#FF9D6B);' : '') + '"></i></div>'; }
  function stat(label, val, color) { return '<div class="plan-stat" style="' + (color ? 'color:' + color : '') + '">' + esc(label) + '<b>' + esc(val) + '</b></div>'; }

  function vOverview(inc, its) {
    var income = sum(inc, 'amount'), planned = sum(its, 'planned'), A = actuals(S.month), pd = planDue(S.month);
    var left = income - A.total, rate = income > 0 ? Math.round((left / income) * 100) : 0, unalloc = income - planned;
    var h = '<div class="plan-summary" style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px;">' + stat('Income', money(income), '#6BCB77') + stat('Planned', money(planned)) + stat('Spent', money(A.total), A.total > income && income > 0 ? '#FF6B6B' : '') + '</div>' +
      '<div class="plan-summary" style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:12px;">' + stat(unalloc >= 0 ? 'Not yet planned' : 'Over-planned by', money(Math.abs(unalloc)), unalloc < 0 ? '#FF6B6B' : '#FFD93D') + stat('Left after spending', money(left), left < 0 ? '#FF6B6B' : '#6BCB77') + '</div>';
    if (!income && !its.length) return h + '<div class="card"><p style="margin:0 0 8px;">Start here:</p><ol style="margin:0;padding-left:18px;font-size:.85rem;line-height:1.7;"><li>Open <b>💼 Salary</b> and add this month\'s salary.</li><li>Use the <b>split calculator</b> to create a ready budget in one tap.</li><li>Spend as usual in Expense Tracker — <b>Actual</b> fills in automatically.</li></ol></div>';
    h += '<div class="card"><div class="section-title" style="font-size:1rem;">Savings rate</div><div style="display:flex;justify-content:space-between;font-size:.8rem;"><span>' + (income ? esc(rate + '% of income not spent') : 'Add income to see this') + '</span><b>' + esc(money(left)) + '</b></div>' + bar(rate, left < 0) + '</div>';
    var bk = {}; its.forEach(function (x) { bk[x.bucket] = (bk[x.bucket] || 0) + Number(x.planned); });
    h += '<div class="card"><div class="section-title" style="font-size:1rem;">Where the money is planned</div>' + Object.keys(BUCKETS).filter(function (b) { return bk[b]; }).map(function (b) { var pct = income ? Math.round(bk[b] / income * 100) : 0; return '<div style="margin-bottom:9px;"><div style="display:flex;justify-content:space-between;font-size:.76rem;"><span>' + BUCKETS[b][0] + ' ' + BUCKETS[b][1] + ' · ' + esc(pct) + '%</span><b>' + esc(money(bk[b])) + '</b></div>' + bar(pct) + '</div>'; }).join('') + (its.length ? '' : '<p style="color:var(--muted);font-size:.78rem;">No budget lines yet.</p>') + '<div style="font-size:.66rem;color:var(--muted);">Guideline: 50% needs · 30% wants · 20% savings.</div></div>';
    var over = its.map(function (x) { return { x: x, a: A.by[low(x.category)] || 0 }; }).filter(function (r) { return r.a > Number(r.x.planned) && r.x.bucket !== 'savings'; });
    if (over.length) h += '<div class="card" style="border-color:#FF6B6B;"><div class="section-title" style="font-size:1rem;color:#FF6B6B;">⚠️ Over budget</div>' + over.map(function (r) { return '<div class="et-row"><span style="flex:1">' + esc(r.x.category) + '</span><b>' + esc(money(r.a - r.x.planned)) + ' over</b></div>'; }).join('') + '</div>';
    if (pd.due) h += '<div class="card"><div class="section-title" style="font-size:1rem;">📅 EPP / Gold installments this month</div><div class="et-row"><span style="flex:1">Due</span><b>' + esc(money(pd.due)) + '</b></div><div class="et-row"><span style="flex:1">Already paid</span><b>' + esc(money(pd.paid)) + '</b></div><div style="font-size:.66rem;color:var(--muted);">Include these in your budget (e.g. a “Plan installments” line) so they are not forgotten.</div></div>';
    return h;
  }

  function vSalary(inc) {
    var income = sum(inc, 'amount'), base = income || 0, tot = Object.keys(S.split).reduce(function (t, k) { return t + Number(S.split[k]); }, 0);
    var h = '<div class="card"><div class="section-title" style="font-size:1rem;">💼 Income — ' + esc(monthLabel(S.month)) + '</div>' +
      (inc.length ? inc.map(function (x) { return '<div class="et-row" data-ifx-k="in' + esc(x.id) + '" data-ifx-amt="' + esc(x.amount) + '" data-ifx-label="' + esc(x.source) + '" data-ifx-date="' + esc(x.pay_date || x.month) + '"><span style="flex:1;min-width:0;"><b>' + esc(x.source) + '</b><small style="color:var(--muted)"> · ' + esc(x.kind) + (x.pay_date ? ' · ' + esc(x.pay_date) : '') + '</small></span><b>' + esc(fmt(x.amount)) + '</b><button class="btn-tiny ghost" data-act="in-edit" data-id="' + esc(x.id) + '">✏️</button><button class="btn-tiny ghost" data-act="in-del" data-id="' + esc(x.id) + '">✕</button></div>'; }).join('') + '<div class="et-row"><span style="flex:1"><b>Total income</b></span><b>' + esc(money(income)) + '</b></div>' : '<p style="color:var(--muted);font-size:.8rem;">No income added for this month.</p>') +
      '<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;"><button class="btn-add" style="flex:1;margin:0;" data-act="in-add">➕ Add income</button><button class="btn-tiny" data-act="in-copy">Copy last month</button></div></div>';
    h += '<div class="card"><div class="section-title" style="font-size:1rem;">🧮 Salary split calculator</div><div style="font-size:.74rem;color:var(--muted);margin-bottom:8px;">Based on this month\'s income: <b>' + esc(money(base)) + '</b>. Change the percentages, check the preview, then create your budget lines in one tap.</div><div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;">' +
      Object.keys(S.split).map(function (k) { return '<div><label style="font-size:.64rem;color:var(--muted);">' + BUCKETS[k][0] + ' ' + BUCKETS[k][1] + ' %</label><input type="number" min="0" max="100" inputmode="numeric" data-split="' + k + '" value="' + esc(S.split[k]) + '" style="width:100%;padding:9px;border-radius:9px;border:1px solid var(--border);background:var(--card2);color:inherit;"></div>'; }).join('') + '</div>' +
      '<div style="font-size:.74rem;margin:8px 0;' + (tot !== 100 ? 'color:#FF6B6B;' : 'color:#6BCB77;') + '">Total ' + esc(tot) + '% ' + (tot === 100 ? '✅' : '— must be 100%') + '</div>' +
      '<div class="wrap" style="overflow-x:auto;"><table style="width:100%;font-size:.74rem;border-collapse:collapse;">' + allocation().map(function (r) { return '<tr><td style="padding:4px;">' + BUCKETS[r.bucket][0] + ' ' + esc(r.category) + '</td><td style="padding:4px;text-align:right;"><b>' + esc(fmt(base * r.pct / 100)) + '</b></td></tr>'; }).join('') + '</table></div>' +
      '<button class="btn-add" style="margin-top:10px;" data-act="apply-split"' + (base > 0 && tot === 100 ? '' : ' disabled') + '>✨ Create budget lines for ' + esc(monthLabel(S.month)) + '</button></div>';
    return h;
  }
  function allocation() { var out = []; Object.keys(S.split).forEach(function (b) { var bp = Number(S.split[b]) || 0; if (!bp) return; (LINES[b] || []).forEach(function (l) { out.push({ bucket: b, category: l[0], pct: bp * l[1] / 100 }); }); }); return out; }

  function vBudget(its) {
    var A = actuals(S.month), h = '<div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap;"><button class="btn-add" style="flex:1;margin:0;" data-act="it-add">➕ Add budget line</button><button class="btn-tiny" data-act="it-copy">Copy last month</button></div>';
    if (!its.length) return h + '<div class="card"><p style="color:var(--muted);margin:0;">No budget lines for this month. Add one, copy last month, or use the split calculator in 💼 Salary.</p></div>';
    Object.keys(BUCKETS).forEach(function (b) {
      var rows = its.filter(function (x) { return x.bucket === b; }); if (!rows.length) return;
      h += '<div class="card"><div class="section-title" style="font-size:1rem;display:flex;justify-content:space-between;"><span>' + BUCKETS[b][0] + ' ' + BUCKETS[b][1] + '</span><span>' + esc(money(sum(rows, 'planned'))) + '</span></div>' + rows.map(function (x) {
        var a = A.by[low(x.category)] || 0, p = Number(x.planned), pct = p > 0 ? a / p * 100 : (a > 0 ? 100 : 0), over = a > p && b !== 'savings';
        return '<div style="margin-bottom:11px;" data-ifx-k="it' + esc(x.id) + '" data-ifx-amt="' + esc(x.planned) + '" data-ifx-label="' + esc(x.category) + '" data-ifx-date="' + esc(x.month) + '"><div style="display:flex;justify-content:space-between;gap:6px;font-size:.8rem;"><b>' + esc(x.category) + '</b><span>' + esc(fmt(a)) + ' / ' + esc(fmt(p)) + '</span></div>' + bar(pct, over) + '<div style="display:flex;justify-content:space-between;font-size:.66rem;color:' + (over ? '#FF6B6B' : 'var(--muted)') + ';margin-top:2px;"><span>' + (over ? esc(fmt(a - p)) + ' over' : esc(fmt(p - a)) + ' left') + '</span><span><button class="btn-tiny ghost" data-act="it-edit" data-id="' + esc(x.id) + '">✏️</button> <button class="btn-tiny ghost" data-act="it-del" data-id="' + esc(x.id) + '">✕</button></span></div></div>';
      }).join('') + '</div>';
    });
    var matched = new Set(its.map(function (x) { return low(x.category); })), un = Object.keys(A.by).filter(function (k) { return !matched.has(k); });
    if (un.length) h += '<div class="card"><div class="section-title" style="font-size:1rem;">Spent without a budget line</div>' + un.map(function (k) { return '<div class="et-row"><span style="flex:1">' + esc(k) + '</span><b>' + esc(money(A.by[k])) + '</b></div>'; }).join('') + '</div>';
    return h;
  }

  function vGoals() {
    var h = '<button class="btn-add" style="margin-bottom:12px;" data-act="g-add">➕ New savings goal</button>';
    if (!S.goals.length) return h + '<div class="card"><p style="color:var(--muted);margin:0;">Goals like “Emergency fund” or “Umrah trip” show how much to save each month.</p></div>';
    var now = new Date();
    return h + S.goals.map(function (g) {
      var t = Number(g.target), sv = Number(g.saved), pct = Math.round(sv / t * 100), need = '';
      if (g.due_date) { var d = new Date(g.due_date + 'T00:00:00'), mths = Math.max(1, (d.getFullYear() - now.getFullYear()) * 12 + d.getMonth() - now.getMonth() + (d.getDate() >= now.getDate() ? 1 : 0)); need = sv >= t ? '' : ' · save ' + fmt((t - sv) / mths) + ' / month'; }
      return '<div class="card" data-ifx-k="g' + esc(g.id) + '" data-ifx-amt="' + esc(g.target) + '" data-ifx-label="' + esc(g.name) + '" data-ifx-date="' + esc(g.due_date || '') + '"><div style="display:flex;justify-content:space-between;gap:8px;"><b>🏆 ' + esc(g.name) + '</b><b>' + esc(pct) + '%</b></div>' + bar(pct) + '<div style="font-size:.72rem;color:var(--muted);margin:4px 0 8px;">' + esc(fmt(sv)) + ' of ' + esc(fmt(t)) + (g.due_date ? ' · by ' + esc(g.due_date) : '') + esc(need) + (sv >= t ? ' · ✅ reached' : '') + '</div><div style="display:flex;gap:6px;flex-wrap:wrap;"><button class="btn-tiny" data-act="g-add-money" data-id="' + esc(g.id) + '">+ Add money</button><button class="btn-tiny ghost" data-act="g-edit" data-id="' + esc(g.id) + '">✏️ Edit</button><button class="btn-tiny ghost" data-act="g-del" data-id="' + esc(g.id) + '">🗑️</button></div></div>';
    }).join('');
  }

  // ---------- actions ----------
  var byId = function (arr, id) { return arr.find(function (x) { return String(x.id) === String(id); }); };
  async function run(p, okMsg) { var r = await p; if (r && r.error) { toast('❌ ' + r.error.message); return false; } if (okMsg) toast(okMsg); await load(); return true; }
  var base = function () { return { user_email: owner(), created_by_email: actor() }; };
  var num = function (v) { var n = Number(String(v).replace(/,/g, '')); return isFinite(n) ? n : NaN; };

  var ACT = {
    'm-': function () { S.month = shiftMonth(S.month, -1); paint(); }, 'm+': function () { S.month = shiftMonth(S.month, 1); paint(); },
    tab: function (el) { S.tab = el.getAttribute('data-v'); paint(); },
    'in-add': async function () { var v = await ask('Add income — ' + monthLabel(S.month), [{ k: 'source', label: 'Source', ph: 'e.g. Company salary' }, { k: 'kind', label: 'Type', options: KINDS, val: 'salary' }, { k: 'amount', label: 'Amount (AED)', type: 'number' }, { k: 'pay_date', label: 'Pay date (optional)', type: 'date' }]); if (!v) return; var a = num(v.amount); if (!v.source || !(a >= 0)) return toast('Enter a source and an amount'); await run(sb.from('bp_income').insert(Object.assign(base(), { month: S.month, source: v.source.slice(0, 120), kind: v.kind, amount: a, pay_date: v.pay_date || null })), 'Income added ✓'); },
    'in-edit': async function (el) { var x = byId(S.income, el.getAttribute('data-id')); if (!x) return; var v = await ask('Edit income', [{ k: 'source', label: 'Source', val: x.source }, { k: 'kind', label: 'Type', options: KINDS, val: x.kind }, { k: 'amount', label: 'Amount (AED)', type: 'number', val: x.amount }, { k: 'pay_date', label: 'Pay date', type: 'date', val: x.pay_date || '' }]); if (!v) return; var a = num(v.amount); if (!v.source || !(a >= 0)) return toast('Enter a source and an amount'); await run(sb.from('bp_income').update({ source: v.source.slice(0, 120), kind: v.kind, amount: a, pay_date: v.pay_date || null }).eq('id', x.id), 'Saved ✓'); },
    'in-del': async function (el) { if (!confirm('Delete this income entry?')) return; await run(sb.from('bp_income').delete().eq('id', el.getAttribute('data-id')), 'Deleted'); },
    'in-copy': async function () { var prev = shiftMonth(S.month, -1), rows = S.income.filter(function (x) { return x.month === prev; }); if (!rows.length) return toast('No income in ' + monthLabel(prev)); if (S.income.some(function (x) { return x.month === S.month; }) && !confirm('This month already has income. Add the copied rows as well?')) return; await run(sb.from('bp_income').insert(rows.map(function (x) { return Object.assign(base(), { month: S.month, source: x.source, kind: x.kind, amount: x.amount, pay_date: x.pay_date ? S.month + x.pay_date.slice(7) : null, note: x.note || '' }); })), 'Copied ' + rows.length + ' rows ✓'); },
    'apply-split': async function () {
      var inc = sum(S.income.filter(function (x) { return x.month === S.month; }), 'amount'), al = allocation(); if (!(inc > 0)) return toast('Add income first');
      if (!confirm('Create / update ' + al.length + ' budget lines for ' + monthLabel(S.month) + '? Lines with the same name are overwritten.')) return;
      var existing = S.items.filter(function (x) { return x.month === S.month; }), ins = [];
      for (var i = 0; i < al.length; i++) {
        var r = al[i], amt = Math.round(inc * r.pct) / 100, hit = existing.find(function (x) { return low(x.category) === low(r.category); });
        if (hit) { var u = await sb.from('bp_items').update({ planned: amt, bucket: r.bucket }).eq('id', hit.id); if (u.error) return toast('❌ ' + u.error.message); }
        else ins.push(Object.assign(base(), { month: S.month, category: r.category, bucket: r.bucket, planned: amt }));
      }
      if (ins.length) { var q = await sb.from('bp_items').insert(ins); if (q.error) return toast('❌ ' + q.error.message); }
      S.tab = 'budget'; toast('Budget created ✓'); await load();
    },
    'it-add': async function () { var v = await ask('Add budget line — ' + monthLabel(S.month), [{ k: 'category', label: 'Category (same name as in Expense Tracker to auto-track)', ph: 'Groceries' }, { k: 'bucket', label: 'Group', options: Object.keys(BUCKETS).map(function (b) { return [b, BUCKETS[b][1]]; }), val: 'needs' }, { k: 'planned', label: 'Planned amount (AED)', type: 'number' }]); if (!v) return; var a = num(v.planned); if (!v.category || !(a >= 0)) return toast('Enter a category and an amount'); if (S.items.some(function (x) { return x.month === S.month && low(x.category) === low(v.category); })) return toast('That category already exists this month — edit it instead'); await run(sb.from('bp_items').insert(Object.assign(base(), { month: S.month, category: v.category.slice(0, 80), bucket: v.bucket, planned: a })), 'Line added ✓'); },
    'it-edit': async function (el) { var x = byId(S.items, el.getAttribute('data-id')); if (!x) return; var v = await ask('Edit budget line', [{ k: 'category', label: 'Category', val: x.category }, { k: 'bucket', label: 'Group', options: Object.keys(BUCKETS).map(function (b) { return [b, BUCKETS[b][1]]; }), val: x.bucket }, { k: 'planned', label: 'Planned amount (AED)', type: 'number', val: x.planned }]); if (!v) return; var a = num(v.planned); if (!v.category || !(a >= 0)) return toast('Enter a category and an amount'); await run(sb.from('bp_items').update({ category: v.category.slice(0, 80), bucket: v.bucket, planned: a }).eq('id', x.id), 'Saved ✓'); },
    'it-del': async function (el) { if (!confirm('Delete this budget line?')) return; await run(sb.from('bp_items').delete().eq('id', el.getAttribute('data-id')), 'Deleted'); },
    'it-copy': async function () { var prev = shiftMonth(S.month, -1), rows = S.items.filter(function (x) { return x.month === prev; }), have = new Set(S.items.filter(function (x) { return x.month === S.month; }).map(function (x) { return low(x.category); })); rows = rows.filter(function (x) { return !have.has(low(x.category)); }); if (!rows.length) return toast('Nothing new to copy from ' + monthLabel(prev)); await run(sb.from('bp_items').insert(rows.map(function (x) { return Object.assign(base(), { month: S.month, category: x.category, bucket: x.bucket, planned: x.planned, note: x.note || '' }); })), 'Copied ' + rows.length + ' lines ✓'); },
    'g-add': async function () { var v = await ask('New savings goal', [{ k: 'name', label: 'Goal name', ph: 'Emergency fund' }, { k: 'target', label: 'Target (AED)', type: 'number' }, { k: 'saved', label: 'Already saved (AED)', type: 'number', val: 0 }, { k: 'due_date', label: 'Target date (optional)', type: 'date' }]); if (!v) return; var t = num(v.target), sv = num(v.saved || 0); if (!v.name || !(t > 0) || !(sv >= 0)) return toast('Enter a name and a target above 0'); await run(sb.from('bp_goals').insert(Object.assign(base(), { name: v.name.slice(0, 120), target: t, saved: sv, due_date: v.due_date || null })), 'Goal added ✓'); },
    'g-edit': async function (el) { var g = byId(S.goals, el.getAttribute('data-id')); if (!g) return; var v = await ask('Edit goal', [{ k: 'name', label: 'Goal name', val: g.name }, { k: 'target', label: 'Target (AED)', type: 'number', val: g.target }, { k: 'saved', label: 'Saved so far (AED)', type: 'number', val: g.saved }, { k: 'due_date', label: 'Target date', type: 'date', val: g.due_date || '' }]); if (!v) return; var t = num(v.target), sv = num(v.saved); if (!v.name || !(t > 0) || !(sv >= 0)) return toast('Enter a name and a target above 0'); await run(sb.from('bp_goals').update({ name: v.name.slice(0, 120), target: t, saved: sv, due_date: v.due_date || null }).eq('id', g.id), 'Saved ✓'); },
    'g-add-money': async function (el) { var g = byId(S.goals, el.getAttribute('data-id')); if (!g) return; var v = await ask('Add money to “' + g.name + '”', [{ k: 'amt', label: 'Amount (AED)', type: 'number' }], 'Add'); if (!v) return; var a = num(v.amt); if (!(a > 0)) return toast('Enter an amount above 0'); await run(sb.from('bp_goals').update({ saved: Math.round((Number(g.saved) + a) * 100) / 100 }).eq('id', g.id), 'Added ✓'); },
    'g-del': async function (el) { if (!confirm('Delete this goal?')) return; await run(sb.from('bp_goals').delete().eq('id', el.getAttribute('data-id')), 'Deleted'); }
  };

  // ---------- import / export data sets ----------
  var byNew = function (a, b) { return a < b ? -1 : 1; };
  async function ins(table, rows) { return X.chunk(rows.map(function (r) { return Object.assign(base(), r); }), 300, function (p) { return sb.from(table).insert(p); }); }
  X.register({
    id: 'bp_income', icon: '💼', title: 'Budget planner — income / salary', file: 'income', amountKey: 'amount',
    cols: [{ k: 'month', label: 'Month (YYYY-MM)', type: 'month', req: true, ex: '2026-10' }, { k: 'source', label: 'Source', type: 'text', req: true, maxLen: 120, ex: 'Company salary' }, { k: 'kind', label: 'Type', type: 'enum', enum: KINDS, def: 'salary', ex: 'salary' }, { k: 'amount', label: 'Amount (AED)', type: 'num', zero: true, req: true, ex: 9500 }, { k: 'pay_date', label: 'Pay date', type: 'date', ex: '2026-10-28' }, { k: 'note', label: 'Note', type: 'text', maxLen: 500 }],
    rows: async function () { return S.income.slice().sort(function (a, b) { return byNew(a.month, b.month); }).map(function (x) { return { month: x.month, source: x.source, kind: x.kind, amount: Number(x.amount), pay_date: x.pay_date || '', note: x.note || '' }; }); },
    dupKey: function (r) { return [r.month, low(r.source), Number(r.amount).toFixed(2)].join('|'); },
    insert: function (rows) { return ins('bp_income', rows.map(function (r) { return { month: r.month, source: r.source, kind: r.kind || 'salary', amount: r.amount, pay_date: r.pay_date || null, note: r.note || '' }; })); }, after: load
  });
  X.register({
    id: 'bp_items', icon: '🎯', title: 'Budget planner — budget lines', file: 'budget-lines', amountKey: 'planned',
    cols: [{ k: 'month', label: 'Month (YYYY-MM)', type: 'month', req: true, ex: '2026-10' }, { k: 'category', label: 'Category', type: 'text', req: true, maxLen: 80, ex: 'Groceries' }, { k: 'bucket', label: 'Group', type: 'enum', enum: Object.keys(BUCKETS), def: 'needs', ex: 'needs', note: 'needs · wants · savings · debt · other' }, { k: 'planned', label: 'Planned (AED)', type: 'num', zero: true, req: true, ex: 1200 }, { k: 'note', label: 'Note', type: 'text', maxLen: 500 }],
    rows: async function () { return S.items.slice().sort(function (a, b) { return byNew(a.month, b.month); }).map(function (x) { return { month: x.month, category: x.category, bucket: x.bucket, planned: Number(x.planned), note: x.note || '' }; }); },
    dupKey: function (r) { return [r.month, low(r.category)].join('|'); },
    insert: function (rows) { var seen = new Set(); rows = rows.filter(function (r) { var k = r.month + '|' + low(r.category); if (seen.has(k)) return false; seen.add(k); return true; }); return ins('bp_items', rows.map(function (r) { return { month: r.month, category: r.category, bucket: r.bucket || 'needs', planned: r.planned, note: r.note || '' }; })); }, after: load
  });
  X.register({
    id: 'bp_goals', icon: '🏆', title: 'Budget planner — savings goals', file: 'goals', amountKey: 'target',
    cols: [{ k: 'name', label: 'Goal', type: 'text', req: true, maxLen: 120, ex: 'Emergency fund' }, { k: 'target', label: 'Target (AED)', type: 'num', req: true, ex: 20000 }, { k: 'saved', label: 'Saved so far (AED)', type: 'num', zero: true, def: 0, ex: 2500 }, { k: 'due_date', label: 'Target date', type: 'date', ex: '2027-06-30' }, { k: 'note', label: 'Note', type: 'text', maxLen: 500 }],
    rows: async function () { return S.goals.map(function (g) { return { name: g.name, target: Number(g.target), saved: Number(g.saved), due_date: g.due_date || '', note: g.note || '' }; }); },
    dupKey: function (r) { return low(r.name); },
    insert: function (rows) { return ins('bp_goals', rows.map(function (r) { return { name: r.name, target: r.target, saved: r.saved || 0, due_date: r.due_date || null, note: r.note || '' }; })); }, after: load
  });

  // ---------- mount ----------
  W.ifxBudget = {
    enter: function () { if (!root) mount(); if (!S.month) S.month = thisMonth(); load(); },
    reset: function () { S.ready = false; S.income = []; S.items = []; S.goals = []; if (root) root.innerHTML = ''; }
  };
  function mount() {
    var host = D.getElementById('page-budget');
    if (!host) { host = D.createElement('div'); host.className = 'page'; host.id = 'page-budget'; var et = D.getElementById('page-et'); et.parentNode.insertBefore(host, et.nextSibling); }
    root = D.createElement('div'); root.id = 'bp-root'; host.appendChild(root);
    root.addEventListener('click', function (e) {
      var el = e.target.closest('[data-act]'); if (el && ACT[el.getAttribute('data-act')]) return void ACT[el.getAttribute('data-act')](el);
    });
    root.addEventListener('input', function (e) { var k = e.target.getAttribute && e.target.getAttribute('data-split'); if (k) { S.split[k] = Math.max(0, Math.min(100, Number(e.target.value) || 0)); clearTimeout(mount._t); mount._t = setTimeout(function () { var pos = e.target.selectionStart; paint(); var again = root.querySelector('[data-split="' + k + '"]'); if (again) { again.focus(); try { again.setSelectionRange(pos, pos); } catch (x) {} } }, 400); } });
    var dr = D.getElementById('drawer'); if (dr && !dr.querySelector('[data-bp]')) { var b = D.createElement('button'); b.className = 'drawer-item'; b.setAttribute('data-bp', '1'); b.textContent = '💰 Budget & Salary'; b.onclick = function () { goModule('budget'); }; var plansBtn = Array.prototype.find.call(dr.querySelectorAll('.drawer-item'), function (x) { return /plans/i.test(x.getAttribute('onclick') || ''); }); if (plansBtn) plansBtn.after(b); else dr.appendChild(b); }
  }
  // make the page + drawer entry exist from the start; load data when the page is opened
  function boot() {
    if (!D.getElementById('page-et')) return; mount();
    var sp = W.switchPage; if (typeof sp === 'function' && !sp._bp) { var g = function (name) { var r = sp.apply(this, arguments); if (name === 'budget') W.ifxBudget.enter(); return r; }; g._bp = 1; W.switchPage = g; }
  }
  if (D.readyState === 'complete') boot(); else W.addEventListener('load', boot);
})();
