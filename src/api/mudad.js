import { parseResponse, parseMonthYear, deriveMlsdUnifiedId } from "./http.js";

const FILE_TYPE_MAP = { txt: "TEXT", csv: "TEXT", jpg: "IMAGE", jpeg: "IMAGE", png: "IMAGE", pdf: "PDF" };

export function getFileType(name = "") {
  const ext = name.split(".").pop()?.toLowerCase();
  return FILE_TYPE_MAP[ext] || "TEXT";
}

const STATUS_MAP = {
  approved: "Approved",
  accepted: "Approved",
  success: "Approved",
  مقبول: "Approved",
  queued: "Queued",
  pending: "Queued",
  submitted: "Queued",
  processing: "Processing",
  underreview: "Processing",
  inprogress: "Processing",
  rejected: "Rejected",
  failed: "Rejected",
  error: "Rejected",
  مرفوض: "Rejected",
  deleted: "Deleted",
};

export function mapStatus(value) {
  if (!value) return "Queued";
  const key = String(value).toLowerCase();
  return STATUS_MAP[key] || (STATUS_MAP[value] ?? "Queued");
}

function pick(obj, keys, fallback = "") {
  for (const k of keys) {
    if (obj?.[k] !== undefined && obj?.[k] !== null && obj[k] !== "") return obj[k];
  }
  return fallback;
}

export function mapMudadFile(item, index = 0) {
  const name = pick(item, ["name", "file_name", "fileName", "file_name_ar", "originalFileName"], `file-${index + 1}`);
  return {
    id: pick(item, ["fileId", "file_id", "id", "wageFileId", "documentId"], index + 1),
    name,
    month: pick(item, ["monthYearAr", "monthYear", "month", "payrollMonth", "wageMonth", "monthName", "period"], "—"),
    date: pick(item, ["submittedDate", "upload_date", "uploadDate", "createdAt", "created_date", "submissionDate"], "—"),
    fileNum: pick(item, ["fileId", "document_number", "documentNumber", "establishmentNumber", "orgNumber", "referenceNumber"], "—"),
    fileType: pick(item, ["fileType", "file_type", "type", "mimeType"], getFileType(name)),
    status: mapStatus(pick(item, ["status", "processingStatus", "fileStatus", "wageStatus"])),
    deletable: Boolean(item?.deletable),
    _raw: item,
  };
}

export function extractFileList(payload) {
  const body = payload?.data ?? payload;
  const root = body?.data ?? body;

  if (Array.isArray(root?.listOfItems)) return root.listOfItems;
  if (Array.isArray(body?.listOfItems)) return body.listOfItems;
  if (Array.isArray(root)) return root;
  if (Array.isArray(root?.content)) return root.content;
  if (Array.isArray(root?.items)) return root.items;
  if (Array.isArray(root?.records)) return root.records;
  if (Array.isArray(root?.data)) return root.data;
  if (Array.isArray(root?.submittedFiles)) return root.submittedFiles;
  if (Array.isArray(body?.submittedFiles)) return body.submittedFiles;
  if (Array.isArray(body?.data)) return body.data;

  return [];
}

export function extractTotal(payload, listLength = 0) {
  const body = payload?.data ?? payload;
  const root = body?.data ?? body;
  return (
    root?.totalElement ??
    root?.totalCount ??
    root?.total ??
    root?.totalElements ??
    root?.totalRecords ??
    root?.count ??
    body?.total ??
    listLength
  );
}

export function isAlreadyUploadedMessage(msg) {
  if (!msg) return false;
  const s = String(msg);
  return /مسبق|سبق رفع|سبق تحميل|already|duplicate|مكرر|uploaded before|previously uploaded|تم تحميله|تم رفعه مسبق/i.test(s);
}

export function isUploadSuccessMessage(msg) {
  if (!msg) return false;
  if (isAlreadyUploadedMessage(msg)) return false;
  return /بنجاح|success|تم رفع الملف|تم رفع ملف/i.test(String(msg));
}

export function shouldContinueRepeater(msg) {
  if (!msg) return true;
  if (isUploadSuccessMessage(msg)) return false;
  return isAlreadyUploadedMessage(msg)
    || /سلامة|integrity|تحقق|التحقق/i.test(String(msg));
}

