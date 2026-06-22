const DEFAULT_FILES = "/compliance/resources/v1/establishment/mlsd-unified-id/submitted-files";

function mask(v) {
  if (!v) return "—";
  return v.length > 12 ? `${v.slice(0, 6)}…${v.slice(-4)}` : "••••";
}

function render(cap, sendStatus, debug) {
  const h = cap?.headers || {};
  document.getElementById("preview").textContent = JSON.stringify({
    bearer_token: mask(h.bearer_token),
    x_apikey: mask(h["x-apikey"]),
    organizationid: h.organizationid || "—",
    session_id: mask(h.session_id),
    uploadPath: cap?.uploadPath || "/compliance/v1/upload-wage-file",
    status: sendStatus || "—",
  }, null, 2);

  document.getElementById("debug").textContent = debug
    ? `آخر طلب: ${debug.url || "—"}\nالمصدر: ${debug.source || "—"} | ${debug.at || ""}`
    : "بانتظار طلب api.mudad.sa...";
}

async function refresh() {
  const status = document.getElementById("status");
  status.className = "";
  status.textContent = "جاري المزامنة...";
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.url?.includes("mudad.com.sa")) {
      await chrome.runtime.sendMessage({ type: "FORCE_SYNC" });
    }
    const stored = await chrome.storage.local.get([
      "mudadCapture", "lastSendStatus", "lastCaptureDebug",
    ]);
    render(stored.mudadCapture, stored.lastSendStatus, stored.lastCaptureDebug);

    if (stored.lastSendStatus === "sent") {
      status.className = "ok";
      status.textContent = "✓ أُرسل للوحة بنجاح";
    } else if (stored.mudadCapture?.headers?.bearer_token) {
      status.className = "ok";
      status.textContent = "✓ جلسة ملتقطة — جاري الإرسال...";
    } else if (stored.lastCaptureDebug?.url) {
      status.className = "err";
      status.textContent = "طُلِّط الطلب لكن الرؤوس ناقصة — جرّب لصق Raw HTTP أدناه";
    } else {
      status.className = "err";
      status.textContent = "لم يُلتقط طلب بعد — ارفع ملفاً في مدد";
    }
  } catch (e) {
    document.getElementById("preview").textContent = "—";
    status.className = "err";
    status.textContent = e.message;
  }
}

document.getElementById("refresh").addEventListener("click", refresh);

document.getElementById("paste").addEventListener("click", async () => {
  const status = document.getElementById("status");
  const text = document.getElementById("raw").value.trim();
  if (!text) {
    status.className = "err";
    status.textContent = "الصق طلب Raw HTTP أولاً";
    return;
  }
  status.textContent = "جاري الإرسال...";
  try {
    const r = await chrome.runtime.sendMessage({ type: "RAW_HTTP_CAPTURE", text });
    if (r?.ok && (r.reason === "sent" || r.reason === "unchanged")) {
      status.className = "ok";
      status.textContent = "✓ تم الربط من Raw HTTP";
      refresh();
    } else {
      status.className = "err";
      status.textContent = r?.reason === "incomplete"
        ? "بيانات ناقصة في اللصق"
        : (r?.reason || "فشل — شغّل npm run dev");
    }
  } catch (e) {
    status.className = "err";
    status.textContent = e.message;
  }
});

refresh();
