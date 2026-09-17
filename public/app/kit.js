/* ============================================================
   MaribKit — R59: أدوات الواجهة المشتركة (kit.js)
   ============================================================
   اتولدت من الـ refactoring: نفس الكود كان متنسوخ عبر الموديولات —
     · تنزيل blob من السيرفر (fetch → <a download> → revoke)
       كان مكرر 6 مرات (entries ×2 + manpower ×4)
     · ختم التاريخ YYYYMMDD (p2 محلية) كان مكرر 6 مرات
     · ensureXLSX (تحميل xlsx.full.min.js عند أول طلب) كان نسختين
       (app_main + app_manpower) — النسخة دي بالوعد المخزن: أي عدد
       نداءات متزامنة = سكريبت واحد بس
     · قراءة شيت إكسل بسيطة (FileReader → XLSX.read → grid + سطر
       الرأس) كانت مكررة في رفع التيمبلتات
   الموديول ده بيتحمّل الأول (قبل app_core) ومفيش ليه أي اعتماد
   على حاجة — كله vanilla.
   ============================================================ */
var MaribKit = (function () {
  "use strict";

  /* ---------------- ختم التاريخ YYYYMMDD ---------------- */
  function dstamp(d) {
    var x = d || new Date();
    function p2(n) { return (n < 10 ? "0" : "") + n; }
    return x.getFullYear() + p2(x.getMonth() + 1) + p2(x.getDate());
  }

  /* ---------------- ensureXLSX — مصدر واحد ----------------
     932KB بيتحملوا مرة واحدة لكل جلسة عند أول احتياج. الوعد
     مخزّن: النداءات المتزامنة بتشترك في نفس التحميل، والفشل بيرجّع
     الحالة صفر عشان محاولة جديدة تقدر تحصل. */
  var _xlsxP = null;
  function ensureXLSX() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (_xlsxP) return _xlsxP;
    _xlsxP = new Promise(function (res, rej) {
      var s = document.createElement("script");
      /* ?v=rXX — ترويسة immutable (R57) خلت الرابط يتخزن للأبد؛
         تحديث المكتبة مستقبلًا = بارامتر جديد (نفس فكرة app.css). */
      s.src = "/app/xlsx.full.min.js?v=r59";
      s.onload = function () { window.XLSX ? res(window.XLSX) : rej(new Error("XLSX missing")); };
      s.onerror = function () { _xlsxP = null; rej(new Error("XLSX load failed")); };
      document.head.appendChild(s);
    });
    return _xlsxP;
  }

  /* ---------------- تنزيل ملف من السيرفر ----------------
     url   : مسار الـ API اللي بيرجّع blob (XLSX مثلًا)
     name  : اسم الملف المحلي (بتاريخ اليوم لو منصتش)
     creds : "include" (افتراضي) — الكوكي الموقّع بيتسافر
     بيرجّع Promise بت resolve بعد الضغطة — النداء بيسيب له
     التوست وتفعيل/تعطيل الزرار (الاختلافات الوحيدة بين المواقع). */
  function dlBlob(url, name, creds) {
    return fetch(url, { credentials: creds || "include" })
      .then(function (r) {
        if (!r.ok) throw new Error("dl " + r.status);
        return r.blob();
      })
      .then(function (b) {
        var a = document.createElement("a");
        a.href = URL.createObjectURL(b);
        a.download = name || ("download-" + dstamp() + ".xlsx");
        document.body.appendChild(a);
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 900);
      });
  }

  /* ---------------- قراءة شيت إكسل بسيط ----------------
     file   : File من الـ input
     needle : نص بيتدور عليه في العمود التاني (r[1]) عشان يلاقي
              سطر الرأس — "الكود" للتيمبلتات القديمة، "PO" لعقود
              الـ PO. أول صف بعد الرأس = البيانات.
     بيرجّع Promise بـ { grid, hRow } — النداء بياخد الصفوف اللي
              بعد hRow ويبني الـ payload بتاعه. */
  function readGrid(file, needle) {
    return ensureXLSX().then(function (XLSX) {
      return new Promise(function (res, rej) {
        var fr = new FileReader();
        fr.onload = function (ev) {
          try {
            var wb = XLSX.read(ev.target.result, { type: "array" });
            var ws = wb.Sheets[wb.SheetNames[0]];
            var grid = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "" });
            var hRow = -1;
            for (var i = 0; i < grid.length; i++) {
              var r = grid[i] || [];
              if (String(r[1] || "").indexOf(needle) >= 0) { hRow = i; break; }
            }
            if (hRow < 0) { rej(new Error("header not found")); return; }
            res({ grid: grid, hRow: hRow });
          } catch (e) { rej(e); }
        };
        fr.onerror = function () { rej(new Error("read error")); };
        fr.readAsArrayBuffer(file);
      });
    });
  }

  return { dstamp: dstamp, ensureXLSX: ensureXLSX, dlBlob: dlBlob, readGrid: readGrid };
})();
