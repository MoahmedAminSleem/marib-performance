/* ============================================================
   MaribCharts — dependency-free SVG chart library (RTL-aware)
   Design: dark glass, calm grid, one accent, tooltips, no 3D/no clutter
   Encoding rules (Cleveland & McGill): bars/columns = comparisons,
   lines = time trends, donut only for few shares, gauge for single ratio.
   ============================================================ */
var MaribCharts = (function () {
  "use strict";
  var NS = "http://www.w3.org/2000/svg";
  var MUTED = "#A9B7C7", FAINT = "#7E92A8", TXT = "#F2EBDD", GRID = "rgba(217,168,107,.10)";
  var SERIES = ["#D9A86B", "#8FB3D9", "#E9C68A", "#4FD98D", "#E08A5A", "#D98A9E", "#9A8FD9", "#5AC8C0"];
  /* R42 — ألوان الثيم: كل الألوان بتتقرا من CSS variables عند أول رسم
     وعند كل تبديل ثيم (refreshPalette) — الدنيم هو الافتراضي لو المتغير
     مش موجود. كده الرسومات بيلبسوا أي ثيم بالظبط زي باقي الموقع. */
  var DENIM_SERIES = SERIES.slice();
  var GOODC = "#4FD98D", WARNC = "#F0BE55", BADC = "#F87C7C", HALOC = "#160C10", INKC = "#06121E";
  function refreshPalette() {
    try {
      var cs = getComputedStyle(document.documentElement);
      function v(name, fb) {
        var x = cs.getPropertyValue(name).trim();
        return x || fb;
      }
      MUTED = v("--chart-muted", "#A9B7C7");
      FAINT = v("--chart-faint", "#7E92A8");
      TXT = v("--chart-txt", "#F2EBDD");
      GRID = v("--chart-grid", "rgba(217,168,107,.10)");
      GOODC = v("--good", "#4FD98D");
      WARNC = v("--warn", "#F0BE55");
      BADC = v("--bad", "#F87C7C");
      HALOC = v("--chart-halo", "#160C10");
      INKC = v("--chart-ink", "#06121E");
      var s = [];
      for (var i = 1; i <= 8; i++) s.push(v("--chart-" + i, DENIM_SERIES[i - 1]));
      SERIES = s;
    } catch (e) { /* أول تحميل قبل الـ CSS؟ الافتراضي الدنيم شغال */ }
  }
  refreshPalette();
  var U = MaribCore ? MaribCore.utils : (typeof require !== "undefined" ? require("./core.js").utils : null);

  /* ---------- UI direction (ar=rtl / en+tr=ltr) — set by I18N ---------- */
  var DIRV = { d: (document.documentElement.getAttribute("dir") === "ltr" ? "ltr" : "rtl") };
  function setDir(d) {
    if (DIRV.d === d) return;
    DIRV.d = d;
    registry.forEach(function (r) {
      if (document.body.contains(r.container) && r.container.clientWidth > 0) drawOne(r.container, r.builder);
    });
  }
  /* translated label helper (safe before I18N loads) */
  function TT(k, fb) {
    return (window.I18N && typeof I18N.t === "function") ? I18N.t(k) : (fb || k);
  }
  function TPCT(v, d) {
    return (window.I18N && typeof I18N.pctV === "function") ? I18N.pctV(v, d) : (v.toFixed(d) + "%");
  }

  function el(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    if (parent) parent.appendChild(e);
    return e;
  }
  function txt(parent, x, y, s, opts) {
    opts = opts || {};
    var anchor = opts.anchor || "start";
    var isAr = /[\u0600-\u06FF]/.test(String(s));
    var useAnchor = (isAr && anchor !== "middle") ? (anchor === "end" ? "start" : "end") : anchor;
    var t = el("text", {
      x: x, y: y, fill: opts.fill || MUTED,
      "font-size": opts.size || 11, "text-anchor": useAnchor,
      "font-weight": opts.weight || 400,
      "pointer-events": "none",
      "direction": isAr ? "rtl" : "ltr"
    }, parent);
    t.textContent = s;
    if (opts.cls) t.setAttribute("class", opts.cls);
    if (opts.halo) {
      t.setAttribute("paint-order", "stroke");
      t.setAttribute("stroke", opts.haloColor || HALOC);
      t.setAttribute("stroke-width", opts.haloW || 3);
      t.setAttribute("stroke-linejoin", "round");
    }
    return t;
  }
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;"); }

  /* ---------- drill-through hook (Power BI style) ---------- */
  function bindDrill(node, drill) {
    if (!drill || !drill.type || !window.__maribDrill) return;
    var cls = (node.getAttribute("class") || "");
    node.setAttribute("class", (cls ? cls + " " : "") + "drillable");
    node.addEventListener("click", function () {
      if (window.__maribDrill) window.__maribDrill(drill.type, drill.value, drill);
    });
  }

  /* ---------- tooltip ---------- */
  var tipEl = null;
  function tipShow(html, ev) {
    if (!tipEl) tipEl = document.getElementById("tip");
    if (!tipEl) return;
    tipEl.innerHTML = html;
    tipEl.style.display = "block";
    tipMove(ev);
  }
  function tipMove(ev) {
    if (!tipEl) return;
    var pad = 14, w = tipEl.offsetWidth, h = tipEl.offsetHeight;
    var x = ev.clientX - w - pad; if (x < 6) x = ev.clientX + pad;
    var y = ev.clientY + 12; if (y + h > innerHeight - 8) y = ev.clientY - h - 10;
    tipEl.style.left = x + "px"; tipEl.style.top = y + "px";
  }
  function tipHide() { if (tipEl) tipEl.style.display = "none"; }
  function bindTip(node, htmlFn) {
    node.addEventListener("mousemove", function (ev) { tipShow(htmlFn(), ev); });
    node.addEventListener("mouseleave", tipHide);
  }

  /* ---------- render registry (resize) ---------- */
  var registry = [];
  function mount(container, builder) {
    registry = registry.filter(function (r) { return r.container !== container; });
    registry.push({ container: container, builder: builder });
    drawOne(container, builder);
  }
  function drawOne(container, builder) {
    container.innerHTML = "";
    var w = Math.max(container.clientWidth || 0, 260);
    var svg = builder(w, container);
    if (svg) container.appendChild(svg);
  }
  var rTimer = null;
  window.addEventListener("resize", function () {
    clearTimeout(rTimer);
    rTimer = setTimeout(function () {
      registry.forEach(function (r) {
        if (document.body.contains(r.container) && r.container.clientWidth > 0) drawOne(r.container, r.builder);
      });
    }, 160);
  });
  /* round 9: charts mounted while their container is hidden (attendance
     sub-tab not active when the page re-renders) draw at the 260px fallback
     and stay squeezed after the tab becomes visible — redrawIn() re-draws
     any chart whose drawn width no longer matches its container */
  function redrawIn(root) {
    setTimeout(function () {
      registry.forEach(function (r) {
        if (root && !root.contains(r.container)) return;
        if (!document.body.contains(r.container) || r.container.clientWidth <= 0) return;
        var svg = r.container.querySelector("svg");
        var drawn = svg ? +svg.getAttribute("width") || 0 : 0;
        if (Math.abs(drawn - r.container.clientWidth) > 4) drawOne(r.container, r.builder);
      });
    }, 30);
  }

  function niceTicks(min, max, n) {
    var span = max - min || 1, step0 = span / (n || 4);
    var mag = Math.pow(10, Math.floor(Math.log(step0) / Math.LN10));
    var norm = step0 / mag, step;
    if (norm < 1.5) step = mag; else if (norm < 3) step = 2 * mag; else if (norm < 7) step = 5 * mag; else step = 10 * mag;
    var ticks = [];
    var t = Math.ceil(min / step) * step;
    for (; t <= max + 1e-9; t += step) ticks.push(t);
    return ticks;
  }

  /* ================= LINE CHART ================= */
  function line(container, opts) {
    mount(container, function (w) {
      var H = opts.height || 250;
      /* days with no recorded value are REMOVED entirely (not kept as
         gaps) — the line never breaks; recorded days stay adjacent */
      var pts = (opts.points || []).filter(function (p) { return p.y != null && isFinite(p.y); });
      var svg = el("svg", { viewBox: "0 0 " + w + " " + H, width: w, height: H });
      if (opts.cmp) cmpStrip(container, opts.cmp);
      if (!pts.length) { emptyMsg(svg, w, H); return svg; }
      var m = { t: 14, r: 46, b: 26, l: 10 };
      var iw = w - m.l - m.r, ih = H - m.t - m.b;
      var ys = pts.map(function (p) { return p.y; }).filter(function (v) { return v != null && isFinite(v); });
      var curAvg = ys.length ? ys.reduce(function (a, b) { return a + b; }, 0) / ys.length : null;
      var loArr = ys.slice(), hiArr = ys.slice();
      (opts.refLines || []).forEach(function (r) { if (r.y != null && isFinite(r.y)) { loArr.push(r.y); hiArr.push(r.y); } });
      if (opts.cmp && !opts.cmp.empty) (opts.cmp.ghost || []).forEach(function (g) {
        (g.values || []).forEach(function (v) { if (v != null && isFinite(v)) { loArr.push(v); hiArr.push(v); } });
      });
      var lo = loArr.length ? Math.min.apply(null, loArr) : 0;
      var hi = hiArr.length ? Math.max.apply(null, hiArr) : 1;
      if (!isFinite(lo)) { lo = 0; hi = 1; }
      var dataLo = lo;
      if (opts.zero) lo = Math.min(0, lo);
      if (hi === lo) hi = lo + 1;
      var pad = (hi - lo) * 0.12; hi += pad;
      /* round 9: the floor no longer dips below 0 for non-negative series —
         zero:true used to pad 0 down to -12%, drawing a negative axis and
         squeezing the line into the top sliver of the plot. tightMin zooms
         the floor into the data range instead of pinning it to 0
         (supervisors-present chart: 15-20 on a 0-22 axis). */
      if (opts.zero && lo === 0) { /* axis pinned at 0: keep it exact */ }
      else if (opts.tightMin) { lo -= pad; if (dataLo >= 0 && lo < 0) lo = 0; }
      else lo -= pad;
      if (opts.pctScale) { lo = 0; hi = Math.max(hi, 1); }
      var X = function (i) { return m.l + (pts.length === 1 ? iw / 2 : (i / (pts.length - 1)) * iw); };
      var Y = function (v) { return m.t + ih - ((v - lo) / (hi - lo)) * ih; };

      niceTicks(lo, hi, 4).forEach(function (t) {
        el("line", { x1: m.l, x2: m.l + iw, y1: Y(t), y2: Y(t), stroke: GRID, "stroke-width": 1 }, svg);
        txt(svg, m.l + iw + 6, Y(t) + 3.5, opts.yFmt ? opts.yFmt(t) : U.fmtNum(t), { size: 10, fill: FAINT, anchor: "start" });
      });
      var step = Math.max(1, Math.ceil(pts.length / Math.max(6, Math.floor(w / 90))));
      pts.forEach(function (p, i) {
        if (i % step === 0 || i === pts.length - 1)
          txt(svg, X(i), H - 8, p.label, { size: 10, fill: FAINT, anchor: "middle" });
      });

      /* round 8: the dashed target line — no permanent label; a hover hit
         band (kept on top, added after the series) reveals goal+current+ratio */
      var goalHits = [];
      (opts.refLines || []).forEach(function (rf) {
        if (rf.y < lo || rf.y > hi) return;
        var ry = Y(rf.y);
        var col = rf.color || WARNC;
        el("line", { x1: m.l, x2: m.l + iw, y1: ry, y2: ry, stroke: col, "stroke-width": 1.4, "stroke-dasharray": "7 5", opacity: .9 }, svg);
        var hit = el("rect", { x: m.l, y: Math.max(m.t - 3, ry - 11), width: iw, height: 22, fill: "transparent", "class": "goal-hit" });
        bindTip(hit, function () { return goalTipHTML(rf, rf.cur != null ? rf.cur : curAvg, opts.fmt || opts.yFmt); });
        goalHits.push(hit);
      });

      var grad = el("linearGradient", { id: "lg" + gid(), x1: 0, y1: 0, x2: 0, y2: 1 }, el("defs", {}, svg));
      el("stop", { offset: "0%", "stop-color": opts.color || SERIES[0], "stop-opacity": .30 }, grad);
      el("stop", { offset: "100%", "stop-color": opts.color || SERIES[0], "stop-opacity": .02 }, grad);

      var segs = [], cur = [];
      pts.forEach(function (p, i) {
        if (p.y == null || !isFinite(p.y)) { if (cur.length) segs.push(cur); cur = []; }
        else cur.push({ i: i, p: p });
      });
      if (cur.length) segs.push(cur);
      segs.forEach(function (seg) {
        if (seg.length < 2) return;
        var d = seg.map(function (s, j) { return (j ? "L" : "M") + X(s.i).toFixed(1) + " " + Y(s.p.y).toFixed(1); }).join(" ");
        if (opts.area !== false) {
          d += " L" + X(seg[seg.length - 1].i).toFixed(1) + " " + (m.t + ih) + " L" + X(seg[0].i).toFixed(1) + " " + (m.t + ih) + " Z";
          el("path", { d: d.slice(0, d.indexOf(" L" + X(seg[seg.length - 1].i).toFixed(1))) + " Z", fill: "url(#" + grad.getAttribute("id") + ")", stroke: "none" }, svg);
          d = seg.map(function (s, j) { return (j ? "L" : "M") + X(s.i).toFixed(1) + " " + Y(s.p.y).toFixed(1); }).join(" ");
        }
        el("path", { d: d, fill: "none", stroke: opts.color || SERIES[0], "stroke-width": 2.4, "stroke-linecap": "round", "stroke-linejoin": "round", "class": "aD" }, svg);
        seg.forEach(function (s) {
          el("circle", { cx: X(s.i), cy: Y(s.p.y), r: 3, fill: HALOC, stroke: opts.color || SERIES[0], "stroke-width": 2 }, svg);
          var hit = el("rect", { x: X(s.i) - iw / pts.length / 2, y: m.t, width: iw / pts.length, height: ih, fill: "transparent" }, svg);
          bindTip(hit, function () { return tipHTML(s.p); });
          bindDrill(hit, s.p.drill);
        });
      });
      /* round 8: comparison ghost — the compared period stretched over the
         same width so both periods read day-for-day (dashed, series color) */
      if (opts.cmp && !opts.cmp.empty && (opts.cmp.ghost || []).length) {
        (opts.cmp.ghost || []).forEach(function (g) {
          var vals = (g.values || []).filter(function (v) { return v != null && isFinite(v); });
          if (vals.length < 2) return;
          var d = "";
          vals.forEach(function (v, j) {
            var x = m.l + (j / (vals.length - 1)) * iw;
            d += (j ? "L" : "M") + x.toFixed(1) + " " + Y(v).toFixed(1) + " ";
          });
          el("path", { d: d, fill: "none", stroke: g.color || (opts.color || SERIES[0]), "stroke-width": 1.8, "stroke-dasharray": "3.5 4.5", opacity: .5 }, svg);
        });
      }
      /* goal hover bands go on top of the point hits */
      goalHits.forEach(function (h) { svg.appendChild(h); });
      /* ---- DATA LABELS on the line: value at a smart interval + last point ---- */
      if (opts.dataLabels) {
        var dlStep = Math.max(1, Math.ceil(pts.length / Math.max(5, Math.floor(w / 108))));
        pts.forEach(function (p, i) {
          if (p.y == null || !isFinite(p.y)) return;
          if (i % dlStep === 0 || i === pts.length - 1) {
            var s = opts.fmt ? opts.fmt(p.y) : U.fmtNum(p.y);
            txt(svg, Math.max(m.l + 16, Math.min(m.l + iw - 16, X(i))), Math.max(11, Y(p.y) - 10), s,
              { size: 9, fill: TXT, anchor: "middle", weight: 700, cls: "num", halo: true, haloW: 2.6 });
          }
        });
      }
      if (opts.legend) legendHTML(container, opts.legend);
      return svg;
    });
  }
  function tipHTML(p) {
    var h = '<div class="t">' + (p.tipTitle || p.label) + "</div>";
    (p.tip || []).forEach(function (r) { h += '<div class="r"><span>' + r[0] + "</span><b>" + r[1] + "</b></div>"; });
    if (p.drill) h += '<div class="drill-hint">' + esc(TT("t_drill", "Click for details")) + "</div>";
    return h;
  }

  /* ---------- round 8: hover tooltip for goal/safe lines ----------
     the dashed line carries no label chip; hovering it reveals the goal,
     the current average of the plotted values and the goal ratio */
  function goalTipHTML(g, curAvg, fmt) {
    var gv = g.y != null ? g.y : g.value;
    var h = '<div class="t">' + esc(TT(g.tipTitle || "t_goal_line", "Target line")) + "</div>";
    h += '<div class="r"><span>' + esc(TT("ref_target", "Target")) + "</span><b>" + (fmt ? fmt(gv) : U.fmtNum(gv)) + "</b></div>";
    if (curAvg != null && isFinite(curAvg)) {
      h += '<div class="r"><span>' + esc(TT("t_cur", "Current")) + "</span><b>" + (fmt ? fmt(curAvg) : U.fmtNum(curAvg)) + "</b></div>";
      if (gv) h += '<div class="r"><span>' + esc(TT("t_ratio", "Ratio")) + "</span><b>" + TPCT(curAvg / gv * 100, 1) + "</b></div>";
    }
    return h;
  }

  /* ---------- round 8: comparison strip (top of chart card) ---------- */
  function cmpStrip(container, cmp) {
    if (!cmp) return;
    var d = document.createElement("div");
    d.className = "cmp-strip";
    var html = '<span class="cmp-tag">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h13l-3.2-3.2M20 17H7l3.2 3.2"/></svg>' +
      esc(cmp.label) + "</span>";
    if (cmp.empty) {
      html += '<span class="cmp-empty">' + esc(TT("cmp_empty", "No data recorded in the compared period")) + "</span>";
    } else {
      (cmp.cells || []).forEach(function (c) {
        var curS = c.fmt ? c.fmt(c.cur) : U.fmtNum(c.cur);
        var cmpS = (c.cmp == null || !isFinite(c.cmp)) ? "—" : (c.fmt ? c.fmt(c.cmp) : U.fmtNum(c.cmp));
        var dlt = "";
        if (c.cur != null && isFinite(c.cur) && c.cmp != null && isFinite(c.cmp) && c.cmp !== 0) {
          var p = ((c.cur - c.cmp) / Math.abs(c.cmp)) * 100;
          if (isFinite(p)) {
            var good = (c.goodUp != null ? c.goodUp : true) ? p >= 0 : p <= 0;
            dlt = '<b class="' + (p === 0 ? "flat" : good ? "up" : "down") + '">' + (p >= 0 ? "+" : "−") + TPCT(Math.abs(p), 1) + "</b>";
          }
        }
        html += '<span class="cmp-cell"><i>' + esc(c.name) + '</i><em class="num">' + esc(String(curS)) +
          '</em><span class="cmp-arr">→</span><em class="num dim">' + esc(String(cmpS)) + "</em>" + dlt + "</span>";
      });
    }
    d.innerHTML = html;
    container.appendChild(d);
  }

  /* round 8: signed % delta text color for bar/row chips */
  function cmpDeltaTxt(pct, goodUp) {
    var good = goodUp ? pct >= 0 : pct <= 0;
    return {
      s: (pct >= 0 ? "+" : "−") + TPCT(Math.abs(pct), 1),
      col: pct === 0 ? MUTED : (good ? GOODC : BADC)
    };
  }

  /* ================= HORIZONTAL BARS (direction-aware) ================= */
  function hbar(container, opts) {
    mount(container, function (w) {
      var items = (opts.items || []).slice();
      if (opts.sort === "asc") items.sort(function (a, b) { return (a.value || 0) - (b.value || 0); });
      if (opts.sort === "desc") items.sort(function (a, b) { return (b.value || 0) - (a.value || 0); });
      var H = Math.max(90, items.length * (opts.rowH || 30) + 26);
      var svg = el("svg", { viewBox: "0 0 " + w + " " + H, width: w, height: H });
      if (opts.cmp) cmpStrip(container, opts.cmp);
      if (!items.length) { emptyMsg(svg, w, H); return svg; }
      var ltr = DIRV.d === "ltr";
      var labelW = Math.min(opts.labelW || 150, Math.floor(w * 0.42));
      var valW = 64, m = { t: 6, r: 8, l: 8 };
      var barLeft, barRight, labX, labAnchor;
      if (ltr) {
        /* labels live in the LEFT zone; bars grow left→right; value right of the bar */
        labX = m.l; labAnchor = "start";
        barLeft = m.l + labelW + 10;
        barRight = w - m.r - (valW + 18);
      } else {
        /* labels live in the RIGHT zone [w-r-labelW, w-r]; bars grow right→left
           so names can never overlap the bars (fixes supervisor-name overlap) */
        labX = w - m.r; labAnchor = "end";
        barRight = w - m.r - labelW - 10;
        barLeft = Math.max(valW + 16, Math.floor(w * 0.13));
      }
      var maxV = Math.max.apply(null, items.map(function (x) { return x.value || 0; }));
      if (opts.goal && opts.goal.value > maxV) maxV = opts.goal.value;
      if (!maxV) maxV = 1;
      var zone = Math.max(24, barRight - barLeft);
      /* truncate label so it always fits inside the reserved label zone */
      var truncN = opts.trunc || Math.max(9, Math.floor((labelW - 12) / 6.2));
      items.forEach(function (it, idx) {
        var y = m.t + idx * (opts.rowH || 30);
        var h = (opts.rowH || 30) - 12;
        var lab = truncate(it.label, truncN);
        txt(svg, labX, y + h / 2 + 4, lab, { size: 11.5, fill: TXT, anchor: labAnchor, weight: 600 });
        var v = it.value || 0;
        var len = Math.max(v > 0 ? 3 : 0, Math.min((v / maxV) * zone, zone));
        var x0 = ltr ? barLeft : barRight - len;
        el("rect", { x: barLeft, y: y, width: zone, height: h, rx: 5, fill: "rgba(217,168,107,.07)" }, svg);
        var rc = el("rect", { x: x0, y: y, width: len, height: h, rx: 5, fill: it.color || SERIES[0], opacity: .92, "class": "aL" }, svg);
        rc.style.animationDelay = (idx * 55) + "ms";
        if (it.color && it.color === "var(--good)") rc.setAttribute("fill", GOODC);
        var valTxt = opts.fmt ? opts.fmt(v) : U.fmtInt(v);
        txt(svg, ltr ? x0 + len + 6 : x0 - 6, y + h / 2 + 4, valTxt, { size: 11, fill: MUTED, anchor: ltr ? "start" : "end", cls: "num", halo: true });
        /* round 8: compare delta chip riding after the value */
        if (opts.cmp && !opts.cmp.empty && opts.cmp.cmpMap) {
          var cv = opts.cmp.cmpMap[it.label];
          if (cv != null && isFinite(cv) && cv !== 0 && v !== 0) {
            var dpct = ((v - cv) / Math.abs(cv)) * 100;
            if (isFinite(dpct)) {
              var dt = cmpDeltaTxt(dpct, opts.cmp.goodUp);
              var dxH = ltr ? x0 + len + 12 + valTxt.length * 6.1 : x0 - 12 - valTxt.length * 6.1;
              txt(svg, dxH, y + h / 2 + 4, dt.s, { size: 9.5, fill: dt.col, anchor: ltr ? "start" : "end", weight: 800, cls: "num", halo: true, haloW: 2.2 });
            }
          }
        }
        var row = el("rect", { x: 0, y: y - 4, width: w, height: (opts.rowH || 30), fill: "transparent" }, svg);
        bindTip(row, function () {
          var hh = '<div class="t">' + esc(it.label) + "</div>";
          (it.tip || [[opts.valueName || TT("t_value", "Value"), valTxt]]).forEach(function (r) { hh += '<div class="r"><span>' + esc(r[0]) + "</span><b>" + esc(r[1]) + "</b></div>"; });
          if (it.drill) hh += '<div class="drill-hint">' + esc(TT("t_drill", "Click for details")) + "</div>";
          return hh;
        });
        bindDrill(row, it.drill);
      });
      if (opts.goal) {
        /* round 8: dashed goal line, no label chip — hover shows
           goal + current average + ratio */
        var gx = ltr ? barLeft + (opts.goal.value / maxV) * zone : barRight - (opts.goal.value / maxV) * zone;
        var colH = opts.goal.color || WARNC;
        el("line", { x1: gx, x2: gx, y1: m.t - 2, y2: m.t + items.length * (opts.rowH || 30) - 8, stroke: colH, "stroke-dasharray": "6 4", "stroke-width": 1.4, opacity: .9 }, svg);
        var sumV = items.reduce(function (s, x) { return s + (x.value || 0); }, 0);
        var curAvgH = items.length ? sumV / items.length : null;
        var hitH = el("rect", { x: gx - 11, y: m.t - 4, width: 22, height: items.length * (opts.rowH || 30), fill: "transparent", "class": "goal-hit" }, svg);
        bindTip(hitH, function () { return goalTipHTML(opts.goal, opts.goal.cur != null ? opts.goal.cur : curAvgH, opts.fmt); });
      }
      if (opts.legend) legendHTML(container, opts.legend);
      return svg;
    });
  }
  function truncate(s, n) {
    s = String(s == null ? "" : s);
    return s.length > n ? s.slice(0, n - 1) + "…" : s;
  }

  /* ================= VERTICAL COLUMNS (grouped optional) ================= */
  function vbar(container, opts) {
    mount(container, function (w) {
      var items = opts.items || [];
      var H = opts.height || 250;
      var svg = el("svg", { viewBox: "0 0 " + w + " " + H, width: w, height: H });
      if (opts.cmp) cmpStrip(container, opts.cmp);
      if (!items.length) { emptyMsg(svg, w, H); return svg; }
      var m = { t: 18, r: 14, b: 30, l: 14 };
      var iw = w - m.l - m.r;
      var slot = iw / items.length;
      /* round 8: x-axis label under EVERY column — horizontal when it fits,
         rotated -58° when the columns get narrow (top-lines & co);
         round 9 measures the TRUNCATED text (day-drill supervisor names
         are 30+ chars raw, which made every chart look "rotated") */
      var maxLabLen = items.reduce(function (mx, it) { return Math.max(mx, Math.min(String(it.label == null ? "" : it.label).length, 18)); }, 0);
      var rotLab = slot - 8 < maxLabLen * 6.3;
      /* round 9: rotated labels used to be anchored at the very bottom of
         the svg and, with overflow:visible, they dropped BELOW the chart
         onto the next section. Now the bottom band is sized for the slanted
         text and labels are anchored just under the axis, descending inside
         the reserved band. Left margin grows so the first slanted label
         does not spill past the plot edge. */
      if (rotLab) {
        var estW = maxLabLen * 5.6;
        m.b = Math.max(m.b, Math.min(122, 24 + estW * 0.86));
        m.l = Math.max(m.l, Math.min(56, estW * 0.5));
        iw = w - m.l - m.r;
        slot = iw / items.length;
      }
      var ih = H - m.t - m.b;
      var grouped = items[0].values != null;
      var series = grouped ? items[0].values.map(function (v) { return v; }) : null;
      var maxV = 0;
      items.forEach(function (it) {
        if (grouped) it.values.forEach(function (v) { if ((v.v || 0) > maxV) maxV = v.v || 0; });
        else if ((it.value || 0) > maxV) maxV = it.value || 0;
      });
      if (opts.goal && opts.goal.value > maxV) maxV = opts.goal.value;
      if (!maxV) maxV = 1;
      niceTicks(0, maxV, 4).forEach(function (t) {
        var y = m.t + ih - (t / maxV) * ih;
        el("line", { x1: m.l, x2: m.l + iw, y1: y, y2: y, stroke: GRID, "stroke-width": 1 }, svg);
        txt(svg, m.l + 2, y - 4, opts.fmt ? opts.fmt(t) : U.fmtInt(t), { size: 10, fill: FAINT, anchor: "end" });
      });
      var bw = grouped ? Math.min(26, (slot - 12) / items[0].values.length) : Math.min(42, slot * 0.55);
      items.forEach(function (it, idx) {
        var cx = m.l + slot * idx + slot / 2;
        if (grouped) {
          var total = it.values.length;
          var gap = 4, all = total * bw + (total - 1) * gap;
          var startX = cx - all / 2;
          it.values.forEach(function (v, vi) {
            var hgt = Math.max((v.v || 0) > 0 ? 2 : 0, ((v.v || 0) / maxV) * ih);
            var x = startX + vi * (bw + gap);
            var y = m.t + ih - hgt;
            var r = el("rect", { x: x, y: y, width: bw, height: hgt, rx: 4, fill: v.color || SERIES[vi], opacity: v.dim ? .45 : .95, "class": "aU" }, svg);
            r.style.animationDelay = (idx * 40 + vi * 70) + "ms";
            bindTip(r, function () {
              var hh = '<div class="t">' + esc(it.label) + "</div>";
              hh += '<div class="r"><span>' + esc(v.name || "") + "</span><b>" + (opts.fmt ? opts.fmt(v.v) : U.fmtInt(v.v)) + "</b></div>";
              if (it.drill) hh += '<div class="drill-hint">' + esc(TT("t_drill", "Click for details")) + "</div>";
              return hh;
            });
            /* data labels for grouped bars: vertical (rotated) value inside the bar */
            var vlab = (opts.fmt ? opts.fmt(v.v) : U.fmtInt(v.v));
            if ((v.v || 0) > 0 && hgt > 42 && bw >= 13 && opts.dataLabels !== false) {
              var ax = x + bw / 2 + 3.4, ay = y + hgt - 7;
              var vl = txt(svg, ax, ay, vlab, { size: 9, fill: TXT, anchor: "start", weight: 700, cls: "num", halo: true, haloW: 2.6 });
              vl.setAttribute("transform", "rotate(-90 " + ax.toFixed(1) + " " + ay.toFixed(1) + ")");
            }
            bindDrill(r, it.drill);
          });
        } else {
          var hgt = Math.max((it.value || 0) > 0 ? 2 : 0, ((it.value || 0) / maxV) * ih);
          var y = m.t + ih - hgt;
          var r = el("rect", { x: cx - bw / 2, y: y, width: bw, height: hgt, rx: 4, fill: it.color || SERIES[0], opacity: .95, "class": "aU" }, svg);
          r.style.animationDelay = (idx * 45) + "ms";
          var lab = opts.fmt ? opts.fmt(it.value) : U.fmtInt(it.value);
          txt(svg, cx, Math.max(y - 5, 10), lab, { size: 10, fill: MUTED, anchor: "middle", cls: "num", halo: true });
          bindTip(r, function () {
            var hh = '<div class="t">' + esc(it.label) + "</div>";
            (it.tip || [[opts.valueName || TT("t_value", "Value"), lab]]).forEach(function (rr) { hh += '<div class="r"><span>' + esc(rr[0]) + "</span><b>" + esc(rr[1]) + "</b></div>"; });
            if (it.drill) hh += '<div class="drill-hint">' + esc(TT("t_drill", "Click for details")) + "</div>";
            return hh;
          });
          bindDrill(r, it.drill);
        }
      });
      if (opts.goal) {
        /* round 8: dashed goal line, no label chip — hover shows
           goal + current average + ratio */
        var gy = m.t + ih - (opts.goal.value / maxV) * ih;
        var col = opts.goal.color || WARNC;
        el("line", { x1: m.l, x2: m.l + iw, y1: gy, y2: gy, stroke: col, "stroke-dasharray": "7 5", "stroke-width": 1.4, opacity: .9 }, svg);
        var valsV = items.map(function (x) { return x.value || 0; });
        var curAvgV = valsV.length ? valsV.reduce(function (a, b) { return a + b; }, 0) / valsV.length : null;
        var hitV = el("rect", { x: m.l, y: Math.max(m.t - 3, gy - 11), width: iw, height: 22, fill: "transparent", "class": "goal-hit" }, svg);
        bindTip(hitV, function () { return goalTipHTML(opts.goal, opts.goal.cur != null ? opts.goal.cur : curAvgV, opts.fmt); });
      }
      /* round 8: x-axis label under every column + per-column compare deltas */
      items.forEach(function (it, idx) {
        var cx = m.l + slot * idx + slot / 2;
        var labX = truncate(String(it.label == null ? "" : it.label), 18);
        if (rotLab) {
          var isArL = /[\u0600-\u06FF]/.test(labX);
          /* anchor the slanted label at the tick just below the axis; the
             text runs down-left INSIDE the reserved bottom band (round 9).
             Latin: end-anchored (last char at the tick); Arabic: rtl
             start-anchored (first char at the tick) — same diagonal. */
          var y0 = m.t + ih + 13;
          var tl = el("text", { x: cx, y: y0, "font-size": 9.3, fill: FAINT, "text-anchor": isArL ? "start" : "end", "pointer-events": "none", direction: isArL ? "rtl" : "ltr" }, svg);
          tl.textContent = labX;
          tl.setAttribute("transform", "rotate(-58 " + cx.toFixed(1) + " " + y0.toFixed(1) + ")");
        } else {
          txt(svg, cx, H - 8, labX, { size: 10, fill: FAINT, anchor: "middle" });
        }
        if (opts.cmp && !opts.cmp.empty && opts.cmp.cmpMap && !grouped) {
          var cv = opts.cmp.cmpMap[it.label];
          if (cv != null && isFinite(cv) && cv !== 0 && (it.value || 0) !== 0) {
            var dpct = ((it.value - cv) / Math.abs(cv)) * 100;
            if (isFinite(dpct)) {
              var dt = cmpDeltaTxt(dpct, opts.cmp.goodUp);
              var yTop = m.t + ih - Math.max((it.value || 0) > 0 ? 2 : 0, ((it.value || 0) / maxV) * ih);
              txt(svg, cx, Math.max(9, yTop - 18), dt.s, { size: 9, fill: dt.col, anchor: "middle", weight: 800, cls: "num", halo: true, haloW: 2.2 });
            }
          }
        }
      });
      if (opts.legend) legendHTML(container, opts.legend);
      return svg;
    });
  }

  /* ================= DONUT ================= */
  function donut(container, opts) {
    mount(container, function (w) {
      var H = opts.height || 240;
      var svg = el("svg", { viewBox: "0 0 " + w + " " + H, width: w, height: H });
      if (opts.cmp) cmpStrip(container, opts.cmp);
      var items = (opts.items || []).filter(function (x) { return (x.value || 0) > 0; });
      if (!items.length) { emptyMsg(svg, w, H); return svg; }
      var total = items.reduce(function (s, x) { return s + (x.value || 0); }, 0);
      var cx = w * (opts.legendSide ? 0.32 : 0.5), cy = H / 2, R = Math.min(H / 2, w * (opts.legendSide ? .3 : .45)) - 18, r0 = R * 0.62;
      var a0 = -Math.PI / 2;
      items.forEach(function (it, i) {
        var frac = (it.value || 0) / total, a1 = a0 + frac * Math.PI * 2;
        var large = frac > 0.5 ? 1 : 0;
        var p1 = pt(cx, cy, R, a0), p2 = pt(cx, cy, R, a1), p3 = pt(cx, cy, r0, a1), p4 = pt(cx, cy, r0, a0);
        var d = "M" + p1.x + " " + p1.y + " A" + R + " " + R + " 0 " + large + " 1 " + p2.x + " " + p2.y +
                " L" + p3.x + " " + p3.y + " A" + r0 + " " + r0 + " 0 " + large + " 0 " + p4.x + " " + p4.y + " Z";
        var path = el("path", { d: d, fill: it.color || SERIES[i % SERIES.length], opacity: .92, stroke: HALOC, "stroke-width": 2, "class": "aP" }, svg);
        path.style.animationDelay = (i * 90) + "ms";
        bindTip(path, function () {
          var hh = '<div class="t">' + esc(it.label) + "</div>";
          if (it.tip && it.tip.length) {
            /* round 8: caller-supplied tooltip rows win (e.g. share-only) */
            it.tip.forEach(function (r) { hh += '<div class="r"><span>' + esc(r[0]) + "</span><b>" + esc(r[1]) + "</b></div>"; });
            if (it.drill) hh += '<div class="drill-hint">' + esc(TT("t_drill", "Click for details")) + "</div>";
            return hh;
          }
          hh += '<div class="r"><span>' + esc(opts.valueName || TT("t_value", "Value")) + "</span><b>" + (opts.fmt ? opts.fmt(it.value) : U.fmtInt(it.value)) + "</b></div>";
          hh += '<div class="r"><span>' + esc(TT("t_share", "Share")) + "</span><b>" + TPCT(frac * 100, 1) + "</b></div>";
          return hh;
        });
        bindDrill(path, it.drill);
        /* ---- DATA LABELS: name + share inside every segment ---- */
        if (frac > 0.005) {
          var mid = (a0 + a1) / 2, rMid = (R + r0) / 2;
          var lx = cx + rMid * Math.cos(mid), ly = cy + rMid * Math.sin(mid);
          var pctStr = TPCT(frac * 100, frac < 0.1 ? 1 : 0);
          if (frac >= 0.07) {
            /* enough room: two lines inside the ring — name (small) + share (bold) */
            var chord = 2 * rMid * Math.sin(Math.min(Math.PI, frac * Math.PI * 2) / 2);
            var nameMax = Math.max(6, Math.floor((chord - 8) / 6.1));
            var nm = truncate(it.label, nameMax);
            txt(svg, lx, ly - 2, pctStr, { size: 12.5, fill: TXT, anchor: "middle", weight: 800, cls: "num", halo: true, haloW: 3.2 });
            txt(svg, lx, ly + 10.5, nm, { size: 8.8, fill: TXT, anchor: "middle", weight: 600, halo: true, haloW: 2.6 });
          } else {
            /* tiny slice: callout line to the outside + combined label */
            var pOut = pt(cx, cy, R + 8, mid), pOut2 = pt(cx, cy, R + 24, mid);
            el("line", { x1: pOut.x, y1: pOut.y, x2: pOut2.x, y2: pOut2.y, stroke: it.color || SERIES[i % SERIES.length], "stroke-width": 1.4, opacity: .9 }, svg);
            var isLeft = Math.cos(mid) < 0;
            var tx = Math.max(28, Math.min(w - 28, parseFloat(pOut2.x) + (isLeft ? -6 : 6)));
            var ty = Math.max(16, Math.min(H - 8, parseFloat(pOut2.y) + 3));
            /* labels that would sit too high get pulled down beside the ring
               so they never crowd the card edge above the chart */
            if (ty < 36) {
              ty = Math.max(36, cy - R + 34);
              tx = Math.max(30, Math.min(w - 30, cx + (isLeft ? -1 : 1) * (R + 46)));
            }
            txt(svg, tx, ty, truncate(it.label, 14) + " " + pctStr, { size: 9.5, fill: MUTED, anchor: isLeft ? "end" : "start", weight: 700, halo: true, haloW: 2.4 });
          }
        }
        a0 = a1;
      });
      if (opts.center) {
        var t1 = txt(svg, cx, cy - 2, opts.center.big, { size: 21, fill: TXT, anchor: "middle", weight: 800, cls: "num" });
      }
      if (opts.legend) legendHTML(container, opts.legend, items, opts.fmt);
      return svg;
    });
  }
  function pt(cx, cy, r, a) { return { x: (cx + r * Math.cos(a)).toFixed(2), y: (cy + r * Math.sin(a)).toFixed(2) }; }

  /* ================= GAUGE (semicircle with zones) ================= */
  function gauge(container, opts) {
    mount(container, function (w) {
      var H = opts.height || 210;
      var svg = el("svg", { viewBox: "0 0 " + w + " " + H, width: w, height: H });
      if (opts.cmp) cmpStrip(container, opts.cmp);
      var v = opts.value == null ? 0 : Math.max(0, Math.min(1, opts.value));
      var cx = w / 2, cy = H - 34, R = Math.min(H - 52, w / 2 - 30);
      var th = opts.thresholds || { good: .10, warn: .20 };
      function arc(a0, a1, color, width) {
        var p1 = pt(cx, cy, R, Math.PI + a0), p2 = pt(cx, cy, R, Math.PI + a1);
        return el("path", { d: "M" + p1.x + " " + p1.y + " A" + R + " " + R + " 0 " + (a1 - a0 > Math.PI ? 1 : 0) + " 1 " + p2.x + " " + p2.y,
          fill: "none", stroke: color, "stroke-width": width || 13, "stroke-linecap": "round" }, svg);
      }
      var maxV = Math.max(th.warn * 2.5, (v || 0) * 1.25, 0.5);
      function ang(val) { return (Math.min(val, maxV) / maxV) * Math.PI; }
      arc(0, ang(th.good), "rgba(79,217,141,.32)");
      arc(ang(th.good), ang(th.warn), "rgba(240,190,85,.32)");
      arc(ang(th.warn), Math.PI, "rgba(248,124,124,.28)");
      arc(0, ang(v), v <= th.good ? GOODC : v <= th.warn ? WARNC : BADC, 11);
      var vt = txt(svg, cx, cy - 8, U.fmtPct(v), { size: 25, fill: TXT, anchor: "middle", weight: 800, cls: "num" });
      var lt = txt(svg, cx, cy + 16, opts.label || "", { size: 11, fill: MUTED, anchor: "middle" });
      [[0, "0"], [th.good, null], [th.warn, null], [maxV, null]].slice(0, 4).forEach(function (pair, i) {
        var a = ang(pair[0]);
        var p = pt(cx, cy, R - 22, Math.PI + a);
        var lab = i === 0 ? "0" : i === 1 ? U.fmtPct(th.good, 0) : i === 2 ? U.fmtPct(th.warn, 0) : U.fmtPct(maxV, 0);
        txt(svg, p.x, p.y + 4, lab, { size: 9.5, fill: FAINT, anchor: "middle", cls: "num" });
      });
      return svg;
    });
  }

  /* ================= HEATMAP (weeks x weekdays — direction-aware) ================= */
  function heat(container, opts) {
    mount(container, function (w) {
      if (opts.cmp) cmpStrip(container, opts.cmp);
      var days = (window.I18N && I18N.heatDays) ? I18N.heatDays()
        : ["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"];
      var ltr = DIRV.d === "ltr";
      var dws = [6, 0, 1, 2, 3, 4, 5];
      var weeks = opts.weeks || [];
      var cell = opts.cell || 34, gap = 5, labelW = 58, topH = 22;
      var H = topH + days.length * (cell + gap) + 4;
      var W = labelW + weeks.length * (cell + gap) + 8;
      var svg = el("svg", { viewBox: "0 0 " + Math.max(W, w) + " " + H, width: Math.max(W, w), height: H });
      if (!weeks.length) { emptyMsg(svg, w, H); return svg; }
      var map = {};
      (opts.cells || []).forEach(function (c) { map[c.week + "|" + c.dw] = c; });
      days.forEach(function (dname, di) {
        txt(svg, ltr ? 4 : w - 4, topH + di * (cell + gap) + cell / 2 + 4, dname, { size: 10.5, fill: MUTED, anchor: ltr ? "start" : "end" });
      });
      weeks.forEach(function (wk, wi) {
        var x = ltr ? labelW + 8 + wi * (cell + gap) : w - labelW - (wi + 1) * (cell + gap);
        var wt = txt(svg, x + cell / 2, 14, U.isoShort(wk), { size: 9.5, fill: FAINT, anchor: "middle", cls: "num" });
        days.forEach(function (dname, di) {
          var dw = dws[di];
          var c = map[wk + "|" + dw];
          var y = topH + di * (cell + gap);
          var fill = "rgba(217,168,107,.05)";
          if (c && c.pct != null) fill = heatColor(c.pct);
          var rc = el("rect", { x: x, y: y, width: cell, height: cell, rx: 7, fill: fill, stroke: "rgba(217,168,107,.12)", "class": "aF" }, svg);
          rc.style.animationDelay = (wi * 55 + di * 40) + "ms";
          if (c && c.pct != null) {
            txt(svg, x + cell / 2, y + cell / 2 + 3.5, (c.pct * 100).toFixed(0), { size: 10, fill: c.pct > .62 ? INKC : TXT, anchor: "middle", weight: 700, cls: "num" });
            bindTip(rc, function () {
              var hh = '<div class="t">' + dname + " " + U.isoShort(wk) + "</div>";
              hh += '<div class="r"><span>' + esc(TT("t_disc", "Discipline")) + "</span><b>" + U.fmtPct(c.pct) + "</b></div>";
              hh += '<div class="r"><span>' + esc(TT("t_recs2", "Records")) + "</span><b>" + c.count + "</b></div>";
              return hh;
            });
          }
        });
      });
      return svg;
    });
  }
  function heatColor(p) {
    // 0.5 -> red, 0.9 -> green (piecewise)
    var stops = [
      { p: .50, c: [248, 124, 124] }, { p: .75, c: [240, 190, 85] }, { p: .95, c: [79, 217, 141] }
    ];
    var c;
    if (p <= stops[0].p) c = stops[0].c;
    else if (p >= stops[stops.length - 1].p) c = stops[stops.length - 1].c;
    else for (var i = 0; i < stops.length - 1; i++) {
      var a = stops[i], b = stops[i + 1];
      if (p >= a.p && p <= b.p) {
        var t = (p - a.p) / (b.p - a.p);
        c = [0, 1, 2].map(function (k) { return Math.round(a.c[k] + t * (b.c[k] - a.c[k])); });
        break;
      }
    }
    return "rgb(" + c[0] + "," + c[1] + "," + c[2] + ")";
  }

  /* ================= legend + misc ================= */
  function legendHTML(container, entries, items, fmt) {
    var wrap = document.createElement("div");
    wrap.className = "legend";
    entries.forEach(function (e) {
      var li = document.createElement("span"); li.className = "li";
      var sw = document.createElement("span"); sw.className = "sw"; sw.style.background = e.color;
      var tx = document.createElement("span"); tx.textContent = e.name;
      if (e.value != null) tx.textContent += ": " + (fmt ? fmt(e.value) : U.fmtInt(e.value));
      li.appendChild(sw); li.appendChild(tx); wrap.appendChild(li);
    });
    container.appendChild(wrap);
  }
  function emptyMsg(svg, w, H) {
  }
  var gidc = 0;
  function gid() { return "g" + (++gidc); }

  return {
    line: line, hbar: hbar, vbar: vbar, donut: donut, gauge: gauge, heat: heat,
    SERIES: SERIES, tipHide: tipHide, setDir: setDir, DIRV: DIRV, cmpStrip: cmpStrip,
    redrawIn: redrawIn, refreshPalette: refreshPalette
  };
})();
