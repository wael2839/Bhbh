import { execSync, spawn } from "child_process";
import { fileURLToPath } from "url";
import path from "path";
import { isDevRunning } from "./health.mjs";
import { watchAndOpenBrowser } from "./open-browser.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORTS = [3001, 5173, 5174, 5175, 5176];

function killPort(port) {
  try {
    const out = execSync(`netstat -ano | findstr :${port}`, { encoding: "utf8" });
    const pids = new Set();
    for (const line of out.split(/\r?\n/)) {
      const m = line.match(/LISTENING\s+(\d+)/);
      if (m) pids.add(m[1]);
    }
    for (const pid of pids) {
      try {
        execSync(`taskkill /F /PID ${pid}`, { stdio: "ignore" });
        console.log(`  أوقفت العملية ${pid} على المنفذ ${port}`);
      } catch { /* */ }
    }
  } catch { /* المنفذ فارغ */ }
}

function killAllDevPorts() {
  console.log("تنظيف المنافذ القديمة...");
  for (const p of PORTS) killPort(p);
}

async function main() {
  if (await isDevRunning()) {
    console.log("✓ الخادم يعمل — فتح المتصفح...");
    watchAndOpenBrowser();
    return;
  }

  killAllDevPorts();

  console.log("تشغيل الخادم والواجهة...\n");
  watchAndOpenBrowser();

  const child = spawn("npm run dev:quick", {
    cwd: ROOT,
    stdio: "inherit",
    shell: true,
  });

  child.on("exit", (code) => process.exit(code ?? 0));
}

main();
