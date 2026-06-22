import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENV_PATH = path.join(ROOT, ".env");
const EXAMPLE_PATH = path.join(ROOT, ".env.example");

const ENV_KEYS = [
  "MUDAD_BASE_URL",
  "MUDAD_BEARER_TOKEN",
  "MUDAD_API_KEY",
  "MUDAD_ORG_ID",
  "MUDAD_SESSION_ID",
  "MUDAD_SYSTEM_TYPE",
  "MUDAD_FILES_PATH",
  "MUDAD_FILE_DETAIL_PATH",
  "MUDAD_UPLOAD_PATH",
  "MUDAD_UPLOAD_CHECK_PATH",
  "MUDAD_MLSD_UNIFIED_ID",
  "MUDAD_FILE_TYPE",
  "MUDAD_WAGE_FREQUENCY",
  "PORT",
];

export function loadEnvFile() {
  if (fs.existsSync(ENV_PATH)) return fs.readFileSync(ENV_PATH, "utf8");
  if (fs.existsSync(EXAMPLE_PATH)) return fs.readFileSync(EXAMPLE_PATH, "utf8");
  return ENV_KEYS.map((k) => `${k}=\n`).join("");
}

export function applyToProcessEnv(updates) {
  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined && value !== null && value !== "") {
      process.env[key] = String(value);
    }
  }
}

export function saveCredentials({
  bearerToken,
  apiKey,
  orgId,
  sessionId,
  systemType,
  filesPath,
  uploadPath,
  detailPath,
  baseUrl,
  mlsdUnifiedId,
  fileType,
  wageFrequencyCode,
  uploadCheckPath,
}) {
  const derivedMlsd = mlsdUnifiedId || (orgId ? `${orgId.split("-")[0]}-${orgId.split("-")[1]}` : "");

  const updates = {
    MUDAD_BEARER_TOKEN: bearerToken,
    MUDAD_API_KEY: apiKey,
    MUDAD_ORG_ID: orgId,
    MUDAD_SESSION_ID: sessionId,
    MUDAD_SYSTEM_TYPE: systemType || "MUDAD_COMPLIANCE_APP",
    MUDAD_FILES_PATH: filesPath || "/compliance/resources/v1/establishment/mlsd-unified-id/submitted-files",
    MUDAD_UPLOAD_PATH: uploadPath || "/compliance/v1/upload-wage-file",
    MUDAD_UPLOAD_CHECK_PATH:
      uploadCheckPath || "/compliance/resources/v1/wps-bank-integrated-services",
    MUDAD_FILE_DETAIL_PATH: detailPath || "",
    MUDAD_BASE_URL: baseUrl || "https://api.mudad.sa",
    MUDAD_MLSD_UNIFIED_ID: derivedMlsd,
    MUDAD_FILE_TYPE: fileType || "1000",
    MUDAD_WAGE_FREQUENCY: wageFrequencyCode || "1001",
  };

  let content = loadEnvFile();

  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined || value === null || value === "") continue;
    const safe = String(value).replace(/\r?\n/g, "");
    const regex = new RegExp(`^${key}=.*$`, "m");
    const line = `${key}=${safe}`;
    content = regex.test(content) ? content.replace(regex, line) : `${content.trimEnd()}\n${line}\n`;
  }

  fs.writeFileSync(ENV_PATH, content.endsWith("\n") ? content : `${content}\n`, "utf8");
  applyToProcessEnv(updates);

  return updates;
}
