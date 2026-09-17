/* Marib entries helpers (R56 — refactoring)
   المنطق المشترك بين مسارات الإدخال الثلاثة (غياب / أوفر تايم /
   إنتاج) كان مكرر 2-4 مرات في كل ملف route. الدوال دي بتستبدل
   النسخ المتكررة بنفس السلوك بالظبط — نفس الاستعلامات وبنفس
   الترتيب — عشان يبقى فيه مصدر واحد للحقيقة. */

import { q } from "./db";

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
    if (er.length) {
      empId = er[0].id as string;
      deptId = (er[0].dept_id as string) || deptId;
    }
  }
  if (!empId && name) {
    const er = await q("SELECT id, dept_id FROM marib_emp WHERE name = $1 LIMIT 1", [name]);
    if (er.length) {
      empId = er[0].id as string;
      deptId = (er[0].dept_id as string) || deptId;
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
