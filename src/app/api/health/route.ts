/* /api/health — فحص حيوية النظام.
   R48 (refactoring): كان بيقرأ من نظام Prisma القديم (User/MonthData)
   اللي الفرونت مش بيستخدمه خالص — اتنقل على نظام marib الحي، فالتشيك
   بقى بيبص على الجداول الشغالة فعلًا (المستخدمين، الشهور، الموظفين). */

import { q, ensureBoot } from "@/lib/marib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    await ensureBoot();
    const users = await q("SELECT COUNT(*)::int AS n FROM marib_user");
    const months = await q("SELECT COUNT(DISTINCT month)::int AS n FROM marib_data");
    const emps = await q("SELECT COUNT(*)::int AS n FROM marib_emp WHERE vac = false");
    return Response.json({
      ok: true,
      users: users[0]?.n ?? 0,
      months: months[0]?.n ?? 0,
      employees: emps[0]?.n ?? 0,
    });
  } catch {
    return Response.json({ ok: false }, { status: 500 });
  }
}
