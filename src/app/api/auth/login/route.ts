import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { ensureReady } from "@/lib/bootstrap"
import {
  createSession,
  ipFailed,
  ipLimited,
  isLocked,
  clearFailures,
  registerFailure,
  verifyPassword,
  SESSION_COOKIE,
  type Role,
} from "@/lib/auth"

export const dynamic = "force-dynamic"

const SESSION_HOURS = 12
const SESSION_HOURS_REMEMBER = 24 * 30

export async function POST(req: NextRequest) {
  try {
    await ensureReady()
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local"
    if (ipLimited(ip)) {
      return NextResponse.json({ ok: false, error: "rate" }, { status: 429 })
    }

    const body = await req.json().catch(() => null)
    const username = String(body?.u ?? "").trim()
    const password = String(body?.p ?? "")
    const remember = !!body?.remember
    if (!username || !password) {
      return NextResponse.json({ ok: false, error: "fill" }, { status: 400 })
    }

    // users table is tiny — fetch and match case-insensitively (offline
    // behavior: "amin" and "Amin" are the same account)
    const users = await db.user.findMany()
    const u = users.find((x) => x.username.toLowerCase() === username.toLowerCase())
    if (!u) {
      ipFailed(ip)
      return NextResponse.json({ ok: false, error: "invalid" }, { status: 401 })
    }
    if (!u.active) {
      return NextResponse.json({ ok: false, error: "inactive" }, { status: 403 })
    }
    if (isLocked(u)) {
      ipFailed(ip)
      return NextResponse.json({ ok: false, error: "locked" }, { status: 423 })
    }
    if (!verifyPassword(password, u.pwHash)) {
      await registerFailure(u.username)
      ipFailed(ip)
      return NextResponse.json({ ok: false, error: "invalid" }, { status: 401 })
    }

    await clearFailures(u.id)
    const hours = remember ? SESSION_HOURS_REMEMBER : SESSION_HOURS
    const { token, maxAge } = await createSession(u.id, hours)

    const res = NextResponse.json({
      ok: true,
      user: {
        u: u.username,
        role: u.role as Role,
        canUpload: u.canUpload || u.role === "dev" || u.role === "admin",
      },
    })
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge,
    })
    return res
  } catch (e) {
    console.error("login error", e)
    return NextResponse.json({ ok: false, error: "server" }, { status: 500 })
  }
}
