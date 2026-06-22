import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const STAGING = path.join(ROOT, ".deploy-staging");
const ZIP = path.join(ROOT, "mudad-deploy.zip");

const DEPLOY_README = `لوحة مدد — حزمة النشر
========================

هذه الحزمة جاهزة للرفع على استضافة تدعم Node.js (cPanel → Node.js، Render، Railway، إلخ).
لا ترفع مجلد src/ أو index.html مباشرة — ذلك يسبب خطأ MIME ولا يعمل.

خطوات الرفع (بدون أوامر على الاستضافة):
1) ارفع mudad-deploy.zip عبر مدير الملفات (FTP / cPanel File Manager).
2) فك الضغط داخل مجلد التطبيق (مثلاً public_html/mudad).
3) من لوحة Node.js في الاستضافة:
   - مسار التطبيق: نفس المجلد بعد فك الضغط
   - ملف التشغيل: server/index.js
   - وضع التطبيق: Production
4) أضف متغيرات البيئة من .env.example (أو أنشئ ملف .env عبر مدير الملفات).
5) شغّل/أعد تشغيل التطبيق من اللوحة.

التحقق: افتح موقعك ثم /api/health — يجب أن ترى {"ok":true,...}

ملاحظة: الاستضافة الثابتة فقط (HTML بدون Node) لا تكفي لهذا المشروع.
`;

function rm(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

function main() {
  console.log("بناء الواجهة...");
  execSync("npm run build", { cwd: ROOT, stdio: "inherit" });

  console.log("\nتجهيز حزمة النشر...");
  rm(STAGING);
  fs.mkdirSync(STAGING, { recursive: true });

  copyDir(path.join(ROOT, "dist"), path.join(STAGING, "dist"));
  copyDir(path.join(ROOT, "server"), path.join(STAGING, "server"));
  fs.copyFileSync(path.join(ROOT, "package.json"), path.join(STAGING, "package.json"));
  fs.copyFileSync(path.join(ROOT, "package-lock.json"), path.join(STAGING, "package-lock.json"));
  if (fs.existsSync(path.join(ROOT, ".env.example"))) {
    fs.copyFileSync(path.join(ROOT, ".env.example"), path.join(STAGING, ".env.example"));
  }
  fs.writeFileSync(path.join(STAGING, "DEPLOY.txt"), DEPLOY_README, "utf8");

  console.log("تثبيت حزم الإنتاج فقط (بدون Vite)...");
  execSync("npm ci --omit=dev", { cwd: STAGING, stdio: "inherit" });

  rm(ZIP);
  if (process.platform === "win32") {
    execSync(
      `powershell -NoProfile -Command "Compress-Archive -Path '${STAGING}\\*' -DestinationPath '${ZIP}' -Force"`,
      { stdio: "inherit" }
    );
  } else {
    execSync(`cd "${STAGING}" && zip -r "${ZIP}" .`, { stdio: "inherit" });
  }

  rm(STAGING);
  const sizeMb = (fs.statSync(ZIP).size / (1024 * 1024)).toFixed(1);
  console.log(`\n✓ جاهز: ${ZIP} (${sizeMb} MB)`);
  console.log("ارفع هذا الملف إلى الاستضافة واتبع DEPLOY.txt داخل الأرشيف.\n");
}

main();
