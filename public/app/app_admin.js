/* ============================================================
   Marib Performance — R52: وحدة الإدارة (app_admin)
   اتقطعت من app_main.js بدون تغيير منطقي — سجل التغييرات (audit)
   + التخزين + لوحة بيت المدير + الصلاحيات. للمطور/الأدمن بس.
   بتوصل لرموز app_main عبر جسر __maribCtx.
   ============================================================ */
var AppAdmin = (function (ctx) {
  "use strict";
  var $ = ctx.$, esc = ctx.esc, toast = ctx.toast, chip = ctx.chip,
      fmtInt = ctx.fmtInt, ensureXLSX = ctx.ensureXLSX,
      goToPage = ctx.goToPage, render = ctx.render,
      mhomeActive = ctx.mhomeActive, monthLabelOf = ctx.monthLabelOf,
      auWhen = ctx.auWhen,
      state = ctx.state, T = ctx.T, TB = ctx.TB, U = ctx.U;

  var auData = null;
  function auEntityPretty(x) {
    var e = x.entity || "";
    if (e.indexOf("data:") === 0) return T("dt_month") + " " + monthLabelOf(e.slice(5));
    if (e === "settings:targets") return T("set_targets");
    if (e === "settings:groups") return T("set_groups");
    if (e === "settings:storage_quota") return T("set_storage");
    if (e === "settings:mhome") return T("set_mhome");   /* R36: the raw key leaked into the table */
    if (e.indexOf("users:") === 0) return T("nav_users") + " · " + e.slice(6);
    if (e === "site") return T("au_site");   /* R36: was set_title (الإعدادات) — wrong face for login/logout rows */
    if (e === "manpower") return T("au_mp");           /* R37: الاتزان rows */
    if (e === "manpower-req") return T("au_mp_req");   /* R37: required-count edits */
    return e;
  }
  /* R35: date-first flow — the log never auto-loads on open. Step 1: the
     user picks a period (or "since site creation"). Step 2: he chooses
     view-on-site or the Excel export. auRange remembers which period
     auData holds, so the export can never ship a stale range. */
  var auAllMode = false, auRange = "";
  function auCurRange() {
    return auAllMode ? "all" : ($("auFrom").value + "|" + $("auTo").value);
  }
  function auValid() {
    return auAllMode || !!($("auFrom").value || $("auTo").value);
  }
  function auditSyncButtons() {
    var ok = auValid();
    $("auShow").disabled = !ok;
    $("auExport").disabled = !ok;
    var hint = $("auPickHint");
    if (hint) hint.hidden = ok;
  }
  function auditReset() {
    auData = null; auRange = ""; auAllMode = false;
    $("auFrom").value = ""; $("auTo").value = "";
    var tb = $("auTables"); if (tb) tb.hidden = true;
    var hint = $("auPickHint"); if (hint) hint.hidden = false;
    auditSyncButtons();
  }
  function loadAudit() {
    var from = $("auFrom").value, to = $("auTo").value;
    MaribCloud.auditGet(from, to).then(function (r) {
      auData = r;
      auRange = auCurRange();
      var tb = $("auTables"); if (tb) tb.hidden = false;
      renderAudit();
    }).catch(function (e) {
      toast(e && e.status === 403 ? T("toast_need_dev") : T("toast_sync_err"), "err");
    });
  }
  function renderAudit() {
    if (!auData) return;
    var ents = auData.entities || [];
    var eh = "<thead><tr><th>" + T("au_entities") + "</th><th>" + T("au_creator") + "</th><th>" + T("au_edits") + "</th><th>" + T("au_total_edits") + "</th></tr></thead>";
    var rows = ents.map(function (x) {
      var edits = (x.edits || []).map(function (ed) {
        return '<span class="au-chip edit">' + esc(ed.actor) + " · " + auWhen(ed.at) + "</span>";
      }).join(" ");
      if (!edits) edits = '<span style="color:#7E92A8">' + T("au_no_edits") + "</span>";
      return "<tr><td><b>" + esc(auEntityPretty(x)) + "</b>" + (x.label ? '<br><small style="color:#7E92A8">' + esc(x.label) + "</small>" : "") + "</td>" +
        '<td class="num"><b>' + esc(x.creator.actor) + "</b><br><small style='color:#7E92A8'>" + auWhen(x.creator.at) + "</small></td>" +
        "<td>" + edits + "</td><td class='num'>" + x.totalEdits + "</td></tr>";
    }).join("");
    if (!ents.length) rows = "<tr><td colspan='4' style='padding:16px;color:#A9B7C7'>" + T("au_empty") + "</td></tr>";
    $("auEntities").innerHTML = eh + "<tbody>" + rows + "</tbody>";

    var evs = auData.events || [];
    var vh = "<thead><tr><th>" + T("f_from") + "</th><th>" + T("t_sup") + "</th><th>—</th><th>" + T("dt_month") + "</th></tr></thead>";
    /* events table: time · actor · action · subject */
    vh = "<thead><tr><th>🕒</th><th></th><th></th><th></th></tr></thead>";
    var vrows = evs.map(function (ev) {
      var cls = "au-chip act-" + (/^[a-z]+$/.test(ev.action || "") ? ev.action : "edit");
      var subj = ev.entity && ev.entity.indexOf("data:") === 0 ? monthLabelOf(ev.entity.slice(5)) : auEntityPretty(ev);
      return "<tr><td class='num'>" + auWhen(ev.at) + "</td><td><b>" + esc(ev.actor) + "</b></td>" +
        '<td><span class="' + cls + '">' + esc(T("au_a_" + ev.action)) + "</span></td>" +
        "<td>" + esc(subj) + (ev.label ? ' <small style="color:#7E92A8">· ' + esc(ev.label) + "</small>" : "") + "</td></tr>";
    }).join("");
    if (!evs.length) vrows = "<tr><td colspan='4' style='padding:16px;color:#A9B7C7'>" + T("au_empty") + "</td></tr>";
    $("auEvents").innerHTML = "<thead><tr><th>" + T("au_c_time") + "</th><th>" + T("au_c_user") + "</th><th>" + T("au_c_action") + "</th><th>" + T("au_c_subject") + "</th></tr></thead><tbody>" + vrows + "</tbody>";
  }
  function exportAudit() {
    if (!auValid()) { toast(T("au_pick"), "err"); return; }
    var build = function () {
      if (!auData) { toast(T("toast_sync_err"), "err"); return; }
      /* SheetJS loads on demand (R24 perf) — the export waits for it once */
      ensureXLSX().then(function () {
      try {
        var wb = XLSX.utils.book_new();
        function xesc(v) {
          var sv = String(v == null ? "" : v);
          return /^[=+\-@]/.test(sv) ? "'" + sv : sv;   /* Excel formula-injection guard */
        }
        var ents = auData.entities || [];
        var r1 = [[T("au_entities")], [T("au_c_subject"), T("au_creator"), T("au_c_time"), T("au_edits"), T("au_total_edits")]];
        ents.forEach(function (x) {
          var edits = (x.edits || []).map(function (ed) { return ed.actor + " @ " + auWhen(ed.at); }).join(" | ");
          r1.push([xesc(auEntityPretty(x) + (x.label ? " · " + x.label : "")), xesc(x.creator.actor), auWhen(x.creator.at), xesc(edits || T("au_no_edits")), x.totalEdits]);
        });
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(r1), T("au_excel_sheet1"));
        var evs = auData.events || [];
        var r2 = [[T("au_c_time"), T("au_c_user"), T("au_c_action"), T("au_c_subject"), T("au_c_label")]];
        evs.forEach(function (ev) {
          r2.push([auWhen(ev.at), xesc(ev.actor), T("au_a_" + ev.action), xesc(auEntityPretty(ev)), xesc(ev.label || "")]);
        });
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(r2), T("au_excel_sheet2"));
        /* R35: the file name carries the exported period (ASCII-safe) */
        var fn = auAllMode ? "marib-audit-all.xlsx"
          : "marib-audit-" + ($("auFrom").value || "x") + "_" + ($("auTo").value || "x") + ".xlsx";
        XLSX.writeFile(wb, fn);
        toast(T("au_exported"), "ok");
      } catch (e) {
        toast(T("toast_sync_err"), "err");
      }
      }).catch(function () { toast(T("toast_sync_err"), "err"); });
    };
    /* R35: fetch the chosen range first if it is not already loaded */
    if (auData && auRange === auCurRange()) { build(); return; }
    MaribCloud.auditGet($("auFrom").value, $("auTo").value).then(function (r) {
      auData = r;
      auRange = auCurRange();
      build();
    }).catch(function (e) {
      toast(e && e.status === 403 ? T("toast_need_dev") : T("toast_sync_err"), "err");
    });
  }
  function bindAuditPanel() {
    /* R35: choosing a date no longer fires a request — it only arms the
       two action buttons; the request happens when the user clicks */
    ["auFrom", "auTo"].forEach(function (id) {
      $(id).addEventListener("change", function () {
        if ($("auFrom").value || $("auTo").value) auAllMode = false;
        auditSyncButtons();
      });
    });
    $("auAll").addEventListener("click", function () {
      $("auFrom").value = ""; $("auTo").value = "";
      auAllMode = true;
      auditSyncButtons();
    });
    $("auShow").addEventListener("click", function () {
      if (!auValid()) { toast(T("au_pick"), "err"); return; }
      loadAudit();
    });
    $("auExport").addEventListener("click", exportAudit);
  }

  /* ---------- storage section (R24 #13 — Amin only) ---------- */
  function fmtBytes(n) {
    if (n == null || !isFinite(n)) return "—";
    var u = ["B", "KB", "MB", "GB", "TB"];
    var i = 0;
    while (n >= 1024 && i < 4) { n /= 1024; i++; }
    return (i ? n.toFixed(1) : Math.round(n)) + " " + u[i];
  }
  function loadStorage() {
    MaribCloud.storageGet().then(function (r) {
      var pct = r.quota ? (r.bytes / r.quota) * 100 : 0;
      var fill = $("stgFill");
      if (fill) {
        fill.style.width = Math.max(1.5, Math.min(100, pct)) + "%";
        fill.className = pct >= 85 ? "danger" : pct >= 60 ? "warn" : "";
      }
      $("stgUsed").textContent = fmtBytes(r.bytes);
      $("stgQuota").textContent = fmtBytes(r.quota);
      $("stgPct").textContent = pct < 0.1 ? "<0.1%" : I18N.pctV(pct, 1);
      $("stgRows").textContent = I18N.fmtInt(r.rows);
      $("stgMonths").textContent = I18N.fmtInt(r.months);
      $("stgQuotaIn").value = (r.quota / (1024 * 1024 * 1024)).toFixed(1);
      var t = $("stgTables");
      if (t) {
        t.innerHTML = "<thead><tr><th>" + T("stg_top") + "</th><th>" + T("stg_used") + "</th></tr></thead><tbody>" +
          (r.tables || []).map(function (x) {
            return "<tr><td>" + esc(x.name) + "</td><td class='num'>" + fmtBytes(x.bytes) + "</td></tr>";
          }).join("") + "</tbody>";
      }
    }).catch(function (e) {
      toast(e && e.status === 403 ? T("toast_need_dev") : T("toast_sync_err"), "err");
    });
  }
  function bindStoragePanel() {
    $("stgSave").addEventListener("click", function () {
      var gb = parseFloat($("stgQuotaIn").value);
      if (!isFinite(gb) || gb <= 0) { toast(T("tg_bad"), "err"); return; }
      MaribCloud.settingsPut("storage_quota", { gb: gb }).then(function () {
        toast(T("stg_saved"), "ok");
        loadStorage();
      }).catch(function (e) {
        toast(e && e.status === 403 ? T("toast_need_dev") : T("toast_sync_err"), "err");
      });
    });
  }

  /* ============================================================
     R30 — settings: "رئيسية المدير" (manager-home visibility, dev only)
     The dev picks which users see the Grafik-style home; everyone else
     keeps the classic overview. Stored as the "mhome" key in
     marib_setting → { users: [id, ...] } — purely additive: no user rows
     and no existing settings are ever touched.
     ============================================================ */
  function mhRoleKey(r) {
    return r === "dev" ? "us_role_dev" : r === "admin" ? "us_role_admin" : "us_role_user";
  }
  function syncMhomeCount() {
    var el = $("mhCount");
    if (el) {
      var n = document.querySelectorAll("#mhUsers input:checked").length;
      el.textContent = n + " " + T("mh_count");
    }
  }
  function loadMhome() {
    var box = $("mhUsers");
    if (!box) return;
    var sel = {};
    ((state.mhome && state.mhome.users) || []).forEach(function (id) { sel[String(id)] = true; });
    MaribCloud.usersList().then(function (r) {
      var users = (r && r.users) || [];
      box.innerHTML = users.map(function (u) {
        return '<label class="mh-user"><input type="checkbox" data-uid="' + esc(String(u.id)) + '"' + (sel[String(u.id)] ? " checked" : "") + '>'
          + '<span class="mh-uav">' + esc((u.username || "?").charAt(0).toUpperCase()) + '</span>'
          + '<span class="mh-utx"><b>' + esc(u.username || "?") + '</b><small>' + esc(T(mhRoleKey(u.role))) + '</small></span>'
          + '<i class="mh-dot"></i></label>';
      }).join("") || '<p class="cls-count">' + esc(T("mh_none")) + "</p>";
      syncMhomeCount();
    }).catch(function (e) {
      toast(e && e.status === 403 ? T("toast_need_dev") : T("toast_sync_err"), "err");
    });
  }
  function bindMhomePanel() {
    var box = $("mhUsers");
    if (box) box.addEventListener("change", syncMhomeCount);
    $("mhSave").addEventListener("click", function () {
      var ids = Array.prototype.slice.call(document.querySelectorAll("#mhUsers input[type=checkbox]:checked"))
        .map(function (i) { return i.getAttribute("data-uid"); });
      MaribCloud.settingsPut("mhome", { users: ids }).then(function () {
        state.mhome = { users: ids };
        toast(T("mh_saved"), "ok");
        /* removed myself from the list while sitting on the manager home
           → fall back to the classic overview right away */
        if (state.page === "mhome" && !mhomeActive()) goToPage("overview");
      }).catch(function (e) {
        toast(e && e.status === 403 ? T("toast_need_dev") : T("toast_sync_err"), "err");
      });
    });
  }

  /* ============================================================
     R46-2 — Permissions panel
     Loads the perm matrix (users × features) and renders it. The
     admin/dev sets per-user × per-feature one of: inherit | hidden |
     view | edit. Changes save immediately on dropdown change.
     ============================================================ */
  var PM_DATA = null;  /* { users: [{id,username,role,perms}], features: [...] } */
  function loadPerms() {
    var rowsHost = $("pmRows");
    var usersHead = $("pmUsersHead");
    var emptyEl = $("pmEmpty");
    if (!rowsHost || !usersHead) return;
    rowsHost.innerHTML = "";
    usersHead.innerHTML = "<div class='pm-uh'>…</div>";
    if (emptyEl) emptyEl.hidden = true;
    fetch("/api/perms", { credentials: "include" })
      .then(function (r) { if (!r.ok) throw { status: r.status }; return r.json(); })
      .then(function (data) {
        PM_DATA = data;
        /* R53: فصل خطأ الرندر عن خطأ الشبكة — قبل كده أي Throw جوا
           renderPerms كان بيتلقط في الـ catch التحتاني ويظهر كـ"المزامنة
           فشلت" حتى لو الـ GET رجع 200 (باج I18N.cur عاش من R46 للـ R52
           من غير ما حد ياخد باله). دلوقتي كل مسار بيقول رسالته الصح. */
        try {
          renderPerms();
        } catch (err) {
          console.error("[perms] render failed:", err);
          usersHead.innerHTML = "";
          rowsHost.innerHTML = "<p style='padding:16px;color:var(--muted)'>" + esc(T("pm_render_err")) + "</p>";
        }
      })
      .catch(function (e) {
        usersHead.innerHTML = "";
        rowsHost.innerHTML = "<p style='padding:16px;color:var(--muted)'>" + esc(T("toast_sync_err")) + "</p>";
      });
  }
  function renderPerms() {
    if (!PM_DATA) return;
    var users = (PM_DATA.users || []).filter(function (u) { return u.role !== "dev"; });
    var allUsers = PM_DATA.users || [];
    var features = PM_DATA.features || [];
    var usersHead = $("pmUsersHead");
    var rowsHost = $("pmRows");
    var emptyEl = $("pmEmpty");
    /* header: one column per non-dev user */
    if (!users.length) {
      usersHead.innerHTML = "";
      rowsHost.innerHTML = "";
      if (emptyEl) emptyEl.hidden = false;
      return;
    }
    usersHead.innerHTML = users.map(function (u) {
      var cls = u.role === "admin" ? "admin" : (u.role === "dev" ? "dev" : "");
      return '<div class="pm-uh ' + cls + '"><b>' + esc(u.username || "?") + "</b><small>" + esc(T("pm_role_" + (u.role || "user"))) + "</small></div>";
    }).join("");
    /* group features by group key */
    var groups = {};
    var groupOrder = ["manpower", "data", "users", "settings", "audit"];
    features.forEach(function (f) {
      var g = f.group || "audit";
      if (!groups[g]) groups[g] = [];
      groups[g].push(f);
    });
    /* R63: نفس منطق defaultForRole السيرفري — عشان نعرض للمالك
       المستوى الفعلي جنب كل اختيار ("افتراضي" كان صندوق أسود). */
    function pmDefaultFor(role, key) {
      if (role === "dev" || role === "admin") return "edit";
      if (key === "users.manage" || key === "audit.view" || key === "storage.view") return "hidden";
      return "view";
    }
    function pmEffective(u, key) {
      var ov = (u.perms && u.perms[key]) || "inherit";
      return ov === "inherit" ? pmDefaultFor(u.role, key) : ov;
    }
    function pmEffChip(u, key) {
      var eff = pmEffective(u, key);
      return '<i class="pm-eff" data-eff="' + esc(eff) + '">' + esc(T("pm_eff")) + " " + esc(T("pm_lg_" + eff)) + "</i>";
    }
    var html = [];
    groupOrder.forEach(function (g) {
      if (!groups[g]) return;
      html.push('<div class="pm-group">' + esc(T("pm_group_" + g)) + "</div>");
      groups[g].forEach(function (f) {
        /* R53: I18N.cur() كانت باج كامن من R46 — cur متغير خاص جوا
           i18n_core ومش من الـ exports، فالنداء كان بيضرب TypeError
           ولوحة الصلاحيات بتقول "المزامنة فشلت". الصح هو I18N.is() */
        html.push('<div class="pm-feat"><b>' + esc(I18N.is("ar") ? f.label_ar : f.label_en) + "</b><small>" + esc(I18N.is("ar") ? f.desc_ar : f.desc_en) + "</small></div>");
        html.push('<div class="pm-cells">');
        users.forEach(function (u) {
          var cur = (u.perms && u.perms[f.key]) || "inherit";
          /* dev is full-edit, no overrides — show a fixed badge instead of a dropdown */
          if (u.role === "dev") {
            html.push('<div class="pm-cell dev-fixed">' + esc(T("pm_lg_edit")) + "</div>");
          } else {
            html.push('<div class="pm-cell"><select data-uid="' + esc(u.id) + '" data-feature="' + esc(f.key) + '" data-cur="' + esc(cur) + '">'
              + '<option value="inherit"' + (cur === "inherit" ? " selected" : "") + ">" + esc(T("pm_lg_inherit")) + "</option>"
              + '<option value="hidden"' + (cur === "hidden" ? " selected" : "") + ">" + esc(T("pm_lg_hidden")) + "</option>"
              + '<option value="view"' + (cur === "view" ? " selected" : "") + ">" + esc(T("pm_lg_view")) + "</option>"
              + '<option value="edit"' + (cur === "edit" ? " selected" : "") + ">" + esc(T("pm_lg_edit")) + "</option>"
              + "</select>" + pmEffChip(u, f.key) + "</div>");
          }
        });
        html.push("</div>");
      });
    });
    rowsHost.innerHTML = html.join("");
    /* attach change handlers */
    var sels = rowsHost.querySelectorAll("select[data-uid]");
    Array.prototype.slice.call(sels).forEach(function (sel) {
      sel.addEventListener("change", function () {
        var uid = sel.getAttribute("data-uid");
        var feat = sel.getAttribute("data-feature");
        var lvl = sel.value;
        /* R63: القيمة الأصلية قبل أي تحديث — الباج القديم كان بيحدّث
           data-cur قبل ما savePerm يقراه، فالفشل كان بيرجّع القيمة
           الجديدة والواجهة كانت بتكذب على المالك (شكلها متحفظ
           والسيرفر رافض) */
        var orig = sel.getAttribute("data-cur");
        savePerm(uid, feat, lvl, sel, orig);
      });
    });
  }
  function savePerm(uid, feature, level, sel, orig) {
    fetch("/api/perms", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ userId: uid, feature: feature, level: level })
    })
      .then(function (r) { if (!r.ok) throw { status: r.status }; return r.json(); })
      .then(function () {
        toast(T("pm_saved"), "ok");
        /* R63: التحديث المحلي بعد النجاح بس — القيمة + شارة الفعلي */
        sel.setAttribute("data-cur", level);
        if (PM_DATA) {
          for (var i = 0; i < PM_DATA.users.length; i++) {
            if (PM_DATA.users[i].id === uid) {
              if (!PM_DATA.users[i].perms) PM_DATA.users[i].perms = {};
              PM_DATA.users[i].perms[feature] = level;
              var chip = sel.parentElement.querySelector(".pm-eff");
              if (chip) {
                var eff = (level === "inherit")
                  ? (PM_DATA.users[i].role === "admin" ? "edit"
                    : (feature === "users.manage" || feature === "audit.view" || feature === "storage.view") ? "hidden" : "view")
                  : level;
                chip.setAttribute("data-eff", eff);
                chip.textContent = T("pm_eff") + " " + T("pm_lg_" + eff);
              }
              break;
            }
          }
        }
      })
      .catch(function (e) {
        /* R63: رسالة 403 واضحة (كانت بتقول «محتاج مطور» وهي مش كده) */
        toast(e && e.status === 403 ? T("perm_denied") : T("toast_sync_err"), "err");
        /* رجّع الدروب ليست للقيمة الفعلية المحفوظة عند السيرفر */
        if (orig) {
          sel.value = orig;
        } else {
          /* ما عندناش القيمة القديمة — أقرب حل صادق: إعادة التحميل */
          loadPerms();
        }
      });
  }

  /* ============================================================
     Thread-spool scrollbar (R24 #11)
     The thumb is drawn as a wooden spool (CSS). While scrolling, the
     diagonal windings shift along the spool — pulling the thread out
     when scrolling down and winding it back when scrolling up.
     ============================================================ */
  return {
    bindAudit: bindAuditPanel, bindStorage: bindStoragePanel,
    bindMhome: bindMhomePanel, auditReset: auditReset,
    loadStorage: loadStorage, loadMhome: loadMhome, loadPerms: loadPerms
  };
})(window.__maribCtx);
