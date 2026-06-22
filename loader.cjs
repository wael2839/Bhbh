// Hostinger/hPanel — تشغيل تطبيق ES Module عندما لا يدعم اللوحة import مباشرة
async function loadApp() {
  await import("./server.js");
}

loadApp().catch((err) => {
  console.error("فشل تشغيل التطبيق:", err);
  process.exit(1);
});
