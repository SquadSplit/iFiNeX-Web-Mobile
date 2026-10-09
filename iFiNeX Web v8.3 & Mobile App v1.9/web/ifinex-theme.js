/* ============================================================================
   iFiNeX background photo engine + editor (v8.3) — shared by index.html and bill-tracker.html
   Stored per person in bill_user_prefs: bg_url, bg_opacity (0.05-0.9), bg_zoom (40-400 = % of "cover"), bg_x, bg_y (0-100).
   ifxBg.apply({url,opacity,zoom,x,y})  -> paints #bg-photo-layer exactly as the editor preview shows it
   ifxBg.mountEditor(el, getState, setState, upload, remove)  -> sliders + drag-to-position + size advice
   ============================================================================ */
(function () {
  'use strict';
  var W = window, cache = {}, cur = null;
  var REC = { portrait: '1080 × 2340 px (9:19.5 — a modern phone)', landscape: '1920 × 1080 px (16:9 — desktop / tablet)', max: '1 MB (JPG or WebP; hard limit 5 MB)' };

  function dims(url) {
    if (cache[url]) return Promise.resolve(cache[url]);
    return new Promise(function (ok) {
      var im = new Image();
      im.onload = function () { cache[url] = { w: im.naturalWidth, h: im.naturalHeight }; ok(cache[url]); };
      im.onerror = function () { ok(null); };
      im.src = url;
    });
  }
  // size/position of the photo inside a box (bw x bh) for a given zoom (% of cover) — the single source of truth for page + preview
  function layout(iw, ih, bw, bh, zoom, x, y) {
    var s = Math.max(bw / iw, bh / ih) * (zoom / 100), w = iw * s, h = ih * s;
    return { w: w, h: h, px: x, py: y, bgSize: w.toFixed(1) + 'px ' + h.toFixed(1) + 'px', bgPos: x + '% ' + y + '%' };
  }
  function norm(p) {
    p = p || {};
    var n = function (v, d, lo, hi) { v = Number(v); if (!isFinite(v)) v = d; return Math.min(hi, Math.max(lo, v)); };
    return { url: p.url || null, opacity: n(p.opacity, 0.30, 0.05, 0.9), zoom: n(p.zoom, 100, 40, 400), x: n(p.x, 50, 0, 100), y: n(p.y, 50, 0, 100) };
  }
  async function apply(p) {
    cur = norm(p);
    var layer = document.getElementById('bg-photo-layer'); if (!layer) return;
    document.documentElement.style.setProperty('--bg-photo-opacity', cur.opacity);
    if (!cur.url) { layer.style.backgroundImage = ''; layer.classList.remove('on'); return; }
    var d = await dims(cur.url);
    layer.style.backgroundImage = "url('" + cur.url.replace(/'/g, '%27') + "')";
    layer.style.backgroundRepeat = 'no-repeat';
    if (d) {
      var L = layout(d.w, d.h, W.innerWidth, W.innerHeight, cur.zoom, cur.x, cur.y);
      layer.style.backgroundSize = L.bgSize; layer.style.backgroundPosition = L.bgPos;
    } else { layer.style.backgroundSize = 'cover'; layer.style.backgroundPosition = cur.x + '% ' + cur.y + '%'; }
    layer.classList.add('on');
  }
  var rt; W.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(function () { if (cur && cur.url) apply(cur); }, 150); });

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function verdict(d) {
    if (!d) return '';
    var r = d.w / d.h, small = Math.max(d.w, d.h) < 1200, ph = r < 0.75, ls = r > 1.3, m = [];
    m.push('Your photo: ' + d.w + ' × ' + d.h + ' px (ratio ' + r.toFixed(2) + ':1)');
    if (small) m.push('⚠️ low resolution — it will look soft on a phone; use at least 1080 px on the short side.');
    else if (ph) m.push('✅ portrait — fits phones well.');
    else if (ls) m.push('ℹ️ landscape — on a phone only a slice shows; drag the preview or use Size/Left-Right to choose which part.');
    else m.push('ℹ️ near-square — use Size to zoom and drag to choose the part.');
    return m.join('<br>');
  }

  // ----- editor -----
  W.ifxBgEditor = {
    mount: function (el, o) {
      // o: { get():{url,opacity,zoom,x,y}, set(partial, persist:boolean), upload(file), remove() }
      if (!el) return;
      var st = norm(o.get()), dim = null;
      var vw = W.innerWidth, vh = W.innerHeight, BW = vh > vw ? 150 : Math.min(300, vw - 80), BH = Math.round(BW * vh / vw);
      el.innerHTML =
        '<div style="display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap;">' +
        '<div><div id="bgx-prev" style="position:relative;width:' + BW + 'px;height:' + BH + 'px;border-radius:14px;overflow:hidden;border:2px solid var(--border);background:#0b0b18;touch-action:none;cursor:grab;flex:none;">' +
        '<div id="bgx-img" style="position:absolute;inset:0;background-repeat:no-repeat;"></div>' +
        '<div style="position:absolute;inset:0;display:flex;flex-direction:column;gap:5px;padding:9px;pointer-events:none;"><i style="height:9px;border-radius:5px;background:rgba(255,255,255,.35)"></i><i style="height:26px;border-radius:7px;background:rgba(255,255,255,.18);margin-top:6px"></i><i style="height:26px;border-radius:7px;background:rgba(255,255,255,.18)"></i><i style="height:26px;border-radius:7px;background:rgba(255,255,255,.18)"></i></div></div>' +
        '<div style="font-size:.62rem;color:var(--muted);text-align:center;margin-top:4px;">Drag the photo to move it</div></div>' +
        '<div style="flex:1;min-width:190px;">' +
        row('Size', 'bgx-zoom', 40, 400, 5, st.zoom, '%') + row('Left ↔ Right', 'bgx-x', 0, 100, 1, st.x, '%') + row('Up ↕ Down', 'bgx-y', 0, 100, 1, st.y, '%') + row('Opacity', 'bgx-op', 5, 90, 1, Math.round(st.opacity * 100), '%') +
        '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;"><button class="btn-tiny" id="bgx-fill">Fill screen</button><button class="btn-tiny" id="bgx-fit">Fit whole photo</button><button class="btn-tiny ghost" id="bgx-reset">Reset</button></div></div></div>' +
        '<div id="bgx-info" style="font-size:.68rem;color:var(--muted);margin-top:10px;line-height:1.45;"></div>' +
        '<div style="font-size:.68rem;margin-top:8px;padding:9px 10px;border-radius:10px;background:rgba(77,150,255,.1);border:1px solid rgba(77,150,255,.28);line-height:1.5;">' +
        '<b>📐 Recommended photo</b><br>Phone: <b>' + REC.portrait + '</b><br>Desktop: <b>' + REC.landscape + '</b><br>File: <b>' + REC.max + '</b>. Keep the main subject in the middle. Large photos are shrunk automatically before upload. Opacity 25–40% keeps text readable.</div>';
      function row(label, id, mn, mx, step, val, unit) {
        return '<label style="font-size:.7rem;color:var(--muted);display:flex;justify-content:space-between;margin-top:6px;"><span>' + label + '</span><b id="' + id + '-v">' + val + unit + '</b></label><input type="range" id="' + id + '" min="' + mn + '" max="' + mx + '" step="' + step + '" value="' + val + '" style="width:100%;">';
      }
      var $ = function (i) { return el.querySelector('#' + i); };
      function paintPrev() {
        var box = $('bgx-img'); if (!st.url) { box.style.backgroundImage = ''; box.style.opacity = 0; return; }
        box.style.backgroundImage = "url('" + st.url.replace(/'/g, '%27') + "')"; box.style.opacity = st.opacity;
        if (dim) { var L = layout(dim.w, dim.h, BW, BH, st.zoom, st.x, st.y); box.style.backgroundSize = L.bgSize; box.style.backgroundPosition = L.bgPos; }
        else { box.style.backgroundSize = 'cover'; box.style.backgroundPosition = st.x + '% ' + st.y + '%'; }
      }
      function sync(persist) {
        $('bgx-zoom-v').textContent = Math.round(st.zoom) + '%'; $('bgx-x-v').textContent = Math.round(st.x) + '%'; $('bgx-y-v').textContent = Math.round(st.y) + '%'; $('bgx-op-v').textContent = Math.round(st.opacity * 100) + '%';
        $('bgx-zoom').value = st.zoom; $('bgx-x').value = st.x; $('bgx-y').value = st.y; $('bgx-op').value = Math.round(st.opacity * 100);
        paintPrev(); apply(st); o.set({ opacity: st.opacity, zoom: st.zoom, x: st.x, y: st.y }, !!persist);
      }
      function setFrom(id, key, scale) { $(id).addEventListener('input', function () { st[key] = Number(this.value) / (scale || 1); sync(false); }); $(id).addEventListener('change', function () { sync(true); }); }
      setFrom('bgx-zoom', 'zoom'); setFrom('bgx-x', 'x'); setFrom('bgx-y', 'y'); setFrom('bgx-op', 'opacity', 100);
      $('bgx-fill').onclick = function () { st.zoom = 100; sync(true); };
      $('bgx-fit').onclick = function () { if (!dim) return; st.zoom = Math.max(40, Math.min(400, Math.round(Math.min(W.innerWidth / dim.w, W.innerHeight / dim.h) / Math.max(W.innerWidth / dim.w, W.innerHeight / dim.h) * 100))); st.x = 50; st.y = 50; sync(true); };
      $('bgx-reset').onclick = function () { st.zoom = 100; st.x = 50; st.y = 50; sync(true); };
      var drag = null, prev = $('bgx-prev');
      prev.addEventListener('pointerdown', function (e) { if (!st.url || !dim) return; drag = { sx: e.clientX, sy: e.clientY, x: st.x, y: st.y }; prev.setPointerCapture(e.pointerId); prev.style.cursor = 'grabbing'; });
      prev.addEventListener('pointermove', function (e) {
        if (!drag) return; var L = layout(dim.w, dim.h, BW, BH, st.zoom, st.x, st.y), rx = BW - L.w, ry = BH - L.h;
        if (Math.abs(rx) > 1) st.x = Math.min(100, Math.max(0, drag.x + (e.clientX - drag.sx) / rx * 100));
        if (Math.abs(ry) > 1) st.y = Math.min(100, Math.max(0, drag.y + (e.clientY - drag.sy) / ry * 100));
        sync(false);
      });
      var endDrag = function () { if (drag) { drag = null; prev.style.cursor = 'grab'; sync(true); } };
      prev.addEventListener('pointerup', endDrag); prev.addEventListener('pointercancel', endDrag);
      if (st.url) dims(st.url).then(function (d) { dim = d; $('bgx-info').innerHTML = verdict(d); paintPrev(); });
      else $('bgx-info').textContent = 'No photo yet — choose one below.';
      el._refresh = function (n) { st = norm(n); dim = null; if (st.url) dims(st.url).then(function (d) { dim = d; $('bgx-info').innerHTML = verdict(d); sync(false); }); else { $('bgx-info').textContent = 'No photo yet — choose one below.'; sync(false); } };
    }
  };

  // shrink big photos before upload (long edge 2400, JPEG 0.86) — returns a File/Blob
  W.ifxPrepPhoto = function (file) {
    return new Promise(function (ok) {
      try {
        var u = URL.createObjectURL(file), im = new Image();
        im.onload = function () {
          var L = Math.max(im.naturalWidth, im.naturalHeight);
          if (L <= 2400 && file.size <= 1.5 * 1024 * 1024) { URL.revokeObjectURL(u); return ok({ blob: file, ext: (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg', w: im.naturalWidth, h: im.naturalHeight }); }
          var s = Math.min(1, 2400 / L), c = document.createElement('canvas'); c.width = Math.round(im.naturalWidth * s); c.height = Math.round(im.naturalHeight * s);
          c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
          c.toBlob(function (b) { URL.revokeObjectURL(u); ok({ blob: b || file, ext: 'jpg', w: c.width, h: c.height }); }, 'image/jpeg', 0.86);
        };
        im.onerror = function () { URL.revokeObjectURL(u); ok({ blob: file, ext: 'jpg' }); };
        im.src = u;
      } catch (e) { ok({ blob: file, ext: 'jpg' }); }
    });
  };
  W.ifxBg = { apply: apply, norm: norm };
})();
