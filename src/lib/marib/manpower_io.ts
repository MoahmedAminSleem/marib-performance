/* /lib/marib/manpower_io.ts — R52: منطق الاتزان المشترك
   الأدوات (cleanStr/normCode/deptPath/logTransfer/normName/hasArabic)
   + الاستيراد الذكي (R42/R47/R50: مطابقة عربية، سلاسل المجموعات،
   أعمدة التركي، الشيت هو الحقيقة). اتقطعوا من /api/manpower/route.ts
   حرفيًا في R52 — نفس المنطق بالظبط، بس الهيكل بقى قابل للاختبار
   والـ route رجع رفيع. */

import { q, audit } from "@/lib/marib/db";
import { logger } from "@/lib/marib/http";

const lg = logger("manpower-io");

/* ---------- الأدوات المشتركة (بيستخدمها الـ route في كل الأكشنات) ---------- */

export function cleanStr(v: unknown, max = 120): string {
  return String(v ?? "").trim().slice(0, max);
}
export function normCode(v: unknown): string {
  const t = cleanStr(v, 20);
  return t === "None" ? "" : t;
}

/* full display path of a dept node (used inside transfer rows) */
export async function deptPath(id: string | null): Promise<string> {
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
export async function logTransfer(
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
export function normName(v: unknown): string {
  return String(v ?? "")
    .replace(/[\u064B-\u065F\u0640]/g, "")          /* تشكيل + تطويل */
    .replace(/[\u2010-\u2015]/g, "-")                /* every dash → - */
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/* (R48) كشف العربي — كان معرّف مرتين جوه edit وجوه import باسمين
   مختلفين (hasArabic / hasArabicImp) — اتحد هنا في تعريف واحد. */
const ARABIC_RE = /[\u0600-\u06FF]/;
export function hasArabic(s: unknown): boolean {
  return ARABIC_RE.test(String(s || ""));
}

/* ---------- الاستيراد الذكي — الشيت هو الحقيقة ----------
   فورمات جديد 18 عمود (R50) + القديم 13 + القديم جدًا 5.
   البيانات مقدسة: undo snapshot قبل أي تعديل، وحذف الشيت
   بيسجل خروج في الأرشيف. */

export type ImportOutcome =
  | { ok: false; field: string }
  | {
      ok: true;
      undoToken: string;
      stats: {
        inserted: number; updated: number; moved: number;
        codeFilled: number; total: number; removed: number; deleted: number;
      };
    };

export async function importManpower(
  actor: string,
  body: Record<string, unknown>
): Promise<ImportOutcome> {
  const rows = Array.isArray(body.rows) ? (body.rows as unknown[]) : [];
  if (!rows.length || rows.length > 6000) return { ok: false, field: "rows" };
  /* R46-7: capture an undo snapshot BEFORE mutating anything —
     the client will show an Undo button for 15 minutes that calls
     the "undo" action with this token. */
  const undoToken = await (await import("@/lib/marib/undo")).captureUndoSnapshot(actor);
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
    tr: !!body.trCol,   /* R50: أعمدة التركي موجودة في الشيت؟ */
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

  /* R50: ensureChain بقى بياخد أسماء التركي جنب العربية —
     القسم الجديد يتخزن بـ label_tr، والموجود بيتحدث لو الشيت
     معبّي عمود التركي (القاعدة: القيمة الفاضية متفرّغش المخزن). */
  async function ensureChain(parts: string[], partsTr: string[] = []): Promise<string> {
    let parent = "";
    for (let pi = 0; pi < parts.length; pi++) {
      const name = cleanStr(parts[pi], 90);
      const nameTr = cleanStr(partsTr[pi] || "", 90);
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
        await q(`INSERT INTO marib_dept (id, name, parent_id, ord, label_tr) VALUES ($1, $2, NULLIF($3,''), $4, NULLIF($5,''))`, [id, name, parent, ord[0]?.n ?? 1, nameTr || null]);
        byId.set(parent + "|" + nm, id);
        if (!byNorm.has(nm)) byNorm.set(nm, []);
        byNorm.get(nm)!.push(id);
      } else if (nameTr) {
        /* موجود + الشيت فيه تركي → حدّث label_tr */
        await q("UPDATE marib_dept SET label_tr = $2 WHERE id = $1", [id, nameTr]);
      }
      parent = id;
    }
    return parent;
  }

  /* R50: normalize — فورمات جديد 18 عنصر (بأعمدة التركي) + القديم 13 + القديم جدًا 5
     الجديد: [code, name, nameTr, dept, deptTr, sec, secTr, sub, subTr,
              job, jobTr, note, hire, vac, mach, del, nameAr, jobAr] */
  type CleanRow = { code: string; name: string; nameTr: string; chain: string[]; chainTr: string[]; job: string; jobTr: string; note: string; hire: string; vac: boolean; mach: string; del: boolean; nameAr: string; jobAr: string };
  const clean: CleanRow[] = [];
  for (const r0 of rows) {
    const r = Array.isArray(r0) ? (r0 as unknown[]) : [];
    if (r.length >= 16) {
      /* R50: الفورمات الجديد بأعمدة التركي */
      const vac = !!(r[13] === 1 || r[13] === true || r[13] === "1");
      const name = cleanStr(r[1], 90);
      const dept = cleanStr(r[3], 90);
      const sec = cleanStr(r[5], 90);
      const sub = cleanStr(r[7], 90);
      const chain = [dept, sec, sub].filter((x) => !!x);
      if (!chain.length) continue;
      if (!name && !cleanStr(r[9], 90)) continue; /* garbage row */
      let hire = cleanStr(r[12], 10);
      if (hire && !/^\d{4}-\d{2}-\d{2}$/.test(hire)) hire = "";
      const delMark = normName(r[15]).replace(/[\u064B-\u065F\u0640]/g, "");
      const del = ["نعم", "yes", "x", "حذف", "1", "true"].includes(delMark);
      /* سلسلة التركي توازي سلسلة العربية (الفاضي بيفضل فاضي) */
      const chainTrRaw = [cleanStr(r[4], 90), cleanStr(r[6], 90), cleanStr(r[8], 90)];
      const chainTr: string[] = [];
      let ti = 0;
      for (const part of [dept, sec, sub]) {
        if (part) { chainTr.push(chainTrRaw[ti] || ""); ti++; }
      }
      clean.push({
        code: normCode(r[0]), name, nameTr: cleanStr(r[2], 90),
        chain, chainTr,
        job: cleanStr(r[9], 90), jobTr: cleanStr(r[10], 90),
        note: cleanStr(r[11], 60), hire, vac: vac || !name, mach: cleanStr(r[14], 30), del,
        nameAr: cleanStr(r[16], 90), jobAr: cleanStr(r[17], 90),
      });
    } else if (r.length >= 8) {
      /* R47/48 legacy: [code, name, dept, sec, sub, job, note, hire, vac, mach, del, nameAr, jobAr] */
      const vac = !!(r[8] === 1 || r[8] === true || r[8] === "1");
      const name = cleanStr(r[1], 90);
      const dept = cleanStr(r[2], 90);
      const sec = cleanStr(r[3], 90);
      const sub = cleanStr(r[4], 90);
      const chain = [dept, sec, sub].filter((x) => !!x);
      if (!chain.length) continue;
      if (!name && !cleanStr(r[5], 90)) continue;
      let hire = cleanStr(r[7], 10);
      if (hire && !/^\d{4}-\d{2}-\d{2}$/.test(hire)) hire = "";
      const delMark = normName(r[10]).replace(/[\u064B-\u065F\u0640]/g, "");
      const del = ["نعم", "yes", "x", "حذف", "1", "true"].includes(delMark);
      clean.push({
        code: normCode(r[0]), name, nameTr: "", chain, chainTr: [],
        job: cleanStr(r[5], 90), jobTr: "",
        note: cleanStr(r[6], 60), hire, vac: vac || !name, mach: cleanStr(r[9], 30), del,
        nameAr: cleanStr(r[11], 90), jobAr: cleanStr(r[12], 90),
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
      clean.push({ code, name, nameTr: "", chain, chainTr: [], job: cleanStr(r[2], 90), jobTr: "", note: "", hire, vac: false, mach: "", del: false, nameAr: "", jobAr: "" });
    }
  }
  if (!clean.length) return { ok: false, field: "rows" };

  /* R50: name_tr/job_tr كمان — أساس منطق finalTr */
  const existing = await q("SELECT id, code, name, job, dept_id, hire, vac, note, mach, name_ar, job_ar, name_tr, job_tr FROM marib_emp");
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
  const chainGroups = new Map<string, { parts: string[]; partsTr: string[]; codes: string[] }>();
  for (const c of clean) {
    if (c.del) continue;
    const key = c.chain.map((x) => normName(x)).join("|");
    if (!chainGroups.has(key)) chainGroups.set(key, { parts: c.chain, partsTr: c.chainTr, codes: [] });
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
        /* R50: الشيت هو الحقيقة — نفس الاسم = نفس الشخص حتى لو
           الكود فاضي في الشيت (بيحفظ الكود المخزن بدل ما يضيع) */
        const cand = byName.get(c.name);
        if (cand) old = cand;
      }
      /* R47: قيمة العربي النهائية للصف —
         (1) الشيت فيه عمود العربي وقيمته مش فاضية → ناخدها
         (2) الشيت من غير أعمدة عربي (تيمبلت قديم) والاسم اتغير
             والقديم كان عربي والعربي المخزن فاضي → نحفظ القديم
             تلقائيًا (حماية من ضياع العربي)
         (3) غير كده → نسيب المخزن زي ما هو (العمود الناقص ميفضّيش) */
      const finalAr = (sheetVal: string, oldVal: string | null, oldMain: string, newMain: string): string | null => {
        if (sheetVal) return sheetVal;
        if (!colFlags.ar && newMain !== oldMain && hasArabic(oldMain) && !oldVal) return oldMain;
        return oldVal || null;
      };
      /* R50: التركي — الشيت المعبّاا بكسب، الفاضي بيسيب المخزن */
      const finalTr = (sheetVal: string, oldVal: string | null): string | null => sheetVal || oldVal || null;
      if (!old) {
        const gKey = c.chain.map((x) => normName(x)).join("|");
        const deptId = chainTarget.get(gKey) || (await ensureChain(c.chain, c.chainTr));
        /* R50: موظف جديد — العربي والتركي من أعمدة الشيت */
        await q(
          `INSERT INTO marib_emp (code, name, job, dept_id, note, hire, vac, ord, mach, name_ar, job_ar, name_tr, job_tr)
           VALUES ($1, $2, $3, $4, $5, $6, false, $7, $8, $9, $10, $11, $12)`,
          [c.code || "جديد", c.name, c.job, deptId, colFlags.note ? c.note : "", c.hire, clean.indexOf(c) + 1, colFlags.mach ? c.mach : "", c.nameAr || null, c.jobAr || null, c.nameTr || null, c.jobTr || null]
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
        if (!deptId) deptId = await ensureChain(c.chain, c.chainTr);
        else if (c.chainTr.some((x) => !!x)) {
          /* R50: القسم موجود — حدّث التركي لو الشيت معبّاا */
          const gg = chainGroups.get(gKey2);
          if (gg) await ensureChain(gg.parts, gg.partsTr);
        }
        const oldPath = await deptPath(old.dept_id as string);
        const newPath = await deptPath(deptId);
        const hadNoCode = !old.code || old.code === "جديد";
        const newHire = colFlags.hire ? (c.hire || (old.hire as string) || "") : (old.hire as string) || "";
        /* R47: العربي النهائي بالمنطق التلاتي (شيت → حفظ تلقائي → مخزن) */
        const finalNameAr = finalAr(c.nameAr, (old.name_ar as string) || null, (old.name as string) || "", c.name);
        const finalJobAr = finalAr(c.jobAr, (old.job_ar as string) || null, (old.job as string) || "", c.job);
        /* R50: التركي النهائي (شيت → مخزن) */
        const finalNameTr = finalTr(c.nameTr, (old.name_tr as string) || null);
        const finalJobTr = finalTr(c.jobTr, (old.job_tr as string) || null);
        await q(
          `UPDATE marib_emp SET code=$2, name=$3, job=$4, dept_id=$5, note=$6, hire=$7, vac=false, mach=$8, name_ar=$9, job_ar=$10, name_tr=$11, job_tr=$12, updated_at=now() WHERE id=$1`,
          [
            old.id,
            c.code && c.code !== "جديد" ? c.code : (old.code as string) || "جديد",
            c.name, c.job, deptId,
            colFlags.note ? c.note : ((old.note as string) || ""),
            newHire,
            colFlags.mach ? c.mach : ((old.mach as string) || ""),
            finalNameAr,
            finalJobAr,
            finalNameTr,
            finalJobTr,
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

  /* R50: الشيت هو الحقيقة — اللي على الموقع ومش في الشيت يتشال
     (بسجل خروج في الأرشيف زي أي حذف، والـ undo لسه شغال 15 دقيقة) */
  const missing = existing.filter((r) => !r.vac && !seenIds.has(r.id as string));
  let removed = 0;
  for (const old of missing) {
    const p = await deptPath(old.dept_id as string);
    await q("DELETE FROM marib_emp WHERE id = $1", [old.id]);
    await logTransfer(actor, (old.code as string) || "جديد", (old.name as string) || "", p, old.job as string, "—", "—", "out", "مش موجود في الشيت");
    removed++;
  }
  await audit(actor, "upload", "manpower", null, { rows: clean.length, inserted, updated, moved, codeFilled, removed, deleted });
  lg.info("manpower import", { rows: clean.length, inserted, updated, moved, codeFilled, removed, deleted });
  return { ok: true, undoToken, stats: { inserted, updated, moved, codeFilled, total: clean.length, removed, deleted } };
}
