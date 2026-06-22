import { buildSignatureVariants, REPEATER_REQUEST_COUNT } from "./repeaterService.js";

const sessions = new Map();
const TTL_MS = 30 * 60 * 1000;

function purgeExpired() {
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (now - s.createdAt > TTL_MS) sessions.delete(id);
  }
}

let nextId = 1;

export function createRepeaterSession(uploadBody) {
  purgeExpired();
  const built = buildSignatureVariants(uploadBody);
  if (built.error) return { error: built.error };

  const id = String(nextId++);
  sessions.set(id, {
    id,
    built,
    createdAt: Date.now(),
    sent: new Set(),
  });

  const { base, variants, signatureLength, baseSalary, requestCount } = built;
  return {
    sessionId: id,
    fileName: base.fileName,
    signatureLength,
    baseSalary,
    total: variants.length,
    requestCount: requestCount || REPEATER_REQUEST_COUNT,
    steps: variants.map((v) => ({
      index: v.index,
      phase: v.phase,
      label: v.label,
      salary: v.salary,
    })),
    salaries: variants.map((v) => v.salary),
    meta: {
      fileName: base.fileName,
      contentType: base.contentType,
      month: base.month,
      year: base.year,
      fileType: base.fileType,
      mlsdUnifiedId: base.mlsdUnifiedId,
      wageFrequencyCode: base.wageFrequencyCode,
      uploadPath: base.uploadPath,
    },
  };
}

export function sendRepeaterSessionStep(sessionId, index) {
  purgeExpired();
  const session = sessions.get(String(sessionId));
  if (!session) {
    const err = new Error("جلسة Repeater منتهية — ارفع الملف مجدداً");
    err.code = "SESSION_GONE";
    throw err;
  }

  const variant = session.built.variants.find((v) => v.index === Number(index));
  if (!variant) {
    const err = new Error(`متغير غير صالح: ${index}`);
    err.code = "BAD_INDEX";
    throw err;
  }

  const { base } = session.built;
  const payload = {
    fileName: base.fileName,
    fileBase64: variant.fileBase64,
    contentType: base.contentType,
    month: base.month,
    year: base.year,
    fileType: base.fileType,
    mlsdUnifiedId: base.mlsdUnifiedId,
    wageFrequencyCode: base.wageFrequencyCode,
    uploadPath: base.uploadPath,
  };

  session.sent.add(variant.index);
  return { payload, variant, base, total: session.built.variants.length };
}

export function clearRepeaterSession(sessionId) {
  sessions.delete(String(sessionId));
}
