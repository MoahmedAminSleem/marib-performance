/* ============================================================
   MaribAuth — round 10
   - Login gate (denim screen) with sewing-machine password
     show/hide animation (stitches sew the field shut, a seam
     ripper unpicks it back)
   - Local users store: developer / admin / user roles
     (default: Amin · developer · full admin rights)
   - Remember-me sessions, logout, user management modal
   Works fully offline next to the app (localStorage only).
   ============================================================ */
var MaribAuth = (function () {
  "use strict";
  var LS_USERS = "marib_users_v1";
  var LS_SESS = "marib_session_v1";
  var T = I18N.t;
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;"); }

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

  /* ---------------- round 21 (online) ----------------
     The SERVER owns authentication: scrypt-hashed passwords in
     PostgreSQL + httpOnly session cookie. This module keeps only a
     display mirror of the signed-in user (me) and re-verifies with
     /api/auth/me on every load. The sewing-machine theater below is
     unchanged — it runs before the request is sent. */

  /* ---------------- session (round 14: survives NEW TABS) ----------------
     remember-me  → localStorage session with no expiry
     without it   → 12h expiry (same workday, still cross-tab) — the
     old per-tab sessionStorage copy is kept for the current tab so
     behavior on reload stays identical */
  var SESS_H = 12;
  function writeSess(name, remember) {
    var o = { u: name, at: Date.now(), exp: remember ? 0 : Date.now() + SESS_H * 3600e3 };
    try {
      sessionStorage.setItem(LS_SESS, JSON.stringify(o));
      localStorage.setItem(LS_SESS, JSON.stringify(o));
    } catch (e) { }
  }
  function readSess() {
    try {
      var raw = sessionStorage.getItem(LS_SESS) || localStorage.getItem(LS_SESS);
      if (!raw) return null;
      var o = JSON.parse(raw);
      if (!o || typeof o.u !== "string") return null;
      if (o.exp && Date.now() > o.exp) { clearSess(); return null; }
      return o;
    } catch (e) { return null; }
  }
  function clearSess() {
    try { sessionStorage.removeItem(LS_SESS); localStorage.removeItem(LS_SESS); } catch (e) { }
  }

  /* ---------------- state ---------------- */
  var users = [], me = null;
  var loginEl = null, cardEl = null;
  function isAdmin(u) { return !!u && (u.role === "dev" || u.role === "admin"); }
  function roleKey(r) { return r === "dev" ? "us_role_dev" : r === "admin" ? "us_role_admin" : "us_role_user"; }

  /* ============================================================
     password theater — machine sews, ripper unpicks
     ============================================================ */
  var pwVisible = false, animating = false, curEnd = null;
  var RM = window.matchMedia ? matchMedia("(prefers-reduced-motion: reduce)") : null;
  var SLOW = 0;
  try { SLOW = parseInt(new URLSearchParams(location.search).get("pwslow"), 10) || 0; } catch (e) { }
  var NEEDLE_X = 62;  /* needle tip x-offset inside the machine svg (86px render) */
  var RIP_X = 17;     /* hook tip x-offset inside the ripper svg (34px render) */
  /* round 14: the stitch covers the TEXT zone of the field — starts
     after the lock icon (the old x=2 start drew gold over the icon and
     hugged the bar's left border, which read as "outside the strip") */
  var X0 = 44;
  /* round 14: faster, silkier theater — 620ms sew / 520ms unpick with
     sine-in-out easing (was 1050/900 + quad). The machine rides on a
     composited layer (translate3d + will-change), the trailing thread
     is mapped 1:1 to real pixels so it actually follows the needle. */
  var DUR_SEW = 620, DUR_RIP = 520;

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

  function prepStitch(stitch, W, H) {
    stitch.setAttribute("viewBox", "0 0 " + W + " " + H);
    stitch.style.width = W + "px";
    stitch.style.display = "block";
    var mid = (H / 2).toFixed(1);
    var span = W - 2 - X0;
    var d = "M" + X0 + " " + mid + " Q " + (X0 + span * 0.3).toFixed(1) + " " + (H / 2 - 3.5).toFixed(1) +
      " " + (X0 + span * 0.55).toFixed(1) + " " + (H / 2 + 0.5).toFixed(1) + " T " + (W - 2) + " " + (H / 2 - 1.5).toFixed(1);
    $("pwStitchPath").setAttribute("d", d);
    $("pwStitchGlow").setAttribute("d", d);
  }

  /* ---- sew: machine sweeps L→R, needle vibrating, gold stitches grow,
          characters fade under the stitches one by one ---- */
  function runSew() {
    var inp = $("lgPass"), field = $("lgPwField"), theater = $("pwTheater");
    var mirror = $("pwMirror"), stitch = $("pwStitchSvg");
    var mach = $("pwMach"), rip = $("pwRip"), threadEl = $("pwThread"), threadPath = $("pwThreadPath");
    var val = inp.value;
    var W = field.clientWidth - 58;
    var H = field.clientHeight;
    if (W < 40) { inp.type = "password"; pwVisible = false; field.classList.add("sewn"); syncToggle(); return; }

    inp.type = "password";
    inp.readOnly = true;
    var spans = buildMirror(mirror, inp, val, false);
    var cxs = spans.map(function (b) { return b.offsetLeft + b.offsetWidth / 2; });
    prepStitch(stitch, W, H);
    stitch.style.clipPath = "inset(0 " + (W + 16) + "px 0 0)";
    rip.style.display = "none";
    /* round 14: 1:1 pixel mapping — the thread svg spans exactly W px
       (it used to be 100% of the field: viewBox scaling shifted every
       point +29px, so the thread never met the needle and poked out
       of the strip at the sweep ends) */
    threadEl.style.width = W + "px";
    threadEl.setAttribute("viewBox", "0 0 " + W + " " + H);
    theater.classList.add("run");
    field.classList.add("stitching");
    setStatus("lg_status_hide");

    var DUR = DUR_SEW + SLOW, t0 = null;
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
      /* easeInOutSine — the smoothest curve for a gliding machine */
      var e = 0.5 - 0.5 * Math.cos(Math.PI * p);
      var x = (X0 - 12) + e * (W + 14 - (X0 - 12));
      stitch.style.clipPath = "inset(0 " + Math.max(0, W - x).toFixed(1) + "px 0 0)";
      mach.style.transform = "translate3d(" + (x - NEEDLE_X).toFixed(1) + "px,0,0)";
      /* trailing thread: spool (behind the machine) down to the needle tip */
      var sx = (x - NEEDLE_X) + 14;
      var ny = Math.min(H - 8, H / 2 + 6);
      threadPath.setAttribute("d",
        "M " + sx.toFixed(1) + " -52 C " + (sx - 14).toFixed(1) + " -40, " + (x - 13).toFixed(1) + " -6, " + x.toFixed(1) + " " + ny.toFixed(1));
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
    var W = field.clientWidth - 58;
    var H = field.clientHeight;
    if (W < 40) { inp.type = "text"; pwVisible = true; field.classList.remove("sewn"); syncToggle(); return; }

    inp.readOnly = true;
    var spans = buildMirror(mirror, inp, val, true);
    var cxs = spans.map(function (b) { return b.offsetLeft + b.offsetWidth / 2; });
    prepStitch(stitch, W, H);
    stitch.style.clipPath = "inset(0 0 0 0)";
    mach.style.display = "none";
    rip.style.display = "block";
    theater.classList.add("rip");
    setStatus("lg_status_show");

    var DUR = DUR_RIP + SLOW, t0 = null;
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
      var e = 1 - Math.pow(1 - p, 3);
      var x = (X0 - 12) + e * (W + 14 - (X0 - 12));
      stitch.style.clipPath = "inset(0 0 0 " + Math.max(0, Math.min(x, W)).toFixed(1) + "px)";
      rip.style.transform = "translate3d(" + (x - RIP_X).toFixed(1) + "px,0,0)";
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
      var W = field.clientWidth - 58, H = field.clientHeight;
      if (W < 40) return;
      prepStitch(stitch, W, H);
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
    ["dataPop", "tgPop", "usPop", "drill"].forEach(function (id) {
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
    refreshChrome();
    if (fresh && me) toast(T("us_hello") + me.u, "ok");
    /* round 23: NEVER reveal the shell while the data restore is still
       in flight — that fraction of a second used to show the "upload
       data" empty state before the server data landed. The login screen
       (or the boot veil) stays up until the restore settles, then the
       shell appears already loaded. 8s safety for a stuck network. */
    var revealed = false;
    function reveal() {
      if (revealed) return;
      revealed = true;
      hideLogin();
      dropBootVeil();
      var sb = $("lgSubmit"); if (sb) sb.disabled = false;
      /* genuinely no data for this account → ask for the folder */
      if (window.App && !App.hasData()) {
        setTimeout(function () {
          if (!window.App || App.hasData()) return;
          if (App.promptData) { try { App.promptData(); } catch (e) { } }
        }, 300);
      }
    }
    if (window.App && !App.hasData() && App.retryRestore) {
      try { App.retryRestore(); } catch (e) { }
      if (App.isRestoring && App.isRestoring() && App.onRestored) {
        App.onRestored(reveal);
        setTimeout(reveal, 8000);
        return;
      }
    }
    reveal();
  }

  function refreshChrome() {
    var chip = $("userChip");
    if (chip) {
      if (me) {
        $("ucAv").textContent = (me.u.charAt(0) || "?").toUpperCase();
        $("ucName").textContent = me.u;
        var r = $("ucRole");
        r.textContent = T(roleKey(me.role));
        r.className = "uc-role " + me.role;
        chip.style.display = "";
      } else chip.style.display = "none";
    }
    var b = $("btnUsers"), o = $("btnLogout");
    if (b) b.style.display = isAdmin(me) ? "" : "none";
    if (o) o.style.display = me ? "" : "none";
  }

  /* ============================================================
     users & roles modal
     ============================================================ */
  function buildUsList() {
    var list = $("usList");
    if (!list) return;
    list.innerHTML = "";
    var devNote = document.createElement("p");
    devNote.className = "us-dev-note on";
    devNote.textContent = T("us_hint_dev");
    list.appendChild(devNote);
    var users = buildUsList._data || [];
    users.forEach(function (u) {
      var isDev = u.role === "dev";
      var isMe = me && u.u === me.u;
      var block = document.createElement("div");
      block.innerHTML =
        '<div class="us-row">' +
          '<span class="us-av ' + u.role + '">' + esc((u.u.charAt(0) || "?").toUpperCase()) + '</span>' +
          '<div class="us-mid">' +
            '<div class="us-nm"><b>' + esc(u.u) + '</b>' + (isMe ? '<span class="us-you">' + esc(T("us_you")) + '</span>' : "") + '</div>' +
            '<span class="us-role ' + u.role + '">' + esc(T(roleKey(u.role))) + '</span>' +
          '</div>' +
          '<div class="us-acts">' +
            '<label class="us-sw" title="' + esc(T("us_admin_lbl")) + '">' +
              '<input type="checkbox"' + (isAdmin(u) ? " checked" : "") + (isDev ? " disabled" : "") + '><i></i>' +
            '</label>' +
            '<label class="us-sw up" title="' + esc(T("us_upload_tt")) + '">' +
              '<input type="checkbox"' + (u.canUpload ? " checked" : "") + (isDev ? " disabled" : "") + '><i></i>' +
            '</label>' +
            '<button class="us-ic chg" type="button" title="' + esc(T("us_chg")) + '">' + KEY_SVG + '</button>' +
            '<button class="us-ic del" type="button" title="' + esc(T("us_del")) + '"' + ((isDev || isMe) ? " disabled" : "") + '>' + TRASH_SVG + '</button>' +
          '</div>' +
        '</div>' +
        '<div class="us-chg"><input type="text" placeholder="' + esc(T("us_chg_ph")) + '"><button class="us-save" type="button">' + esc(T("us_save")) + '</button><button class="us-cancel" type="button">' + esc(T("us_cancel")) + '</button></div>';

      var sw = block.querySelector(".us-sw input");
      var swUp = block.querySelector(".us-sw.up input");
      sw.addEventListener("change", function () {
        apiPatch("/api/users/" + u.id, { role: sw.checked ? "admin" : "user" }, function (ok) {
          if (ok) { u.role = sw.checked ? "admin" : "user"; refreshChrome(); }
          buildUsList();
          toast(ok ? T("us_toast_saved") : T("cloud_err_server"), ok ? "ok" : "err");
        });
      });
      if (swUp) swUp.addEventListener("change", function () {
        apiPatch("/api/users/" + u.id, { canUpload: swUp.checked }, function (ok) {
          if (ok) u.canUpload = swUp.checked;
          buildUsList();
          toast(ok ? T("us_toast_saved") : T("cloud_err_server"), ok ? "ok" : "err");
        });
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
        fetch("/api/users/" + u.id + "/password", {
          method: "POST", credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ p: v })
        }).then(function (r) { return r.json().catch(function () { return {}; }); }).then(function (j) {
          chgBox.classList.remove("on");
          toast(j && j.ok ? T("us_toast_saved") : T("cloud_err_server"), j && j.ok ? "ok" : "err");
        }).catch(function () { toast(T("cloud_err_server"), "err"); });
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
        fetch("/api/users/" + u.id, { method: "DELETE", credentials: "same-origin" })
          .then(function (r) { return r.json().catch(function () { return {}; }); })
          .then(function (j) {
            if (j && j.ok) { loadUsersList(); toast(T("us_toast_del"), "ok"); }
            else toast(T("us_toast_nodel"), "err");
          }).catch(function () { toast(T("cloud_err_server"), "err"); });
      });

      list.appendChild(block);
    });
  }

  function bindUsers() {
    var pop = $("usPop");
    if (!pop) return;
    function openUs() {
      if (!isAdmin(me)) { toast(T("us_no_admin")); return; }
      loadUsersList();
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
      fetch("/api/users", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ u: name, p: pw, role: $("usAdmin").checked ? "admin" : "user", canUpload: !!($("usUpload") && $("usUpload").checked) })
      }).then(function (r) { return r.json().catch(function () { return {}; }); }).then(function (j) {
        if (j && j.ok) {
          $("usName").value = ""; $("usPass").value = ""; $("usAdmin").checked = false;
          if ($("usUpload")) $("usUpload").checked = false;
          loadUsersList();
          toast(T("us_toast_added"), "ok");
        } else {
          toast(j && j.error === "dup" ? T("us_toast_dup") : T("us_toast_bad"), "err");
        }
      }).catch(function () { toast(T("cloud_err_server"), "err"); });
    });

    function apiPatch(url, data, cb) {
      fetch(url, {
        method: "PATCH", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      }).then(function (r) { return r.json().catch(function () { return {}; }); })
        .then(function (j) { cb(!!(j && j.ok)); })
        .catch(function () { cb(false); });
    }
    function loadUsersList() {
      fetch("/api/users", { credentials: "same-origin" })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) {
          buildUsList._data = (j && j.ok && j.users) ? j.users : [];
          buildUsList();
        }).catch(function () { });
    }
    $("usPop").addEventListener("transitionend", function () {
      if ($("usPop").classList.contains("on")) loadUsersList();
    });

    var lo = $("btnLogout");
    if (lo) lo.addEventListener("click", function () {
      clearSess();
      fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" }).catch(function () { });
      /* round 21: logout clears THIS device's caches + UI state — the
         server months stay (that's the point of the online version) */
      try {
        if (window.MaribStore) { MaribStore.clearData(); MaribStore.clearUI(); }
      } catch (er) { }
      toast(T("toast_logout"), "ok");
      setTimeout(function () { try { location.reload(); } catch (e) { showLogin(); } }, 500);
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
      function bad(msg) {
        err.textContent = msg;
        err.classList.add("on");
        cardEl.classList.remove("shake");
        void cardEl.offsetWidth;
        cardEl.classList.add("shake");
      }
      if (!name || !pw) { bad(T("lg_err_fill")); return; }
      var submitBtn = $("lgSubmit");
      if (submitBtn) submitBtn.disabled = true;
      fetch("/api/auth/login", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ u: name, p: pw, remember: !!$("lgRemember").checked })
      }).then(function (r) {
        return r.json().then(function (j) { return { ok: r.ok, body: j || {} }; });
      }).then(function (r) {
        var j = r.body;
        if (!r.ok || !j.ok) {
          if (submitBtn) submitBtn.disabled = false;
          var key = (j.error === "locked" || j.error === "rate") ? "lg_err_locked"
            : j.error === "inactive" ? "lg_err_inactive"
            : j.error === "server" ? "lg_err_server" : "lg_err";
          bad(T(key));
          var ip = $("lgPass");
          ip.value = "";
          pwVisible = false;
          $("lgPwField").classList.add("sewn");
          var st = $("pwStitchSvg"); if (st) st.style.display = "none";
          syncToggle();
          try { ip.focus(); } catch (e2) { }
          return;
        }
        err.classList.remove("on");
        me = j.user;
        writeSess(me.u, $("lgRemember").checked);
        enterApp(true);
      }).catch(function () {
        if (submitBtn) submitBtn.disabled = false;
        bad(T("lg_err_server"));
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
    });
  }

  function bindParallax() {
    if (!window.matchMedia) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || matchMedia("(pointer: coarse)").matches) return;
    var root = $("loginScreen");
    root.addEventListener("mousemove", function (e) {
      var r = root.getBoundingClientRect();
      var nx = ((e.clientX - r.left) / r.width - 0.5) * 2;
      var ny = ((e.clientY - r.top) / r.height - 0.5) * 2;
      root.style.setProperty("--px", nx.toFixed(3));
      root.style.setProperty("--py", ny.toFixed(3));
    });
    root.addEventListener("mouseleave", function () {
      root.style.setProperty("--px", "0");
      root.style.setProperty("--py", "0");
    });
  }

  /* ---------------- round 22: first-paint boot veil ----------------
     The skeleton paints a full-screen denim veil (#bootVeil) so the
     dashboard shell behind the login gate never flashes while the
     session check is in flight. Whoever settles first (session hit,
     login show, or the 9s safety below) lifts it. Idempotent and a
     no-op when the veil is absent (older builds). */
  var veilDropped = false;
  function dropBootVeil() {
    var v = document.getElementById("bootVeil");
    if (!v || veilDropped) return;
    veilDropped = true;
    v.classList.add("bye");
    setTimeout(function () {
      try { v.remove(); } catch (e) { v.style.display = "none"; }
    }, 520);
  }

  /* ---------------- boot ---------------- */
  function boot() {
    loginEl = $("loginScreen");
    cardEl = loginEl ? loginEl.querySelector(".lg-card") : null;
    if (!loginEl) return;
    /* round 11: real company logo on the login leather patch */
    try {
      var lgLogo = $("lgCoLogo");
      if (lgLogo && window.EMBED && EMBED.logo) {
        lgLogo.src = "data:image/png;base64," + EMBED.logo;
        lgLogo.alt = "";
      }
    } catch (e) { }
    pwVisible = false;
    $("lgPwField").classList.add("sewn");
    syncToggle();
    bindLogin();
    bindUsers();
    bindParallax();
    /* round 22: never let a stuck network check freeze the veil —
       after 9s show the login screen no matter what */
    setTimeout(function () {
      if (!veilDropped) { showLogin(); dropBootVeil(); }
    }, 9000);
    /* round 21: the server is the source of truth for the session.
       round 22: page.tsx pre-started this fetch BEFORE the heavy app
       scripts began loading (window.__meCheck) — reuse that in-flight
       promise instead of firing a second request, so the boot veil
       drops at the earliest possible moment. */
    function settle(j) {
      if (j && j.ok && j.user) { me = j.user; enterApp(false); }
      else { showLogin(); dropBootVeil(); }
    }
    var pre = (window.__meCheck && window.__meCheck.then) ? window.__meCheck : null;
    if (pre) {
      pre.then(function (j) { settle(j || null); }).catch(function () { settle(null); });
    } else {
      fetch("/api/auth/me", { credentials: "same-origin" })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) { settle(j); })
        .catch(function () { settle(null); });
    }
    /* round 23: the veil now lifts inside showLogin()/enterApp() — only
       after the session AND the data restore have settled, so neither
       the dashboard-behind-login nor the empty-state ever flashes. */
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  return {
    login: showLogin,
    logout: function () {
      clearSess();
      try {
        if (window.MaribStore) { MaribStore.clearData(); MaribStore.clearUI(); }
      } catch (er) { }
      location.reload();
    },
    togglePw: togglePw,
    me: function () { return me; },
    canUpload: function () {
      return !!me && (me.canUpload || me.role === "dev" || me.role === "admin");
    }
  };
})();
