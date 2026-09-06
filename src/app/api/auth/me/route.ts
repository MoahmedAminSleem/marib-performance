import { NextRequest, NextResponse } from "next/server"
import { ensureReady } from "@/lib/bootstrap"
import { SESSION_COOKIE, sessionUser } from "@/lib/auth"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  try {
    await ensureReady()
    const token = req.cookies.get(SESSION_COOKIE)?.value
    const user = await sessionUser(token)
    if (!user) {
      return NextResponse.json({ ok: false }, { status: 401 })
    }
    return NextResponse.json({
      ok: true,
      user: { u: user.username, role: user.role, canUpload: user.canUpload },
    })
  } catch (e) {
    console.error("me error", e)
    return NextResponse.json({ ok: false, error: "server" }, { status: 500 })
  }
}
