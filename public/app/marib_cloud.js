/* ============================================================
   MaribStore — round 21 (ONLINE edition)
   Same external interface as the offline IndexedDB store, so the
   app_c/app_b modules keep working untouched:
     - loadData()      → GET /api/months/{active}   {pack, names, at}
     - saveData()      → kept for interface compat (finish() drives
                         saveMonth directly with callbacks)
     - saveMonth()     → POST /api/months/{key}  (uploaders only)
     - clearData()     → local caches only — server months SURVIVE
   UI state (page/filters) stays per-device in localStorage, exactly
   like round 14. BroadcastChannel still syncs tabs in this browser;
   other people's devices see the month on their next load.
   ============================================================ */
var MaribStore = (function () {
  "use strict";
  var LS_UI = "marib_ui_v1";
  var LS_MONTH = "marib_month_v1";
  var bc = null;
  try { bc = new BroadcastChannel("marib_sync"); } catch (e) { bc = null; }
  function bcast() { if (bc) { try { bc.postMessage({ t: "data", at: Date.now() }); } catch (e) { } } }

  var monthsCache = null;   // [{key,label,rows,updatedAt}] (desc) or null
  var activeMonth = null;   // "2026-08"

  function jfetch(url, opts) {
    return fetch(url, Object.assign({ credentials: "same-origin" }, opts || {}))
      .then(function (r) {
        return r.json().then(function (j) { return { ok: r.ok, status: r.status, body: j || {} }; })
          .catch(function () { return { ok: false, status: r.status, body: {} }; });
      });
  }

  /* ---------- month list (auth'd; cached per tab) ---------- */
  function getMonths(force) {
    if (monthsCache && !force) return Promise.resolve(monthsCache);
    return jfetch("/api/months").then(function (r) {
      if (r.ok && r.body.ok) {
        monthsCache = r.body.months || [];
        return monthsCache;
      }
      return monthsCache || [];   // 401 (not logged in yet) → not cached
    }).catch(function () { return monthsCache || []; });
  }

  function activeMonthKey() {
    if (activeMonth) return activeMonth;
    var m = null;
    try { m = localStorage.getItem(LS_MONTH); } catch (e) { }
    if (m && /^\d{4}-\d{2}$/.test(m)) activeMonth = m;
    return activeMonth;
  }
  function setActiveMonth(key) {
    if (!/^\d{4}-\d{2}$/.test(key)) return;
    activeMonth = key;
    try { localStorage.setItem(LS_MONTH, key); } catch (e) { }
  }

  function monthKeyOf(pack) {
    try {
      var dd = pack && pack.dd;
      if (!dd || !Array.isArray(dd.r) || !dd.r.length) return null;
      var c = dd.c || [], di = c.indexOf("date");
      if (di < 0) di = 0;
      var mk = "";
      for (var i = 0; i < dd.r.length; i++) {
        var v = dd.r[i] && dd.r[i][di];
        if (typeof v === "string" && /^\d{4}-\d{2}/.test(v)) {
          var k = v.slice(0, 7);
          if (k > mk) mk = k;
        }
      }
      return mk || null;
    } catch (e) { return null; }
  }

  function labelOf(key) {
    if (monthsCache) {
      for (var i = 0; i < monthsCache.length; i++) {
        if (monthsCache[i].key === key) return monthsCache[i].label;
      }
    }
    try {
      if (window.MaribCore && MaribCore.isoMonthLabel) return MaribCore.isoMonthLabel(key + "-01");
    } catch (e) { }
    return key;
  }

  /* ---------- month switch (round 23: driven by the DATE range —
     the file/month dropdown is gone; app_main asks for the month that
     covers the picked dates and the range is PRESERVED, not reset) ---------- */
  function switchMonth(key) {
    if (!/^\d{4}-\d{2}$/.test(key)) return Promise.resolve(null);
    setActiveMonth(key);
    return jfetch("/api/months/" + key).then(function (r) {
      if (!r.ok || !r.body.ok) return null;
      if (window.App && App.setTables && App.unpackTables) {
        var t = null;
        try { t = App.unpackTables(r.body.pack); } catch (e) { return null; }
        if (!t || (!t.dd.length && !t.lo.length)) return null;
        App.setTables(t, "restored");
        return { pack: r.body.pack, names: r.body.names || [], at: r.body.at, month: key, label: r.body.label };
      }
      return null;
    }).catch(function () { return null; });
  }

  /* ---------- the record the app expects: {pack, names, at} ---------- */
  function loadData() {
    return getMonths().then(function (months) {
      if (!months.length) return null;
      var key = activeMonthKey() || months[0].key;
      return jfetch("/api/months/" + key).then(function (r) {
        if (!r.ok || !r.body.ok) return null;
        activeMonth = key;
        return { pack: r.body.pack, names: r.body.names || [], at: r.body.at, month: key, label: r.body.label, months: months };
      });
    }).catch(function () { return null; });
  }

  /* ---------- upload (finish() drives this with a callback) ---------- */
  function saveMonth(key, pack, names, cb) {
    if (!/^\d{4}-\d{2}$/.test(key)) {
      key = monthKeyOf(pack) || activeMonthKey() || "";
      if (!/^\d{4}-\d{2}$/.test(key)) { if (cb) cb("cloud_err_up", null); return Promise.resolve(false); }
    }
    return jfetch("/api/months/" + key, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pack: pack, names: names || [], label: labelOf(key) })
    }).then(function (r) {
      var ok = r.ok && r.body.ok;
      if (ok) { monthsCache = null; bcast(); }
      if (cb) {
        var errKey = !ok
          ? (r.status === 403 ? "cloud_err_no_perm" : r.status === 401 ? "cloud_err_auth" : "cloud_err_up")
          : null;
        cb(errKey, ok ? (r.body.label || labelOf(key)) : null);
      }
      return ok;
    }).catch(function () { if (cb) cb("cloud_err_up", null); return false; });
  }

  /* interface compat (app_c legacy path) */
  function saveData(pack, names) {
    return saveMonth(monthKeyOf(pack) || "", pack, names, null).then(function () { });
  }

  function clearData() {
    /* round 21: the SERVER months survive logout — clear only this
       device's caches (logout = clean machine for the next user) */
    monthsCache = null;
    activeMonth = null;
    try { localStorage.removeItem(LS_MONTH); } catch (e) { }
    return Promise.resolve();
  }

  /* ---------- UI state (unchanged from round 14 — per device) ---------- */
  function saveUI(o) { try { localStorage.setItem(LS_UI, JSON.stringify(o)); } catch (e) { } }
  function loadUI() {
    try {
      var raw = localStorage.getItem(LS_UI);
      if (!raw) return null;
      var o = JSON.parse(raw);
      return (o && typeof o === "object") ? o : null;
    } catch (e) { return null; }
  }
  function clearUI() { try { localStorage.removeItem(LS_UI); } catch (e) { } }

  /* another tab in THIS browser uploaded a month → reload it */
  function onDataMessage(fn) {
    if (!bc) return;
    try {
      bc.addEventListener("message", function (e) {
        if (e.data && e.data.t === "data") { try { fn(e.data); } catch (er) { } }
      });
    } catch (e) { }
  }

  return {
    saveData: saveData, loadData: loadData, clearData: clearData,
    saveMonth: saveMonth, monthKeyOf: monthKeyOf,
    getMonths: getMonths, switchMonth: switchMonth,
    setActiveMonth: setActiveMonth, activeMonthKey: activeMonthKey,
    saveUI: saveUI, loadUI: loadUI, clearUI: clearUI,
    onDataMessage: onDataMessage
  };
})();
