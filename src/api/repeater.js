import { parseResponse } from "./http.js";
import {
  extractMudadMessage,
  isUploadSuccessMessage,
  shouldContinueRepeater,
} from "./mudad.js";

const STEP_DELAY_MS = 600;
const DEFAULT_TOTAL = 10;

export function buildStepResponse(row) {
  const mudadMsg = row.message || extractMudadMessage(row.data) || extractMudadMessage(row.raw);
  const phase = row.phase === "original" ? "أصلي" : "معدّل";
  const httpPart = row.status ? `HTTP ${row.status}` : "";
  return {
    label: mudadMsg || `POST #${row.request} (${phase}) — راتب ${row.salary ?? "?"}${httpPart ? ` — ${httpPart}` : ""}`,
    color: row.ok ? "#4ade80" : "#f87171",
    body: {
      رسالة_مدد: mudadMsg || null,
      request: row.request,
      phase: row.phase,
      label: row.label,
      salary: row.salary,
      signatureLength: row.signatureLength,
      httpStatus: row.status,
      ok: row.ok,
      message: mudadMsg || row.message || null,
      mudadResponse: row.data ?? row.raw,
    },
  };
}

export function initRepeaterHistory(plan) {
  return (plan.steps || Array.from({ length: plan.total || DEFAULT_TOTAL }, (_, i) => ({ index: i + 1 }))).map((s) => ({
    request: s.index,
    phase: s.phase,
    label: s.label || `طلب #${s.index}`,
    salary: s.salary,
    state: "pending",
    ok: null,
    status: null,
    message: null,
    color: "#64748b",
    body: null,
    responseLabel: null,
  }));
}

export function historyItemFromRow(row, stepMeta) {
  const resp = buildStepResponse(row);
  const mudadMsg = row.message || extractMudadMessage(row.data);
  return {
    request: row.request,
    phase: row.phase,
    label: stepMeta?.label || row.label || `طلب #${row.request}`,
    salary: row.salary,
    state: "done",
    ok: row.ok,
    status: row.status,
    message: mudadMsg,
    color: resp.color,
    body: resp.body,
    responseLabel: mudadMsg || resp.label,
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseStepRow(json, res, index) {
  const msg = extractMudadMessage(json) || json?.error || "";
  const ok = json.ok !== undefined ? Boolean(json.ok) : res.ok;
  return {
    request: json.request ?? index,
    method: json.method || "POST",
    path: json.path,
    phase: json.phase,
    label: json.label,
    salary: json.salary,
    baseSalary: json.baseSalary,
    signatureLength: json.signatureLength,
    ok,
    status: json.status || res.status,
    message: msg,
    data: json.data,
    raw: json,
  };
}

/** إرسال خطوة واحدة فقط */
export async function sendRepeaterStep(sessionId, index, total) {
  const res = await fetch("/api/mudad/repeater/step", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionId, index, total }),
  });
  const json = await parseResponse(res);
  if (json.error && json.ok === false) {
    return parseStepRow({ ...json, ok: false, request: index }, res, index);
  }
  return parseStepRow(json, res, index);
}

/**
 * رفع أصلي أولاً — إن نجح يتوقف.
 * إن ظهر «تم رفعه مسبقاً» أو خطأ سلامة → يعدّل راتب+توقيع ويكرر حتى 10 مرات.
 */
export async function runRepeaterSequence(plan, onProgress) {
  const { sessionId, total, fileName, signatureLength, baseSalary, salaries } = plan;
  if (!sessionId) {
    throw new Error("جلسة Repeater غير صالحة — أعد رفع الملف");
  }

  const results = [];
  const count = total || DEFAULT_TOTAL;
  let stoppedEarly = false;
  let stopReason = "";

  for (let i = 1; i <= count; i += 1) {
    onProgress?.({
      current: i,
      total: count,
      results: [...results],
      salary: salaries?.[i - 1],
      status: "sending",
    });

    let row;
    try {
      row = await sendRepeaterStep(sessionId, i, count);
      results.push(row);
    } catch (err) {
      row = {
        request: i,
        method: "POST",
        phase: i === 1 ? "original" : "modified",
        salary: salaries?.[i - 1],
        ok: false,
        status: 0,
        message: err.message,
        data: null,
      };
      results.push(row);
    }

    const msg = row.message || extractMudadMessage(row.data);

    onProgress?.({
      current: i,
      total: count,
      results: [...results],
      salary: row.salary ?? salaries?.[i - 1],
      status: "done",
      lastRow: row,
    });

    if (isUploadSuccessMessage(msg)) {
      stoppedEarly = true;
      stopReason = "success";
      break;
    }

    if (i === 1 && !shouldContinueRepeater(msg)) {
      stoppedEarly = true;
      stopReason = "no_retry";
      break;
    }

    if (i < count) await sleep(STEP_DELAY_MS);
  }

  const success = results.filter((r) => r.ok).length;
  return {
    ok: true,
    fileName,
    signatureLength,
    baseSalary,
    total: count,
    sent: results.length,
    success,
    results,
    stoppedEarly,
    stopReason,
  };
}
