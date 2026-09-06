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

type Ctx = { params: Promise<{ id: string }> }

/**
 * POST /api/users/[id]/password — set a new password.
 * Admins may set anyone's (including their own); regular users may
 * set ONLY their own (must be logged in as that user).
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    await ensureReady()
    const me = await sessionUser(req.cookies.get(SESSION_COOKIE)?.value)
    if (!me) return unauthorized()

    const { id: idStr } = await ctx.params
    const id = Number(idStr)
    if (!Number.isInteger(id) || id < 1) {
      return NextResponse.json({ ok: false, error: "badid" }, { status: 400 })
    }
    const isAdmin = me.role === "dev" || me.role === "admin"
    if (id !== me.id && !isAdmin) return forbidden()

    const u = await db.user.findUnique({ where: { id } })
    if (!u) {
      return NextResponse.json({ ok: false, error: "notfound" }, { status: 404 })
    }

    const body = await req.json().catch(() => null)
    const password = String(body?.p ?? "")
    if (password.length < 4) {
      return NextResponse.json({ ok: false, error: "badpass" }, { status: 400 })
    }

    await db.user.update({
      where: { id },
      data: { pwHash: hashPassword(password), failedCount: 0, lockedUntil: null },
    })
    // password change invalidates that user's other sessions (clean state)
    if (id === me.id) {
      const token = req.cookies.get(SESSION_COOKIE)?.value
      if (token) {
        await db.session.deleteMany({ where: { id: { not: token }, userId: id } })
      }
    } else {
      await db.session.deleteMany({ where: { userId: id } })
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error("password set error", e)
    return NextResponse.json({ ok: false, error: "server" }, { status: 500 })
  }
}
