/* /api/manpower — R38 الاتزان v2 (Marib 3 structure)
   R52: أدوات مشتركة + منطق الاستيراد في src/lib/marib/manpower_io.ts
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
         req value is an override on top.
   R55: الصلاحيات الفعلية — GET محتاج manpower.view وPOST محتاج
         manpower.edit edit (والاستيراد manpower.import edit) — كان
         الدور admin هو الحارس والأدمن مقدرش يمنح يوزر تعديل الاتزان. */

import { NextRequest, NextResponse } from "next/server";
import { q, audit } from "@/lib/marib/db";
import { fail, serverFail, readJson, logger, requirePerm, requirePermBody } from "@/lib/marib/http";
import { cleanStr, normCode, deptPath, logTransfer, hasArabic, importManpower } from "@/lib/marib/manpower_io";
import { isDayStr } from "@/lib/marib/entries"; /* R56: توحيد تحقق التواريخ (كانت الـ regex مكررة) */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const lg = logger("manpower");

/* (R50) الترجمة الفورية اتشالت خالص — التركي من أعمدة الشيت */

export async function GET(req: NextRequest) {
  try {
    /* R55: رؤية الاتزان = manpower.view — مش أي يوزر داخل */
    const g = await requirePerm(req, "manpower.view", "view");
    if (g.res) return g.res;

    /* R50: label_tr للأقسام + name_tr/job_tr للموظفين (التركي من الشيت) */
    const depts = await q("SELECT id, name, parent_id, ord, label_tr FROM marib_dept ORDER BY ord ASC");
    const emps = await q(
      `SELECT id, code, name, job, dept_id, hire, vac, note, mach, name_ar, job_ar, name_tr, job_tr FROM marib_emp
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
    /* R50: خريطة ترجمات marib_i18n اتشالت مع الترجمة الفورية */
    return NextResponse.json({
      depts: depts.map((r) => [r.id, r.name, r.parent_id || "", r.ord, r.label_tr || ""]),
      emps: emps.map((r) => [r.id, r.code || "", r.name || "", r.job || "", r.dept_id || "", r.hire || "", r.vac ? 1 : 0, r.note || "", r.mach || "", r.name_ar || "", r.job_ar || "", r.name_tr || "", r.job_tr || ""]),
      req: reqRows.reduce<Record<string, number>>((acc, r) => {
        acc[r.node_key as string] = r.required as number;
        return acc;
      }, {}),
      transfers: trs.map((t) => [
        t.at, t.actor, t.code, t.name, t.from_dept, t.from_job, t.to_dept, t.to_job, t.kind, t.note || "", t.id || "",
      ]),
      root: root || { ar: "مأرب 3", en: "Marib 3", tr: "Marib 3" },
    });
  } catch (e) {
    return serverFail("manpower", "GET", e);
  }
}

export async function POST(req: NextRequest) {
  try {
    /* R55: التعديل صلاحية manpower.edit edit — الأدمن يمنحها لأي يوزر
       من لوحة الصلاحيات. الاستيراد وحده له مفتاحه manpower.import.
       نقرأ البادي الأول عشان نعرف الأكشن (requirePermBody مش بياكله). */
    const body = await readJson(req);
    if (!body) return fail("body", 413);
    const action = String(body.action || "");
    const g = await requirePermBody(
      req,
      action === "import" ? "manpower.import" : "manpower.edit",
      "edit"
    );
    if (g.res) return g.res;
    const me = g.user!;
    const actor = me.username;

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
        /* R60 (noUncheckedIndexedAccess): الحارس على العنصر نفسه بدل
           فحص الطول — نفس السلوك بالظبط بس الـ narrow حقيقي */
        const old = cur[0];
        if (!old) continue;
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
        /* R60: حارس العنصر بدل فحص الطول */
        const old = cur[0];
        if (!old || old.vac) continue;
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

    /* R50: trSync اتشالت مع الترجمة الفورية — التركي من أعمدة الشيت */

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
      if (hire && !isDayStr(hire)) return fail("hire", 400);
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
      const old = cur[0]; /* R60: حارس العنصر بدل فحص الطول */
      if (!old) return fail("none", 404);
      const name = body.name !== undefined ? cleanStr(body.name, 90) : (old.name as string);
      const job = body.job !== undefined ? cleanStr(body.job, 90) : (old.job as string);
      const deptId = body.deptId !== undefined ? cleanStr(body.deptId, 40) : (old.dept_id as string);
      const hire = body.hire !== undefined ? cleanStr(body.hire, 10) : (old.hire as string);
      /* R47: الاسم/الوظيفة بالعربي — القيمة من المودال مباشرة، ولو فاضية
         والقيمة الأساسية اتغيرت من عربي لحاجة تانية، بنحفظ العربي القديم
         تلقائيًا في حقله (حماية من ضياع العربي — مبدأ ممنوع مسح البيانات).
         مسح العربي بيحصل بكتابة القيمة الجديدة أو تفريغ الحقل مع تثبيت
         نفس الاسم (حينها مفيش تغيير فمفيش حفظ تلقائي). */
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
      if (hire && !isDayStr(hire)) return fail("hire", 400);
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
      const old = cur[0]; /* R60: حارس العنصر بدل فحص الطول */
      if (!old) return fail("none", 404);
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
      if (hire && !isDayStr(hire)) return fail("hire", 400);
      const cur = await q("SELECT id, code, name, job, dept_id FROM marib_emp WHERE id = $1 AND vac = true LIMIT 1", [id]);
      const old = cur[0]; /* R60: حارس العنصر بدل فحص الطول */
      if (!old) return fail("none", 404);
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
      const old = cur[0]; /* R60: حارس العنصر بدل فحص الطول */
      if (!old) return fail("none", 404);
      const p = await deptPath(old.dept_id as string);
      await q("DELETE FROM marib_emp WHERE id = $1 AND vac = true", [id]);
      await audit(actor, "delete", "manpower-vac", old.job as string, { dept: p });
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
      return NextResponse.json({ ok: true, id });
    }

    /* ---------- rename a dept node (employees untouched) ---------- */
    if (action === "deptRename") {
      const id = cleanStr(body.id, 40);
      const name = cleanStr(body.name, 90);
      if (!id || !name) return fail("fields", 400);
      const cur = await q("SELECT id, name, parent_id FROM marib_dept WHERE id = $1 LIMIT 1", [id]);
      const old = cur[0]; /* R60: حارس العنصر بدل فحص الطول */
      if (!old) return fail("none", 404);
      const oldPath = await deptPath(id);
      await q("UPDATE marib_dept SET name = $2 WHERE id = $1", [id, name]);
      const newPath = await deptPath(id);
      /* R56: استعلام COUNT كان بيتنفذ وبعدين بيترمي (void n) — حذفناه.
         أرشيف إعادة التسمية مش بيستخدم عدد الموظفين أصلًا. */
      await logTransfer(actor, "—", old.name as string, oldPath, null, newPath, null, "dept-rename");
      await audit(actor, "edit", "manpower-dept", name, { from: oldPath, to: newPath });
      return NextResponse.json({ ok: true });
    }

    /* ---------- move a dept node (inside another / out to top) ---------- */
    if (action === "deptMove") {
      const id = cleanStr(body.id, 40);
      const parentId = cleanStr(body.parentId, 40); /* "" = top level */
      if (!id) return fail("id", 400);
      if (id === parentId) return fail("parent", 400);
      const cur = await q("SELECT id, name, parent_id FROM marib_dept WHERE id = $1 LIMIT 1", [id]);
      const old = cur[0]; /* R60: حارس العنصر بدل فحص الطول */
      if (!old) return fail("none", 404);
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
      await logTransfer(actor, "—", old.name as string, oldPath, null, newPath, null, "dept-move", (n[0]?.n ?? 0) + " موظف");
      await audit(actor, "edit", "manpower-dept", old.name as string, { from: oldPath, to: newPath, employees: n[0]?.n ?? 0 });
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
      const old = cur[0]; /* R60: حارس العنصر بدل فحص الطول */
      if (!old) return fail("none", 404);
      const kids = await q("SELECT COUNT(*)::int AS n FROM marib_dept WHERE parent_id = $1", [id]);
      const rows = await q("SELECT COUNT(*)::int AS n FROM marib_emp WHERE dept_id = $1", [id]);
      if (Number(kids[0]?.n ?? 0) > 0 || Number(rows[0]?.n ?? 0) > 0) return fail("notEmpty", 409);
      const p = await deptPath(id);
      await q("DELETE FROM marib_dept WHERE id = $1", [id]);
      await q("DELETE FROM marib_req WHERE node_key = $1", ["d:" + id]); /* orphan override cleanup */
      await logTransfer(actor, "—", old.name as string, p, "—", "—", "—", "dept-del");
      await audit(actor, "delete", "manpower-dept", old.name as string, { path: p });
      lg.info("dept removed", { actor, name: old.name, path: p });
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
      /* R52: المنطق كله في lib/marib/manpower_io.ts — هنا بس النتيجة */
      const out = await importManpower(actor, body);
      if (!out.ok) return fail(out.field, 400);
      return NextResponse.json({ ok: true, ...out.stats, undoToken: out.undoToken });
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
