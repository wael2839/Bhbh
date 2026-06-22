import { exec } from "child_process";
import { isViteHealthy } from "./health.mjs";

const URL = "http://127.0.0.1:5173";
let opened = false;

async function tryOpen() {
  if (opened) return;
  if (!(await isViteHealthy())) return;
  opened = true;
  const cmd = process.platform === "win32" ? `start "" "${URL}"` : `open "${URL}"`;
  exec(cmd);
  console.log(`\n🌐 فُتح المتصفح: ${URL}\n`);
}

export function watchAndOpenBrowser() {
  const id = setInterval(tryOpen, 1000);
  setTimeout(() => clearInterval(id), 120000);
  tryOpen();
}

if (process.argv[1]?.includes("open-browser")) {
  watchAndOpenBrowser();
}
