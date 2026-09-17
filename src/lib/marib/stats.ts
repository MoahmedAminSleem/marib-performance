/* Marib runtime stats (R62 — Logging & Observability)
   عدادات تشغيلية خفيفة على globalThis (بتعيش مع العملية وبتتصفّر
   معها — مش بديل عن الأوديت اللي هو سجل الأعمال الدائم).
   مين بيكتب:
     - db.ts: كل استعلام (عدد/زمن/بطيء/فاشل) عبر timedQuery
     - http.ts serverFail: كل خطأ 5xx
   مين بيقرأ:
     - /api/health stats — رابط واحد للمالك يجاوب على: النسخة شغالة
       من قد إيه؟ · عملت قد إيه استعلام وبكام زمن؟ · فين آخر خطأ؟
       · الذاكرة قد إيه؟ (R57 خلت boot مرئي — R62 كمّلت بالباقي)
   مفيش بيانات حساسة: أرقام وطوابع ورسايل أخطاء مقصوصة 200 حرف —
   مفيش passwords ولا tokens ولا قيم بارامترات. */

export interface MaribStats {
  startedAt: number; /** طابع بدء العملية (ms) — uptime منها */
  qCount: number; /** إجمالي الاستعلامات */
  qSlow: number; /** الاستعلامات اللي عدّت عتبة البطء */
  qMs: number; /** إجمالي زمن الاستعلامات (ms) */
  qErrors: number; /** استعلامات فشلت */
  srvErrors: number; /** أخطاء 5xx (serverFail) */
  lastError: string | null; /** آخر خطأ (رسالة مقصوصة) */
  lastErrorAt: string | null; /** طابع آخر خطأ ISO */
}

const g = globalThis as unknown as { __maribStats?: MaribStats };

/** العدادات — بتتنشأ بأول قراءة وبتفضل نفس المرجع طول حياة العملية. */
export function stats(): MaribStats {
  if (!g.__maribStats) {
    g.__maribStats = {
      startedAt: Date.now(),
      qCount: 0,
      qSlow: 0,
      qMs: 0,
      qErrors: 0,
      srvErrors: 0,
      lastError: null,
      lastErrorAt: null,
    };
  }
  return g.__maribStats;
}

/** تسجيل آخر خطأ (بدون رمي) — برسالة مقصوصة 200 حرف. */
export function noteError(msg: string): void {
  const s = stats();
  s.lastError = String(msg).slice(0, 200);
  s.lastErrorAt = new Date().toISOString();
}

/** لقطة جاهزة للعرض في /api/health — القيم الحية بس، مفيش حالات. */
export function statsSnapshot(): {
  uptime_s: number;
  q: { count: number; slow: number; ms_total: number; errors: number };
  srv_errors: number;
  last_error: { at: string | null; msg: string } | null;
  mem: { rss_mb: number };
  node: string;
} {
  const s = stats();
  const m = process.memoryUsage();
  return {
    uptime_s: Math.max(0, Math.round((Date.now() - s.startedAt) / 1000)),
    q: { count: s.qCount, slow: s.qSlow, ms_total: s.qMs, errors: s.qErrors },
    srv_errors: s.srvErrors,
    last_error: s.lastError === null ? null : { at: s.lastErrorAt, msg: s.lastError },
    mem: { rss_mb: Math.round(m.rss / 1048576) },
    node: process.version,
  };
}
