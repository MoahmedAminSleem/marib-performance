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
  var T = I18N.t;
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }

  var KEY_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="7.5" cy="15.5" r="4"/><path d="M11 12 20 3M16.5 6.5l3.5 3.5M13.5 9.5l2.5 2.5"/></svg>';
  var TRASH_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9.5 7V5q0-1 1-1h3q1 0 1 1v2M6.5 7l1 13q0 .5.5.5h8q.5 0 .5-.5l1-13"/><path d="M10 11v6M14 11v6"/></svg>';

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
  var me = null; /* {uid, username, role} — from the signed session cookie */
  var loginEl = null, cardEl = null;
  function isAdmin(u) { return !!u && (u.role === "dev" || u.role === "admin"); }
  function isDev(u) { return !!u && u.role === "dev"; }
  function roleKey(r) { return r === "dev" ? "us_role_dev" : r === "admin" ? "us_role_admin" : "us_role_user"; }

  /* ============================================================
     password theater — machine sews, ripper unpicks
     ============================================================ */
  var pwVisible = false, animating = false, curEnd = null;
  var RM = window.matchMedia ? matchMedia("(prefers-reduced-motion: reduce)") : null;
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

    var DUR = 680 + SLOW, t0 = null;
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

    var DUR = 620 + SLOW, t0 = null;
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
    refreshChrome();
    loginEl.classList.add("on");
    document.body.classList.add("lg-locked");
    var shell = document.querySelector(".shell");
    if (shell) {
      try { shell.inert = true; } catch (e) { }
      shell.setAttribute("aria-hidden", "true");
    }
    document.title = T("brand_name");
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
    /* cloud data: fetch the server months — the upload prompt only
       appears when the server actually has no months (no flash in between) */
    if (window.App && App.cloudLoad) {
      App.cloudLoad().then(function () {
        if (!App.hasData() && window.App && App.promptData) App.promptData();
      });
    }
    if (window.App && App.updateTitle) App.updateTitle();
  }

  function refreshChrome() {
    var chip = $("userChip");
    if (chip) {
      if (me) {
        $("ucAv").textContent = (me.username.charAt(0) || "?").toUpperCase();
        $("ucName").textContent = me.username;
        var r = $("ucRole");
        r.textContent = T(roleKey(me.role));
        r.className = "uc-role " + me.role;
        chip.style.display = "";
      } else chip.style.display = "none";
    }
    var b = $("btnUsers"), o = $("btnLogout"), g = $("btnSettings");
    if (b) b.style.display = isAdmin(me) ? "" : "none";
    if (o) o.style.display = me ? "" : "none";
    if (g) g.style.display = me ? "" : "none";
  }

  /* ============================================================
     users & roles modal — server-backed (/api/users)
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
      var block = document.createElement("div");
      block.innerHTML =
        '<div class="us-row">' +
          '<span class="us-av ' + u.role + '">' + esc((u.username.charAt(0) || "?").toUpperCase()) + '</span>' +
          '<div class="us-mid">' +
            '<div class="us-nm"><b>' + esc(u.username) + '</b>' + (isMe ? '<span class="us-you">' + esc(T("us_you")) + '</span>' : "") + '</div>' +
            '<span class="us-role ' + u.role + '">' + esc(T(roleKey(u.role))) + '</span>' +
          '</div>' +
          '<div class="us-acts">' +
            '<label class="us-sw" title="' + esc(T("us_admin_lbl")) + '">' +
              '<input type="checkbox"' + (isAdmin({ role: u.role }) ? " checked" : "") + (isDev ? " disabled" : "") + '><i></i>' +
            '</label>' +
            '<button class="us-ic chg" type="button" title="' + esc(T("us_chg")) + '">' + KEY_SVG + '</button>' +
            '<button class="us-ic del" type="button" title="' + esc(T("us_del")) + '"' + ((isDev || isMe) ? " disabled" : "") + '>' + TRASH_SVG + '</button>' +
          '</div>' +
        '</div>' +
        '<div class="us-chg"><input type="text" placeholder="' + esc(T("us_chg_ph")) + '"><button class="us-save" type="button">' + esc(T("us_save")) + '</button><button class="us-cancel" type="button">' + esc(T("us_cancel")) + '</button></div>';

      var sw = block.querySelector(".us-sw input");
      sw.addEventListener("change", function () {
        MaribCloud.userUpdate(uid, { role: sw.checked ? "admin" : "user" }).then(function () {
          loadUsers();
          toast(T("us_toast_saved"), "ok");
        }).catch(function (e) { toast(e && e.status === 403 ? T("us_no_admin") : T("us_toast_bad"), "err"); });
      });

      var chgBtn = block.querySelector(".us-ic.chg");
      var chgBox = block.querySelector(".us-chg");
      var chgInput = chgBox.querySelector("input");
      chgBtn.addEventListener("click", function () {
        var open = chgBox.classList.contains("on");
        document.querySelectorAll(".us-chg.on").forEach(function (x) { x.classList.remove("on"); });
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

      var delBtn = block.querySelector(".us-ic.del");
      delBtn.addEventListener("click", function () {
        if (isDev || isMe) { toast(T("us_toast_nodel"), "err"); return; }
        if (!delBtn.classList.contains("confirm")) {
          delBtn.classList.add("confirm");
          delBtn.textContent = T("us_del_cf");
          setTimeout(function () {
            if (delBtn.isConnected) {
              delBtn.classList.remove("confirm");
              delBtn.innerHTML = TRASH_SVG;
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
       settles instantly (R24 #12). */
    var lo = $("btnLogout");
    if (lo) lo.addEventListener("click", function () {
      var done = function () {
        me = null;
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
    /* session check against the server — the login screen is never
       shown before this resolves (no flash, R23 #5) */
    MaribCloud.session().then(function (r) {
      me = r && r.user;
      if (me) enterApp(false);
      else showLogin();
      veilOff();
    }).catch(function () {
      showLogin();
      veilOff();
    });
  }

  document.addEventListener("DOMContentLoaded", boot);

  return {
    login: showLogin,
    logout: function () {
      var done = function () { showLogin(); };
      MaribCloud.logout().then(done).catch(done);
    },
    togglePw: togglePw,
    me: function () { return me; },
    isAdmin: function () { return isAdmin(me); },
    isDev: function () { return isDev(me); },
    veilOff: veilOff
  };
})();
