/* /api/manpower — R38 الاتزان v2 (Marib 3 structure)
   GET  (any signed-in user) → one small snapshot per session:
         { depts:[[id,name,parent,ord]…],
           emps: [[id,code,name,job,deptId,hire,vac,note,mach]…],
           req:  {nodeKey: required},          (manual overrides only)
           transfers: [[at,actor,code,name,fromDept,fromJob,toDept,toJob,kind,note]…] }
         All tree/variance math stays client-side — the server never
         gets heavy (828 rows is lighter than R37's 2005).
   POST (admin+) → one tiny action at a time:
         add / edit / fill / vacAdd / vacDel / deptAdd / deptRename /
         deptMove / deptDelete / req / import.
         Actual/required rule (the owner's): every row = one required
         position; a row with an empty name = a vacancy (missing).
         required(node) = rows, actual(node) = filled rows, the manual
         req value is an override on top. */

import { NextRequest, NextResponse } from "next/server";
import { q, audit } from "@/lib/marib/db";
import { fail, serverFail, readJson, logger, requireUser, requireRoleBody } from "@/lib/marib/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const lg = logger("manpower");

function cleanStr(v: unknown, max = 120): string {
  return String(v ?? "").trim().slice(0, max);
}
function normCode(v: unknown): string {
  const t = cleanStr(v, 20);
  return t === "None" ? "" : t;
}

/* full display path of a dept node (used inside transfer rows) */
async function deptPath(id: string | null): Promise<string> {
  if (!id) return "";
  const byId = new Map<string, { name: string; parent: string | null }>();
  const all = await q("SELECT id, name, parent_id FROM marib_dept");
  for (const r of all) byId.set(r.id as string, { name: r.name as string, parent: (r.parent_id as string) || null });
  const parts: string[] = [];
  let cur = byId.get(id);
  let guard = 0;
  while (cur && guard++ < 30) {
    parts.unshift(cur.name);
    cur = cur.parent ? byId.get(cur.parent) : undefined;
  }
  return parts.join(" - ");
}

/* one transfer record — kind: move (dept+job), dept, job, dept-move,
   dept-rename, fill, import-out */
