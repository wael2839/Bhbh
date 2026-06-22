const OFFLINE_HINT =
  "الخادم الوسيط غير متصل — أوقف كل نوافذ الطرفية ثم شغّل: npm run dev\n" +
  "وتأكد أنك تفتح http://127.0.0.1:5173 (وليس ملف HTML مباشرة)";

export function isProxyOfflineResponse(res, text) {
  if (!res.url.includes("/api/")) return false;
  const t = text.trim();
  if (t.startsWith("<!") || t.startsWith("<html")) return true;
  if (res.status === 502 || res.status === 504) return true;
  if (/ECONNREFUSED|proxy error|http proxy error/i.test(t)) return true;
  return false;
}

export async function parseResponse(res) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    if (isProxyOfflineResponse(res, text)) {
      throw new Error(OFFLINE_HINT);
    }
    throw new Error(text.slice(0, 300) || `خطأ ${res.status}`);
  }
}

export async function checkServerHealth() {
  try {
    const res = await fetch("/api/health", { signal: AbortSignal.timeout(3000) });
    const json = await parseResponse(res);
    return res.ok && json.ok;
  } catch {
    return false;
  }
}

const ARABIC_MONTHS = {
  يناير: 1, فبراير: 2, مارس: 3, أبريل: 4, مايو: 5, يونيو: 6,
  يوليو: 7, أغسطس: 8, سبتمبر: 9, أكتوبر: 10, نوفمبر: 11, ديسمبر: 12,
};

export function parseMonthYear(label, fallbackYear = new Date().getFullYear()) {
  if (typeof label === "number") return { month: label, year: fallbackYear };
  const str = String(label || "").trim();
  const numeric = str.match(/^(\d{1,2})\s*[/\-]\s*(\d{4})$/);
  if (numeric) return { month: Number(numeric[1]), year: Number(numeric[2]) };

  const [ar, yr] = str.split(/\s+/);
  return {
    month: ARABIC_MONTHS[ar] || new Date().getMonth() + 1,
    year: Number(yr) || fallbackYear,
  };
}

export function deriveMlsdUnifiedId(orgId) {
  if (!orgId) return "";
  const parts = String(orgId).split("-");
  if (parts.length >= 2) return `${parts[0]}-${parts[1]}`;
  return String(orgId);
}
