import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { ensureReady } from "@/lib/bootstrap"
import { SESSION_COOKIE, sessionUser, unauthorized, forbidden } from "@/lib/auth"

export const dynamic = "force-dynamic"

/* ============================================================
   Round 23 — server-side app settings (people classification).
   The admin chooses which name appears under Supervisors / Leaders
   / Managers on the supervisors page; the choice is stored here so
   EVERY device in the company sees the same classification.

   GET  /api/settings  → { ok, roles: { name: "sup"|"leader"|"manager" } }
   PUT  /api/settings  → admin only, body { roles } (≤ 500 names)
   Storage: the AppSetting key/value table (created by bootstrap.ts).
   Raw tagged-template SQL keeps the Prisma schema untouched.
   ============================================================ */

const ROLES_KEY = "roles"
const MAX_NAMES = 500

function parseRoles(v: unknown): Record<string, string> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null
  const out: Record<string, string> = {}
  const entries = Object.entries(v as Record<string, unknown>)
  if (entries.length > MAX_NAMES) return null
  for (const [name, cat] of entries) {
    if (typeof name !== "string" || name.length > 120) return null
    if (cat !== "sup" && cat !== "leader" && cat !== "manager") return null
    out[name] = cat
  }
  return out
}

/** GET /api/settings — the stored classification (any signed-in user). */
export async function GET(req: NextRequest) {
  try {
    await ensureReady()
    const user = await sessionUser(req.cookies.get(SESSION_COOKIE)?.value)
    if (!user) return unauthorized()
    const rows = await db.$queryRaw<Array<{ value: string }>>`SELECT "value" FROM "AppSetting" WHERE "key" = ${ROLES_KEY}`
    let roles: Record<string, string> = {}
    if (rows && rows.length) {
      try {
        const parsed = JSON.parse(rows[0].value)
        roles = parseRoles(parsed) || {}
      } catch {
        roles = {}
      }
    }
    return NextResponse.json({ ok: true, roles })
  } catch (e) {
    console.error("settings get error", e)
    return NextResponse.json({ ok: false, error: "server" }, { status: 500 })
  }
}

/** PUT /api/settings — store the classification (admins only). */
export async function PUT(req: NextRequest) {
  try {
    await ensureReady()
    const user = await sessionUser(req.cookies.get(SESSION_COOKIE)?.value)
    if (!user) return unauthorized()
    if (user.role !== "dev" && user.role !== "admin") return forbidden()
    const body = await req.json().catch(() => null)
    const roles = parseRoles(body?.roles)
    if (!roles) {
      return NextResponse.json({ ok: false, error: "badroles" }, { status: 400 })
    }
    const json = JSON.stringify(roles)
    const now = new Date().toISOString()
    await db.$executeRaw`INSERT INTO "AppSetting" ("key", "value", "updatedAt")
       VALUES (${ROLES_KEY}, ${json}, ${now})
       ON CONFLICT ("key") DO UPDATE SET "value" = ${json}, "updatedAt" = ${now}`
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error("settings put error", e)
    return NextResponse.json({ ok: false, error: "server" }, { status: 500 })
  }
}
