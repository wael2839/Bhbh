/**
 * نقطة دخول CommonJS — Hostinger يفضّلها على ES Modules.
 * Entry file في hPanel: app.cjs
 */
const PORT = process.env.PORT || 3001;

console.log("[mudad] app.cjs بدء...", { node: process.version, port: PORT });

import("./server/index.js").catch((err) => {
  console.error("[mudad] فشل تحميل server/index.js:", err);

  // خادم بسيط للتشخيص — على الأقل /api/health يعمل لمعرفة الخطأ
  const http = require("http");
  http
    .createServer((req, res) => {
      if (req.url === "/api/health" || req.url?.startsWith("/api/health?")) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, mode: "fallback", bootError: String(err.message) }));
        return;
      }
      res.writeHead(503, { "Content-Type": "text/html; charset=utf-8" });
      res.end(
        `<h1>فشل تشغيل الخادم</h1><pre>${String(err.stack || err.message)}</pre>` +
        `<p>راجع stderr.log في File Manager</p>`
      );
    })
    .listen(PORT, "0.0.0.0", () => console.log("[mudad] وضع fallback على المنفذ", PORT));
});