export function extractMudadMessage(json) {
  if (!json) return "";
  const layers = [json, json.data, json.data?.data, json.mudadResponse, json.raw?.data];
  for (const layer of layers) {
    if (!layer) continue;
    const msg = layer.message;
    if (msg?.arabic) return msg.arabic;
    if (typeof msg === "string" && msg.trim()) return msg.trim();
    if (msg?.english) return msg.english;
  }
  if (typeof json.message === "string" && json.message.trim()) return json.message.trim();
  return "";
}

export function extractMudadError(json, status = "") {
  const ar = extractMudadMessage(json);
  if (ar) return ar;
  if (json?.error) return json.error;
  if (status === 403 || json?.status === 403) {
    return "لا يوجد صلاحية — انتهت الجلسة. الصق اعتماداً جديداً من DevTools وأنت على صفحة مدد";
  }
  return status ? `خطأ ${status}` : "خطأ غير معروف";
}

export async function getMudadConfig() {
  const res = await fetch("/api/mudad/config");
  const json = await parseResponse(res);
  if (!res.ok) throw new Error(json.error || "تعذّر قراءة إعدادات الخادم");
  return json;
}

export async function saveMudadCredentials(credentials) {
  const res = await fetch("/api/mudad/credentials", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(credentials),
  });
  const json = await parseResponse(res);
  if (!res.ok) throw new Error(extractMudadError(json, res.status));
  return json;
}

export async function fetchMudadFiles(page = 1, size = 10) {
  const index = Math.max(0, page - 1);
  const res = await fetch(
    `/api/mudad/files?index=${index}&limit=${size}&fileStatus=&monthYear=&order=newest`
  );
  const json = await parseResponse(res);
  if (!res.ok) throw new Error(extractMudadError(json, res.status));
  return json;
}

export async function fetchMudadFileDetail(id) {
  const res = await fetch(`/api/mudad/files/${encodeURIComponent(id)}`);
  const json = await parseResponse(res);
  if (!res.ok) throw new Error(extractMudadError(json, res.status));
  return json;
}

export async function uploadMudadFile(file, { month, year, orgId, repeater = false } = {}) {
  const { month: monthNum, year: yearNum } = parseMonthYear(month, year);
  const base64 = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const payload = {
    fileName: file.name,
    fileBase64: base64,
    month: monthNum,
    year: yearNum,
    mlsdUnifiedId: deriveMlsdUnifiedId(orgId),
    contentType: file.type || "text/plain",
    repeater: Boolean(repeater),
  };

  const url = repeater ? "/api/mudad/repeater/start" : "/api/mudad/upload";
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = await parseResponse(res);
  if (json.repeaterPlan) {
    return { repeaterPlan: true, repeater: true, ...json };
  }
  if (!res.ok) {
    throw new Error(extractMudadError(json, res.status));
  }
  return json;
}

export async function getInterceptState() {
  const res = await fetch("/api/mudad/intercept");
  return parseResponse(res);
}

export async function setInterceptEnabled(enabled) {
  const res = await fetch("/api/mudad/intercept", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ enabled }),
  });
  return parseResponse(res);
}

export async function executeInterceptedUpload(id, body) {
  const res = await fetch("/api/mudad/intercept/send", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ interceptId: id, ...body }),
  });
  const json = await parseResponse(res);
  if (Array.isArray(json.pending)) return json;
  if (json.ok !== undefined) return json;
  if (!res.ok) throw new Error(extractMudadError(json, res.status));
  return json;
}

export async function trySignatureVariants(id, variants) {
  const res = await fetch(`/api/mudad/intercept/signature-trial/${id}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ variants }),
  });
  const json = await parseResponse(res);
  if (Array.isArray(json.pending)) return json;
  if (json.results) return json;
  if (!res.ok) throw new Error(extractMudadError(json, res.status));
  return json;
}

export async function discardInterceptedUpload(id) {
  const res = await fetch(`/api/mudad/intercept/pending/${id}`, { method: "DELETE" });
  return parseResponse(res);
}

export async function proxyMudadRequest(path, { method = "GET", query = {}, body = null } = {}) {
  const res = await fetch("/api/mudad/proxy", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path, method, query, body }),
  });
  const json = await parseResponse(res);
  if (!res.ok) throw new Error(json.error || json.data?.message || `خطأ ${res.status}`);
  return json;
}
