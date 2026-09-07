/* Marib logger (R25 #11)
   One structured JSON line per event, two sinks:
     1. stdout (console) — on Vercel this lands in the project's runtime
        logs (Dashboard → Deployments → Functions/Logs), queryable.
     2. a local file logs/marib.log — written ONLY when the filesystem is
        writable (local dev / self-hosted), capped at 2 MB and rotated to
        marib.log.1 so it can never eat the disk. On Vercel the FS is
        read-only, the write is skipped silently, and stdout remains.
   Usage:
     import { log } from "@/lib/marib/logger";
     const auth = log.child("auth");
     auth.info("login ok", { user: "Amin" });
     auth.error("db down", { err: e });
   Never log passwords or session tokens — the routes only pass
   usernames, row counts and ids. */

import fs from "node:fs";
import path from "node:path";

export type Level = "debug" | "info" | "warn" | "error";

const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2 MB cap before rotation
const LOG_DIR = path.join(process.cwd(), "logs");
const LOG_FILE = path.join(LOG_DIR, "marib.log");

type Extra = Record<string, unknown>;

let fileUsable: boolean | null = null; // null = not probed yet

function writeFile(line: string): void {
  if (fileUsable === false) return;
  try {
    if (fileUsable === null) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
      fileUsable = true;
    }
    // rotate: marib.log → marib.log.1 (one generation is plenty)
    try {
      const st = fs.statSync(LOG_FILE);
      if (st.size > MAX_FILE_BYTES) {
        try { fs.renameSync(LOG_FILE, LOG_FILE + ".1"); } catch { fs.rmSync(LOG_FILE, { force: true }); }
      }
    } catch { /* no file yet — fine */ }
    fs.appendFileSync(LOG_FILE, line + "\n", "utf8");
  } catch {
    // read-only FS (Vercel) or permissions — stdout sink still works
    fileUsable = false;
  }
}

function emit(level: Level, mod: string, msg: string, extra?: Extra): void {
  const rec: Record<string, unknown> = {
    t: new Date().toISOString(),
    lvl: level,
    mod,
    msg,
  };
  if (extra) {
    for (const k of Object.keys(extra)) {
      const v = extra[k];
      if (v === undefined) continue;
      rec[k] = v instanceof Error ? { name: v.name, message: v.message } : v;
    }
  }
  const line = JSON.stringify(rec);
  // console first (always available, Vercel-visible)
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
  writeFile(line);
}

export interface ChildLogger {
  debug(msg: string, extra?: Extra): void;
  info(msg: string, extra?: Extra): void;
  warn(msg: string, extra?: Extra): void;
  error(msg: string, extra?: Extra): void;
}

function child(mod: string): ChildLogger {
  return {
    debug: (msg, extra) => emit("debug", mod, msg, extra),
    info: (msg, extra) => emit("info", mod, msg, extra),
    warn: (msg, extra) => emit("warn", mod, msg, extra),
    error: (msg, extra) => emit("error", mod, msg, extra),
  };
}

export const log = {
  child,
  debug: (msg: string, extra?: Extra) => emit("debug", "app", msg, extra),
  info: (msg: string, extra?: Extra) => emit("info", "app", msg, extra),
  warn: (msg: string, extra?: Extra) => emit("warn", "app", msg, extra),
  error: (msg: string, extra?: Extra) => emit("error", "app", msg, extra),
};
