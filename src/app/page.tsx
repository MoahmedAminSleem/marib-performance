/* Marib Performance — online edition (R23/R24)
   The whole dashboard is the vanilla-JS denim app under /public/app:
   the skeleton DOM below + the module scripts in load order.
   The boot veil sits inside the skeleton — the session check decides
   login screen vs. dashboard BEFORE anything is revealed (no flash). */

import { SKELETON } from "./skeleton";

/* R47: ?v=r47 على كل سكريبت — cache-busting بعد كل رفع (نفس فكرة app.css) */
const SCRIPTS = [
  "/app/app_core.js?v=r47",      // MaribCore — parsing + the 42 measures
  "/app/i18n_dict.js?v=r47",     // AR / EN / TR dictionary
  "/app/i18n_core.js?v=r47",     // i18n engine
  "/app/app_charts.js?v=r47",    // MaribCharts
  "/app/marib_cloud.js?v=r47",   // server sync client (R23)
  "/app/app_main.js?v=r47",      // App module (a+b+c concatenated — one closure)
  "/app/app_auth.js?v=r47",      // MaribAuth — server login gate
  "/app/app_manpower.js?v=r47",  // R37 — الاتزان (manpower balance)
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
      {SCRIPTS.map((src) => (
        <script key={src} src={src} />
      ))}
    </>
  );
}
