import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { ensureReady, monthLabel } from "@/lib/bootstrap"
import { SESSION_COOKIE, sessionUser, unauthorized, forbidden } from "@/lib/auth"

export const dynamic = "force-dynamic"

const KEY_RE = /^\d{4}-(0[1-9]|1[0-2])$/
const MAX_PACK_JSON = 6 * 1024 * 1024 // 6MB safety cap

type Ctx = { params: Promise<{ key: string }> }

/** GET /api/months/[key] — the month's packed tables. */
export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    await ensureReady()
    const user = await sessionUser(req.cookies.get(SESSION_COOKIE)?.value)
    if (!user) return unauthorized()
    const { key } = await ctx.params
    if (!KEY_RE.test(key)) {
      return NextResponse.json({ ok: false, error: "badkey" }, { status: 400 })
    }
    const row = await db.monthData.findUnique({ where: { monthKey: key } })
    if (!row) {
      return NextResponse.json({ ok: false, error: "notfound" }, { status: 404 })
    }
    return NextResponse.json({
      ok: true,
      month: key,
      label: row.label || monthLabel(key),
      pack: JSON.parse(row.packJson),
      names: safeNames(row.fileNames),
      at: row.updatedAt.toISOString(),
    })
  } catch (e) {
    console.error("month get error", e)
    return NextResponse.json({ ok: false, error: "server" }, { status: 500 })
  }
}

/** POST /api/months/[key] — upload/replace a month (uploaders only). */
export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    await ensureReady()
    const user = await sessionUser(req.cookies.get(SESSION_COOKIE)?.value)
    if (!user) return unauthorized()
    if (!user.canUpload) return forbidden()
    const { key } = await ctx.params
    if (!KEY_RE.test(key)) {
      return NextResponse.json({ ok: false, error: "badkey" }, { status: 400 })
    }

    const body = await req.json().catch(() => null)
    const pack = body?.pack
    if (!pack || typeof pack !== "object") {
      return NextResponse.json({ ok: false, error: "badpack" }, { status: 400 })
    }
    const dd = pack.dd
    if (!dd || !Array.isArray(dd.c) || !Array.isArray(dd.r)) {
      return NextResponse.json({ ok: false, error: "badpack" }, { status: 400 })
    }
    // rows must be arrays of primitives (packTables format)
    for (const row of dd.r.slice(0, 50)) {
      if (!Array.isArray(row)) {
        return NextResponse.json({ ok: false, error: "badpack" }, { status: 400 })
      }
    }
    const packJson = JSON.stringify(pack)
    if (packJson.length > MAX_PACK_JSON) {
      return NextResponse.json({ ok: false, error: "toolarge" }, { status: 413 })
    }

    const names = Array.isArray(body?.names)
      ? body.names.slice(0, 20).map((x: unknown) => String(x).slice(0, 120))
      : []
    const label = typeof body?.label === "string" && body.label.trim()
      ? body.label.trim().slice(0, 40)
      : monthLabel(key)

    await db.monthData.upsert({
      where: { monthKey: key },
      create: {
        monthKey: key,
        label,
        packJson,
        fileNames: JSON.stringify(names),
        uploadedById: user.id,
      },
      update: {
        label,
        packJson,
        fileNames: JSON.stringify(names),
        uploadedById: user.id,
        uploadedAt: new Date(),
      },
    })
    return NextResponse.json({ ok: true, month: key, label })
  } catch (e) {
    console.error("month post error", e)
    return NextResponse.json({ ok: false, error: "server" }, { status: 500 })
  }
}

/** DELETE /api/months/[key] — remove a month (admins only). */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  try {
    await ensureReady()
    const user = await sessionUser(req.cookies.get(SESSION_COOKIE)?.value)
    if (!user) return unauthorized()
    if (user.role !== "dev" && user.role !== "admin") return forbidden()
    const { key } = await ctx.params
    if (!KEY_RE.test(key)) {
      return NextResponse.json({ ok: false, error: "badkey" }, { status: 400 })
    }
    await db.monthData.deleteMany({ where: { monthKey: key } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error("month delete error", e)
    return NextResponse.json({ ok: false, error: "server" }, { status: 500 })
  }
}

function safeNames(s: string): string[] {
  try {
    const a = JSON.parse(s)
    return Array.isArray(a) ? a.map(String) : []
  } catch {
    return []
  }
}
