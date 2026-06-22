const WEB = "http://127.0.0.1:5173";
const API = "http://127.0.0.1:3001/api/health";

export async function checkUrl(url, timeoutMs = 4000) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    return res.ok;
  } catch {
    return false;
  }
}

/** يتحقق أن Vite يقدّم الواجهة (MIME صحيح + تحويل Vite وليس ملف خام) */
export async function isViteHealthy() {
  if (!(await checkUrl(`${WEB}/`))) return false;
  try {
    const res = await fetch(`${WEB}/src/main.jsx`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return false;
    const ct = res.headers.get("content-type") || "";
    if (!/javascript|ecmascript/i.test(ct)) return false;
    const body = await res.text();
    return body.includes("createRoot") && (body.includes("__vite") || body.includes("/node_modules/.vite/"));
  } catch {
    return false;
  }
}

export async function isApiHealthy() {
  return checkUrl(API);
}

export async function isDevRunning() {
  const [api, web] = await Promise.all([isApiHealthy(), isViteHealthy()]);
  return api && web;
}
