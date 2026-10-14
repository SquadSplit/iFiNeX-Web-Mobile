/* iFiNeX Standalone — on-device data engine.
   A drop-in replacement for the parts of supabase-js that the app uses. Everything is stored on THIS device
   (IndexedDB, with localStorage as a fallback). No internet, no account, no login.
   Public extras:  window.IFX_LOCAL.exportAll() / importAll(obj) / wipe() / counts() / meta */
(function () {
  'use strict';
  var W = window;
  if (!(W.IFX_CFG && W.IFX_CFG.mode === 'standalone')) return;   // v8.7: ships in every build, wakes up ONLY when the user chose Standalone
  var DB_NAME = 'ifinex-standalone', STORE = 'kv', KEY = 'db', LSKEY = 'ifx_sa_db';
  var FORMAT = 'ifinex-standalone-backup', VERSION = 1;
  var LOCAL_EMAIL = 'me@this-device.local';
  var state = null, ready = null, saving = Promise.resolve();

  // ── persistence ─────────────────────────────────────────────────────────────
  function idb() {
    return new Promise(function (res, rej) {
      if (!W.indexedDB) return rej(new Error('no idb'));
      var r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = function () { r.result.createObjectStore(STORE); };
      r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); };
    });
  }
  async function readStore() {
    try {
      var d = await idb();
      var v = await new Promise(function (res, rej) { var q = d.transaction(STORE).objectStore(STORE).get(KEY); q.onsuccess = function () { res(q.result); }; q.onerror = function () { rej(q.error); }; });
      if (v) return v;
    } catch (e) {}
    try { var s = localStorage.getItem(LSKEY); if (s) return JSON.parse(s); } catch (e) {}
    return null;
  }
  function writeStore() {
    var snap = JSON.stringify(state);
    saving = saving.then(async function () {
      try {
        var d = await idb();
        await new Promise(function (res, rej) { var t = d.transaction(STORE, 'readwrite'); t.objectStore(STORE).put(JSON.parse(snap), KEY); t.oncomplete = res; t.onerror = function () { rej(t.error); }; });
        try { localStorage.removeItem(LSKEY); } catch (e) {}
      } catch (e) { try { localStorage.setItem(LSKEY, snap); } catch (x) { console.error('ifx local save failed', x); } }
    });
    return saving;
  }
  function fresh() {
    var now = new Date().toISOString();
    return {
      format: FORMAT, version: VERSION, created: now, seq: 1000, tables: {
        app_users: [{ id: 1, email: LOCAL_EMAIL, name: 'Me', emoji: '😀', color: '#4d96ff', group_type: 'squad_split', is_admin: true, delegate_email: null, created_at: now }],
        members_config: [{ id: 'me', name: 'Me', email: LOCAL_EMAIL, emoji: '😀', color: '#4d96ff', is_admin: true, sort_order: 0 }]
      }
    };
  }
  function init() {
    if (!ready) ready = (async function () {
      var s = await readStore();
      state = (s && s.tables) ? s : fresh();
      if (!state.tables.app_users || !state.tables.app_users.length) state.tables.app_users = fresh().tables.app_users;
      if (!state.tables.members_config || !state.tables.members_config.length) state.tables.members_config = fresh().tables.members_config;
      if (!s) await writeStore();
    })();
    return ready;
  }

  // ── table rules (emulating the cloud schema) ─────────────────────────────────
  var UNIQUE = { bill_card_shares: ['card_id', 'shared_with_email'], bill_card_payments: ['card_id', 'month'], bill_user_prefs: ['user_email'], et_kinds: ['user_email', 'key'] };
  var CASCADE = {            // when a row of <table> is deleted: [childTable, fk, 'delete'|'null']
    bill_cards: [['bill_card_shares', 'card_id', 'delete'], ['bill_card_payments', 'card_id', 'delete'], ['bill_expenses', 'card_id', 'null'], ['bill_plans', 'card_id', 'null'], ['bill_payee_entries', 'card_id', 'null']],
    bill_plans: [['bill_plan_payments', 'plan_id', 'delete']],
    bill_payees: [['bill_payee_entries', 'payee_id', 'delete'], ['bill_plans', 'payee_id', 'null']],
    et_trackers: [['et_entries', 'tracker_id', 'delete']]
  };
  function tbl(n) { return state.tables[n] || (state.tables[n] = []); }
  function nextId(table) { var rows = tbl(table), m = state.seq; rows.forEach(function (r) { if (typeof r.id === 'number' && r.id > m) m = r.id; }); state.seq = m + 1; return state.seq; }
  var low = function (v) { return String(v == null ? '' : v).toLowerCase(); };
  function monthOf(d) { return d ? String(d).slice(0, 7) : d; }
  function prepare(table, row, isNew) {
    var now = new Date().toISOString(), r = Object.assign({}, row);
    if (isNew) {
      if (r.id === undefined || r.id === null) { if (table !== 'members_config') r.id = nextId(table); }
      if (!r.created_at && table !== 'members_config') r.created_at = now;
    }
    if (/^(bill_expenses|bill_payee_entries)$/.test(table) && r.date && !r.month) r.month = monthOf(r.date);
    if (table === 'expenses' && r.date && !r.month) r.month = monthOf(r.date);
    if (table === 'bill_expenses' && !r.category) r.category = 'other';
    if (table === 'bill_payee_entries' && !r.payment_method) r.payment_method = 'cash';
    if (table === 'bill_cards' && r.reminder_enabled === undefined) r.reminder_enabled = true;
    if (table === 'bill_notifications') { if (r.is_read === undefined) r.is_read = false; if (r.read === undefined) r.read = false; }
    return r;
  }
  function dupErr(table) { return { code: '23505', message: 'duplicate key value violates unique constraint on ' + table, details: '', hint: null }; }
  function findDup(table, row, skipRow) {
    var u = UNIQUE[table]; if (!u) return null;
    return tbl(table).find(function (r) { return r !== skipRow && u.every(function (k) { return low(r[k]) === low(row[k]); }); }) || null;
  }
  function cascadeDelete(table, row) {
    (CASCADE[table] || []).forEach(function (c) {
      var child = c[0], fk = c[1], mode = c[2];
      if (mode === 'delete') {
        var kill = tbl(child).filter(function (r) { return r[fk] === row.id; });
        kill.forEach(function (k) { cascadeDelete(child, k); });
        state.tables[child] = tbl(child).filter(function (r) { return r[fk] !== row.id; });
      } else tbl(child).forEach(function (r) { if (r[fk] === row.id) r[fk] = null; });
    });
  }

  // ── filters ──────────────────────────────────────────────────────────────────
  function likeRe(p) {
    var out = '', s = String(p == null ? '' : p);
    for (var i = 0; i < s.length; i++) {
      var ch = s[i];
      if (ch === '\\' && i + 1 < s.length) { out += s[++i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
      else if (ch === '%') out += '.*'; else if (ch === '_') out += '.';
      else out += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    return new RegExp('^' + out + '$', 'i');
  }
  function cmp(a, b) { var na = Number(a), nb = Number(b); if (a !== '' && b !== '' && !isNaN(na) && !isNaN(nb) && typeof a !== 'object') return na < nb ? -1 : na > nb ? 1 : 0; a = String(a); b = String(b); return a < b ? -1 : a > b ? 1 : 0; }
  var OPS = {
    eq: function (v, x) { return v !== null && v !== undefined && String(v) === String(x); },
    neq: function (v, x) { return String(v) !== String(x); },
    gt: function (v, x) { return v != null && cmp(v, x) > 0; }, gte: function (v, x) { return v != null && cmp(v, x) >= 0; },
    lt: function (v, x) { return v != null && cmp(v, x) < 0; }, lte: function (v, x) { return v != null && cmp(v, x) <= 0; },
    in: function (v, x) { return (x || []).some(function (y) { return String(y) === String(v); }); },
    ilike: function (v, x) { return v != null && likeRe(x).test(String(v)); },
    like: function (v, x) { return v != null && likeRe(x).test(String(v)); },
    is: function (v, x) { return x === null ? (v === null || v === undefined) : v === x; },
    contains: function (v, x) { return Array.isArray(v) && (x || []).every(function (y) { return v.some(function (z) { return String(z) === String(y); }); }); }
  };

  // ── query builder ────────────────────────────────────────────────────────────
  function Q(table) { this.t = table; this.op = 'select'; this.f = []; this.p = null; this.ord = []; this.lim = null; this.mode = 'many'; this.ret = false; this.conf = null; this.cnt = false; this.head = false; this.ign = false; }
  ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'ilike', 'like', 'is', 'contains'].forEach(function (o) { Q.prototype[o] = function (c, v) { this.f.push([o, c, v]); return this; }; });
  Q.prototype.not = function (c, o, v) { this.f.push(['not', c, [o, v]]); return this; };
  Q.prototype.match = function (obj) { var s = this; Object.keys(obj || {}).forEach(function (k) { s.f.push(['eq', k, obj[k]]); }); return this; };
  Q.prototype.filter = function (c, o, v) { this.f.push([o === 'in' ? 'in' : o, c, v]); return this; };
  Q.prototype.select = function (cols, o) { if (this.op === 'select') { this.cnt = !!(o && o.count); this.head = !!(o && o.head); } else this.ret = true; return this; };
  Q.prototype.insert = function (p, o) { this.op = 'insert'; this.p = p; this.ign = !!(o && o.ignoreDuplicates); return this; };
  Q.prototype.update = function (p) { this.op = 'update'; this.p = p; return this; };
  Q.prototype.delete = function () { this.op = 'delete'; return this; };
  Q.prototype.upsert = function (p, o) { this.op = 'upsert'; this.p = p; this.conf = o && o.onConflict ? String(o.onConflict).split(',').map(function (s) { return s.trim(); }) : null; this.ign = !!(o && o.ignoreDuplicates); return this; };
  Q.prototype.order = function (c, o) { this.ord.push([c, !(o && o.ascending === false)]); return this; };
  Q.prototype.limit = function (n) { this.lim = n; return this; };
  Q.prototype.range = function (a, b) { this.off = a; this.lim = b - a + 1; return this; };
  Q.prototype.single = function () { this.mode = 'single'; return this; };
  Q.prototype.maybeSingle = function () { this.mode = 'maybe'; return this; };
  Q.prototype.then = function (a, b) { return this.run().then(a, b); };
  Q.prototype.catch = function (b) { return this.run().catch(b); };
  Q.prototype.match_ = function (r) {
    return this.f.every(function (f) {
      var v = r[f[1]];
      if (f[0] === 'not') return !OPS[f[2][0]](v, f[2][1]);
      return OPS[f[0]] ? OPS[f[0]](v, f[2]) : true;
    });
  };
  Q.prototype.shape = function (rows) {
    if (this.mode === 'single') { if (rows.length !== 1) return { data: null, error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' } }; return { data: rows[0], error: null }; }
    if (this.mode === 'maybe') return { data: rows[0] || null, error: null };
    return { data: rows, error: null };
  };
  var clone = function (o) { return JSON.parse(JSON.stringify(o)); };
  Q.prototype.run = async function () {
    await init(); var self = this, t = this.t, rows = tbl(t), out;
    try {
      if (this.op === 'select') {
        out = rows.filter(function (r) { return self.match_(r); });
        var total = out.length;
        this.ord.slice().reverse().forEach(function (o) { out.sort(function (a, b) { var x = a[o[0]], y = b[o[0]]; if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1; return cmp(x, y) * (o[1] ? 1 : -1); }); });
        if (this.off) out = out.slice(this.off); if (this.lim != null) out = out.slice(0, this.lim);
        var res = this.head ? { data: null, error: null } : this.shape(clone(out));
        if (this.cnt) res.count = total; return res;
      }
      if (this.op === 'insert' || this.op === 'upsert') {
        var arr = Array.isArray(this.p) ? this.p : [this.p], made = [];
        for (var i = 0; i < arr.length; i++) {
          var row = prepare(t, arr[i], true), dup = findDup(t, row, null);
          if (!dup && this.conf) dup = rows.find(function (r) { return self.conf.every(function (k) { return low(r[k]) === low(row[k]); }); });
          if (dup) {
            if (this.op === 'upsert' && !this.ign) { Object.assign(dup, arr[i]); made.push(dup); continue; }
            if (this.ign) continue;
            return { data: null, error: dupErr(t) };
          }
          rows.push(row); made.push(row);
        }
        await writeStore();
        return this.ret ? this.shape(clone(made)) : { data: null, error: null };
      }
      if (this.op === 'update') {
        var hit = rows.filter(function (r) { return self.match_(r); });
        hit.forEach(function (r) { Object.assign(r, self.p); if (/^(bill_expenses|bill_payee_entries|expenses)$/.test(t) && self.p.date && !self.p.month) r.month = monthOf(self.p.date); });
        await writeStore();
        return this.ret ? this.shape(clone(hit)) : { data: null, error: null };
      }
      if (this.op === 'delete') {
        var gone = rows.filter(function (r) { return self.match_(r); });
        gone.forEach(function (r) { cascadeDelete(t, r); });
        state.tables[t] = tbl(t).filter(function (r) { return gone.indexOf(r) < 0; });
        await writeStore();
        return this.ret ? this.shape(clone(gone)) : { data: null, error: null };
      }
    } catch (e) { return { data: null, error: { message: String(e && e.message || e) } }; }
    return { data: null, error: { message: 'unsupported' } };
  };

  // ── RPC (server functions re-implemented locally) ────────────────────────────
  async function hist(src, owner, party, amount, type, note, created, reason) {
    tbl('bill_deleted_history').push({ id: nextId('bill_deleted_history'), source: src, owner_email: owner, party_email: party || null, amount: amount, entry_type: type || null, note: note || null, original_created_at: created || null, deleted_at: new Date().toISOString(), deleted_by_email: LOCAL_EMAIL, reason: reason });
  }
  function needReason(r) { return !r || !String(r).trim(); }
  var RPC = {
    ifx_bulk_import: function (a) {
      var kind = a.p_kind, owner = a.p_owner, rows = a.p_rows || [];
      var map = { bill_expenses: 'bill_expenses', bill_owed: 'bill_owed', bill_payee_entries: 'bill_payee_entries' };
      if (!map[kind]) return { error: { message: 'unsupported_kind' } };
      rows.forEach(function (x) { var r = prepare(kind, Object.assign({ user_email: owner }, x), true); if (kind === 'bill_payee_entries') r.created_by_email = LOCAL_EMAIL; tbl(kind).push(r); });
      return { data: { ok: true, inserted: rows.length } };
    },
    delete_owed_entry: function (a) { return delOne('bill_owed', a.p_id, a.p_reason, function (r) { hist('owed', r.user_email, null, r.amount, null, r.note, r.created_at, a.p_reason); }); },
    delete_settlement_entry: function (a) { return delOne('bill_settlements', a.p_id, a.p_reason, function (r) { hist('settlement', r.user_email, null, r.amount, null, r.month, r.created_at, a.p_reason); }); },
    delete_payee_entry: function (a) {
      return delOne('bill_payee_entries', a.p_entry_id, a.p_reason, function (r) {
        var p = tbl('bill_payees').find(function (x) { return x.id === r.payee_id; }) || {};
        hist('payee_entry', r.user_email, p.party_email, r.amount, r.entry_type, r.note, r.date, a.p_reason);
      });
    },
    delete_payee_with_reason: function (a) {
      var p = tbl('bill_payees').find(function (x) { return x.id === a.p_payee_id; });
      if (!p) return { data: { ok: false, error: 'not_found' } }; if (needReason(a.p_reason)) return { data: { ok: false, error: 'reason_required' } };
      var es = tbl('bill_payee_entries').filter(function (e) { return e.payee_id === p.id; });
      es.forEach(function (r) { hist('payee_entry', r.user_email, p.party_email, r.amount, r.entry_type, r.note, r.date, a.p_reason); });
      cascadeDelete('bill_payees', p); state.tables.bill_payees = tbl('bill_payees').filter(function (x) { return x !== p; });
      return { data: { ok: true, archived: es.length } };
    },
    register_device: function () { return { data: null }; }, unregister_device: function () { return { data: null }; }
  };
  function delOne(table, id, reason, archive) {
    var r = tbl(table).find(function (x) { return String(x.id) === String(id); });
    if (!r) return { data: { ok: false, error: 'not_found' } };
    if (needReason(reason)) return { data: { ok: false, error: 'reason_required' } };
    archive(r); state.tables[table] = tbl(table).filter(function (x) { return x !== r; });
    return { data: { ok: true } };
  }

  // ── client ───────────────────────────────────────────────────────────────────
  var session = function () { var exp = Math.floor(Date.now() / 1000) + 86400 * 365; return { access_token: 'local', refresh_token: 'local', token_type: 'bearer', expires_in: 31536000, expires_at: exp, user: { id: 'local-user', email: LOCAL_EMAIL, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} } }; };
  var auth = {
    getSession: async function () { await init(); return { data: { session: session() }, error: null }; },
    refreshSession: async function () { await init(); return { data: { session: session(), user: session().user }, error: null }; },
    getUser: async function () { return { data: { user: session().user }, error: null }; },
    signInWithOtp: async function () { return { data: {}, error: null }; },
    verifyOtp: async function () { return { data: { session: session(), user: session().user }, error: null }; },
    signOut: async function () { return { error: null }; },
    onAuthStateChange: function () { return { data: { subscription: { unsubscribe: function () {} } } }; }
  };
  var blobs = {};
  var storage = {
    from: function (bucket) {
      return {
        upload: async function (path, blob) {
          var url = await new Promise(function (res) { var f = new FileReader(); f.onload = function () { res(f.result); }; f.readAsDataURL(blob); });
          await init(); var k = bucket + '/' + path; (state.blobs = state.blobs || {})[k] = url; await writeStore(); blobs[k] = url; return { data: { path: path }, error: null };
        },
        getPublicUrl: function (path) { var k = bucket + '/' + path; return { data: { publicUrl: blobs[k] || (state && state.blobs && state.blobs[k]) || '' } }; },
        remove: async function (paths) { await init(); (paths || []).forEach(function (p) { if (state.blobs) delete state.blobs[bucket + '/' + p]; }); await writeStore(); return { data: [], error: null }; }
      };
    }
  };
  var client = {
    from: function (t) { return new Q(t); },
    rpc: async function (name, args) {
      await init(); var f = RPC[name]; if (!f) return { data: null, error: { message: 'function ' + name + ' is not available in the standalone app' } };
      var r = f(args || {}); await writeStore(); return r.error ? { data: null, error: r.error } : { data: r.data === undefined ? null : r.data, error: null };
    },
    auth: auth, storage: storage,
    channel: function () { var c = { on: function () { return c; }, subscribe: function () { return c; }, unsubscribe: function () {} }; return c; },
    removeChannel: function () {},
    functions: { invoke: async function () { return { data: null, error: { message: 'Email reports need the internet and the cloud edition.' } }; } }
  };
  W.supabase = { createClient: function () { return client; } };

  // ── backup / restore API ─────────────────────────────────────────────────────
  var NOTE = 'Everything the app stores on this device. Keep this file safe — it contains all your money records.';
  W.IFX_LOCAL = {
    email: LOCAL_EMAIL, ready: init,
    exportAll: async function () {
      await init();
      var out = { format: FORMAT, version: VERSION, app: 'iFiNeX', exported_at: new Date().toISOString(), note: NOTE, counts: {}, tables: clone(state.tables), blobs: clone(state.blobs || {}), settings: {} };
      Object.keys(out.tables).forEach(function (k) { out.counts[k] = out.tables[k].length; });
      try { Object.keys(localStorage).forEach(function (k) { if (/^ifx_(theme|bg|appearance)|^ifx_keep_/.test(k) && !/^ifx_(prof|sqcache)_/.test(k)) out.settings[k] = localStorage.getItem(k); }); } catch (e) {}
      return out;
    },
    validate: function (o) {
      if (!o || o.format !== FORMAT || !o.tables || typeof o.tables !== 'object') return 'This is not an iFiNeX standalone backup file.';
      if (o.version > VERSION) return 'This backup was made by a newer version of the app. Update the app first.';
      var bad = Object.keys(o.tables).find(function (k) { return !Array.isArray(o.tables[k]); });
      return bad ? 'Backup file is damaged (table "' + bad + '").' : null;
    },
    importAll: async function (o) {
      var err = this.validate(o); if (err) throw new Error(err);
      await init();
      var keepMe = state.tables.app_users;
      state = { format: FORMAT, version: VERSION, created: new Date().toISOString(), seq: 1000, tables: clone(o.tables), blobs: clone(o.blobs || {}) };
      if (!state.tables.app_users || !state.tables.app_users.length) state.tables.app_users = keepMe;
      // the local login is always this device's user — keep every record under it
      state.tables.app_users.forEach(function (u) { if (u.is_admin) u.email = LOCAL_EMAIL; });
      state.tables.members_config = (state.tables.members_config || []).map(function (m) { return m.is_admin ? Object.assign({}, m, { email: LOCAL_EMAIL }) : m; });
      Object.keys(state.tables).forEach(function (k) { state.tables[k].forEach(function (r) { if (typeof r.id === 'number' && r.id > state.seq) state.seq = r.id; }); });
      await writeStore();
      try { Object.keys(o.settings || {}).forEach(function (k) { localStorage.setItem(k, o.settings[k]); }); } catch (e) {}
      try { Object.keys(localStorage).forEach(function (k) { if (/^ifx_(prof|sqcache)_/.test(k)) localStorage.removeItem(k); }); } catch (e) {}
      var c = {}; Object.keys(state.tables).forEach(function (k) { c[k] = state.tables[k].length; }); return c;
    },
    wipe: async function () {
      await init(); var me = state.tables.app_users, mc = state.tables.members_config;
      state = fresh(); state.tables.app_users[0].name = (me && me[0] && me[0].name) || 'Me'; await writeStore();
      try { Object.keys(localStorage).forEach(function (k) { if (/^ifx_(prof|sqcache)_/.test(k)) localStorage.removeItem(k); }); localStorage.removeItem('sq_members_v2'); } catch (e) {}
    },
    counts: async function () { await init(); var c = {}; Object.keys(state.tables).forEach(function (k) { c[k] = state.tables[k].length; }); return c; },
    lastBackup: function () { try { return localStorage.getItem('ifx_sa_lastbackup') || ''; } catch (e) { return ''; } }
  };
  init();
})();
