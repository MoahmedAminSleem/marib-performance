/* Marib entries helpers (R56 — refactoring)
   المنطق المشترك بين مسارات الإدخال الثلاثة (غياب / أوفر تايم /
   إنتاج) كان مكرر 2-4 مرات في كل ملف route. الدوال دي بتستبدل
   النسخ المتكررة بنفس السلوك بالظبط — نفس الاستعلامات وبنفس
   الترتيب — عشان يبقى فيه مصدر واحد للحقيقة. */

import { NextRequest, NextResponse } from "next/server";
import { q, audit } from "./db";
import { fail, serverFail, logger, requirePermBody } from "./http";

export interface EmpBrief {
  code: string;
  name: string;
  job: string;
  dept_id: string;
}

/** مطابقة موظف بالكود الأول وبعدين بالاسم — كانت مكررة 3 مرات
 *  (غياب POST + استيراد الغياب + أوفر تايم POST).
 *  fallbackDeptId: القيمة اللي تفضل لو الموظف ملقوش أو الموظف نفسه
 *  من غير قسم (حالة الأوفر تايم: القسم النصي من الطلب). */
export async function matchEmployee(
  code: string,
  name: string,
  fallbackDeptId: string | null = null
): Promise<{ empId: string | null; deptId: string | null }> {
  let empId: string | null = null;
  let deptId: string | null = fallbackDeptId;
  if (code) {
    const er = await q("SELECT id, dept_id FROM marib_emp WHERE code = $1 LIMIT 1", [code]);
    const e0 = er[0]; /* R60: حارس العنصر بدل فحص الطول */
    if (e0) {
      empId = e0.id as string;
      deptId = (e0.dept_id as string) || deptId;
    }
  }
  if (!empId && name) {
    const er = await q("SELECT id, dept_id FROM marib_emp WHERE name = $1 LIMIT 1", [name]);
    const e0 = er[0]; /* R60: حارس العنصر بدل فحص الطول */
    if (e0) {
      empId = e0.id as string;
      deptId = (e0.dept_id as string) || deptId;
    }
  }
  return { empId, deptId };
}

/** خريطة الموظفين بالـ ids — كانت مكررة في GET الغياب و GET الأوفر
 *  تايم. بترجع {} لو القايمة فاضية (زي الكود القديم بالظبط). */
export async function loadEmpMap(empIds: string[]): Promise<Record<string, EmpBrief>> {
  const out: Record<string, EmpBrief> = {};
  if (!empIds.length) return out;
  const er = await q("SELECT id, code, name, job, dept_id FROM marib_emp WHERE id = ANY($1::text[])", [empIds]);
  for (const r of er) {
    out[r.id as string] = {
      code: r.code as string,
      name: r.name as string,
      job: r.job as string,
      dept_id: r.dept_id as string,
    };
  }
  return out;
}

/** خريطة أسماء الأقسام بالـ ids — كانت مكررة في الثلاثة GETs. */
export async function loadDeptMap(deptIds: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  if (!deptIds.length) return out;
  const dr = await q("SELECT id, name FROM marib_dept WHERE id = ANY($1::text[])", [deptIds]);
  for (const r of dr) out[r.id as string] = r.name as string;
  return out;
}

/** ?month=YYYY-MM — الشهر الحالي لو المش موجودة، null لو الصيغة
 *  مش صالحة (المسارات بترجع fail("month", 400) زي ما هي). */
export function monthParam(sp: URLSearchParams): string | null {
  const m = sp.get("month") || new Date().toISOString().slice(0, 7);
  return /^\d{4}-\d{2}$/.test(m) ? m : null;
}

/** YYYY-MM-DD صالح؟ — تواريخ الإدخال الثلاثة + تاريخ التعيين في
 *  الاتزان (كانت الـ regex مكررة 6+ مرات في 4 ملفات). */
export function isDayStr(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

/* ── R59 (refactoring): حذف سجل إدخال بالمعرّف ──
   الـ DELETE في مسارات الإدخال الثلاثة (إنتاج/غياب/أوفر تايم) كان
   متطابق حرفيًا: حارس الصلاحية → قراءة ?id= → التأكد إن السجل موجود
   (404 لو مش موجود) → الحذف → الأوديت → الرد. الفروق الوحيدة:
   اسم الجدول + اسم الكيان في الأوديت. الدالة دي هي المصدر الوحيد
   دلوقتي — أي تعديل مستقبلي (صلاحيات/أوديت) بيتطبق في مكان واحد. */
const DELETE_TABLES = {
  production: "marib_prod",
  absence: "marib_absence",
  overtime: "marib_overtime",
} as const;
const DELETE_LOGGERS: Record<keyof typeof DELETE_TABLES, ReturnType<typeof logger>> = {
  production: logger("entries:production"),
  absence: logger("entries:absence"),
  overtime: logger("entries:overtime"),
};

export async function deleteEntry(
  req: NextRequest,
  kind: keyof typeof DELETE_TABLES
): Promise<NextResponse> {
  const lg = DELETE_LOGGERS[kind];
  try {
    const g = await requirePermBody(req, "data.upload", "edit");
    if (g.res) return g.res;
    const me = g.user!;

    const id = req.nextUrl.searchParams.get("id") || "";
    if (!id) return fail("id", 400);

    const rows = await q(`SELECT id FROM ${DELETE_TABLES[kind]} WHERE id = $1`, [id]);
    if (!rows.length) return fail("notfound", 404);
    await q(`DELETE FROM ${DELETE_TABLES[kind]} WHERE id = $1`, [id]);
    await audit(me.username, "delete", `entries:${kind}`, id, null);
    lg.info("entry deleted", { by: me.username, id });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return serverFail(`entries:${kind}`, "DELETE", e);
  }
}
