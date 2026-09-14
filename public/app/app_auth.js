/* ============================================================
   MaribAuth — R23/R24 online edition
   - Login gate (denim screen) with sewing-machine password
     show/hide animation (stitches sew the field shut, a seam
     ripper unpicks it back)
   - Server-backed accounts: developer / admin / user roles
     (default: Amin · developer · full admin rights) via /api/auth
   - Signed session cookie (remember me = 30 days); logout WITHOUT
     page reload — opening a new tab never re-refreshes (R24 #12)
   All accounts live on the server (Neon); the browser stores none.
   ============================================================ */
var MaribAuth = (function () {
  "use strict";
  /* R42: حماية من التحميل المزدوج (نفس تعليق app_manpower) */
  if (window.__maribAuth42) return window.__maribAuth42;
  var T = I18N.t;
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }

  var KEY_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="7.5" cy="15.5" r="4"/><path d="M11 12 20 3M16.5 6.5l3.5 3.5M13.5 9.5l2.5 2.5"/></svg>';
  var TRASH_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9.5 7V5q0-1 1-1h3q1 0 1 1v2M6.5 7l1 13q0 .5.5.5h8q.5 0 .5-.5l1-13"/><path d="M10 11v6M14 11v6"/></svg>';
  /* R27: tag = job title editor · camera = photo picker */
  var TAG_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0l-7.2-7.2A2 2 0 0 1 2.6 12V5a2 2 0 0 1 2-2h7a2 2 0 0 1 1.4.6l7.6 7.6a2 2 0 0 1 0 2.2z"/><circle cx="7.5" cy="7.5" r="1.3" fill="currentColor" stroke="none"/></svg>';
  var CAM_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h2.2l1.7-2.4h7.2L17.3 7h2.2A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z"/><circle cx="12" cy="13" r="3.4"/></svg>';

  /* ---------------- local toast (reuses the app node) ---------------- */
  function toast(msg, cls) {
    var t = $("toast");
    if (!t) return;
    t.textContent = msg;
    t.className = "on " + (cls || "");
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.className = ""; }, 3600);
  }

  /* ---------------- state ---------------- */
  var me = null; /* {uid, username, role, photo} — from the signed session cookie */
  var loginEl = null, cardEl = null;
  /* R26 "تذكرني" rule — WITHOUT the checkbox the login must be asked
     again on every fresh open of the site; WITH it the session lasts
     30 days. The cookie alone can't express that (browsers keep session
     cookies while the process lives / restore them on startup), so the
     client keeps two flags:
       localStorage  "marib_stay" — set ONLY when تذكرني was checked
       sessionStorage "marib_stay" — set on every login; copied to tabs
                                     opened FROM a link (open-in-new-tab
                                     keeps the same view) and wiped the
                                     moment the browser session ends. */
  var STAY_KEY = "marib_stay";
  function stayAllowed() {
    try {
      return localStorage.getItem(STAY_KEY) === "1" || sessionStorage.getItem(STAY_KEY) === "1";
    } catch (e) { return true; /* storage blocked — keep the old behaviour */ }
  }
  function setStay(remember) {
    try {
      if (remember) localStorage.setItem(STAY_KEY, "1");
      else localStorage.removeItem(STAY_KEY);
      sessionStorage.setItem(STAY_KEY, "1");
    } catch (e) { }
  }
  function clearStay() {
    try { localStorage.removeItem(STAY_KEY); sessionStorage.removeItem(STAY_KEY); } catch (e) { }
  }
  function isAdmin(u) { return !!u && (u.role === "dev" || u.role === "admin"); }
  function isDev(u) { return !!u && u.role === "dev"; }
  function roleKey(r) { return r === "dev" ? "us_role_dev" : r === "admin" ? "us_role_admin" : "us_role_user"; }

  /* ============================================================
     password theater — machine sews, ripper unpicks
     ============================================================ */
  var pwVisible = false, animating = false, curEnd = null;
  var RM = window.matchMedia ? matchMedia("(prefers-reduced-motion: reduce)") : null;
  /* R25: the theater runs noticeably slower than R24 — the user asked for
     a smoother, less frantic machine ride (sew ~1.0s, unpick ~0.9s).
     ?pwslow=<ms> still adds extra slowness on top. */
  var SLOW = 0;
  try { SLOW = parseInt(new URLSearchParams(location.search).get("pwslow"), 10) || 0; } catch (e) { }
  var NEEDLE_X = 62;   /* needle tip x-offset inside the machine svg (86px render) */
  var NEEDLE_TIP = 115;/* needle tip y-offset inside the machine svg (120px render) */
  var RIP_X = 17;      /* hook tip x-offset inside the ripper svg (34px render) */

  function setStatus(key) {
    var s = $("lgStatus");
    if (s) s.textContent = key ? T(key) : "";
  }
  function syncToggle() {
    var btn = $("lgEye");
    if (!btn) return;
    var lbl = T(pwVisible ? "lg_act_hide" : "lg_act_show");
    btn.setAttribute("aria-pressed", pwVisible ? "true" : "false");
    btn.setAttribute("aria-label", lbl);
    btn.title = lbl;
  }

  function buildMirror(mirror, inp, val, startHidden) {
    var cs = getComputedStyle(inp);
    mirror.style.left = inp.offsetLeft + "px";
    mirror.style.top = inp.offsetTop + "px";
    mirror.style.width = inp.offsetWidth + "px";
    mirror.style.height = inp.offsetHeight + "px";
    mirror.style.font = cs.font;
    mirror.style.letterSpacing = cs.letterSpacing;
    mirror.style.padding = cs.padding;
    mirror.style.lineHeight = cs.lineHeight;
    mirror.style.color = cs.color;
    mirror.style.display = "flex";
    mirror.innerHTML = "";
    var spans = [];
    for (var i = 0; i < val.length; i++) {
      var b = document.createElement("b");
      b.textContent = val.charAt(i) === " " ? "\u00A0" : val.charAt(i);
      if (startHidden) b.className = "done";
      mirror.appendChild(b);
      spans.push(b);
    }
    return spans;
  }

  function prepStitch(stitch, X0, W, H) {
    stitch.setAttribute("viewBox", "0 0 " + W + " " + H);
    stitch.style.left = X0 + "px";   /* start at the TEXT zone — never on the lock icon */
    stitch.style.width = W + "px";
    stitch.style.display = "block";
    var mid = (H / 2).toFixed(1);
    var d = "M2 " + mid + " Q " + (W * 0.3).toFixed(1) + " " + (H / 2 - 3.5).toFixed(1) +
      " " + (W * 0.55).toFixed(1) + " " + (H / 2 + 0.5).toFixed(1) + " T " + (W - 2) + " " + (H / 2 - 1.5).toFixed(1);
    $("pwStitchPath").setAttribute("d", d);
    $("pwStitchGlow").setAttribute("d", d);
  }

  /* theater geometry — everything is INPUT-relative: the stitch, the
     machine sweep and the ripper all live INSIDE the text zone and never
     touch the lock icon on the left or the eye toggle on the right.
     (R24 fix: the stitch used to start at field x=2, crossing the lock.) */
  function theaterGeom() {
    var inp = $("lgPass"), field = $("lgPwField"), eye = $("lgEye");
    var X0 = inp.offsetLeft;
    /* the eye toggle floats over the input's right end — the fabric
       (stitch zone) must stop BEFORE it, not run underneath it */
    var eyeL = eye && eye.offsetLeft ? eye.offsetLeft : field.clientWidth - 46;
    var W = Math.max(40, eyeL - X0 - 12);
    var H = field.clientHeight;
    return { X0: X0, W: W, H: H, FW: field.clientWidth };
  }

  /* ---- sew: machine rides ON TOP of the field (only the needle dips
          in), gold stitches grow, characters fade under them one by one ---- */
  function runSew() {
    var inp = $("lgPass"), field = $("lgPwField"), theater = $("pwTheater");
    var mirror = $("pwMirror"), stitch = $("pwStitchSvg");
    var mach = $("pwMach"), rip = $("pwRip"), threadEl = $("pwThread"), threadPath = $("pwThreadPath");
    var val = inp.value;
    var G = theaterGeom(), X0 = G.X0, W = G.W, H = G.H, FW = G.FW;
    if (W < 40) { inp.type = "password"; pwVisible = false; field.classList.add("sewn"); syncToggle(); return; }

    inp.type = "password";
    inp.readOnly = true;
    var spans = buildMirror(mirror, inp, val, false);
    var cxs = spans.map(function (b) { return b.offsetLeft + b.offsetWidth / 2; });
    prepStitch(stitch, X0, W, H);
    stitch.style.clipPath = "inset(0 " + (W + 16) + "px 0 0)";
    rip.style.display = "none";
    mach.style.left = X0 + "px";
    mach.style.top = (H / 2 + 2 - NEEDLE_TIP).toFixed(1) + "px"; /* plate above the field, tip at the stitch line */
    threadEl.setAttribute("viewBox", "0 0 " + FW + " " + H);
    theater.classList.add("run");
    field.classList.add("stitching");
    setStatus("lg_status_hide");

    var DUR = 1020 + SLOW, t0 = null;   /* R25: 680 → 1020ms base */
    function end() {
      animating = false; curEnd = null;
      stitch.style.clipPath = "inset(0 0 0 0)";
      theater.classList.remove("run");
      field.classList.remove("stitching");
      mirror.style.display = "none"; mirror.innerHTML = "";
      inp.readOnly = false;
      threadPath.setAttribute("d", "");
      pwVisible = false;
      field.classList.add("sewn");
      syncToggle();
      setStatus(null);
    }
    curEnd = end;
    animating = true;
    function frame(t) {
      if (t0 === null) t0 = t;
      var p = Math.min(1, (t - t0) / DUR);
      var e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      var x = -16 + e * (W + 26);
      stitch.style.clipPath = "inset(0 " + Math.max(0, W - x).toFixed(1) + "px 0 0)";
      mach.style.transform = "translateX(" + (x - NEEDLE_X).toFixed(1) + "px)";
      /* trailing thread from the spool down to the needle point */
      var sx = X0 + (x - NEEDLE_X) + 40, nx = X0 + x;
      threadPath.setAttribute("d",
        "M " + sx.toFixed(1) + " -66 C " + (sx - 26).toFixed(1) + " -54, " + (nx - 16).toFixed(1) + " -6, " + nx.toFixed(1) + " " + (H / 2 + 2).toFixed(1));
      for (var i = 0; i < spans.length; i++) {
        if (cxs[i] <= x + 6 && !spans[i].classList.contains("done")) spans[i].classList.add("done");
      }
      if (p < 1 && animating) requestAnimationFrame(frame);
      else end();
    }
    requestAnimationFrame(frame);
  }

  /* ---- unpick: seam ripper sweeps L→R removing stitches, characters
          reappear behind the cleared sections ---- */
  function runReveal() {
    var inp = $("lgPass"), field = $("lgPwField"), theater = $("pwTheater");
    var mirror = $("pwMirror"), stitch = $("pwStitchSvg");
    var mach = $("pwMach"), rip = $("pwRip"), threadPath = $("pwThreadPath");
    var val = inp.value;
    var G = theaterGeom(), X0 = G.X0, W = G.W, H = G.H;
    if (W < 40) { inp.type = "text"; pwVisible = true; field.classList.remove("sewn"); syncToggle(); return; }

    inp.readOnly = true;
    var spans = buildMirror(mirror, inp, val, true);
    var cxs = spans.map(function (b) { return b.offsetLeft + b.offsetWidth / 2; });
    prepStitch(stitch, X0, W, H);
    stitch.style.clipPath = "inset(0 0 0 0)";
    mach.style.display = "none";
    rip.style.display = "block";
    rip.style.left = X0 + "px";
    rip.style.top = (H / 2 - 47).toFixed(1) + "px"; /* hook tip on the stitch line */
    theater.classList.add("rip");
    setStatus("lg_status_show");

    var DUR = 940 + SLOW, t0 = null;   /* R25: 620 → 940ms base */
    function end() {
      animating = false; curEnd = null;
      stitch.style.display = "none";
      theater.classList.remove("rip");
      mirror.style.display = "none"; mirror.innerHTML = "";
      rip.style.display = "none";
      mach.style.display = "";
      inp.readOnly = false;
      inp.type = "text";
      threadPath.setAttribute("d", "");
      pwVisible = true;
      field.classList.remove("sewn");
      syncToggle();
      setStatus(null);
    }
    curEnd = end;
    animating = true;
    function frame(t) {
      if (t0 === null) t0 = t;
      var p = Math.min(1, (t - t0) / DUR);
      var e = 1 - Math.pow(1 - p, 2.2);
      var x = -12 + e * (W + 14);
      stitch.style.clipPath = "inset(0 0 0 " + Math.max(0, Math.min(x, W)).toFixed(1) + "px)";
      rip.style.transform = "translateX(" + (x - RIP_X).toFixed(1) + "px)";
      for (var i = 0; i < spans.length; i++) {
        if (cxs[i] <= x + 6 && spans[i].classList.contains("done")) spans[i].classList.remove("done");
      }
      if (p < 1 && animating) requestAnimationFrame(frame);
      else end();
    }
    requestAnimationFrame(frame);
  }

  function finishTheater() { if (animating && curEnd) { var f = curEnd; animating = false; f(); } }

  /* a typed-but-hidden password looks sewn shut at rest — the first
     unpick then has real stitches to remove */
  function staticStitch(show) {
    var field = $("lgPwField"), stitch = $("pwStitchSvg"), inp = $("lgPass");
    if (!field || !stitch) return;
    if (animating) return;
    if (show && inp && inp.value) {
      var G = theaterGeom();
      if (G.W < 40) return;
      prepStitch(stitch, G.X0, G.W, G.H);
      stitch.style.clipPath = "inset(0 0 0 0)";
    } else {
      stitch.style.display = "none";
    }
  }

  function togglePw() {
    var inp = $("lgPass"), field = $("lgPwField");
    if (animating) { finishTheater(); return; }
    var wantVisible = !pwVisible;
    var val = inp.value;
    if ((RM && RM.matches) || !val) {
      inp.type = wantVisible ? "text" : "password";
      pwVisible = wantVisible;
      field.classList.toggle("sewn", !pwVisible);
      staticStitch(!pwVisible);
      syncToggle();
      return;
    }
    if (wantVisible) runReveal(); else runSew();
  }

  /* ============================================================
     login screen chrome
     ============================================================ */
  function closeAppModals() {
    ["setPop", "usPop", "drill"].forEach(function (id) {
      var el = $(id);
      if (el) el.classList.remove("on");
    });
    var cp = $("cmpPop");
    if (cp) cp.classList.remove("on");
  }

  function showLogin() {
    me = null;
    closeAppModals();
    document.title = I18N.t("brand_name");   /* R42: العنوان بيقول أنا فين */
    /* R37: leaving via logout also drops the الاتزان surface — the login
       screen must never sit on top of a hidden shell mode */
    if (window.MaribManpower && MaribManpower.hide) { try { MaribManpower.hide(); } catch (e) { } }
    if (mgEl && !mgEl.hidden) hideModeGate();
    refreshChrome();
    loginEl.classList.add("on");
    document.body.classList.add("lg-locked");
    var shell = document.querySelector(".shell");
    if (shell) {
      try { shell.inert = true; } catch (e) { }
      shell.setAttribute("aria-hidden", "true");
    }
    document.title = T("brand_name");
    /* R26: the login screen starts truly EMPTY — no remembered username,
       no password, no ticked تذكرني, no sewn-stitch leftovers. One quick
       delayed pass (300ms) defeats the browser's load-time autofill, but
       it stays AWAY from a field the user is already typing in. */
    function blankLogin(force) {
      var u = $("lgUser"), p = $("lgPass"), rm = $("lgRemember");
      var typing = (document.activeElement === u) || (document.activeElement === p);
      if (typing && !force) return;
      if (u) u.value = "";
      if (p) p.value = "";
      if (rm) rm.checked = false;
      pwVisible = false;
      var fld = $("lgPwField");
      if (fld) fld.classList.add("sewn");
      var st = $("pwStitchSvg"); if (st) st.style.display = "none";
      syncToggle();
    }
    blankLogin(true);
    setTimeout(function () { blankLogin(false); }, 300);
    /* R25: React's hydration can restore the SSR <title> a moment AFTER
       the vanilla script already set it (a dev-mode race). Re-assert the
       login title once more — by then hydration has settled for good. */
    setTimeout(function () { if (!me) document.title = T("brand_name"); }, 900);
    setTimeout(function () { var u = $("lgUser"); if (u) { try { u.focus(); } catch (e) { } } }, 130);
  }

  function hideLogin() {
    loginEl.classList.add("bye");
    setTimeout(function () { loginEl.classList.remove("on", "bye"); }, 620);
    document.body.classList.remove("lg-locked");
    var shell = document.querySelector(".shell");
    if (shell) {
      try { shell.inert = false; } catch (e) { }
      shell.removeAttribute("aria-hidden");
    }
  }

  function enterApp(fresh) {
    hideLogin();
    refreshChrome();
    if (fresh && me) toast(T("us_hello") + me.username, "ok");
    /* R37: after login the user picks the surface — تحليل الأداء (the
       existing dashboard) or الاتزان (the manpower hierarchy). The
       gate re-opens any time from the topbar ⇄ button. */
    showModeGate();
  }

  /* ============================================================
     R37 — mode gate (تحليل الأداء / الاتزان)
     ============================================================ */
  var mgEl = null;
  function showModeGate() {
    if (!mgEl) mgEl = $("modeGate");
    if (!mgEl) {
      /* skeleton without the gate (older cache) — straight to the dashboard */
      if (window.App && App.enterDash) App.enterDash();
      return;
    }
    mgEl.hidden = false;
    document.title = I18N.t("th_gate_title") + " — " + I18N.t("brand_name");   /* R42 */
    /* entrance animation on the next frame so display→opacity transitions run */
    requestAnimationFrame(function () { mgEl.classList.add("on"); });
  }
  function hideModeGate() {
    if (!mgEl) mgEl = $("modeGate");
    if (!mgEl) return;
    mgEl.classList.remove("on");
    setTimeout(function () { if (!mgEl.classList.contains("on")) mgEl.hidden = true; }, 260);
  }
  function bindModeGate() {
    var d = $("mgDash"), m = $("mgMp");
    if (d) d.addEventListener("click", function () {
      hideModeGate();
      if (window.App && App.enterDash) App.enterDash();
    });
    if (m) m.addEventListener("click", function () {
      hideModeGate();
      if (window.MaribManpower && MaribManpower.show) MaribManpower.show();
    });
  }

  function refreshChrome() {
    var chip = $("userChip");
    if (chip) {
      if (me) {
        var ucAv = $("ucAv");
        if (ucAv) {
          ucAv.textContent = (me.username.charAt(0) || "?").toUpperCase();
          ucAv.style.backgroundImage = "";
          ucAv.classList.remove("photo");
        }
        /* review#8: guard every chrome node the same way */
        var ucName = $("ucName"); if (ucName) ucName.textContent = me.username;
        var t = $("ucTitle");
        if (t) {
          var tt = String(me.title || "").trim();
          t.textContent = tt;
          t.hidden = !tt;
        }
        var r = $("ucRole");
        if (r) {
          r.textContent = T(roleKey(me.role));
          r.className = "uc-role " + me.role;
        }
        /* R27 fix: the stylesheet base is .user-chip{display:none} — an
           empty inline style falls back to it, so the chip NEVER showed
           (a pre-existing bug since R23: "flex" is required to reveal) */
        chip.style.display = "flex";
      } else chip.style.display = "none";
    }
    var b = $("btnUsers"), o = $("btnLogout"), g = $("btnSettings");
    if (b) b.style.display = isAdmin(me) ? "" : "none";
    if (o) o.style.display = me ? "" : "none";
    if (g) g.style.display = me ? "" : "none";
    /* R26/R27: photo circle + name + job title (title row, topbar chip) */
    if (window.MaribMe) { try { window.MaribMe.set(me); } catch (e) { } }
  }

  /* ============================================================
     users & roles modal — server-backed (/api/users)
     R27: every row carries photo + title controls (admin-only modal,
     so only admins ever reach them — the server re-checks anyway):
       · clicking the avatar (camera badge) → photo editor row
       · the tag icon → title editor row (مدير الإنتاج …)
     ============================================================ */
  var users = [];
  function loadUsers() {
    return MaribCloud.usersList().then(function (r) {
      users = r.users || [];
      buildUsList();
    }).catch(function (e) {
      toast(e && e.status === 403 ? T("us_no_admin") : T("toast_sync_err"), "err");
    });
  }

  /* R27 client-side photo pipeline — small on the server, crisp on
     screen:
       1. center-crop to a SQUARE (faces fill the circle, no distortion)
       2. scale to 240×240 (largest display is 64px → 240px stays sharp
          even on 2× retina; never upscales a small source)
       3. adaptive JPEG quality: 0.85 → 0.72 → 0.6, stop as soon as the
          data URL ≤ ~32K chars (~24KB) — typically 8-20KB per photo,
          hundreds of photos still fit the Neon plan */
  function resizePhotoSquare(file, cb) {
    var img = new Image();
    var url = URL.createObjectURL(file);
    var done = false;
    /* review#3: a decode that never fires must not hang the UI silently */
    var timer = setTimeout(function () { finish(null); }, 15000);
    function finish(out) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      URL.revokeObjectURL(url);
      cb(out);
    }
    img.onload = function () {
      try {
        var MAX = 240;
        var iw = img.width || MAX, ih = img.height || MAX;
        var side = Math.min(iw, ih);
        var s = Math.min(1, MAX / side);
        var w = Math.max(1, Math.round(side * s));
        var sx = (iw - side) / 2, sy = (ih - side) / 2;
        var cv = document.createElement("canvas");
        cv.width = w; cv.height = w;
        var cx = cv.getContext("2d");
        cx.fillStyle = "#FFFFFF";
        cx.fillRect(0, 0, w, w);
        cx.imageSmoothingEnabled = true;
        if (cx.imageSmoothingQuality) cx.imageSmoothingQuality = "high";
        cx.drawImage(img, sx, sy, side, side, 0, 0, w, w);
        var QS = [0.85, 0.72, 0.6];
        var out = null;
        for (var i = 0; i < QS.length; i++) {
          out = cv.toDataURL("image/jpeg", QS[i]);
          if (out && out.length <= 32000) break;
        }
        /* review#6: the callback runs OUTSIDE the try so a throwing
           caller can't trigger the catch's second cb(null) */
        var res = out;
        setTimeout(function () { finish(res); }, 0);
      } catch (e) { finish(null); }
    };
    img.onerror = function () { finish(null); };
    img.src = url;
  }

  /* keep the signed-in `me` object + chrome in sync when an admin
     (typically editing their own row) changes photo/title */
  function syncMeAfterEdit(username, patch) {
    if (me && me.username === username) {
      if (patch.photo !== undefined) me.photo = patch.photo;
      if (patch.title !== undefined) me.title = patch.title;
      refreshChrome();
    }
  }

  function buildUsList() {
    var list = $("usList");
    if (!list) return;
    list.innerHTML = "";
    var devNote = document.createElement("p");
    devNote.className = "us-dev-note on";
    devNote.textContent = T("us_hint_dev");
    list.appendChild(devNote);
    users.forEach(function (u) {
      var isDev = u.role === "dev";
      var isMe = me && u.username === me.username;
      var uid = u.id;
      var titleTxt = String(u.title || "").trim();
      /* review#4: escape the role for class attrs (defense in depth) */
      var roleCls = esc(u.role);
      /* review#2: a NON-dev admin can never patch the dev account —
         the server rejects it (dev-fixed), so don't even offer it.
         NOTE: the local `isDev` boolean shadows the outer isDev()
         helper here, so the signed-in role is checked inline. */
      var devLocked = isDev && !(me && me.role === "dev");
      var lockAttrs = devLocked ? " disabled" : "";
      var lockStyle = devLocked ? " style=\"opacity:.38\"" : "";
      var block = document.createElement("div");
      block.className = "us-item";
      block.innerHTML =
        '<div class="us-row">' +
          '<span class="us-av ' + roleCls + '" role="button" tabindex="' + (devLocked ? "-1" : "0") + '" title="' + esc(T("us_cam")) + '"><i class="us-av-cam">' + CAM_SVG + '</i><span class="us-av-txt"></span></span>' +
          '<div class="us-mid">' +
            '<div class="us-nm"><b>' + esc(u.username) + '</b>' + (isMe ? '<span class="us-you">' + esc(T("us_you")) + '</span>' : "") + '</div>' +
            '<div class="us-meta"><span class="us-role ' + roleCls + '">' + esc(T(roleKey(u.role))) + '</span>' +
            (titleTxt ? '<span class="us-title">' + esc(titleTxt) + '</span>' : "") + '</div>' +
          '</div>' +
          '<div class="us-acts">' +
            '<label class="us-sw" title="' + esc(T("us_admin_lbl")) + '">' +
              '<input type="checkbox"' + (isAdmin({ role: u.role }) ? " checked" : "") + (isDev ? " disabled" : "") + '><i></i>' +
            '</label>' +
            '<button class="us-ic ttl" type="button" title="' + esc(T("us_ttl")) + '"' + lockAttrs + lockStyle + '>' + TAG_SVG + '</button>' +
            '<button class="us-ic chg" type="button" title="' + esc(T("us_chg")) + '"' + lockAttrs + lockStyle + '>' + KEY_SVG + '</button>' +
            '<button class="us-ic del" type="button" title="' + esc(T("us_del")) + '"' + ((isDev || isMe) ? " disabled" : "") + '>' + TRASH_SVG + '</button>' +
          '</div>' +
        '</div>' +
        /* R27: title editor row */
        '<div class="us-sub us-ttl-row">' +
          '<input type="text" maxlength="40" placeholder="' + esc(T("us_ttl_ph")) + '">' +
          '<button class="us-save" type="button">' + esc(T("us_save")) + '</button>' +
          '<button class="us-cancel" type="button">' + esc(T("us_cancel")) + '</button>' +
        '</div>' +
        /* R27: photo editor row */
        '<div class="us-sub us-img-row">' +
          '<span class="us-av prev ' + roleCls + '"><span class="us-av-txt"></span></span>' +
          '<div class="us-img-mid">' +
            '<p class="set-hint">' + esc(T("ph_hint_u")) + '</p>' +
            '<div class="pf-btns">' +
              '<button class="pf-btn" type="button">' + esc(T("pf_pick")) + '</button>' +
              '<button class="pf-btn del" type="button">' + esc(T("pf_del")) + '</button>' +
            '</div>' +
          '</div>' +
          '<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden>' +
        '</div>' +
        /* password row (unchanged) */
        '<div class="us-sub us-chg"><input type="text" placeholder="' + esc(T("us_chg_ph")) + '"><button class="us-save" type="button">' + esc(T("us_save")) + '</button><button class="us-cancel" type="button">' + esc(T("us_cancel")) + '</button></div>';

      var sw = block.querySelector(".us-sw input");
      var avEl = block.querySelector(".us-row > .us-av");
      var prevEl = block.querySelector(".us-img-row .prev");
      var avTxt = block.querySelector(".us-row .us-av-txt");
      var prevTxt = block.querySelector(".us-img-row .us-av-txt");
      [avTxt, prevTxt].forEach(function (tx) { if (tx) tx.textContent = (u.username.charAt(0) || "?").toUpperCase(); });
      if (u.photo) {
        [avEl, prevEl].forEach(function (el) {
          if (el) { el.classList.add("photo"); el.style.backgroundImage = 'url("' + u.photo + '")'; }
        });
      }

      /* only ONE expandable row at a time (same behaviour as chg) */
      function closeSubs() {
        block.querySelectorAll(".us-sub.on").forEach(function (x) { x.classList.remove("on"); });
      }

      sw.addEventListener("change", function () {
        MaribCloud.userUpdate(uid, { role: sw.checked ? "admin" : "user" }).then(function () {
          loadUsers();
          toast(T("us_toast_saved"), "ok");
        }).catch(function (e) { toast(e && e.status === 403 ? T("us_no_admin") : T("us_toast_bad"), "err"); });
      });

      /* ---- title editor ---- */
      var ttlBtn = block.querySelector(".us-ic.ttl");
      var ttlRow = block.querySelector(".us-ttl-row");
      var ttlInput = ttlRow.querySelector("input");
      ttlBtn.addEventListener("click", function () {
        var open = ttlRow.classList.contains("on");
        closeSubs();
        ttlRow.classList.toggle("on", !open);
        if (!open) { ttlInput.value = titleTxt; try { ttlInput.focus(); } catch (e) { } }
      });
      ttlRow.querySelector(".us-save").addEventListener("click", function () {
        var v = ttlInput.value.replace(/[\u0000-\u001F\u007F]/g, "").trim();
        if (v.length > 40) { toast(T("us_ttl_bad"), "err"); return; }
        MaribCloud.userTitle(uid, v).then(function () {
          ttlRow.classList.remove("on");
          syncMeAfterEdit(u.username, { title: v });
          loadUsers();
          toast(T("us_ttl_saved"), "ok");
        }).catch(function (e) { toast(e && e.status === 403 ? T("us_no_admin") : T("us_toast_bad"), "err"); });
      });
      ttlRow.querySelector(".us-cancel").addEventListener("click", function () { ttlRow.classList.remove("on"); });

      /* ---- photo editor (avatar click + camera badge) ---- */
      var imgRow = block.querySelector(".us-img-row");
      var fileInp = imgRow.querySelector('input[type="file"]');
      var pickBtn = imgRow.querySelector(".pf-btn:not(.del)");
      var delBtn = imgRow.querySelector(".pf-btn.del");
      function openImgRow() {
        var open = imgRow.classList.contains("on");
        closeSubs();
        imgRow.classList.toggle("on", !open);
      }
      /* review#9: both click paths open the same row — one handler */
      avEl.addEventListener("click", function () {
        if (devLocked) { toast(T("us_toast_nodel"), "err"); return; }
        openImgRow();
      });
      avEl.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openImgRow(); }
      });
      pickBtn.addEventListener("click", function () { fileInp.click(); });
      fileInp.addEventListener("change", function (e) {
        var f = e.target.files && e.target.files[0];
        e.target.value = "";
        if (!f) return;
        /* review#7: raster formats only — SVG has no intrinsic size and
           can turn the square crop into a blank white upload */
        if (!/^image\/(png|jpe?g|webp|gif)$/i.test(f.type)) { toast(T("pf_bad"), "err"); return; }
        resizePhotoSquare(f, function (dataUrl) {
          if (!dataUrl || dataUrl.length < 200) { toast(T("pf_bad"), "err"); return; }
          MaribCloud.userPhoto(uid, dataUrl).then(function () {
            [avEl, prevEl].forEach(function (el) {
              if (el) { el.classList.add("photo"); el.style.backgroundImage = 'url("' + dataUrl + '")'; }
            });
            syncMeAfterEdit(u.username, { photo: dataUrl });
            toast(T("ph_saved_u") + " · " + Math.round(dataUrl.length * 3 / 4 / 1024) + " KB", "ok");
          }).catch(function (err) {
            toast(err && err.status === 403 ? T("us_no_admin") : T("toast_sync_err"), "err");
          });
        });
      });
      delBtn.addEventListener("click", function () {
        MaribCloud.userPhoto(uid, "").then(function () {
          [avEl, prevEl].forEach(function (el) {
            if (el) { el.classList.remove("photo"); el.style.backgroundImage = ""; }
          });
          syncMeAfterEdit(u.username, { photo: "" });
          toast(T("ph_none_u"), "ok");
        }).catch(function (err) {
          toast(err && err.status === 403 ? T("us_no_admin") : T("toast_sync_err"), "err");
        });
      });

      /* ---- password row (unchanged) ---- */
      var chgBtn = block.querySelector(".us-ic.chg");
      var chgBox = block.querySelector(".us-chg");
      var chgInput = chgBox.querySelector("input");
      chgBtn.addEventListener("click", function () {
        var open = chgBox.classList.contains("on");
        closeSubs();
        chgBox.classList.toggle("on", !open);
        if (!open) { chgInput.value = ""; try { chgInput.focus(); } catch (e) { } }
      });
      chgBox.querySelector(".us-save").addEventListener("click", function () {
        var v = chgInput.value;
        if (v.length < 4) { toast(T("us_toast_bad"), "err"); return; }
        MaribCloud.userUpdate(uid, { password: v }).then(function () {
          chgBox.classList.remove("on");
          toast(T("us_toast_saved"), "ok");
        }).catch(function (e) { toast(e && e.status === 403 ? T("us_no_admin") : T("us_toast_bad"), "err"); });
      });
      chgBox.querySelector(".us-cancel").addEventListener("click", function () { chgBox.classList.remove("on"); });

      var delBtn2 = block.querySelector(".us-ic.del");
      delBtn2.addEventListener("click", function () {
        if (isDev || isMe) { toast(T("us_toast_nodel"), "err"); return; }
        if (!delBtn2.classList.contains("confirm")) {
          delBtn2.classList.add("confirm");
          delBtn2.textContent = T("us_del_cf");
          setTimeout(function () {
            if (delBtn2.isConnected) {
              delBtn2.classList.remove("confirm");
              delBtn2.innerHTML = TRASH_SVG;
            }
          }, 2600);
          return;
        }
        MaribCloud.userDelete(uid).then(function () {
          loadUsers();
          toast(T("us_toast_del"), "ok");
        }).catch(function (e) { toast(e && e.status === 403 ? T("us_no_admin") : T("us_toast_del"), "err"); });
      });

      list.appendChild(block);
    });
  }

  function bindUsers() {
    var pop = $("usPop");
    if (!pop) return;
    function openUs() {
      if (!isAdmin(me)) { toast(T("us_no_admin")); return; }
      loadUsers();
      pop.classList.add("on");
    }
    function closeUs() { pop.classList.remove("on"); }
    var bu = $("btnUsers");
    if (bu) bu.addEventListener("click", openUs);
    var chip = $("userChip");
    if (chip) chip.addEventListener("click", openUs);
    $("usClose").addEventListener("click", closeUs);
    pop.addEventListener("click", function (e) { if (e.target === pop) closeUs(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeUs(); });

    $("usAddBtn").addEventListener("click", function () {
      var name = $("usName").value.trim();
      var pw = $("usPass").value;
      if (name.length < 2 || pw.length < 4) { toast(T("us_toast_bad"), "err"); return; }
      MaribCloud.userCreate(name, pw, $("usAdmin").checked).then(function () {
        $("usName").value = ""; $("usPass").value = ""; $("usAdmin").checked = false;
        loadUsers();
        toast(T("us_toast_added"), "ok");
      }).catch(function (e) {
        var m = e && e.status === 409 ? T("us_toast_dup") : e && e.status === 403 ? T("us_no_admin") : T("us_toast_bad");
        toast(m, "err");
      });
    });

    /* logout — server-side cookie clear + back to the login screen.
       No location.reload(): a brand-new tab therefore loads ONCE and
       settles instantly (R24 #12). R26: the stay flags go too — the
       next open asks for the login again. */
    var lo = $("btnLogout");
    if (lo) lo.addEventListener("click", function () {
      var done = function () {
        me = null;
        clearStay();
        toast(T("toast_logout"), "ok");
        showLogin();
      };
      MaribCloud.logout().then(done).catch(done);
    });
  }

  /* ============================================================
     login form + parallax
     ============================================================ */
  function bindLogin() {
    $("lgForm").addEventListener("submit", function (e) {
      e.preventDefault();
      if (animating) finishTheater();
      var name = $("lgUser").value.trim();
      var pw = $("lgPass").value;
      var err = $("lgErr");
      var btn = $("lgSubmit");
      function bad(msg) {
        err.textContent = msg;
        err.classList.add("on");
        cardEl.classList.remove("shake");
        void cardEl.offsetWidth;
        cardEl.classList.add("shake");
      }
      function resetPw() {
        var ip = $("lgPass");
        ip.value = "";
        pwVisible = false;
        $("lgPwField").classList.add("sewn");
        var st = $("pwStitchSvg"); if (st) st.style.display = "none";
        syncToggle();
        try { ip.focus(); } catch (e2) { }
      }
      if (!name || !pw) { bad(T("lg_err_fill")); return; }
      btn.disabled = true;
      MaribCloud.login(name, pw, $("lgRemember").checked).then(function (r) {
        btn.disabled = false;
        me = r.user;
        setStay($("lgRemember").checked);   /* R26 — the تذكرني rule */
        err.classList.remove("on");
        enterApp(true);
      }).catch(function (e2) {
        btn.disabled = false;
        bad(T("lg_err"));
        resetPw();
      });
    });

    var eye = $("lgEye");
    if (eye) eye.addEventListener("click", togglePw);

    /* typed-while-hidden → keep the sewn look over the dots */
    var pwInp = $("lgPass");
    if (pwInp) pwInp.addEventListener("input", function () {
      if (!pwVisible) staticStitch(true);
    });

    var fg = $("lgForgot");
    if (fg) fg.addEventListener("click", function (e) {
      e.preventDefault();
      toast(T("lg_forgot_note"));
    });

    document.querySelectorAll("#lgLang button").forEach(function (b) {
      b.addEventListener("click", function () { I18N.setLang(b.getAttribute("data-lg")); });
    });

    I18N.onChange(function () {
      refreshChrome();
      syncToggle();
      if (!me) document.title = T("brand_name");
    });
  }

  function bindParallax() {
    if (!window.matchMedia) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || matchMedia("(pointer: coarse)").matches) return;
    var root = $("loginScreen");
    /* R24 perf: coalesce mousemove into one write per frame */
    var pendX = 0, pendY = 0, pxRaf = 0;
    root.addEventListener("mousemove", function (e) {
      var r = root.getBoundingClientRect();
      pendX = ((e.clientX - r.left) / r.width - 0.5) * 2;
      pendY = ((e.clientY - r.top) / r.height - 0.5) * 2;
      if (!pxRaf) pxRaf = requestAnimationFrame(function () {
        pxRaf = 0;
        root.style.setProperty("--px", pendX.toFixed(3));
        root.style.setProperty("--py", pendY.toFixed(3));
      });
    });
    root.addEventListener("mouseleave", function () {
      root.style.setProperty("--px", "0");
      root.style.setProperty("--py", "0");
    });
  }

  function veilOff() {
    var v = $("bootVeil");
    if (v) v.classList.add("off");
  }

  /* R42 — إصلاح سباق الـ hydration: القرار (دخول/بوابة/شاشة الدخول)
     كان بيتم أحيانًا قبل ما React يخلص hydration فيمسح الكلاسات اللي
     اتعدلت. التأجيل لما بعد load بيضمن إن أي تعديل DOM بيثبت.
     (كان موجود من R23 لكن ظهر لما الـ API بقى أسرع من الـ hydration) */
  function whenSettled(fn) {
    if (document.readyState === "complete") setTimeout(fn, 120);
    else window.addEventListener("load", function () { setTimeout(fn, 150); });
  }

  /* ---------------- boot ---------------- */
  function boot() {
    loginEl = $("loginScreen");
    cardEl = loginEl ? loginEl.querySelector(".lg-card") : null;
    if (!loginEl) { veilOff(); return; }
    /* real company logo on the login leather patch (static file) */
    try {
      var lgLogo = $("lgCoLogo");
      if (lgLogo) { lgLogo.src = "/app/logo.png"; lgLogo.alt = ""; }
    } catch (e) { }
    pwVisible = false;
    $("lgPwField").classList.add("sewn");
    syncToggle();
    bindLogin();
    bindUsers();
    bindParallax();
    bindModeGate();   /* R37: تحليل الأداء / الاتزان chooser */
    /* R26: link-opened tabs (right-click / Ctrl / middle-click on the nav
       links) arrive with ?_st=<token>. Chromium does NOT copy this tab's
       sessionStorage to them (only window.open / target=_blank get a
       copy), so the token is the bridge: match it against the shared
       localStorage copy → adopt the session, then strip _st from the
       visible URL. A typed/bookmarked URL has no _st → login gate. */
    try {
      var qs = new URLSearchParams(location.search);
      var stTok = qs.get("_st");
      if (stTok) {
        if (stTok === (localStorage.getItem("marib_link") || "")) {
          sessionStorage.setItem(STAY_KEY, "1");
        }
        qs.delete("_st");
        var clean = qs.toString();
        history.replaceState(null, "", clean ? "?" + clean : location.pathname);
      }
    } catch (e) { }
    /* session check against the server — the login screen is never
       shown before this resolves (no flash, R23 #5). R26: a session
       cookie WITHOUT تذكرني only lives inside the current browser
       session (sessionStorage flag); a fresh open of the site drops
       it and asks for the login again. */
    MaribCloud.session().then(function (r) {
      me = r && r.user;
      if (me && !stayAllowed()) {
        me = null;
        MaribCloud.logout().catch(function () { });
        showLogin();
      } else if (me) enterApp(false);
      else showLogin();
      veilOff();
    }).catch(function () {
      showLogin();
      veilOff();
    });
  }

  /* R42: البووت كله بعد ما الـ hydration يخلص — أي ربط أو تعديل DOM
     قبل كده ممكن React يمسحه لو أعاد بناء الشجرة (السباق اللي كان
     مخفي شاشة الدخول/البوابة أحيانًا — الـ API بيرجع أسرع من الـ
     hydration في السيرفر السريع). */
  document.addEventListener("DOMContentLoaded", function () { whenSettled(boot); });

  var __authApi42 = {
    login: showLogin,
    logout: function () {
      var done = function () { showLogin(); };
      clearStay();
      MaribCloud.logout().then(done).catch(done);
    },
    togglePw: togglePw,
    me: function () { return me; },
    isAdmin: function () { return isAdmin(me); },
    isDev: function () { return isDev(me); },
    veilOff: veilOff,
    /* R37: both surfaces reopen the mode gate through this handle */
    showGate: showModeGate,
    hideGate: hideModeGate   /* R43: enterDash يقفلها لو الدخول من زراير البوابة */,
    hideGate: hideModeGate   /* R43: enterDash يقفلها لو الدخول من زراير البوابة */
  };
  window.__maribAuth42 = __authApi42;
  return __authApi42;
})();
