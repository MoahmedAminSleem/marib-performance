"use client"

import { useEffect } from "react"
import { SKELETON_HTML } from "./skeleton-html"

/* ============================================================
   Marib Performance Studio — ONLINE shell.
   The whole battle-tested offline app (theme, sewing-machine login
   theater, 7 pages, charts, i18n, MaribCore parsing) runs exactly
   as before as classic scripts; only the storage/auth layers talk
   to the server (see public/app/marib_cloud.js + app_auth.js).
   Scripts load strictly in order AFTER the skeleton DOM is parsed.
   ============================================================ */

const SCRIPTS = [
  "/app/xlsx.js",
  "/app/marib-core.js",
  "/app/i18n.js",
  "/app/marib-charts.js",
  "/app/embed.js",
  "/app/marib_cloud.js",
  // app_a + app_b + app_c are ONE IIFE module split across files —
  // served combined as app_main.js (scripts/build_online_site.py)
  "/app/app_main.js",
  "/app/app_auth.js",
]

declare global {
  interface Window {
    __maribBooted?: boolean
  }
}

export default function Home() {
  useEffect(() => {
    if (window.__maribBooted) return
    window.__maribBooted = true
    let i = 0
    const loadNext = () => {
      if (i >= SCRIPTS.length) return
      const s = document.createElement("script")
      s.src = SCRIPTS[i++]
      s.async = false // preserve execution order
      s.onload = loadNext
      s.onerror = () => console.error("[marib] failed to load", s.src)
      document.body.appendChild(s)
    }
    loadNext()
  }, [])

  return <div id="maribRoot" dangerouslySetInnerHTML={{ __html: SKELETON_HTML }} />
}
