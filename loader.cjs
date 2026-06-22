// Hostinger/hPanel — تشغيل تطبيق ES Module
console.log("[mudad] بدء التشغيل...", { node: process.version, port: process.env.PORT });

async function loadApp() {
  await import("./server.js");
}

loadApp().catch((err) => {
  console.error("[mudad] فشل التشغيل:", err);
  process.exit(1);
});
