import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { ensureReady } from "@/lib/bootstrap"
import {
  SESSION_COOKIE,
  sessionUser,
  unauthorized,
  forbidden,
  hashPassword,
} from "@/lib/auth"

export const dynamic = "force-dynamic"

const NAME_RE = /^[\p{L}\p{N}_. -]{2,32}$/u

/** GET /api/users — list (admins only). */
export async function GET(req: NextRequest) {
  try {
    await ensureReady()
    const me = await sessionUser(req.cookies.get(SESSION_COOKIE)?.value)
    if (!me) return unauthorized()
    if (me.role !== "dev" && me.role !== "admin") return forbidden()
    const users = await db.user.findMany({ orderBy: { id: "asc" } })
    return NextResponse.json({
      ok: true,
      users: users.map((u) => ({
        id: u.id,
        u: u.username,
        role: u.role,
        canUpload: u.canUpload || u.role === "dev" || u.role === "admin",
        active: u.active,
      })),
    })
  } catch (e) {
    console.error("users list error", e)
    return NextResponse.json({ ok: false, error: "server" }, { status: 500 })
  }
}

/** POST /api/users — create a user (admins only). */
export async function POST(req: NextRequest) {
  try {
    await ensureReady()
    const me = await sessionUser(req.cookies.get(SESSION_COOKIE)?.value)
    if (!me) return unauthorized()
    if (me.role !== "dev" && me.role !== "admin") return forbidden()

    const body = await req.json().catch(() => null)
    const username = String(body?.u ?? "").trim()
    const password = String(body?.p ?? "")
    const role = body?.role === "admin" ? "admin" : "user"
    const canUpload = !!body?.canUpload || role === "admin"

    if (!NAME_RE.test(username)) {
      return NextResponse.json({ ok: false, error: "badname" }, { status: 400 })
    }
    if (password.length < 4) {
      return NextResponse.json({ ok: false, error: "badpass" }, { status: 400 })
    }
    const users = await db.user.findMany({ select: { username: true } })
    if (users.some((x) => x.username.toLowerCase() === username.toLowerCase())) {
      return NextResponse.json({ ok: false, error: "dup" }, { status: 409 })
    }

    const u = await db.user.create({
      data: { username, role, canUpload, active: true, pwHash: hashPassword(password) },
    })
    return NextResponse.json({ ok: true, id: u.id })
  } catch (e) {
    console.error("user create error", e)
    return NextResponse.json({ ok: false, error: "server" }, { status: 500 })
  }
}
