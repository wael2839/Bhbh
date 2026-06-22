import { buildUploadPreview } from "./uploadService.mjs";

let interceptEnabled = false;
const pending = new Map();
let nextId = 1;

export function isInterceptEnabled() {
  return interceptEnabled;
}

export function setInterceptEnabled(value) {
  interceptEnabled = Boolean(value);
  return interceptEnabled;
}

export function enqueueUpload(body) {
  clearPending();
  const id = String(nextId++);
  const preview = buildUploadPreview(body);
  const item = {
    id,
    createdAt: new Date().toISOString(),
    body: preview,
    originalFileBase64: preview.fileBase64,
  };
  pending.set(id, item);
  return item;
}

export function getPending(id) {
  return pending.get(id);
}

export function listPending() {
  return [...pending.values()].sort((a, b) => Number(b.id) - Number(a.id));
}

export function removePending(id) {
  pending.delete(id);
}

export function updatePendingBody(id, patch) {
  const item = pending.get(id);
  if (!item) return null;
  item.body = buildUploadPreview({ ...item.body, ...patch });
  return item;
}

export function restorePending(id, body) {
  const existing = getPending(id);
  const preview = buildUploadPreview(body);
  const item = {
    id: String(id),
    createdAt: existing?.createdAt || new Date().toISOString(),
    body: preview,
    originalFileBase64: existing?.originalFileBase64 || preview.fileBase64,
  };
  pending.set(String(id), item);
  return item;
}

/** إعادة الملف المعلّق كما رُفع أول مرة (بعد تجربة توقيع) */
export function restorePendingOriginal(id) {
  const item = getPending(id);
  if (!item?.originalFileBase64) return null;
  item.body = buildUploadPreview({ ...item.body, fileBase64: item.originalFileBase64 });
  return item;
}

/** دمج الطلب المعلّق مع التعديلات وإبقاؤه في الذاكرة (لا يُحذف بعد الإرسال) */
export function ensurePending(id, patch = {}) {
  const existing = getPending(id);
  const merged = buildUploadPreview({ ...(existing?.body ?? {}), ...patch });
  if (!merged.fileName || !merged.fileBase64) {
    const err = new Error("fileName و fileBase64 مطلوبان");
    err.code = "INVALID_BODY";
    throw err;
  }
  const item = restorePending(id, merged);
  if (existing?.originalFileBase64) item.originalFileBase64 = existing.originalFileBase64;
  return item;
}

export function clearPending() {
  pending.clear();
}
