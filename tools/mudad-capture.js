/** يُحمَّل بعد capture-core.js في bookmarklet */
function mudadCaptureBookmarklet() {
  const DEFAULT_FILES =
    "/compliance/resources/v1/establishment/mlsd-unified-id/submitted-files";
  const DEFAULT_UPLOAD = "/compliance/v1/upload-wage-file";
  const PROXY = "http://localhost:3001";
  const PANEL = "http://localhost:5173";

  if (!location.hostname.includes("mudad.com.sa")) {
    alert("افتح mudad.com.sa أولاً ثم اضغط المفضلة");
    return;
  }

  const state = installMudadCapture();
  const scan = () => window.__mudadCaptureScanStorage?.() || state;

  function buildBody() {
    const s = scan();
    const h = s.headers || {};
    return {
      bearerToken: h.bearer_token,
      apiKey: h["x-apikey"] || "",
      orgId: h.organizationid || "",
      sessionId: h.session_id || "",
      systemType: h.systemtype || "MUDAD_COMPLIANCE_APP",
      filesPath: s.filesPath || DEFAULT_FILES,
      uploadPath: s.uploadPath || DEFAULT_UPLOAD,
    };
  }

  function sendViaRelay(body) {
    return new Promise((resolve, reject) => {
      let panel = null;
      try {
        panel = window.open(`${PANEL}/#credential-bridge`, "mudad_bahbah_panel");
      } catch (e) {
        reject(e);
        return;
      }

      const credentials = body;
      let done = false;
      const finish = (fn, value) => {
        if (done) return;
        done = true;
        window.removeEventListener("message", onMessage);
        clearInterval(ping);
        clearTimeout(timeout);
        fn(value);
      };

      const onMessage = (ev) => {
        if (!String(ev.origin).startsWith("http://localhost:")) return;
        if (ev.data?.source !== "mudad-capture") return;
        if (ev.data.type === "BRIDGE_READY") {
          const target = ev.origin;
          ev.source?.postMessage(
            { source: "mudad-capture", type: "SAVE_CREDENTIALS", credentials },
            target
          );
          if (panel && panel !== ev.source) {
            try {
              panel.postMessage(
                { source: "mudad-capture", type: "SAVE_CREDENTIALS", credentials },
                target
              );
            } catch { /* */ }
          }
        }
        if (ev.data.type === "CREDENTIALS_SAVED") finish(resolve, ev.data);
        if (ev.data.type === "CREDENTIALS_ERROR") finish(reject, new Error(ev.data.error));
      };

      window.addEventListener("message", onMessage);

      const ping = setInterval(() => {
        if (panel && !panel.closed) {
          try {
            panel.postMessage({ source: "mudad-capture", type: "BRIDGE_PING" }, PANEL);
          } catch { /* */ }
        }
      }, 400);

      const timeout = setTimeout(() => {
        finish(reject, new Error("bridge_timeout"));
      }, 20000);
    });
  }

  function sendToPanel() {
    const body = buildBody();
    if (!body.bearerToken) return Promise.reject(new Error("no_session"));

    return fetch(`${PROXY}/api/mudad/credentials`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
      .then((r) => r.json())
      .catch(() => sendViaRelay(body));
  }

  function onSendError(err) {
    if (err?.message === "no_session") {
      alert("لم تُلتقط الجلسة — افتح قائمة الملفات في مدد ثم حاول مجدداً");
      return;
    }
    if (err?.message === "bridge_timeout") {
      alert(
        "تعذّر الاتصال باللوحة.\n\n" +
          "1) شغّل: npm run dev\n" +
          "2) افتح http://localhost:5173 في تبويب\n" +
          "3) اضغط المفضلة مرة أخرى"
      );
      return;
    }
    alert("تعذّر الإرسال — تأكد أن npm run dev يعمل وأن اللوحة مفتوحة على localhost:5173");
  }

  scan();

  if (state.headers?.bearer_token) {
    sendToPanel()
      .then(() => alert("تم إرسال الجلسة للوحة ✓\nافتح http://localhost:5173"))
      .catch(onSendError);
    return;
  }

  alert(
    "تم تفعيل الالتقاط.\n\n" +
      "1) افتح http://localhost:5173 (مع npm run dev)\n" +
      "2) انتقل لقائمة الملفات داخل مدد\n" +
      "3) سيُرسل الاعتماد تلقائياً خلال 30 ثانية"
  );

  const deadline = Date.now() + 30000;
  const poll = setInterval(() => {
    scan();
    if (state.headers?.bearer_token) {
      clearInterval(poll);
      sendToPanel()
        .then(() => alert("تم إرسال الجلسة للوحة ✓\nافتح http://localhost:5173"))
        .catch(onSendError);
    } else if (Date.now() > deadline) {
      clearInterval(poll);
      alert(
        "لم تُلتقط الجلسة.\n\n" +
          "ثبّت إضافة Chrome من مجلد extension/\n" +
          "أو انسخ طلباً من DevTools → Network"
      );
    }
  }, 400);
}
