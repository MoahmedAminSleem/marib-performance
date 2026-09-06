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
    __meCheck?: Promise<{ ok: boolean; user?: unknown } | null>
  }
}

export default function Home() {
  useEffect(() => {
    if (window.__maribBooted) return
    window.__maribBooted = true
    /* round 22: pre-start the session check while the heavy app
       scripts are still downloading — app_auth.js consumes this
       in-flight promise (window.__meCheck) so the boot veil drops
       at the earliest possible moment. */
    try {
      window.__meCheck = fetch("/api/auth/me", { credentials: "same-origin" })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null)
    } catch (e) {
      console.warn("[marib] me prefetch failed", e)
    }
    /* round 22: safety — if app_auth.js never arrives (network
       hiccup), lift the boot veil after 12s so the login screen is
       at least reachable (bye = invisible + click-through). */
    setTimeout(() => {
      const v = document.getElementById("bootVeil")
      if (v && !v.classList.contains("bye")) v.classList.add("bye")
    }, 12000)
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
