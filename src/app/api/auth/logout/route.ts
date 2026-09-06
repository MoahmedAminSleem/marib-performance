import { NextRequest, NextResponse } from "next/server"
import { ensureReady } from "@/lib/bootstrap"
import { SESSION_COOKIE, destroySession } from "@/lib/auth"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  try {
    await ensureReady()
    const token = req.cookies.get(SESSION_COOKIE)?.value
    if (token) await destroySession(token)
  } catch (e) {
    console.error("logout error", e)
  }
  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 })
  return res
}
