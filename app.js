// نقطة الدخول الافتراضية على Hostinger (main + start)
console.log("[mudad] بدء التشغيل...", { node: process.version, port: process.env.PORT });

import("./server/index.js").catch((err) => {
  console.error("[mudad] فشل التشغيل:", err);
  process.exit(1);
});
