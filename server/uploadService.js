import "dotenv/config";

const BASE = (process.env.MUDAD_BASE_URL || "https://api.mudad.sa").replace(/\/$/, "");

export function deriveMlsdUnifiedId(orgId) {
  if (!orgId) return "";
  const parts = String(orgId).split("-");
  if (parts.length >= 2) return `${parts[0]}-${parts[1]}`;
  return String(orgId);
}

export function mudadHeaders() {
  const headers = {
    accept: "application/json, text/plain, */*",
    "accept-language": "ar",
    origin: "https://mudad.com.sa",
    referer: "https://mudad.com.sa/compliance/",
    systemtype: process.env.MUDAD_SYSTEM_TYPE || "MUDAD_COMPLIANCE_APP",
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
  };

  if (process.env.MUDAD_BEARER_TOKEN) headers.bearer_token = process.env.MUDAD_BEARER_TOKEN;
  if (process.env.MUDAD_API_KEY) headers["x-apikey"] = process.env.MUDAD_API_KEY;
  if (process.env.MUDAD_ORG_ID) headers.organizationid = process.env.MUDAD_ORG_ID;
  if (process.env.MUDAD_SESSION_ID) headers.session_id = process.env.MUDAD_SESSION_ID;

  return headers;
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

export function normalizeUploadBody(body = {}) {
  const {
    fileName,
    fileBase64,
    month,
    year,
    contentType,
    mlsdUnifiedId,
    fileType,
    wageFrequencyCode,
    uploadPath,
  } = body;

  const monthNum = Number(month) || new Date().getMonth() + 1;
  const yearNum = Number(year) || new Date().getFullYear();
  const unifiedId =
    mlsdUnifiedId ||
    process.env.MUDAD_MLSD_UNIFIED_ID ||
    deriveMlsdUnifiedId(process.env.MUDAD_ORG_ID);

  return {
    uploadPath: uploadPath || process.env.MUDAD_UPLOAD_PATH || "/compliance/v1/upload-wage-file",
    fileName,
    fileBase64,
    contentType: contentType || "text/plain",
    form: {
      month: String(monthNum),
      year: String(yearNum),
      fileType: String(fileType || process.env.MUDAD_FILE_TYPE || "1000"),
      mlsdUnifiedId: unifiedId,
      wageFrequencyCode: String(wageFrequencyCode || process.env.MUDAD_WAGE_FREQUENCY || "1001"),
    },
  };
}

export function buildUploadPreview(body) {
  const norm = normalizeUploadBody(body);
  return {
    method: "POST",
    url: `${BASE}${norm.uploadPath.startsWith("/") ? "" : "/"}${norm.uploadPath}`,
    headers: mudadHeaders(),
    form: {
      ...norm.form,
      files: {
        fileName: norm.fileName,
        contentType: norm.contentType,
        fileBase64: norm.fileBase64,
        sizeBytes: norm.fileBase64 ? Math.floor((norm.fileBase64.length * 3) / 4) : 0,
      },
    },
    uploadPath: norm.uploadPath,
    fileName: norm.fileName,
    fileBase64: norm.fileBase64,
    contentType: norm.contentType,
    month: norm.form.month,
    year: norm.form.year,
    fileType: norm.form.fileType,
    mlsdUnifiedId: norm.form.mlsdUnifiedId,
    wageFrequencyCode: norm.form.wageFrequencyCode,
  };
}

export async function executeUpload(body) {
  const norm = normalizeUploadBody(body);
  if (!norm.fileName || !norm.fileBase64) {
    throw new Error("fileName و fileBase64 مطلوبان");
  }

  const buffer = Buffer.from(norm.fileBase64, "base64");
  const form = new FormData();
  form.append("month", norm.form.month);
  form.append("year", norm.form.year);
  form.append("fileType", norm.form.fileType);
  form.append("mlsdUnifiedId", norm.form.mlsdUnifiedId);
  form.append("wageFrequencyCode", norm.form.wageFrequencyCode);
  form.append("files", new Blob([buffer], { type: norm.contentType }), norm.fileName);

  const url = `${BASE}${norm.uploadPath.startsWith("/") ? "" : "/"}${norm.uploadPath}`;
  const res = await fetch(url, {
    method: "POST",
    headers: mudadHeaders(),
    body: form,
  });

  const text = await res.text();
  const data = parseResponseBody(text);

  return { status: res.status, ok: res.ok, data, url };
}
