import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import cors from "cors";
import { saveCredentials } from "./envStore.js";
import { executeUpload, mudadHeaders } from "./uploadService.js";
import {
  isInterceptEnabled,
  setInterceptEnabled,
  enqueueUpload,
  listPending,
  removePending,
  getPending,
  updatePendingBody,
  restorePending,
  ensurePending,
  clearPending,
  restorePendingOriginal,
} from "./intercept.js";
import { buildSignatureVariants } from "./repeaterService.js";
import {
  createRepeaterSession,
  sendRepeaterSessionStep,
  clearRepeaterSession,
} from "./repeaterSession.js";

const app = express();
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");
const PORT = process.env.PORT || 3001;
const BASE = (process.env.MUDAD_BASE_URL || "https://api.mudad.sa").replace(/\/$/, "");
let credentialsUpdatedAt = null;

app.use(cors());
app.use(express.json({ limit: "20mb" }));

function mudadHeadersLocal() {
  return mudadHeaders();
}

function configStatus() {
  return {
    configured: Boolean(
      process.env.MUDAD_BEARER_TOKEN &&
      process.env.MUDAD_API_KEY &&
      process.env.MUDAD_ORG_ID
    ),
    hasSession: Boolean(process.env.MUDAD_SESSION_ID),
    filesPath: process.env.MUDAD_FILES_PATH || null,
    uploadPath: process.env.MUDAD_UPLOAD_PATH || null,
    uploadCheckPath: process.env.MUDAD_UPLOAD_CHECK_PATH || null,
    detailPath: process.env.MUDAD_FILE_DETAIL_PATH || null,
    orgId: process.env.MUDAD_ORG_ID || null,
    updatedAt: credentialsUpdatedAt,
  };
}

function parseResponseBody(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const trimmed = text.trim();
    if (trimmed.startsWith("<!") || trimmed.startsWith("<html")) {
      return { error: "استجابة HTML — تحقق من مسار API والاعتماد", raw: text.slice(0, 200) };
    }
    return { raw: text };
  }
}

async function forwardToMudad(path, { method = "GET", query = {}, body = null } = {}) {
  const url = new URL(path.startsWith("http") ? path : `${BASE}${path.startsWith("/") ? "" : "/"}${path}`);
  Object.entries(query).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  });

  const init = {
    method,
    headers: { ...mudadHeadersLocal() },
  };

  if (body && method !== "GET" && method !== "HEAD") {
    init.headers["content-type"] = "application/json";
    init.body = JSON.stringify(body);
  }

  const res = await fetch(url, init);
  const text = await res.text();
  const data = parseResponseBody(text);

  return { status: res.status, ok: res.ok, data, url: url.toString() };
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, port: PORT });
});

app.get("/api/mudad/config", (_req, res) => {
  res.json(configStatus());
});

app.post("/api/mudad/credentials", (req, res) => {
  const {
    bearerToken,
    apiKey,
    orgId,
    sessionId,
    systemType,
    filesPath,
    uploadPath,
    detailPath,
    baseUrl,
    mlsdUnifiedId,
    fileType,
    wageFrequencyCode,
    uploadCheckPath,
  } = req.body || {};

  if (!bearerToken || !apiKey || !orgId) {
    return res.status(400).json({
      error: "بيانات ناقصة — تأكد من وجود bearer_token و x-apikey و organizationid",
      missing: [
        !bearerToken && "bearer_token",
        !apiKey && "x-apikey",
        !orgId && "organizationid",
      ].filter(Boolean),
    });
  }

  try {
    saveCredentials({
      bearerToken,
      apiKey,
      orgId,
      sessionId,
      systemType,
      filesPath,
      uploadPath: uploadPath || "/compliance/v1/upload-wage-file",
      detailPath,
      baseUrl,
      mlsdUnifiedId,
      fileType,
      wageFrequencyCode,
      uploadCheckPath,
    });
    credentialsUpdatedAt = Date.now();
    res.json({ ok: true, config: configStatus() });
  } catch (err) {
    res.status(500).json({ error: err.message || "فشل حفظ الاعتماد" });
  }
});

