const DEFAULT_BASE_SALARY = 4000;

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** يكتشف الراتب الأساسي في جسم الملف (يفضّل 4000 إن وُجد) */
export function detectBaseSalary(bodyText, fallback = DEFAULT_BASE_SALARY) {
  const text = String(bodyText || "");
  if (/\b4000\b/.test(text)) return 4000;

  const lines = text.split(/\r?\n/).filter((l) => l.trim() && l.trim() !== "-");
  const counts = new Map();

  for (const line of lines) {
    for (const m of line.matchAll(/\b(\d{3,6})\b/g)) {
      const n = Number(m[1]);
      if (n >= 500 && n <= 999999) {
        counts.set(n, (counts.get(n) || 0) + 1);
      }
    }
  }

  if (!counts.size) return fallback;

  let best = fallback;
  let bestCount = 0;
  for (const [n, c] of counts) {
    if (c > bestCount) {
      best = n;
      bestCount = c;
    }
  }
  return best;
}

/**
 * يستبدل الراتب الأساسي بقيمة جديدة في سطور البيانات.
 * يحافظ على طول الحقل إن كان الرقم بنفس عدد الخانات (مثلاً 4000 → 4001).
 */
export function replaceSalaryInBody(bodyText, baseSalary, newSalary) {
  const oldStr = String(baseSalary);
  const newStr = String(newSalary);
  let replaced = 0;

  const lines = String(bodyText || "").split(/\r?\n/);
  const updated = lines.map((line) => {
    if (!line.includes(oldStr)) return line;

    const fieldRe = new RegExp(`(?<=[|,\\s])${escapeRegex(oldStr)}(?=[|,\\s]|$)`, "g");
    if (fieldRe.test(line)) {
      replaced += 1;
      return line.replace(fieldRe, newStr);
    }

    const wordRe = new RegExp(`\\b${escapeRegex(oldStr)}\\b`);
    if (wordRe.test(line)) {
      replaced += 1;
      return line.replace(wordRe, newStr);
    }

    return line;
  });

  return {
    bodyText: updated.join("\n"),
    replaced,
  };
}

/** لكل متغير: الراتب = الأساس + رقم المتغير (4000 → 4001، 4002، …) */
export function bodyTextForVariant(bodyText, variantIndex, baseSalary = detectBaseSalary(bodyText)) {
  const newSalary = baseSalary + variantIndex;
  const { bodyText: edited, replaced } = replaceSalaryInBody(bodyText, baseSalary, newSalary);
  return {
    bodyText: edited,
    baseSalary,
    salary: newSalary,
    salaryReplaced: replaced > 0,
  };
}
