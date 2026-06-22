import { splitPmsFile, generateSignatureVariants } from "../src/utils/pmsSignature.js";
import { detectBaseSalary, bodyTextForVariant } from "../src/utils/wageFileEdit.js";
import { buildUploadPreview, executeUpload } from "./uploadService.js";

function decodeFileText(base64) {
  return Buffer.from(base64, "base64").toString("utf-8");
}

function encodeFileText(text) {
  return Buffer.from(text, "utf-8").toString("base64");
}

export const REPEATER_REQUEST_COUNT = 10;

export function buildSignatureVariants(body, requestCount = REPEATER_REQUEST_COUNT) {
  const base = buildUploadPreview(body);
  const text = decodeFileText(base.fileBase64);
  const split = splitPmsFile(text);

  if (!split.hasSignature) {
    return { error: "الملف لا يحتوي توقيعاً (سطر - ثم التوقيع في النهاية)" };
  }

  const sigLen = split.signature.length;
  const baseSalary = detectBaseSalary(split.bodyText);
  const signatures = generateSignatureVariants(split.signature, requestCount);

  const variants = [
    {
      index: 1,
      phase: "original",
      label: "رفع أصلي",
      signature: split.signature,
      salary: baseSalary,
      baseSalary,
      fileBase64: encodeFileText(text),
    },
  ];

  for (let i = 2; i <= requestCount; i += 1) {
    const wage = bodyTextForVariant(split.bodyText, i - 1, baseSalary);
    const sig = signatures[i - 1];
    if (sig.length !== sigLen) {
      return { error: `تعذّر توليد توقيع #${i} بنفس الطول (${sigLen})` };
    }
    variants.push({
      index: i,
      phase: "modified",
      label: `توقيع+راتب ${wage.salary}`,
      signature: sig,
      salary: wage.salary,
      baseSalary,
      fileBase64: encodeFileText(`${wage.bodyText}\n${sig}`),
    });
  }

  return { base, variants, signatureLength: sigLen, baseSalary, requestCount };
}

/** 10 طلبات منفصلة — مثل Repeater في Burp */
export async function runSignatureRepeater(body) {
  const built = buildSignatureVariants(body);
  if (built.error) {
    return { ok: false, error: built.error, total: 0, success: 0, results: [] };
  }

  const { base, variants, signatureLength } = built;
  const results = [];

  for (const variant of variants) {
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

    try {
      const result = await executeUpload(payload);
      const ar = result.data?.message?.arabic;
      results.push({
        request: variant.index,
        method: "POST",
        path: base.uploadPath,
        signatureLength,
        signaturePreview: variant.signature.length > 56
          ? `${variant.signature.slice(0, 56)}…`
          : variant.signature,
        salary: variant.salary,
        baseSalary: variant.baseSalary,
        ok: result.ok,
        status: result.status,
        message: ar || result.data?.message?.english || result.error || "",
        data: result.data,
      });
    } catch (err) {
      results.push({
        request: variant.index,
        method: "POST",
        path: base.uploadPath,
        ok: false,
        status: 0,
        message: err.message,
      });
    }
  }

  const success = results.filter((r) => r.ok).length;
  return {
    ok: true,
    fileName: base.fileName,
    total: results.length,
    success,
    results,
  };
}
