/* /api/health — فحص حيوية النظام.
   R48 (refactoring): كان بيقرأ من نظام Prisma القديم (User/MonthData)
   اللي الفرونت مش بيستخدمه خالص — اتنقل على نظام marib الحي، فالتشيك
   بقى بيبص على الجداول الشغالة فعلًا (المستخدمين، الشهور، الموظفين). */

import { q, ensureBoot, driverName, bootInfo } from "@/lib/marib/db";
import { statsSnapshot } from "@/lib/marib/stats";
import { logger } from "@/lib/marib/http";

const lg = logger("health");

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const t0 = Date.now();
  try {
    await ensureBoot();
    const users = await q("SELECT COUNT(*)::int AS n FROM marib_user");
    const months = await q("SELECT COUNT(DISTINCT month)::int AS n FROM marib_data");
    const emps = await q("SELECT COUNT(*)::int AS n FROM marib_emp WHERE vac = false");
    /* R54: مراقبة — زمن الفحص نفسه مقياس تشغيلي مفيد (بطء الجداول
       = أول علامة لمشكلة). أرقام فقط، مفيش بيانات حساسة. */
    lg.info("health ok", { ms: Date.now() - t0 });
    return Response.json({
      ok: true,
      /* R56: db = neon على الإنتاج (Vercel) و pglite محليًا —
         إثبات مرئي إن الداتا بتتحفظ على سيرفر Neon. */
      db: driverName(),
      /* R57 (perf): boot = ازاي اقلعت النسخة دي — "fast" يعني بوابة
         boot_ver اتخطت باستعلام واحد (بدل ~44 استعلام DDL على كل
         إقلاع بارد)، و "full" يعني الـ DDL اشتغل فعليًا. */
      boot: bootInfo(),
      users: users[0]?.n ?? 0,
      months: months[0]?.n ?? 0,
      employees: emps[0]?.n ?? 0,
      /* R62 (observability): رابط واحد بيجاوب — النسخة شغالة من
         قد إيه · عملت قد إيه استعلام وبكام زمن وفيه كام بطيء ·
         آخر خطأ إيه وامتى · الذاكرة قد إيه. عدادات حية بالطبيعة
         (بتتصفّر مع كل عملية جديدة) زي boot بالظبط. */
      stats: statsSnapshot(),
    });
  } catch (e) {
    lg.error("health failed", { err: String(e), ms: Date.now() - t0 });
    return Response.json({ ok: false }, { status: 500 });
  }
}