app.post("/api/mudad/proxy", async (req, res) => {
  const { path, method = "GET", query = {}, body = null } = req.body || {};
  if (!path) return res.status(400).json({ error: "path مطلوب" });
  if (!configStatus().configured) {
    return res.status(400).json({ error: "أكمل إعداد .env أولاً (bearer_token, x-apikey, organizationid)" });
  }

  try {
    const result = await forwardToMudad(path, { method, query, body });
    res.status(result.status).json(result);
  } catch (err) {
    res.status(502).json({ error: err.message || "فشل الاتصال بـ api.mudad.sa" });
  }
});

app.get("/api/mudad/files", async (req, res) => {
  const path =
    process.env.MUDAD_FILES_PATH ||
    "/compliance/resources/v1/establishment/mlsd-unified-id/submitted-files";

  const index = req.query.index ?? req.query.page ?? 0;
  const limit = req.query.limit ?? req.query.size ?? 10;

  const query = {
    index,
    limit,
    fileStatus: req.query.fileStatus ?? "",
    monthYear: req.query.monthYear ?? "",
    order: req.query.order ?? "newest",
  };

  try {
    const result = await forwardToMudad(path, { method: "GET", query });
    if (!result.ok) {
      const ar = result.data?.message?.arabic;
      result.error = ar || result.data?.message?.english || `خطأ ${result.status}`;
    }
    res.status(result.status).json(result);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

function formatMudadDate(d = new Date()) {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

app.get("/api/mudad/upload-availability", async (req, res) => {
  const path =
    process.env.MUDAD_UPLOAD_CHECK_PATH ||
    "/compliance/resources/v1/wps-bank-integrated-services";

  const query = {
    serviceAvailabilityDate: req.query.date || formatMudadDate(),
    serviceName: req.query.serviceName || "WAGE_FILE_UPLOAD",
    status: req.query.status || "A",
  };

  if (!configStatus().configured) {
    return res.status(400).json({ error: "أكمل إعداد الاعتماد أولاً" });
  }

  try {
    const result = await forwardToMudad(path, { method: "GET", query });
    if (!result.ok) {
      const ar = result.data?.message?.arabic;
      result.error = ar || result.data?.message?.english || `خطأ ${result.status}`;
    }
    res.status(result.status).json(result);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.get("/api/mudad/intercept", (_req, res) => {
  res.json({ enabled: isInterceptEnabled(), pending: listPending() });
});

app.post("/api/mudad/intercept", (req, res) => {
  const enabled = setInterceptEnabled(req.body?.enabled);
  res.json({ enabled, pending: listPending() });
});

app.get("/api/mudad/intercept/pending", (_req, res) => {
  res.json({ pending: listPending() });
});

app.delete("/api/mudad/intercept/pending/:id", (req, res) => {
  removePending(req.params.id);
  res.json({ ok: true, pending: listPending() });
});

async function runInterceptSend(interceptId, patch) {
  const id = String(interceptId || `s${Date.now()}`);
  const item = ensurePending(id, patch);
  const result = await executeUpload(item.body);
  restorePendingOriginal(id);
  if (!result.ok) {
    const ar = result.data?.message?.arabic;
    result.error = ar || result.data?.message?.english || `خطأ ${result.status}`;
  }
  return { id, result };
}

app.post("/api/mudad/intercept/send", async (req, res) => {
  if (!configStatus().configured) {
    return res.status(400).json({ error: "أكمل إعداد الاعتماد أولاً", pending: listPending() });
  }
  const { interceptId, ...patch } = req.body || {};
  try {
    const { id, result } = await runInterceptSend(interceptId, patch);
    res.status(result.status).json({ ...result, interceptId: id, pending: listPending() });
  } catch (err) {
    const status = err.code === "INVALID_BODY" ? 400 : 502;
    res.status(status).json({ error: err.message, pending: listPending() });
  }
});

app.post("/api/mudad/intercept/execute/:id", async (req, res) => {
  if (!configStatus().configured) {
    return res.status(400).json({ error: "أكمل إعداد الاعتماد أولاً", pending: listPending() });
  }
  try {
    const { id, result } = await runInterceptSend(req.params.id, req.body);
    res.status(result.status).json({ ...result, interceptId: id, pending: listPending() });
  } catch (err) {
    const status = err.code === "INVALID_BODY" ? 400 : 502;
    res.status(status).json({ error: err.message, pending: listPending() });
  }
});

app.post("/api/mudad/intercept/signature-trial/:id", async (req, res) => {
  if (!configStatus().configured) {
    return res.status(400).json({ error: "أكمل إعداد الاعتماد أولاً", pending: listPending() });
  }

  const variants = req.body?.variants;
  if (!Array.isArray(variants) || !variants.length) {
    return res.status(400).json({ error: "variants مطلوب — مصفوفة من fileBase64", pending: listPending() });
  }

  const id = String(req.params.id);
  let baseBody = getPending(id)?.body ?? {};

  const results = [];
  for (let i = 0; i < variants.length; i += 1) {
    const variant = variants[i];
    const payload = typeof variant === "string"
      ? { ...baseBody, fileBase64: variant }
      : { ...baseBody, ...variant };
    try {
      ensurePending(id, payload);
      baseBody = getPending(id).body;
      const result = await executeUpload(baseBody);
      restorePendingOriginal(id);
      baseBody = getPending(id)?.body ?? baseBody;
      const ar = result.data?.message?.arabic;
      results.push({
        index: i + 1,
        ok: result.ok,
        status: result.status,
        message: ar || result.data?.message?.english || result.error || "",
        data: result.data,
      });
    } catch (err) {
      results.push({ index: i + 1, ok: false, status: 0, message: err.message });
    }
  }

  res.json({ results, total: results.length, success: results.filter((r) => r.ok).length, pending: listPending() });
});

/** بدء جلسة Repeater — دائماً (لا يعتمد على وضع الاعتراض) */
app.post("/api/mudad/repeater/start", async (req, res) => {
  if (!configStatus().configured) {
    return res.status(400).json({ error: "أكمل إعداد الاعتماد أولاً" });
  }
  const session = createRepeaterSession(req.body || {});
  if (session.error) {
    return res.status(400).json({
      repeaterPlan: true,
      repeater: true,
      error: session.error,
      total: 0,
      success: 0,
      results: [],
    });
  }
  return res.json({
    repeaterPlan: true,
    repeater: true,
    ...session,
  });
});

/** طلب رفع واحد — خطوة من جلسة Repeater (واحد تلو الآخر) */
app.post("/api/mudad/repeater/step", async (req, res) => {
  if (!configStatus().configured) {
    return res.status(400).json({ error: "أكمل إعداد الاعتماد أولاً" });
  }
  const { sessionId, index } = req.body || {};
  if (!sessionId || !index) {
    return res.status(400).json({ error: "sessionId و index مطلوبان" });
  }
  try {
    const { payload, variant, base, total } = sendRepeaterSessionStep(sessionId, index);
    const result = await executeUpload(payload);
    const ar = result.data?.message?.arabic;
    if (!result.ok) {
      result.error = ar || result.data?.message?.english || `خطأ ${result.status}`;
    }
    const row = {
      request: variant.index,
      phase: variant.phase,
      label: variant.label,
      method: "POST",
      path: base.uploadPath,
      salary: variant.salary,
      baseSalary: variant.baseSalary,
      signatureLength: variant.signature.length,
      ok: result.ok,
      status: result.status,
      message: ar || result.data?.message?.english || result.error || "",
      data: result.data,
    };
    if (Number(index) >= total) {
      clearRepeaterSession(sessionId);
    }
    res.status(result.status).json({ ...result, ...row });
  } catch (err) {
    const status = err.code === "SESSION_GONE" ? 404 : err.code === "BAD_INDEX" ? 400 : 502;
    res.status(status).json({ error: err.message, request: index, ok: false });
  }
});

/** احتياطي — رفع مباشر بجسم كامل */
app.post("/api/mudad/repeater/send", async (req, res) => {
  if (!configStatus().configured) {
    return res.status(400).json({ error: "أكمل إعداد الاعتماد أولاً" });
  }
  const { repeaterIndex, ...uploadBody } = req.body || {};
  if (!uploadBody.fileName || !uploadBody.fileBase64) {
    return res.status(400).json({ error: "fileName و fileBase64 مطلوبان", request: repeaterIndex });
  }
  try {
    const result = await executeUpload(uploadBody);
    if (!result.ok) {
      const ar = result.data?.message?.arabic;
      result.error = ar || result.data?.message?.english || `خطأ ${result.status}`;
    }
    res.status(result.status).json({ ...result, request: repeaterIndex });
  } catch (err) {
    res.status(502).json({ error: err.message, request: repeaterIndex });
  }
});

app.post("/api/mudad/upload", async (req, res) => {
  const path = process.env.MUDAD_UPLOAD_PATH || "/compliance/v1/upload-wage-file";
  if (!configStatus().configured) {
    return res.status(400).json({ error: "أكمل إعداد الاعتماد أولاً" });
  }

  const useRepeater = isInterceptEnabled() || Boolean(req.body?.repeater);
  if (useRepeater) {
    const session = createRepeaterSession(req.body || {});
    clearPending();
    if (session.error) {
      return res.status(400).json({
        intercepted: true,
        repeater: true,
        repeaterPlan: true,
        error: session.error,
        total: 0,
        success: 0,
        results: [],
        pending: [],
      });
    }
    return res.status(202).json({
      intercepted: true,
      repeater: true,
      repeaterPlan: true,
      pending: [],
      ...session,
    });
  }

  const {
    fileName,
    fileBase64,
    month,
    year,
    contentType,
    mlsdUnifiedId,
    fileType,
    wageFrequencyCode,
  } = req.body || {};

  if (!fileName || !fileBase64) {
    return res.status(400).json({ error: "fileName و fileBase64 مطلوبان" });
  }

  try {
    const result = await executeUpload({
      fileName,
      fileBase64,
      month,
      year,
      contentType,
      mlsdUnifiedId,
      fileType,
      wageFrequencyCode,
      uploadPath: path,
    });

    if (!result.ok && result.data?.error) {
      return res.status(result.status).json({ ...result, error: result.data.error });
    }

    res.status(result.status).json(result);
  } catch (err) {
    res.status(502).json({ error: err.message || "فشل رفع الملف" });
  }
});

app.get("/api/mudad/files/:id", async (req, res) => {
  const template = process.env.MUDAD_FILE_DETAIL_PATH;
  const path = template
    ? template.replace("{id}", req.params.id)
    : `${process.env.MUDAD_FILES_PATH}/${req.params.id}`;

  if (!path || path.includes("undefined")) {
    return res.status(400).json({ error: "حدّد MUDAD_FILE_DETAIL_PATH أو MUDAD_FILES_PATH في .env" });
  }

  try {
    const result = await forwardToMudad(path, { method: "GET" });
    res.status(result.status).json(result);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

if (fs.existsSync(DIST)) {
  app.use(express.static(DIST, { index: false }));
  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res.sendFile(path.join(DIST, "index.html"));
  });
} else {
  console.warn("⚠ مجلد dist/ غير موجود — الواجهة غير متاحة حتى يُنفَّذ npm run build");
  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res.status(503).type("text/html; charset=utf-8").send(
      "<!DOCTYPE html><html lang='ar' dir='rtl'><body style='font-family:sans-serif;padding:2rem'>" +
      "<h1>الواجهة غير مبنية</h1><p>نفّذ <code>npm run build</code> ثم أعد تشغيل التطبيق.</p>" +
      "<p>الـ API يعمل على <a href='/api/health'>/api/health</a></p></body></html>"
    );
  });
}

app.listen(PORT, "0.0.0.0", () => {
  const cfg = configStatus();
  console.log(`Mudad → http://0.0.0.0:${PORT}`);
  if (fs.existsSync(DIST)) console.log(`✓ واجهة الإنتاج من ${DIST}`);
  console.log(cfg.configured ? "✓ بيانات الاعتماد محمّلة" : "⚠ أكمل ملف .env أو الصق الاعتماد من الواجهة");
  if (cfg.filesPath) console.log(`  files: ${cfg.filesPath}`);
}).on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`\n✗ المنفذ ${PORT} مشغول — شغّل: npm run dev (ينظّف المنافذ تلقائياً)\n`);
  } else {
    console.error(err);
  }
  process.exit(1);
});
