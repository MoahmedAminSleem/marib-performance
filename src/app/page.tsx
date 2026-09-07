/* Marib Performance — online edition (R23/R24)
   The whole dashboard is the vanilla-JS denim app under /public/app:
   the skeleton DOM below + the module scripts in load order.
   The boot veil sits inside the skeleton — the session check decides
   login screen vs. dashboard BEFORE anything is revealed (no flash). */

import { SKELETON } from "./skeleton";

const SCRIPTS = [
  "/app/xlsx.full.min.js", // SheetJS — reads the month's Excel locally
  "/app/app_core.js",      // MaribCore — parsing + the 42 measures
  "/app/i18n_dict.js",     // AR / EN / TR dictionary
  "/app/i18n_core.js",     // i18n engine
  "/app/app_charts.js",    // MaribCharts
  "/app/marib_cloud.js",   // server sync client (R23)
  "/app/app_main.js",      // App module (a+b+c concatenated — one closure)
  "/app/app_auth.js",      // MaribAuth — server login gate
];

export default function Home() {
  return (
    <>
      <div id="maribApp" dangerouslySetInnerHTML={{ __html: SKELETON }} />
      {SCRIPTS.map((src) => (
        <script key={src} src={src} />
      ))}
    </>
  );
}
