// نقطة الدخول للاستضافة التي تتوقع server.js في الجذر
import("./server/index.js").catch((err) => {
  console.error("فشل تحميل الخادم:", err);
  process.exit(1);
});
