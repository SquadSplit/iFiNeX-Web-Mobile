/* ============================================================================
   iFiNeX shared tools (v8.3) — used by index.html and bill-tracker.html
   1) ifxSel   : tick-boxes on list rows + a floating "N selected · Total X" bar.
                 A row opts in with data-ifx-k (unique key) + data-ifx-amt (number); optional data-ifx-cur, data-ifx-label, data-ifx-date.
   2) ifxXfer  : one engine for every module: download a blank Excel template, export Excel, export PDF, import Excel/CSV
                 with validation + preview + duplicate skipping.  A module = a "dataset" registered with ifxXfer.register().
   Libraries (vendor/): SheetJS (xlsx), jsPDF, jspdf-autotable — bundled locally, so it also works offline in the app.
   ============================================================================ */
(function () {
  'use strict';
  var W = window, D = document;
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function toast(m) { try { if (W.toast) return W.toast(m); if (W.showToast) return W.showToast(m); } catch (e) {} console.log(m); }
  function fmt(n) { return (Math.round(n * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

  // ---------- shared styles ----------
  var st = D.createElement('style');
  st.textContent =
    '.ifx-host{position:relative;padding-left:38px !important;}' +
    '.ifx-cb{position:absolute;left:10px;top:50%;transform:translateY(-50%);width:20px;height:20px;accent-color:#4D96FF;cursor:pointer;margin:0;z-index:2;}' +
    '.ifx-host.ifx-on{outline:2px solid #4D96FF;outline-offset:-2px;background-image:linear-gradient(0deg,rgba(77,150,255,.12),rgba(77,150,255,.12));}' +
    '#ifx-selbar{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(88px + env(safe-area-inset-bottom,0px));z-index:9000;width:min(560px,calc(100% - 20px));display:none;gap:8px;align-items:center;flex-wrap:wrap;padding:10px 12px;border-radius:16px;background:linear-gradient(135deg,rgba(25,32,70,.97),rgba(45,25,80,.97));border:1px solid rgba(120,160,255,.5);box-shadow:0 10px 30px rgba(0,0,0,.45);color:#fff;font-size:.8rem;}' +
    '#ifx-selbar b.t{font-size:1rem;color:#FFD93D;}#ifx-selbar button{border:0;border-radius:9px;padding:7px 10px;font-weight:800;font-size:.7rem;cursor:pointer;background:rgba(255,255,255,.14);color:#fff;}' +
    '#ifx-selbar button.p{background:linear-gradient(135deg,#4D96FF,#B06AFF);}' +
    '.ifx-xbtn{display:inline-flex;gap:6px;align-items:center;border:1px solid var(--border,rgba(255,255,255,.2));background:var(--card2,rgba(255,255,255,.08));color:inherit;border-radius:12px;padding:8px 12px;font-weight:800;font-size:.74rem;cursor:pointer;}' +
    '#ifx-xfer{position:fixed;inset:0;z-index:9500;background:rgba(0,0,0,.6);display:none;align-items:flex-end;justify-content:center;}#ifx-xfer.open{display:flex;}' +
    '#ifx-xfer .box{width:min(640px,100%);max-height:92vh;overflow:auto;background:var(--card,#151528);color:var(--text,#e8ecff);border:1px solid var(--border,rgba(255,255,255,.15));border-radius:20px 20px 0 0;padding:16px 16px calc(18px + env(safe-area-inset-bottom,0px));}' +
    '@media(min-width:700px){#ifx-xfer{align-items:center}#ifx-xfer .box{border-radius:20px}}' +
    '#ifx-xfer h3{margin:0 0 4px;font-size:1.05rem;}#ifx-xfer .sub{font-size:.7rem;color:var(--muted,#9aa3c7);margin-bottom:10px;}' +
    '#ifx-xfer select,#ifx-xfer input[type=file]{width:100%;padding:10px;border-radius:10px;border:1px solid var(--border,rgba(255,255,255,.2));background:var(--card2,rgba(255,255,255,.06));color:inherit;font-size:.82rem;margin-bottom:8px;}' +
    '#ifx-xfer .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:8px 0 12px;}#ifx-xfer .grid button{padding:12px 6px;border-radius:12px;border:1px solid var(--border,rgba(255,255,255,.2));background:var(--card2,rgba(255,255,255,.07));color:inherit;font-weight:800;font-size:.72rem;cursor:pointer;}' +
    '#ifx-xfer .sec{font-size:.78rem;font-weight:800;margin:10px 0 4px;}#ifx-xfer table{width:100%;border-collapse:collapse;font-size:.68rem;}#ifx-xfer td,#ifx-xfer th{padding:4px 5px;border-bottom:1px solid var(--border,rgba(255,255,255,.12));text-align:left;white-space:nowrap;max-width:140px;overflow:hidden;text-overflow:ellipsis;}' +
    '#ifx-xfer .bad{color:#FF6B6B}#ifx-xfer .good{color:#6BCB77}#ifx-xfer .wrap{overflow-x:auto;}' +
    '#ifx-xfer .go{width:100%;padding:13px;border:0;border-radius:12px;font-weight:900;font-size:.9rem;color:#fff;background:linear-gradient(135deg,#4D96FF,#B06AFF);margin-top:10px;cursor:pointer;}#ifx-xfer .go[disabled]{opacity:.45}' +
    '#ifx-xfer .x{float:right;background:none;border:0;color:inherit;font-size:1.2rem;cursor:pointer;}';
  D.head.appendChild(st);

  // ---------- libraries ----------
  function loadScript(src) { return new Promise(function (ok, no) { var s = D.createElement('script'); s.src = src; s.onload = ok; s.onerror = function () { no(new Error('Could not load ' + src)); }; D.head.appendChild(s); }); }
  async function needXlsx() { if (!W.XLSX) await loadScript('vendor/xlsx.full.min.js'); if (!W.XLSX) throw new Error('Excel library missing'); }
  async function needPdf() {
    if (!W.jspdf) await loadScript('vendor/jspdf.umd.min.js');
    if (!(W.jspdf && W.jspdf.jsPDF.API.autoTable)) await loadScript('vendor/jspdf.plugin.autotable.min.js');
    if (!W.jspdf) throw new Error('PDF library missing');
  }
  async function saveBlob(blob, name) {
    var C = W.Capacitor;
    if (C && C.isNativePlatform && C.isNativePlatform() && C.Plugins && C.Plugins.Filesystem && C.Plugins.Share) {
      var b64 = await new Promise(function (r) { var f = new FileReader(); f.onload = function () { r(String(f.result).split(',')[1]); }; f.readAsDataURL(blob); });
      var w = await C.Plugins.Filesystem.writeFile({ path: name, data: b64, directory: 'CACHE' });
      await C.Plugins.Share.share({ title: name, url: w.uri }); return;
    }
    var a = D.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; D.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }
  function safeName(s) { return String(s || 'ifinex').replace(/[^\w\-]+/g, '_').replace(/^_+|_+$/g, '') || 'ifinex'; }
  function stamp() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

  // ---------- generic table -> Excel / PDF ----------
  async function tableXlsx(sheets, filename) {
    await needXlsx();
    var wb = XLSX.utils.book_new();
    sheets.forEach(function (s) {
      var ws = XLSX.utils.aoa_to_sheet(s.rows);
      ws['!cols'] = (s.widths || (s.rows[0] || []).map(function (h) { return Math.min(40, Math.max(10, String(h == null ? '' : h).length + 4)); })).map(function (w) { return { wch: w }; });
      XLSX.utils.book_append_sheet(wb, ws, String(s.name).slice(0, 31));
    });
    await saveBlob(new Blob([XLSX.write(wb, { bookType: 'xlsx', type: 'array' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename + '.xlsx');
  }
  async function tablePdf(o, filename) {
    await needPdf();
    var wide = o.columns.length > 6, doc = new W.jspdf.jsPDF({ orientation: wide ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
    doc.setFontSize(16); doc.text(String(o.title || 'iFiNeX'), 14, 15);
    doc.setFontSize(9); doc.setTextColor(110); doc.text(String(o.subtitle || '') + (o.subtitle ? '   |   ' : '') + 'Generated ' + new Date().toLocaleString(), 14, 21); doc.setTextColor(0);
    var body = o.rows.map(function (r) { return r.map(function (c) { return c == null ? '' : String(c); }); });
    if (o.totalRow) body.push(o.totalRow.map(function (c) { return c == null ? '' : String(c); }));
    doc.autoTable({
      startY: 26, head: [o.columns], body: body, styles: { fontSize: 8, cellPadding: 1.6 }, headStyles: { fillColor: [77, 150, 255] }, alternateRowStyles: { fillColor: [244, 247, 255] },
      didParseCell: function (d) { if (o.totalRow && d.section === 'body' && d.row.index === body.length - 1) { d.cell.styles.fontStyle = 'bold'; d.cell.styles.fillColor = [255, 244, 200]; } }
    });
    var n = doc.internal.getNumberOfPages(); for (var i = 1; i <= n; i++) { doc.setPage(i); doc.setFontSize(8); doc.setTextColor(140); doc.text('iFiNeX · page ' + i + '/' + n, 14, doc.internal.pageSize.getHeight() - 7); }
    await saveBlob(doc.output('blob'), filename + '.pdf');
  }

  // ======================================================================== 1) SELECTION
  var sel = new Set(), bar = null, lastScope = null, scheduled = false, lastHtml = '';
  function hosts() { return Array.prototype.filter.call(D.querySelectorAll('[data-ifx-k]'), function (e) { return e.offsetParent !== null; }); }
  function decorate() {
    D.querySelectorAll('[data-ifx-k]:not([data-ifx-d])').forEach(function (el) {
      el.setAttribute('data-ifx-d', '1'); el.classList.add('ifx-host');
      var cb = D.createElement('input'); cb.type = 'checkbox'; cb.className = 'ifx-cb'; cb.setAttribute('aria-label', 'Select');
      var k = el.getAttribute('data-ifx-k'); cb.checked = sel.has(k); if (cb.checked) el.classList.add('ifx-on');
      cb.addEventListener('click', function (e) { e.stopPropagation(); });
      cb.addEventListener('change', function () { if (cb.checked) sel.add(k); else sel.delete(k); el.classList.toggle('ifx-on', cb.checked); lastScope = el.closest('.page,.modal-box,.box') || D.body; recount(); });
      el.insertBefore(cb, el.firstChild);
    });
  }
  function ensureBar() {
    if (bar) return bar; bar = D.createElement('div'); bar.id = 'ifx-selbar'; D.body.appendChild(bar);
    bar.addEventListener('click', function (e) {
      var a = e.target && e.target.getAttribute && e.target.getAttribute('data-a'); if (!a) return;
      if (a === 'clear') clearSel();
      if (a === 'all') { var sc = lastScope || D.body; sc.querySelectorAll('[data-ifx-k]').forEach(function (el) { if (el.offsetParent === null) return; sel.add(el.getAttribute('data-ifx-k')); var c = el.querySelector('.ifx-cb'); if (c) { c.checked = true; el.classList.add('ifx-on'); } }); recount(); }
      if (a === 'xl' || a === 'pdf') exportSelected(a);
    });
    return bar;
  }
  function picked() { return hosts().filter(function (el) { return sel.has(el.getAttribute('data-ifx-k')); }); }
  function recount() {
    var els = picked(), b = ensureBar();
    if (!els.length) { if (b.style.display !== 'none') b.style.display = 'none'; lastHtml = ''; return; }
    var by = {}, n = els.length;
    els.forEach(function (el) { var c = el.getAttribute('data-ifx-cur') || 'AED'; by[c] = (by[c] || 0) + (parseFloat(el.getAttribute('data-ifx-amt')) || 0); });
    var tot = Object.keys(by).map(function (c) { return c + ' ' + fmt(by[c]); }).join(' + ');
    var html = '<span><b>' + n + '</b> selected</span><span>Total <b class="t">' + esc(tot) + '</b></span><span style="flex:1"></span>' +
      '<button data-a="all">Select all</button><button data-a="xl" class="p">Excel</button><button data-a="pdf" class="p">PDF</button><button data-a="clear">✕ Clear</button>';
    if (html !== lastHtml) { b.innerHTML = html; lastHtml = html; }
    b.style.display = 'flex';
  }
  function clearSel() { sel.clear(); D.querySelectorAll('.ifx-cb').forEach(function (c) { c.checked = false; }); D.querySelectorAll('.ifx-on').forEach(function (e) { e.classList.remove('ifx-on'); }); recount(); }
  async function exportSelected(kind) {
    var els = picked(); if (!els.length) return;
    var rows = els.map(function (el) { return [el.getAttribute('data-ifx-date') || '', el.getAttribute('data-ifx-label') || '', parseFloat(el.getAttribute('data-ifx-amt')) || 0, el.getAttribute('data-ifx-cur') || 'AED']; });
    var by = {}; rows.forEach(function (r) { by[r[3]] = (by[r[3]] || 0) + r[2]; });
    try {
      if (kind === 'xl') await tableXlsx([{ name: 'Selected', rows: [['Date', 'Item', 'Amount', 'Currency']].concat(rows, Object.keys(by).map(function (c) { return ['', 'TOTAL', Math.round(by[c] * 100) / 100, c]; })) }], 'iFiNeX_selected_' + stamp());
      else await tablePdf({ title: 'Selected items', subtitle: rows.length + ' items', columns: ['Date', 'Item', 'Amount', 'Currency'], rows: rows.map(function (r) { return [r[0], r[1], fmt(r[2]), r[3]]; }), totalRow: ['', 'TOTAL', Object.keys(by).map(function (c) { return c + ' ' + fmt(by[c]); }).join(' + '), ''] }, 'iFiNeX_selected_' + stamp());
      toast('Export ready ✓');
    } catch (e) { toast('❌ ' + (e.message || e)); }
  }
  function schedule() { if (scheduled) return; scheduled = true; requestAnimationFrame(function () { scheduled = false; decorate(); recount(); }); }
  W.ifxSel = { clear: clearSel, count: function () { return picked().length; }, refresh: schedule };
  var mo = new MutationObserver(schedule); function startObs() { mo.observe(D.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] }); schedule(); }
  if (D.body) startObs(); else D.addEventListener('DOMContentLoaded', startObs);
  // switching page / tab forgets the selection (it belongs to the list that was on screen)
  function hookClear(name) { var f = W[name]; if (typeof f === 'function' && !f._ifx) { var g = function () { clearSel(); return f.apply(this, arguments); }; g._ifx = 1; W[name] = g; } }
  D.addEventListener('DOMContentLoaded', function () { ['switchPage', 'switchHomeTab', 'switchOweSubTab', 'changeMonth'].forEach(hookClear); });
  W.addEventListener('load', function () { ['switchPage', 'switchHomeTab', 'switchOweSubTab', 'changeMonth'].forEach(hookClear); });

  // ======================================================================== 2) IMPORT / EXPORT
  var DS = {}, order = [], cur = null, parsed = null;
  function register(ds) { DS[ds.id] = ds; if (order.indexOf(ds.id) < 0) order.push(ds.id); }
  function unregisterAll() { DS = {}; order = []; }

  // ----- cell coercion -----
  function pad(n) { return String(n).padStart(2, '0'); }
  function isoDate(y, m, d) { var dt = new Date(y, m - 1, d); if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null; return y + '-' + pad(m) + '-' + pad(d); }
  function toDate(v) {
    if (v === '' || v == null) return '';
    if (v instanceof Date) return isNaN(v) ? null : isoDate(v.getFullYear(), v.getMonth() + 1, v.getDate());
    if (typeof v === 'number') { if (v > 20000 && v < 80000 && W.XLSX && XLSX.SSF) { var p = XLSX.SSF.parse_date_code(v); return p ? isoDate(p.y, p.m, p.d) : null; } return null; }
    var s = String(v).trim(), m;
    if ((m = s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/))) return isoDate(+m[1], +m[2], +m[3]);
    if ((m = s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})$/))) return isoDate(+m[3], +m[2], +m[1]);     // DD/MM/YYYY (UAE/UK order)
    var t = Date.parse(s); if (!isNaN(t)) { var d = new Date(t); return isoDate(d.getFullYear(), d.getMonth() + 1, d.getDate()); }
    return null;
  }
  function toNum(v) { if (typeof v === 'number') return v; var s = String(v == null ? '' : v).replace(/[,\s]/g, '').replace(/^[A-Za-z]{3}/, '').replace(/[A-Za-z]+$/, ''); if (s === '') return ''; var n = Number(s); return isFinite(n) ? n : null; }
  function coerce(col, raw) {
    var t = col.type || 'text', v = raw, empty = (v === '' || v == null || (typeof v === 'string' && v.trim() === ''));
    if (empty) { if (col.req) return { err: col.label + ' is required' }; return { val: col.def !== undefined ? col.def : (t === 'num' || t === 'int' ? null : '') }; }
    if (t === 'date') { var d = toDate(v); return d ? { val: d } : { err: col.label + ': not a valid date (use YYYY-MM-DD)' }; }
    if (t === 'month') { var dd = toDate(v), s = String(v).trim(); if (/^\d{4}-(0[1-9]|1[0-2])$/.test(s)) return { val: s }; return dd ? { val: dd.slice(0, 7) } : { err: col.label + ': use YYYY-MM' }; }
    if (t === 'num' || t === 'int') {
      var n = toNum(v); if (n === null || n === '') return { err: col.label + ': not a number' };
      if (t === 'int' && Math.round(n) !== n) return { err: col.label + ': must be a whole number' };
      var mn = col.min !== undefined ? col.min : (col.zero ? 0 : 0.01); if (n < mn) return { err: col.label + ': must be ' + (col.zero ? '≥ ' : '≥ ') + mn };
      if (col.max !== undefined && n > col.max) return { err: col.label + ': must be ≤ ' + col.max };
      return { val: t === 'num' ? Math.round(n * 100) / 100 : n };
    }
    if (t === 'enum') { var key = String(v).trim().toLowerCase(), hit = (col.enum || []).find(function (e) { return String(e.v !== undefined ? e.v : e).toLowerCase() === key || String(e.l || e).toLowerCase() === key; }); return hit !== undefined ? { val: hit.v !== undefined ? hit.v : hit } : { err: col.label + ': "' + String(v).slice(0, 30) + '" is not one of ' + (col.enum || []).map(function (e) { return e.v !== undefined ? e.v : e; }).join(' / ') }; }
    if (t === 'bool') { var b = String(v).trim().toLowerCase(); if (/^(y|yes|true|1|on)$/.test(b)) return { val: true }; if (/^(n|no|false|0|off)$/.test(b)) return { val: false }; return { err: col.label + ': Yes or No' }; }
    if (t === 'email') { var em = String(v).trim().toLowerCase(); return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em) ? { val: em } : { err: col.label + ': not an e-mail' }; }
    if (t === 'list') return { val: String(v).split(/[;,]/).map(function (x) { return x.trim(); }).filter(Boolean) };
    var tx = String(v).trim(); if (col.maxLen && tx.length > col.maxLen) return { err: col.label + ': longer than ' + col.maxLen + ' characters' };
    if (/[<>]/.test(tx) && !col.allowHtml) tx = tx.replace(/[<>]/g, '');   // never import markup
    return { val: tx };
  }
  function norm(s) { return String(s == null ? '' : s).toLowerCase().replace(/\*/g, '').replace(/\(.*?\)/g, '').replace(/[^a-z0-9]/g, ''); }

  // ----- template / export / import -----
  async function downloadTemplate(ds) {
    var TC = ds.cols.filter(function (c) { return !c.exportOnly; });
    var head = TC.map(function (c) { return c.label + (c.req ? ' *' : ''); });
    var ex = TC.map(function (c) { return c.ex !== undefined ? c.ex : ''; });
    var ins = [['How to fill this template — ' + ds.title], [''], ['1. Fill the "Data" sheet only. Keep row 1 (the column names). One record per row.'], ['2. Columns marked * are required.'], ['3. Dates: YYYY-MM-DD (example 2026-10-07). DD/MM/YYYY also works.'], ['4. Amounts: plain numbers (125.50). No text.'], ['5. See the "Example" sheet for a filled row and "Lists" for allowed values.'], ['6. Save, then in iFiNeX tap Import and choose this file.'], ['']].concat(TC.map(function (c) { return [c.label + (c.req ? ' *' : ''), (c.type || 'text') + (c.note ? ' — ' + c.note : '')]; }));
    var lists = []; TC.forEach(function (c) { if (c.type === 'enum') lists.push([c.label].concat((c.enum || []).map(function (e) { return e.v !== undefined ? e.v : e; }))); });
    if (ds.lists) { var L = await ds.lists(); Object.keys(L || {}).forEach(function (k) { lists.push([k].concat(L[k])); }); }
    var sheets = [{ name: 'Data', rows: [head] }, { name: 'Example', rows: [head, ex] }, { name: 'Instructions', rows: ins, widths: [34, 70] }];
    if (lists.length) sheets.push({ name: 'Lists', rows: lists });
    await tableXlsx(sheets, 'iFiNeX_' + safeName(ds.file || ds.id) + '_TEMPLATE'); toast('Template ready ✓');
  }
  async function getRows(ds) { return (await ds.rows()) || []; }
  function cell(c, v) { if (v == null) return ''; if (c.type === 'bool') return v ? 'Yes' : 'No'; if (c.type === 'list' && Array.isArray(v)) return v.join('; '); return v; }
  async function exportXlsx(ds) {
    var rows = await getRows(ds); if (!rows.length) { toast('Nothing to export yet'); return; }
    var data = [ds.cols.map(function (c) { return c.label; })].concat(rows.map(function (r) { return ds.cols.map(function (c) { return cell(c, r[c.k]); }); }));
    var ak = ds.amountKey; if (ak) { var i = ds.cols.findIndex(function (c) { return c.k === ak; }); var tot = rows.reduce(function (a, r) { return a + (Number(r[ak]) || 0); }, 0); var tr = ds.cols.map(function () { return ''; }); tr[0] = 'TOTAL'; tr[i] = Math.round(tot * 100) / 100; data.push(tr); }
    await tableXlsx([{ name: 'Data', rows: data }], 'iFiNeX_' + safeName(ds.file || ds.id) + '_' + stamp()); toast('Excel ready ✓');
  }
  async function exportPdfDs(ds) {
    var rows = await getRows(ds); if (!rows.length) { toast('Nothing to export yet'); return; }
    var ak = ds.amountKey, tot = ak ? rows.reduce(function (a, r) { return a + (Number(r[ak]) || 0); }, 0) : null, i = ak ? ds.cols.findIndex(function (c) { return c.k === ak; }) : -1;
    var totalRow = null; if (ak) { totalRow = ds.cols.map(function () { return ''; }); totalRow[0] = 'TOTAL'; totalRow[i] = fmt(tot); }
    await tablePdf({ title: ds.title, subtitle: rows.length + ' records' + (ds.subtitle ? ' · ' + ds.subtitle() : ''), columns: ds.cols.map(function (c) { return c.label; }), rows: rows.map(function (r) { return ds.cols.map(function (c) { var v = cell(c, r[c.k]); return (c.type === 'num' && v !== '') ? fmt(Number(v)) : v; }); }), totalRow: totalRow }, 'iFiNeX_' + safeName(ds.file || ds.id) + '_' + stamp()); toast('PDF ready ✓');
  }
  async function parseFile(ds, file) {
    await needXlsx();
    var buf = await file.arrayBuffer(), wb = XLSX.read(buf, { type: 'array', cellDates: true });
    var name = wb.SheetNames.find(function (n) { return /^data$/i.test(n); }) || wb.SheetNames.find(function (n) { return !/^(example|instructions|lists)$/i.test(n); }) || wb.SheetNames[0];
    var aoa = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: '' });
    var hi = aoa.findIndex(function (r) { return r.some(function (x) { return String(x).trim() !== ''; }); }); if (hi < 0) throw new Error('The file is empty');
    var hdr = aoa[hi].map(norm), map = {};
    var IC = ds.cols.filter(function (c) { return !c.exportOnly; });
    IC.forEach(function (c) { var names = [c.label, c.k].concat(c.alias || []).map(norm), ix = hdr.findIndex(function (h) { return names.indexOf(h) >= 0; }); map[c.k] = ix; });
    var missing = IC.filter(function (c) { return c.req && map[c.k] < 0; }).map(function (c) { return c.label; });
    if (missing.length) throw new Error('Missing column(s): ' + missing.join(', ') + '. Download the template and use its column names.');
    var out = [];
    for (var r = hi + 1; r < aoa.length; r++) {
      var row = aoa[r]; if (!row.some(function (x) { return String(x).trim() !== ''; })) continue;
      if (/^total$/i.test(String(row[0]).trim())) continue;
      var obj = {}, errs = [];
      IC.forEach(function (c) { var res = coerce(c, map[c.k] >= 0 ? row[map[c.k]] : ''); if (res.err) errs.push(res.err); else obj[c.k] = res.val; });
      out.push({ line: r + 1, obj: obj, errs: errs });
    }
    if (!out.length) throw new Error('No data rows found under the header');
    if (out.length > 2000) throw new Error('Too many rows (' + out.length + '). Import up to 2000 rows at a time.');
    if (ds.check) { for (var i = 0; i < out.length; i++) if (!out[i].errs.length) { var e = ds.check(out[i].obj); if (e) out[i].errs.push(e); } }
    if (ds.dupKey && ds.rows) { var ex = new Set((await getRows(ds)).map(ds.dupKey)); out.forEach(function (x) { if (!x.errs.length && ex.has(ds.dupKey(x.obj))) x.dup = true; }); var seen = new Set(); out.forEach(function (x) { if (x.errs.length) return; var k = ds.dupKey(x.obj); if (seen.has(k)) x.dup = true; seen.add(k); }); }
    return out;
  }

  // ----- modal -----
  function modal() {
    var m = D.getElementById('ifx-xfer'); if (m) return m;
    m = D.createElement('div'); m.id = 'ifx-xfer'; m.innerHTML = '<div class="box" id="ifx-xbox"></div>'; D.body.appendChild(m);
    m.addEventListener('click', function (e) { if (e.target === m) close(); });
    return m;
  }
  function close() { modal().classList.remove('open'); parsed = null; }
  function render() {
    var ds = DS[cur], box = D.getElementById('ifx-xbox'); if (!ds) return;
    var can = ds.canImport ? ds.canImport() : { ok: true };
    var sel = '<select id="ifx-ds">' + order.map(function (id) { return '<option value="' + esc(id) + '"' + (id === cur ? ' selected' : '') + '>' + esc((DS[id].icon || '') + ' ' + DS[id].title) + '</option>'; }).join('') + '</select>';
    var h = '<button class="x" onclick="ifxXfer.close()" aria-label="Close">✕</button><h3>⇅ Import / Export</h3><div class="sub">Excel &amp; PDF for every module. Pick the data set:</div>' + sel +
      '<div class="grid"><button id="ifx-b-tpl">📥<br>Blank template<br>(Excel)</button><button id="ifx-b-xl">📊<br>Export<br>Excel</button><button id="ifx-b-pdf">📄<br>Export<br>PDF</button></div>' +
      '<div class="sec">⬆️ Import from Excel / CSV</div>';
    if (!can.ok) h += '<div class="sub bad">' + esc(can.why || 'Import is not available for this data set.') + '</div>';
    else h += '<div class="sub">Use the blank template (or any Excel with the same column names). You will see a preview before anything is saved.</div><input type="file" id="ifx-file" accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"><div id="ifx-prev"></div>';
    box.innerHTML = h;
    box.querySelector('#ifx-ds').onchange = function () { cur = this.value; parsed = null; render(); };
    box.querySelector('#ifx-b-tpl').onclick = guard(function () { return downloadTemplate(ds); });
    box.querySelector('#ifx-b-xl').onclick = guard(function () { return exportXlsx(ds); });
    box.querySelector('#ifx-b-pdf').onclick = guard(function () { return exportPdfDs(ds); });
    var f = box.querySelector('#ifx-file'); if (f) f.onchange = async function () { if (!f.files[0]) return; var pv = box.querySelector('#ifx-prev'); pv.innerHTML = '<div class="sub">Reading…</div>'; try { parsed = await parseFile(ds, f.files[0]); preview(ds); } catch (e) { parsed = null; pv.innerHTML = '<div class="sub bad">❌ ' + esc(e.message || e) + '</div>'; } };
  }
  function guard(fn) { return async function () { try { await fn(); } catch (e) { toast('❌ ' + (e.message || e)); console.error(e); } }; }
  function preview(ds) {
    var pv = D.getElementById('ifx-prev'), ok = parsed.filter(function (x) { return !x.errs.length && !x.dup; }), bad = parsed.filter(function (x) { return x.errs.length; }), dup = parsed.filter(function (x) { return !x.errs.length && x.dup; });
    var cols = ds.cols.slice(0, 5), h = '<div class="sub"><span class="good">✅ ' + ok.length + ' ready</span> · <span class="bad">❌ ' + bad.length + ' with errors</span> · ⏭️ ' + dup.length + ' already exist (skipped)</div><div class="wrap"><table><tr><th>#</th>' + cols.map(function (c) { return '<th>' + esc(c.label) + '</th>'; }).join('') + '<th>Status</th></tr>';
    parsed.slice(0, 12).forEach(function (x) { h += '<tr><td>' + x.line + '</td>' + cols.map(function (c) { var v = x.obj[c.k]; return '<td>' + esc(Array.isArray(v) ? v.join('; ') : v == null ? '' : v) + '</td>'; }).join('') + '<td class="' + (x.errs.length ? 'bad' : 'good') + '">' + (x.errs.length ? '❌' : x.dup ? '⏭️' : '✅') + '</td></tr>'; });
    h += '</table></div>' + (parsed.length > 12 ? '<div class="sub">…and ' + (parsed.length - 12) + ' more rows</div>' : '');
    if (bad.length) h += '<div class="sub bad" style="margin-top:6px;">' + bad.slice(0, 8).map(function (x) { return 'Row ' + x.line + ': ' + esc(x.errs.join('; ')); }).join('<br>') + (bad.length > 8 ? '<br>…' : '') + '<br>Rows with errors are NOT imported. Fix them in Excel and import again, or continue with the ready rows.</div>';
    h += '<button class="go" id="ifx-go"' + (ok.length ? '' : ' disabled') + '>Import ' + ok.length + ' row' + (ok.length === 1 ? '' : 's') + '</button>';
    pv.innerHTML = h;
    var go = D.getElementById('ifx-go'); if (go) go.onclick = async function () {
      go.disabled = true; go.textContent = 'Importing…';
      try { var res = await ds.insert(ok.map(function (x) { return x.obj; })); if (res && res.error) throw new Error(res.error.message || res.error); toast('✅ Imported ' + ok.length + ' rows'); if (ds.after) await ds.after(); close(); }
      catch (e) { go.disabled = false; go.textContent = 'Import ' + ok.length + ' rows'; pv.insertAdjacentHTML('beforeend', '<div class="sub bad">❌ ' + esc(e.message || e) + '</div>'); }
    };
  }
  function open(id) { if (!order.length) return toast('Nothing to import/export on this screen'); cur = DS[id] ? id : order[0]; parsed = null; modal().classList.add('open'); render(); }
  // a small button any screen can drop in:  ifxXfer.button('bills')  -> HTML string
  function button(id, label) { return '<button class="ifx-xbtn" onclick="ifxXfer.open(\'' + esc(id) + '\')">⇅ ' + esc(label || 'Import / Export') + '</button>'; }

  W.ifxXfer = { register: register, reset: unregisterAll, open: open, close: close, button: button, tableXlsx: tableXlsx, tablePdf: tablePdf, saveBlob: saveBlob, coerce: coerce, fmt: fmt, esc: esc, stamp: stamp, chunk: async function (arr, n, fn) { for (var i = 0; i < arr.length; i += n) { var r = await fn(arr.slice(i, i + n)); if (r && r.error) return r; } return {}; } };
})();
