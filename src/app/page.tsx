/* Marib Performance — online edition (R23/R24)
   The whole dashboard is the vanilla-JS denim app under /public/app:
   the skeleton DOM below + the module scripts in load order.
   The boot veil sits inside the skeleton — the session check decides
   login screen vs. dashboard BEFORE anything is revealed (no flash). */

import { SKELETON } from "./skeleton";

/* R52: ?v=rXX على كل سكريبت — cache-busting بعد كل رفع (نفس فكرة app.css).
   R57 (perf): bump إلى r57 (اتعدل app_main + app_manpower للتحميل
   المسبق) + defer على الكل: التحميل بيتنفذ بالتوازي مع بارس الـ HTML
   بدل ما يحجز البارس — وترتيب التنفيذ بيفضل زي ما هو (defer بيضمن
   الترتيب، وapp_auth شغال على DOMContentLoaded اللي بييجي بعدهم).
   R52 refactoring: app_main اتقسم 4 وحدات — core (الحالة + الأدوات +
   الفلاتر + الدريو) + app_pages (عرض الصفحات) + app_entries (إدخال
   البيانات) + app_admin (الأوديت/التخزين/الصلاحيات) — كلهم بعد app_main
   عشان جسر __maribCtx يبقى جاهز، وقبل app_auth اللي بيبدأ التشغيل. */
const SCRIPTS = [
  "/app/kit.js?v=r63",           // R59 — MaribKit: أدوات مشتركة (dstamp/ensureXLSX/dlBlob/readGrid)
  "/app/app_core.js?v=r63",      // MaribCore — parsing + the 42 measures
  "/app/i18n_dict.js?v=r63",     // AR / EN / TR dictionary
  "/app/i18n_core.js?v=r63",     // i18n engine
  "/app/app_charts.js?v=r63",    // MaribCharts
  "/app/marib_cloud.js?v=r63",   // server sync client (R23)
  "/app/app_main.js?v=r63",      // App core — state + utils + filters + drill + settings
  "/app/app_pages.js?v=r63",     // R52 — عرض صفحات التحليل + بيت المدير
  "/app/app_entries.js?v=r63",   // R52 — إدخال البيانات (إنتاج/غياب/أوفر تايم)
  "/app/app_admin.js?v=r63",     // R52 — الأوديت + التخزين + الصلاحيات
  "/app/app_auth.js?v=r63",      // MaribAuth — server login gate
  "/app/app_manpower.js?v=r63",  // R37 — الاتزان (manpower balance)
];
/* xlsx.full.min.js (~950KB) is NOT loaded upfront anymore: App.ensureXLSX()
   pulls it on first upload/export (R24 perf — the first paint got heavy). */

export default function Home() {
  return (
    <>
      {/* suppressHydrationWarning: the vanilla scripts (i18n, auth boot)
          start mutating this subtree right after parse — before React
          hydrates — so the innerHTML diff would warn on every load.
          React never reconciles inside dangerouslySetInnerHTML anyway;
          the whole dashboard DOM belongs to /public/app. */}
      <div id="maribApp" suppressHydrationWarning dangerouslySetInnerHTML={{ __html: SKELETON }} />
      {/* R57 (perf): defer — تنزيل متوازي غير حاجز أثناء البارس،
          والتنفيذ بترتيب المصفوفة بالظبط زي قبل (ضمانة defer)،
          وDOMContentLoaded (بووت app_auth) بييجي بعد تنفيذهم كلهم. */}
      {SCRIPTS.map((src) => (
        <script key={src} src={src} defer />
      ))}
    </>
  );
}