async function logTransfer(
  actor: string,
  code: string,
  name: string,
  oldDept: string, oldJob: string | null,
  newDept: string, newJob: string | null,
  kind = "move",
  note: string | null = null
): Promise<void> {
  await q(
    `INSERT INTO marib_transfer (actor, code, name, from_dept, from_job, to_dept, to_job, kind, note)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [actor, code, name, oldDept, oldJob, newDept, newJob, kind, note]
  );
}

/* ---------- R42: Arabic-aware name normalization ----------
   للمطابقة الذكية في الاستيراد والبحث: المسافات الزيادة، الشرطات
   المختلفة، وحالة الأحرف — بحيث "PRO. - Q.A. - SEWING  " في الشيت
   تلقى "PRO. - Q.A. - SEWING" على الموقع. */
function normName(v: unknown): string {
  return String(v ?? "")
    .replace(/[\u064B-\u065F\u0640]/g, "")          /* تشكيل + تطويل */
    .replace(/[\u2010-\u2015]/g, "-")                /* every dash → - */
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/* ---------- R42: الترجمة التلقائية المجانية ----------
   Google gtx endpoint (بدون مفتاح، بدون حدود عملية) + MyMemory كاحتياطي.
   الاتجاه: لو الكلمة عربية → ar→en + ar→tr، غير كده → en→ar + en→tr.
   النتيجة تتخزن في marib_i18n — مرة واحدة لكل كلمة. الفشل صامت:
   الكلمة تظهر زي ما هي (مفيش ترجمة أحسن من ترجمة غلط). */
const AR_RE = /[\u0600-\u06FF]/;
async function gtx(text: string, from: string, to: string, host = "translate.googleapis.com"): Promise<string> {
  const u =
    "https://" + host + "/translate_a/single?client=gtx&sl=" +
    from + "&tl=" + to + "&dt=t&q=" + encodeURIComponent(text);
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 3500);
  try {
    const r = await fetch(u, { signal: ctl.signal });
    if (!r.ok) return "";
    const j = (await r.json()) as unknown;
    const segs = (j as unknown[][])?.[0];
    if (!Array.isArray(segs)) return "";
    return segs.map((s) => (Array.isArray(s) && s[0]) ? String(s[0]) : "").join("").trim();
  } catch {
    return "";
  } finally {
    clearTimeout(t);
  }
}
async function myMemory(text: string, from: string, to: string): Promise<string> {
  try {
    const u =
      "https://api.mymemory.translated.net/get?q=" + encodeURIComponent(text) +
      "&langpair=" + from + "|" + to;
    const r = await fetch(u);
    if (!r.ok) return "";
    const j = (await r.json()) as { responseData?: { translatedText?: string } };
    const out = String(j?.responseData?.translatedText || "").trim();
    /* MyMemory يرجع أحيانًا رسائل خطأ كنص — تجاهلها */
    if (!out || /MYMEMORY WARNING|INVALID/i.test(out)) return "";
    return out;
  } catch {
    return "";
  }
}
async function translateInto(text: string, from: string, to: string): Promise<string> {
  /* R43: مضيفين لجوجل + MyMemory — 3 فرص قبل ما الكلمة تفضل زي ما هي */
  return (await gtx(text, from, to))
    || (await gtx(text, from, to, "translate.google.com"))
    || (await myMemory(text, from, to));
}
/* يترجم مصطلحًا للغتين التانيتين ويخزنهم — يستخدمها deptAdd/deptRename
   و trSync (الدفعات اللي بيبعتها العميل). */
async function translateAndStore(term: string): Promise<void> {
  const t = cleanStr(term, 90);
  if (!t || t.length < 2) return;
  const have = await q("SELECT lang FROM marib_i18n WHERE term = $1", [t]);
  const done = new Set(have.map((r) => r.lang as string));
  const from = AR_RE.test(t) ? "ar" : "en";
  const targets: string[] = from === "ar" ? ["en", "tr"] : ["ar", "tr"];
  /* R43: اللغتين بالتوازي */
  await Promise.all(targets.map(async (tl) => {
    if (done.has(tl)) return;
    const out = await translateInto(t, from, tl);
    if (out && out !== t) {
      await q(
        `INSERT INTO marib_i18n (term, lang, tr) VALUES ($1, $2, $3)
         ON CONFLICT (term, lang) DO UPDATE SET tr = $3, at = now()`,
        [t, tl, out.slice(0, 90)]
      );
    }
  }));
}

export async function GET(req: NextRequest) {
  try {
    const g = await requireUser(req, "manpower", "GET");
    if (g.res) return g.res;

    const depts = await q("SELECT id, name, parent_id, ord FROM marib_dept ORDER BY ord ASC");
    const emps = await q(
      `SELECT id, code, name, job, dept_id, hire, vac, note, mach, name_ar, job_ar FROM marib_emp
       ORDER BY ord ASC`
    );
    const reqRows = await q("SELECT node_key, required FROM marib_req");
    const trs = await q(
      `SELECT id, at, actor, code, name, from_dept, from_job, to_dept, to_job, kind, note
       FROM marib_transfer ORDER BY at DESC LIMIT 2000`
    );
    /* R42: اسم الجذر (مأرب 3 / Marib 3) + خريطة الترجمات التلقائية */
    const rootRow = await q("SELECT value FROM marib_setting WHERE key = 'mp_root'");
    const root =
      rootRow[0] && typeof rootRow[0].value === "object"
        ? (rootRow[0].value as Record<string, string>)
        : null;
    const trRows = await q("SELECT term, lang, tr FROM marib_i18n");
    const tr: Record<string, Record<string, string>> = {};
    for (const r of trRows) {
      const term = r.term as string;
      (tr[term] = tr[term] || {})[r.lang as string] = r.tr as string;
    }
    return NextResponse.json({
      depts: depts.map((r) => [r.id, r.name, r.parent_id || "", r.ord]),
      emps: emps.map((r) => [r.id, r.code || "", r.name || "", r.job || "", r.dept_id || "", r.hire || "", r.vac ? 1 : 0, r.note || "", r.mach || "", r.name_ar || "", r.job_ar || ""]),
      req: reqRows.reduce<Record<string, number>>((acc, r) => {
        acc[r.node_key as string] = r.required as number;
        return acc;
      }, {}),
      transfers: trs.map((t) => [
        t.at, t.actor, t.code, t.name, t.from_dept, t.from_job, t.to_dept, t.to_job, t.kind, t.note || "", t.id || "",
      ]),
      root: root || { ar: "مأرب 3", en: "Marib 3", tr: "Marib 3" },
      tr,
    });
  } catch (e) {
    return serverFail("manpower", "GET", e);
  }
}

export async function POST(req: NextRequest) {
  try {
    /* editing the manpower structure is an admin+ job — viewers get 403 */
    const g = await requireRoleBody(req, "admin");
    if (g.res) return g.res;
    const me = g.user!;
    const actor = me.username;

    const body = await readJson(req);
    if (!body) return fail("body", 413);
    const action = String(body.action || "");

    /* ---------- R42: تسمية الجذر (مأرب 3 / Marib 3) لكل لغة ---------- */
    if (action === "rootSet") {
      const ar = cleanStr(body.ar, 40);
      const en = cleanStr(body.en, 40);
      const tr = cleanStr(body.tr, 40);
      if (!ar || !en || !tr) return fail("fields", 400);
      const val = { ar, en, tr };
      await q(
        `INSERT INTO marib_setting (key, value, updated_at, updated_by)
         VALUES ('mp_root', $1::jsonb, now(), $2)
         ON CONFLICT (key) DO UPDATE SET value = $1::jsonb, updated_at = now(), updated_by = $2`,
        [JSON.stringify(val), actor]
      );
      await audit(actor, "edit", "manpower-root", ar, { to: val });
      return NextResponse.json({ ok: true, root: val });
    }

    /* ---------- R42: نقل مجموعة موظفين مرة واحدة (multi-select) ----------
       نفس منطق edit بالظبط لكل واحد — بس في طلب واحد، وكل واحد
       بياخد سطر الأرشيف الخاص بيه عشان السجل يفضل فردي. */
    if (action === "editMany") {
      const ids = Array.isArray(body.ids) ? (body.ids as unknown[]).map((x) => cleanStr(x, 40)).filter(Boolean) : [];
      const deptId = cleanStr(body.deptId, 40);
      const job = body.job !== undefined && body.job !== null ? cleanStr(body.job, 90) : null;
      if (!ids.length || ids.length > 500) return fail("ids", 400);
      if (!deptId) return fail("fields", 400);
      const parent = await q("SELECT 1 FROM marib_dept WHERE id = $1 LIMIT 1", [deptId]);
      if (!parent.length) return fail("parent", 404);
      const newPath = await deptPath(deptId);
      let moved = 0;
      for (const id of ids) {
        const cur = await q("SELECT id, code, name, job, dept_id FROM marib_emp WHERE id = $1 LIMIT 1", [id]);
        if (!cur.length) continue;
        const old = cur[0];
        const newJob = job !== null ? job : (old.job as string) || "";
        const oldPath = await deptPath(old.dept_id as string);
        await q(
          `UPDATE marib_emp SET dept_id=$2, job=$3, updated_at=now() WHERE id=$1`,
          [old.id, deptId, newJob]
        );
        if (oldPath !== newPath || (old.job as string) !== newJob) {
          await logTransfer(actor, (old.code as string) || "جديد", old.name as string, oldPath, old.job as string, newPath, newJob);
          moved++;
        }
      }
      await audit(actor, "edit", "manpower", `${ids.length} موظف`, { to: newPath, moved });
      return NextResponse.json({ ok: true, moved });
    }

    /* ---------- R42: حذف مجموعة (multi-select) — كل واحد بياخد خروجه في الأرشيف ---------- */
    if (action === "delMany") {
      const ids = Array.isArray(body.ids) ? (body.ids as unknown[]).map((x) => cleanStr(x, 40)).filter(Boolean) : [];
      if (!ids.length || ids.length > 500) return fail("ids", 400);
      let gone = 0;
      for (const id of ids) {
        const cur = await q("SELECT id, code, name, job, dept_id, vac FROM marib_emp WHERE id = $1 LIMIT 1", [id]);
        if (!cur.length || cur[0].vac) continue;
        const old = cur[0];
        const p = await deptPath(old.dept_id as string);
        await q("DELETE FROM marib_emp WHERE id = $1 AND vac = false", [id]);
        await logTransfer(actor, (old.code as string) || "جديد", old.name as string, p, old.job as string, "—", "—", "out", "خروج من الموقع");
        gone++;
      }
      await audit(actor, "delete", "manpower", `${gone} موظف`, { ids: gone });
      return NextResponse.json({ ok: true, deleted: gone });
    }

    /* ---------- R42: مسح سجلات من أرشيف النقل (multi-select في الأرشيف) ---------- */
    if (action === "archDel") {
      const ids = Array.isArray(body.ids) ? (body.ids as unknown[]).map((x) => cleanStr(x, 40)).filter(Boolean) : [];
      if (!ids.length || ids.length > 1000) return fail("ids", 400);
      let gone = 0;
      for (const id of ids) {
        const chk = await q("SELECT id FROM marib_transfer WHERE id = $1 LIMIT 1", [id]);
        if (!chk.length) continue;
        await q("DELETE FROM marib_transfer WHERE id = $1", [id]);
        gone++;
      }
      await audit(actor, "delete", "manpower-arch", `${gone} سجل`, {});
      return NextResponse.json({ ok: true, deleted: gone });
    }

    /* ---------- R42: ترجمة تلقائية دفعة واحدة ----------
       العميل بيبعت المصطلحات اللي ملهاش ترجمة (أقسام/وظايف جديدة) —
       السيرفر يترجمها بالخدمة المجانية ويخزنها ويرجّع الخريطة كلها. */
    if (action === "trSync") {
      const terms = Array.isArray(body.terms)
        ? (body.terms as unknown[]).map((x) => cleanStr(x, 90)).filter(Boolean).slice(0, 100)
        : [];
      const have = new Set((await q("SELECT term FROM marib_i18n")).map((r) => r.term as string));
      const todo = terms.filter((t) => !have.has(t));
      /* R43: 8 مصطلحات بالتوازي — أسرع بكتير من التتابع (Vercel-safe) */
      for (let i = 0; i < todo.length; i += 8) {
        await Promise.all(todo.slice(i, i + 8).map((t) => translateAndStore(t).catch(() => {})));
      }
      const trRows = await q("SELECT term, lang, tr FROM marib_i18n");
      const tr: Record<string, Record<string, string>> = {};
      for (const r of trRows) {
        const term = r.term as string;
        (tr[term] = tr[term] || {})[r.lang as string] = r.tr as string;
      }
      return NextResponse.json({ ok: true, tr });
    }

    /* ---------- add one employee (code optional — blank = جديد) ---------- */
    if (action === "add") {
      const code = normCode(body.code);
      const name = cleanStr(body.name, 90);
      const job = cleanStr(body.job, 90);
      const deptId = cleanStr(body.deptId, 40);
      const hire = cleanStr(body.hire, 10);
      const nameAr = cleanStr(body.name_ar, 90);   /* R47: العربي من المودال */
      const jobAr = cleanStr(body.job_ar, 90);     /* R47 */
      if (!name || !deptId) return fail("fields", 400);
      if (hire && !/^\d{4}-\d{2}-\d{2}$/.test(hire)) return fail("hire", 400);
      if (code && code !== "جديد") {
        const dup = await q("SELECT 1 FROM marib_emp WHERE code = $1 LIMIT 1", [code]);
        if (dup.length) return fail("dup", 409);
      }
      const ord = await q("SELECT COALESCE(MAX(ord),0)+1 AS n FROM marib_emp");
      await q(
        `INSERT INTO marib_emp (code, name, job, dept_id, hire, vac, ord, name_ar, job_ar)
         VALUES ($1, $2, $3, $4, $5, false, $6, $7, $8)`,
        [code || "جديد", name, job, deptId, hire, ord[0]?.n ?? 1, nameAr || null, jobAr || null]
      );
      const p = await deptPath(deptId);
      await audit(actor, "create", "manpower", name, { code: code || "جديد", dept: p, job });
      return NextResponse.json({ ok: true });
    }

    /* ---------- edit one employee (dept/job change ⇒ transfer row) ---------- */
    if (action === "edit") {
      const id = cleanStr(body.id, 40);
      const code = normCode(body.code);
      if (!id && !code) return fail("code", 400);
      const cur = await q(
        "SELECT id, code, name, job, dept_id, hire, name_ar, job_ar FROM marib_emp WHERE id = $1 OR code = $1 LIMIT 1",
        [id || code]
      );
      if (!cur.length) return fail("none", 404);
      const old = cur[0];
      const name = body.name !== undefined ? cleanStr(body.name, 90) : (old.name as string);
      const job = body.job !== undefined ? cleanStr(body.job, 90) : (old.job as string);
      const deptId = body.deptId !== undefined ? cleanStr(body.deptId, 40) : (old.dept_id as string);
      const hire = body.hire !== undefined ? cleanStr(body.hire, 10) : (old.hire as string);
      /* R47: الاسم/الوظيفة بالعربي — القيمة من المودال مباشرة، ولو فاضية
         والقيمة الأساسية اتغيرت من عربي لحاجة تانية، بنحفظ العربي القديم
         تلقائيًا في حقله (حماية من ضياع العربي — مبدأ ممنوع مسح البيانات).
         مسح العربي بيحصل بكتابة القيمة الجديدة أو تفريغ الحقل مع تثبيت
         نفس الاسم (حينها مفيش تغيير فمفيش حفظ تلقائي). */
      const hasArabic = (s: unknown): boolean => /[\u0600-\u06FF]/.test(String(s || ""));
      let nameAr = body.name_ar !== undefined ? cleanStr(body.name_ar, 90) : ((old.name_ar as string) || "");
      if (!nameAr && body.name !== undefined && name !== (old.name as string) && hasArabic(old.name) && !(old.name_ar as string)) {
        nameAr = (old.name as string);
      }
      let jobAr = body.job_ar !== undefined ? cleanStr(body.job_ar, 90) : ((old.job_ar as string) || "");
      if (!jobAr && body.job !== undefined && job !== (old.job as string) && hasArabic(old.job) && !(old.job_ar as string)) {
        jobAr = (old.job as string);
      }
      /* allow setting the code of a جديد row (code pending) — never steal
         a code that already belongs to someone else.
         R45: مسح الكود بقى مسموح — فاضي أو «جديد» يرجّع الموظف لحالة
         «من غير كود» (NULL) عشان لو حد غلط في الكود يرجّعه براحته */
      let newCode = old.code as string | null;
      if (body.code !== undefined) {
        const c = normCode(body.code);
        if (c === "" || c === "جديد") {
          newCode = null;   /* back to no-code state */
        } else if (c && c !== (old.code || "")) {
          const dup = await q("SELECT 1 FROM marib_emp WHERE code = $1 AND id <> $2 LIMIT 1", [c, old.id]);
          if (dup.length) return fail("dup", 409);
          newCode = c;
        }
      }
      if (!name || !deptId) return fail("fields", 400);
      if (hire && !/^\d{4}-\d{2}-\d{2}$/.test(hire)) return fail("hire", 400);
      await q(
        `UPDATE marib_emp SET code=$2, name=$3, job=$4, dept_id=$5, hire=$6, name_ar=$7, job_ar=$8, updated_at=now() WHERE id=$1`,
        [old.id, newCode, name, job, deptId, hire, nameAr || null, jobAr || null]
      );
      const oldPath = await deptPath(old.dept_id as string);
      const newPath = await deptPath(deptId);
      if (oldPath !== newPath || (old.job as string) !== job) {
        await logTransfer(actor, newCode || "جديد", name, oldPath, old.job as string, newPath, job);
      }
      await audit(actor, "edit", "manpower", name, { code: newCode, from: oldPath + " / " + old.job, to: newPath + " / " + job });
      return NextResponse.json({ ok: true });
    }

    /* ---------- delete one employee (R39: the owner manages people on
       the site, away from Excel — deletion keeps a trace: a transfer
       row kind="out" + an audit entry, so the archive answers "مين خرج
       وامتى ومين عمله") ---------- */
    if (action === "del") {
      const id = cleanStr(body.id, 40);
      if (!id) return fail("id", 400);
      const cur = await q("SELECT id, code, name, job, dept_id, vac FROM marib_emp WHERE id = $1 LIMIT 1", [id]);
      if (!cur.length) return fail("none", 404);
      const old = cur[0];
      if (old.vac) return fail("vac", 400); /* vacancies have their own vacDel */
      const p = await deptPath(old.dept_id as string);
      await q("DELETE FROM marib_emp WHERE id = $1 AND vac = false", [id]);
      await logTransfer(
        actor, (old.code as string) || "جديد", old.name as string,
        p, old.job as string, "—", "—", "out", "خروج من الموقع"
      );
      await audit(actor, "delete", "manpower", old.name as string, { code: old.code, dept: p, job: old.job });
      lg.info("employee removed", { actor, name: old.name, code: old.code });
      return NextResponse.json({ ok: true });
    }

    /* ---------- fill a vacancy (turn the empty row into an employee) ---------- */
    if (action === "fill") {
      const id = cleanStr(body.id, 40);
      const code = normCode(body.code);
      const name = cleanStr(body.name, 90);
      const hire = cleanStr(body.hire, 10);
      const nameAr = cleanStr(body.name_ar, 90);   /* R47: العربي من المودال */
      const jobAr = cleanStr(body.job_ar, 90);     /* R47 */
      if (!id || !name) return fail("fields", 400);
      if (hire && !/^\d{4}-\d{2}-\d{2}$/.test(hire)) return fail("hire", 400);
      const cur = await q("SELECT id, code, name, job, dept_id FROM marib_emp WHERE id = $1 AND vac = true LIMIT 1", [id]);
      if (!cur.length) return fail("none", 404);
      const old = cur[0];
      if (code && code !== "جديد") {
        const dup = await q("SELECT 1 FROM marib_emp WHERE code = $1 LIMIT 1", [code]);
        if (dup.length) return fail("dup", 409);
      }
      const p = await deptPath(old.dept_id as string);
      await q(
        `UPDATE marib_emp SET code=$2, name=$3, hire=$4, name_ar=$5, job_ar=$6, vac=false, updated_at=now() WHERE id=$1`,
        [old.id, code || "جديد", name, hire, nameAr || null, jobAr || null]
      );
      await logTransfer(actor, code || "جديد", name, p, (old.job as string) + " (شاغر)", p, old.job as string, "fill");
      await audit(actor, "create", "manpower", name, { filled: old.job, dept: p });
      return NextResponse.json({ ok: true });
    }

    /* ---------- add a vacancy (a required, unfilled position) ---------- */
    if (action === "vacAdd") {
      const deptId = cleanStr(body.deptId, 40);
      const job = cleanStr(body.job, 90);
      if (!deptId || !job) return fail("fields", 400);
      const ord = await q("SELECT COALESCE(MAX(ord),0)+1 AS n FROM marib_emp");
      await q(
        `INSERT INTO marib_emp (code, name, job, dept_id, vac, ord) VALUES (NULL, '', $1, $2, true, $3)`,
        [job, deptId, ord[0]?.n ?? 1]
      );
      const p = await deptPath(deptId);
      await audit(actor, "create", "manpower-vac", job, { dept: p });
      return NextResponse.json({ ok: true });
    }

    /* ---------- remove a vacancy (no longer needed) ---------- */
    if (action === "vacDel") {
      const id = cleanStr(body.id, 40);
      if (!id) return fail("id", 400);
      const cur = await q("SELECT id, job, dept_id FROM marib_emp WHERE id = $1 AND vac = true LIMIT 1", [id]);
      if (!cur.length) return fail("none", 404);
      const p = await deptPath(cur[0].dept_id as string);
      await q("DELETE FROM marib_emp WHERE id = $1 AND vac = true", [id]);
      await audit(actor, "delete", "manpower-vac", cur[0].job as string, { dept: p });
      return NextResponse.json({ ok: true });
    }

    /* ---------- add a dept node ---------- */
    if (action === "deptAdd") {
      const name = cleanStr(body.name, 90);
      const parentId = cleanStr(body.parentId, 40);
      if (!name) return fail("fields", 400);
      if (parentId) {
        const p = await q("SELECT 1 FROM marib_dept WHERE id = $1 LIMIT 1", [parentId]);
        if (!p.length) return fail("parent", 404);
      }
      const ord = await q(
        "SELECT COALESCE(MAX(ord),0)+1 AS n FROM marib_dept WHERE parent_id IS NOT DISTINCT FROM NULLIF($1,'')",
        [parentId]
      );
      const id = crypto.randomUUID();
      await q(
        `INSERT INTO marib_dept (id, name, parent_id, ord) VALUES ($1, $2, NULLIF($3,''), $4)`,
        [id, name, parentId, ord[0]?.n ?? 1]
      );
      const p = await deptPath(id);
      await audit(actor, "create", "manpower-dept", name, { path: p });
      /* R42: القسم الجديد بيتترجم فورًا للغتين التانيتين (مجاني) —
         الفشل صامت: الاسم يفضل ظاهر زي ما هو */
      void translateAndStore(name).catch(() => {});
      return NextResponse.json({ ok: true, id });
    }

    /* ---------- rename a dept node (employees untouched) ---------- */
    if (action === "deptRename") {
      const id = cleanStr(body.id, 40);
      const name = cleanStr(body.name, 90);
      if (!id || !name) return fail("fields", 400);
      const cur = await q("SELECT id, name, parent_id FROM marib_dept WHERE id = $1 LIMIT 1", [id]);
      if (!cur.length) return fail("none", 404);
      const oldPath = await deptPath(id);
      await q("UPDATE marib_dept SET name = $2 WHERE id = $1", [id, name]);
      const newPath = await deptPath(id);
      const n = await q("SELECT COUNT(*)::int AS n FROM marib_emp WHERE dept_id = $1", [id]);
      await logTransfer(actor, "—", cur[0].name as string, oldPath, null, newPath, null, "dept-rename");
      /* R42: الاسم الجديد بيتترجم للغتين التانيتين */
      void translateAndStore(name).catch(() => {});
      await audit(actor, "edit", "manpower-dept", name, { from: oldPath, to: newPath });
      void n;
      return NextResponse.json({ ok: true });
    }

    /* ---------- move a dept node (inside another / out to top) ---------- */
    if (action === "deptMove") {
      const id = cleanStr(body.id, 40);
      const parentId = cleanStr(body.parentId, 40); /* "" = top level */
      if (!id) return fail("id", 400);
      if (id === parentId) return fail("parent", 400);
      const cur = await q("SELECT id, name, parent_id FROM marib_dept WHERE id = $1 LIMIT 1", [id]);
      if (!cur.length) return fail("none", 404);
      if (parentId) {
        const p = await q("SELECT 1 FROM marib_dept WHERE id = $1 LIMIT 1", [parentId]);
        if (!p.length) return fail("parent", 404);
        /* cycle guard: walk up from the new parent — must never reach id */
        let pid: string | null = parentId;
        let guard = 0;
        while (pid && guard++ < 60) {
          if (pid === id) return fail("cycle", 400);
          const up = await q("SELECT parent_id FROM marib_dept WHERE id = $1 LIMIT 1", [pid]);
          pid = (up[0]?.parent_id as string) || null;
        }
      }
      const oldPath = await deptPath(id);
      await q("UPDATE marib_dept SET parent_id = NULLIF($2,'') WHERE id = $1", [id, parentId]);
      const newPath = await deptPath(id);
      const n = await q("SELECT COUNT(*)::int AS n FROM marib_emp WHERE dept_id = $1", [id]);
      await logTransfer(actor, "—", cur[0].name as string, oldPath, null, newPath, null, "dept-move", (n[0]?.n ?? 0) + " موظف");
      await audit(actor, "edit", "manpower-dept", cur[0].name as string, { from: oldPath, to: newPath, employees: n[0]?.n ?? 0 });
      return NextResponse.json({ ok: true });
    }

    /* ---------- delete a dept node (R41 — مسح الأقسام الفاضية ----------
       Only an EMPTY node can go: no sub-sections, no employees, no
       vacancies. That is exactly the "I clicked add five times and got
       five copies" case — duplicates are empty by definition. Anything
       with content refuses with 409 notEmpty so headcount can never
       disappear by accident. The deletion is written to the archive. */
    if (action === "deptDelete") {
      const id = cleanStr(body.id, 40);
      if (!id) return fail("id", 400);
      const cur = await q("SELECT id, name, parent_id FROM marib_dept WHERE id = $1 LIMIT 1", [id]);
      if (!cur.length) return fail("none", 404);
      const kids = await q("SELECT COUNT(*)::int AS n FROM marib_dept WHERE parent_id = $1", [id]);
      const rows = await q("SELECT COUNT(*)::int AS n FROM marib_emp WHERE dept_id = $1", [id]);
      if (Number(kids[0]?.n ?? 0) > 0 || Number(rows[0]?.n ?? 0) > 0) return fail("notEmpty", 409);
      const p = await deptPath(id);
      await q("DELETE FROM marib_dept WHERE id = $1", [id]);
      await q("DELETE FROM marib_req WHERE node_key = $1", ["d:" + id]); /* orphan override cleanup */
      await logTransfer(actor, "—", cur[0].name as string, p, "—", "—", "—", "dept-del");
      await audit(actor, "delete", "manpower-dept", cur[0].name as string, { path: p });
      lg.info("dept removed", { actor, name: cur[0].name, path: p });
      return NextResponse.json({ ok: true });
    }

    /* ---------- set / clear a node's manual required override ---------- */
    if (action === "req") {
      const key = cleanStr(body.key, 260);
      if (!key) return fail("key", 400);
      if (body.required === null || body.required === undefined || body.required === "") {
        await q("DELETE FROM marib_req WHERE node_key = $1", [key]);
      } else {
        const n = Math.round(Number(body.required));
        if (!isFinite(n) || n < 0 || n > 99999) return fail("num", 400);
        await q(
          `INSERT INTO marib_req (node_key, required, updated_at, updated_by)
           VALUES ($1, $2, now(), $3)
           ON CONFLICT (node_key) DO UPDATE SET required = $2, updated_at = now(), updated_by = $3`,
          [key, n, actor]
        );
      }
      await audit(actor, "edit", "manpower-req", key, { required: body.required ?? null });
      return NextResponse.json({ ok: true });
    }

    /* ---------- import: full sync from the Manpower sheet ----------
       New Database format rows: [code, name, dept, sec, sub, job, note, hire, vac, mach]
       Old Employees-DB format rows: [code, name, job, deptPath, hire]
       R42 v2 — الاستيراد الذكي (يحافظ على إعادة تنظيم الموقع):
       - مطابقة الأسماء مع تطبيع عربي (مسافات/شرطات/تشكيل/همزات)
       - "نفس الاسم في أي مكان": الشيت "إدارة - إدارة - General
         Maintenance" يلاقي القسم حتى لو المستخدم شال المستوى الأوسط
       - تطابق الموظفين: لو سلسلة الشيت مش موجودة، بنشوف موظفين السلسلة
         دول واقعين في أنهي قسم على الموقع حاليًا (الأغلبية) — ده اللي
         يخلي "IAS - IS - Security" في الشيت تلقى "الأمن" على الموقع
         بدل ما تعمل قسم مكرر وتهدّ إعادة التنظيم
       - الموظف الموجود + سلسلة غير محلولة = يفضل مكانه (الموقع بكلمته)
       - عمود حذف؟ في التيمبلت: "نعم/yes/x" = حذف من الموقع (بتسجيل خروج)
       - الأعمدة الناقصة من الشيت (التعيين مثلًا) مش بتفرّغ القيمة القديمة */
    if (action === "import") {
      const rows = Array.isArray(body.rows) ? (body.rows as unknown[]) : [];
      if (!rows.length || rows.length > 6000) return fail("rows", 400);
      /* R46-7: capture an undo snapshot BEFORE mutating anything —
         the client will show an Undo button for 15 minutes that calls
         the "undo" action with this token. */
      const undoToken = await (await import("@/lib/marib/undo")).captureUndoSnapshot(me.username);
      await (await import("@/lib/marib/undo")).sweepExpiredUndoTokens().catch(() => {});
      /* R42: أعمدة موجودة فعلًا في الشيت؟ (لو عمود التعيين مش موجود
         أصلًا، مفيش فرغ لتواريخ التعيين المخزنة)
         R47: arCol — أعمدة «بالعربي» موجودة في الشيت؟ لو مش موجودة
         (تيمبلت قديم) بنطبّق الحفظ التلقائي للعربي عند تغيير الاسم */
      const colFlags = {
        hire: !!body.hireCol,
        mach: body.machCol !== false,
        note: body.noteCol !== false,
        ar: !!body.arCol,
      };

      const allDepts0 = await q("SELECT id, name, parent_id FROM marib_dept");
      const byId = new Map<string, string>();            /* "parent|normName" → deptId */
      const byNorm = new Map<string, string[]>();        /* normName → [deptId…] */
      for (const r of allDepts0) {
        const pid = (r.parent_id as string) || "";
        const nm = normName(r.name);
        byId.set(pid + "|" + nm, r.id as string);
        if (!byNorm.has(nm)) byNorm.set(nm, []);
        byNorm.get(nm)!.push(r.id as string);
      }

      /* R42: حل السلسلة على الأقسام الموجودة بس — من غير إنشاء:
         مطابقة تحت الأب > نفس الاسم في أي مكان (لو فريد) > تخطي الجزء
         (مستوى شاله المستخدم من الموقع). بيرجع "" لو مفيش أي مطابقة. */
      function resolveExisting(parts: string[]): string {
        function walk(i: number, parent: string): string {
          if (i >= parts.length) return parent;
          const nm = normName(parts[i]);
          if (!nm) return walk(i + 1, parent);
          const exact = byId.get(parent + "|" + nm);
          if (exact) return walk(i + 1, exact);
          const cands = (byNorm.get(nm) || []).filter((x) => x !== parent);
          if (cands.length === 1) return walk(i + 1, cands[0]);
          return walk(i + 1, parent);   /* تخطي الجزء اللي ملقاش له مقابل */
        }
        const out = walk(0, "");
        return out || "";
      }

      async function ensureChain(parts: string[]): Promise<string> {
        let parent = "";
        for (const raw of parts) {
          const name = cleanStr(raw, 90);
          if (!name) continue;
          const nm = normName(name);
          let id = byId.get(parent + "|" + nm);
          if (!id) {
            /* R42: نفس الاسم في أي مكان (لو فريد) — يتبنى زي ما هو */
            const cands = (byNorm.get(nm) || []).filter((x) => x !== parent);
            id = cands.length === 1 ? cands[0] : undefined;
          }
          if (!id) {
            const ord = await q(
              "SELECT COALESCE(MAX(ord),0)+1 AS n FROM marib_dept WHERE parent_id IS NOT DISTINCT FROM NULLIF($1,'')",
              [parent]
            );
            id = crypto.randomUUID();
            await q(`INSERT INTO marib_dept (id, name, parent_id, ord) VALUES ($1, $2, NULLIF($3,''), $4)`, [id, name, parent, ord[0]?.n ?? 1]);
            byId.set(parent + "|" + nm, id);
            if (!byNorm.has(nm)) byNorm.set(nm, []);
            byNorm.get(nm)!.push(id);
            void translateAndStore(name).catch(() => {});
          }
          parent = id;
        }
        return parent;
      }

      /* normalize both formats → {code,name,chain,job,note,hire,vac,mach,del,nameAr,jobAr} */
      const clean: { code: string; name: string; chain: string[]; job: string; note: string; hire: string; vac: boolean; mach: string; del: boolean; nameAr: string; jobAr: string }[] = [];
      for (const r0 of rows) {
        const r = Array.isArray(r0) ? (r0 as unknown[]) : [];
        if (r.length >= 8) {
          const vac = !!(r[8] === 1 || r[8] === true || r[8] === "1");
          const name = cleanStr(r[1], 90);
          const dept = cleanStr(r[2], 90);
          const sec = cleanStr(r[3], 90);
          const sub = cleanStr(r[4], 90);
          const chain = [dept, sec, sub].filter((x) => !!x);
          if (!chain.length) continue;
          if (!name && !cleanStr(r[5], 90)) continue; /* garbage row */
          let hire = cleanStr(r[7], 10);
          if (hire && !/^\d{4}-\d{2}-\d{2}$/.test(hire)) hire = "";
          /* R42: عمود "حذف؟" (عنصر 10 في التيمبلت) */
          const delMark = normName(r[10]).replace(/[\u064B-\u065F\u0640]/g, "");
          const del = ["نعم", "yes", "x", "حذف", "1", "true"].includes(delMark);
          clean.push({
            code: normCode(r[0]), name, chain, job: cleanStr(r[5], 90),
            note: cleanStr(r[6], 60), hire, vac: vac || !name, mach: cleanStr(r[9], 30), del,
            nameAr: cleanStr(r[11], 90), jobAr: cleanStr(r[12], 90),   /* R47: بالعربي */
          });
        } else {
          /* old format: [code, name, job, deptPath, hire] */
          const code = normCode(r[0]);
          const name = cleanStr(r[1], 90);
          if (!code || !name || code === "جديد") continue;
          let hire = cleanStr(r[4], 10);
          if (hire && !/^\d{4}-\d{2}-\d{2}$/.test(hire)) hire = "";
          const chain = cleanStr(r[3], 190).split(" - ").map((x) => x.trim()).filter(Boolean);
          if (!chain.length) continue;
          clean.push({ code, name, chain, job: cleanStr(r[2], 90), note: "", hire, vac: false, mach: "", del: false });
        }
      }
      if (!clean.length) return fail("rows", 400);

      /* R47: name_ar/job_ar في الـ SELECT — أساس الحفظ التلقائي */
      const existing = await q("SELECT id, code, name, job, dept_id, hire, vac, note, mach, name_ar, job_ar FROM marib_emp");
      type EmpRow = (typeof existing)[number];
      const byCode = new Map<string, EmpRow>();
      const byName = new Map<string, EmpRow>();
      for (const r of existing) {
        if (r.code && r.code !== "جديد") byCode.set(r.code as string, r);
        const nk = (r.name as string).trim();
        if (nk) byName.set(nk, r);
      }
      /* R42: خريطة "أنهي قسم فيه الموظفين دول دلوقتي" — أساس تطابق السلاسل */
      const deptOfCode = new Map<string, string>();
      for (const r of existing) {
        if (r.code && r.code !== "جديد") deptOfCode.set(r.code as string, (r.dept_id as string) || "");
      }

      let inserted = 0, updated = 0, moved = 0, codeFilled = 0, deleted = 0;
      const seenIds = new Set<string>();

      /* R42: حل السلاسل على مستوى المجموعة — كل سلسلة فريدة في الشيت
         بتتحل مرة واحدة بذكاء:
         (1) greedy على الأقسام الموجودة (مطابقة مطبّعة + نفس-الاسم-في-
             أي-مكان + تخطي المستويات المحذوفة)
         (2) لو الموظفين الموجودين في السلسلة مش ساكنين في نتيجة الـ
             greedy → شوف هم ساكنين في أنهي قسم على الموقع (الأغلبية
             ≥ 50%) — ده اللي يخلي "IAS - IS - Security" في شيت قديم
             تلقى "الأمن" على الموقع بدل ما تعمل قسم مكرر، و"front"
             تلقى "الصدر". الموقع أعرف بمكانهم من الشيت.
         (3) مفيش قرار؟ السلسلة تتحل بالـ greedy للصفوف الجديدة،
             والموجودين يفضلوا أماكنهم. */
      const chainGroups = new Map<string, { parts: string[]; codes: string[] }>();
      for (const c of clean) {
        if (c.del) continue;
        const key = c.chain.map((x) => normName(x)).join("|");
        if (!chainGroups.has(key)) chainGroups.set(key, { parts: c.chain, codes: [] });
        if (c.code && c.code && c.code !== "جديد" && deptOfCode.has(c.code)) {
          chainGroups.get(key)!.codes.push(c.code);
        }
      }
      const chainTarget = new Map<string, string>();
      for (const [key, g] of chainGroups) {
        const greedy = resolveExisting(g.parts);
        let target = greedy;
        const uniq = Array.from(new Set(g.codes));
        if (uniq.length) {
          if (greedy) {
            const inGreedy = uniq.filter((code) => deptOfCode.get(code) === greedy).length;
            if (inGreedy / uniq.length >= 0.5) { chainTarget.set(key, greedy); continue; }
          }
          const tally = new Map<string, number>();
          for (const code of uniq) {
            const d = deptOfCode.get(code) || "";
            if (d) tally.set(d, (tally.get(d) || 0) + 1);
          }
          let best = "", bestN = 0;
          for (const [d, n] of tally) if (n > bestN) { best = d; bestN = n; }
          if (best && bestN / uniq.length >= 0.5) target = best;
        }
        chainTarget.set(key, target);
      }

      await q("BEGIN");
      try {
        /* R42: عمود الحذف — الموظفين المعلمين "نعم" يخرجوا من الموقع
           (بنفس منطق حذف الموقع: سطر خروج في الأرشيف) */
        for (const c of clean) {
          if (!c.del || !c.code || c.code === "جديد") continue;
          const old = byCode.get(c.code);
          if (!old || old.vac) continue;
          const p = await deptPath(old.dept_id as string);
          await q("DELETE FROM marib_emp WHERE id = $1", [old.id]);
          await logTransfer(actor, c.code, old.name as string, p, old.job as string, "—", "—", "out", "حذف من الشيت");
          deleted++;
        }

        /* vacancies: the sheet is the truth for required-but-unfilled rows */
        await q("DELETE FROM marib_emp WHERE vac = true");

        for (const c of clean) {
          if (c.del) continue;
          if (c.vac) {
            const gKey = c.chain.map((x) => normName(x)).join("|");
            const deptId = chainTarget.get(gKey) || (await ensureChain(c.chain));
            const ord = await q("SELECT COALESCE(MAX(ord),0)+1 AS n FROM marib_emp");
            await q(
              `INSERT INTO marib_emp (code, name, job, dept_id, note, hire, vac, ord, mach)
               VALUES (NULL, '', $1, $2, $3, $4, true, $5, $6)`,
              [c.job, deptId, colFlags.note ? c.note : "", c.hire, ord[0]?.n ?? 1, colFlags.mach ? c.mach : ""]
            );
            inserted++;
            continue;
          }
          let old: EmpRow | undefined = undefined;
          if (c.code && c.code !== "جديد") old = byCode.get(c.code);
          if (!old) {
            /* no code match — try the same name (the جديد flow: the owner
               re-uploads the sheet with the code typed in) */
            const cand = byName.get(c.name);
            if (cand && (!cand.code || cand.code === "جديد")) old = cand;
          }
          /* R47: قيمة العربي النهائية للصف —
             (1) الشيت فيه عمود العربي وقيمته مش فاضية → ناخدها
             (2) الشيت من غير أعمدة عربي (تيمبلت قديم) والاسم اتغير
                 والقديم كان عربي والعربي المخزن فاضي → نحفظ القديم
                 تلقائيًا (حماية من ضياع العربي)
             (3) غير كده → نسيب المخزن زي ما هو (العمود الناقص ميفضّيش) */
          const hasArabicImp = (s: unknown): boolean => /[\u0600-\u06FF]/.test(String(s || ""));
          const finalAr = (sheetVal: string, oldVal: string | null, oldMain: string, newMain: string): string | null => {
            if (sheetVal) return sheetVal;
            if (!colFlags.ar && newMain !== oldMain && hasArabicImp(oldMain) && !oldVal) return oldMain;
            return oldVal || null;
          };
          if (!old) {
            const gKey = c.chain.map((x) => normName(x)).join("|");
            const deptId = chainTarget.get(gKey) || (await ensureChain(c.chain));
            /* R47: موظف جديد — العربي من عمود الشيت لو موجود */
            await q(
              `INSERT INTO marib_emp (code, name, job, dept_id, note, hire, vac, ord, mach, name_ar, job_ar)
               VALUES ($1, $2, $3, $4, $5, $6, false, $7, $8, $9, $10)`,
              [c.code || "جديد", c.name, c.job, deptId, colFlags.note ? c.note : "", c.hire, clean.indexOf(c) + 1, colFlags.mach ? c.mach : "", c.nameAr || null, c.jobAr || null]
            );
            inserted++;
          } else {
            seenIds.add(old.id as string);
            /* R42: حل سلسلة الشيت بالذكاء:
               1) المطابقة العادية (مطبّعة) 2) نفس-الاسم-في-أي-مكان —
               ولو السلسلة لسه مش لاقية قسم: شوف موظفين الشيت دول
               واقعين فين على الموقع (الأغلبية) — ولو مفيش أغلبية
               والموظف موجود خلاص: خليه مكانه (إعادة تنظيم الموقع أحكم). */
            /* قرار المجموعة الأول — ولو مفيش، الموظف يفضل مكانه
               الحالي (إعادة تنظيم الموقع أحكم من الشيت) */
            const gKey2 = c.chain.map((x) => normName(x)).join("|");
            let deptId = chainTarget.get(gKey2) || (old.dept_id as string) || "";
            if (!deptId) deptId = await ensureChain(c.chain);
            const oldPath = await deptPath(old.dept_id as string);
            const newPath = await deptPath(deptId);
            const hadNoCode = !old.code || old.code === "جديد";
            const newHire = colFlags.hire ? (c.hire || (old.hire as string) || "") : (old.hire as string) || "";
            /* R47: العربي النهائي بالمنطق التلاتي (شيت → حفظ تلقائي → مخزن) */
            const finalNameAr = finalAr(c.nameAr, (old.name_ar as string) || null, (old.name as string) || "", c.name);
            const finalJobAr = finalAr(c.jobAr, (old.job_ar as string) || null, (old.job as string) || "", c.job);
            await q(
              `UPDATE marib_emp SET code=$2, name=$3, job=$4, dept_id=$5, note=$6, hire=$7, vac=false, mach=$8, name_ar=$9, job_ar=$10, updated_at=now() WHERE id=$1`,
              [
                old.id,
                c.code && c.code !== "جديد" ? c.code : (old.code as string) || "جديد",
                c.name, c.job, deptId,
                colFlags.note ? c.note : ((old.note as string) || ""),
                newHire,
                colFlags.mach ? c.mach : ((old.mach as string) || ""),
                finalNameAr,
                finalJobAr,
              ]
            );
            if (hadNoCode && c.code && c.code !== "جديد") codeFilled++;
            updated++;
            if (oldPath !== newPath || (old.job as string) !== c.job) {
              await logTransfer(actor, c.code || (old.code as string) || "جديد", c.name, oldPath, old.job as string, newPath, c.job);
              moved++;
            }
          }
        }
        await q("COMMIT");
      } catch (e) {
        await q("ROLLBACK").catch(() => {});
        throw e;
      }

      const kept = existing.filter((r) => !r.vac && !seenIds.has(r.id as string) && r.code && r.code !== "جديد");
      await audit(actor, "upload", "manpower", null, { rows: clean.length, inserted, updated, moved, codeFilled, keptOut: kept.length, deleted });
      lg.info("manpower import", { rows: clean.length, inserted, updated, moved, codeFilled, keptOut: kept.length, deleted });
      return NextResponse.json({ ok: true, inserted, updated, moved, codeFilled, total: clean.length, keptOut: kept.length, deleted, undoToken });
    }

    /* R46-7: undo an import — restore the snapshot taken before the
       most recent import (within the 15-min window). Returns the
       same shape as the original import would return. */
    if (action === "undo") {
      const token = String(body.undoToken || "");
      if (!token) return fail("undoToken", 400);
      const restored = await (await import("@/lib/marib/undo")).restoreFromSnapshot(token, me.username);
      if (!restored) return fail("expired", 410);
      lg.info("manpower undo", { by: me.username, token });
      return NextResponse.json({ ok: true, restored: true });
    }

    return fail("action", 400);
  } catch (e) {
    return serverFail("manpower", "POST", e);
  }
}
