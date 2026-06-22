function forwardCapture(payload) {
  chrome.storage.local.set({ mudadCapture: payload });
  chrome.runtime.sendMessage({ type: "CAPTURE_UPDATE", payload }).catch(() => {});
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "GET_CAPTURE") {
    window.postMessage({ source: "mudad-capture", type: "PING" }, "*");
    const onMsg = (ev) => {
      if (ev.data?.source !== "mudad-capture" || ev.data?.type !== "UPDATE") return;
      window.removeEventListener("message", onMsg);
      forwardCapture(ev.data.payload);
      sendResponse({ ok: true, payload: ev.data.payload });
    };
    window.addEventListener("message", onMsg);
    setTimeout(() => {
      try {
        const raw = sessionStorage.getItem("__mudad_capture_v1");
        if (raw) {
          const payload = JSON.parse(raw);
          forwardCapture(payload);
          sendResponse({ ok: true, payload });
        } else {
          sendResponse({ ok: false, error: "لم تُلتقط جلسة بعد — تصفّح مدد قليلاً" });
        }
      } catch (e) {
        sendResponse({ ok: false, error: e.message });
      }
    }, 400);
    return true;
  }
});

window.addEventListener("message", (ev) => {
  if (ev.data?.source === "mudad-capture" && ev.data?.type === "UPDATE") {
    forwardCapture(ev.data.payload);
  }
});
