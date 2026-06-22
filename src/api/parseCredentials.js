const DEFAULT_FILES_PATH =
  "/compliance/resources/v1/establishment/mlsd-unified-id/submitted-files";
const DEFAULT_UPLOAD_PATH = "/compliance/v1/upload-wage-file";

const HEADER_ALIASES = {
  bearer_token: "bearerToken",
  bearertoken: "bearerToken",
  authorization: "bearerToken",
  "x-apikey": "apiKey",
  x_apikey: "apiKey",
  apikey: "apiKey",
  organizationid: "orgId",
  organization_id: "orgId",
  orgid: "orgId",
  session_id: "sessionId",
  sessionid: "sessionId",
  systemtype: "systemType",
  system_type: "systemType",
};

function normalizeHeaderName(name) {
  return String(name).trim().toLowerCase().replace(/-/g, "_");
}

function setHeader(headers, name, value) {
  const key = HEADER_ALIASES[normalizeHeaderName(name)];
  if (!key || !value) return;
  if (key === "bearerToken" && /^bearer\s+/i.test(value)) {
    headers[key] = value.replace(/^bearer\s+/i, "").trim();
  } else {
    headers[key] = String(value).trim();
  }
}

function collectHeaders(text) {
  const headers = {};

  const trimmed = text.trim();
  if (trimmed.startsWith("{")) {
    try {
      const json = JSON.parse(trimmed);
      const source = json.headers && typeof json.headers === "object" ? json.headers : json;
      for (const [k, v] of Object.entries(source)) {
        if (typeof v === "string" || typeof v === "number") setHeader(headers, k, v);
      }
    } catch {
      /* ليس JSON صالح */
    }
  }

  for (const m of text.matchAll(/-H\s+['"]([^'"]+)['"]/gi)) {
    const idx = m[1].indexOf(":");
    if (idx > 0) setHeader(headers, m[1].slice(0, idx), m[1].slice(idx + 1));
  }

  for (const m of text.matchAll(/['"]?(bearer_token|x-apikey|organizationid|session_id|systemtype)['"]?\s*:\s*['"]?([^\s'"]+)['"]?/gi)) {
    setHeader(headers, m[1], m[2]);
  }

  for (const line of text.split(/\r?\n/)) {
    const cleaned = line.trim().replace(/^[-•*]\s*/, "");
    const colon = cleaned.match(/^(Bearer_token|bearer_token|X-Apikey|x-apikey|Organizationid|organizationid|Session_id|session_id|Systemtype|systemtype)\s*:\s*(.+)$/i);
    if (colon) {
      setHeader(headers, colon[1], colon[2].replace(/^['"]|['"]$/g, ""));
      continue;
    }
    const generic = cleaned.match(/^([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(.+)$/);
    if (generic) {
      setHeader(headers, generic[1], generic[2].trim());
      continue;
    }
    const env = cleaned.match(/^MUDAD_([A-Z_]+)\s*=\s*(.*)$/);
    if (env) {
      const map = {
        BEARER_TOKEN: "bearerToken",
        API_KEY: "apiKey",
        ORG_ID: "orgId",
        SESSION_ID: "sessionId",
        SYSTEM_TYPE: "systemType",
        FILES_PATH: "filesPath",
        UPLOAD_PATH: "uploadPath",
        FILE_DETAIL_PATH: "detailPath",
        BASE_URL: "baseUrl",
      };
      const field = map[env[1]];
      if (field) headers[field] = env[2].replace(/^['"]|['"]$/g, "");
    }
  }

  return headers;
}

function extractUrlInfo(text) {
  const urls = [
    ...text.matchAll(/curl\s+(?:-X\s+\w+\s+)?['"]?(https?:\/\/[^\s'"]+)['"]?/gi),
    ...text.matchAll(/fetch\s*\(\s*['"](https?:\/\/[^'"]+)['"]/gi),
    ...text.matchAll(/(https:\/\/api\.mudad\.sa\/[^\s'")\]]+)/gi),
    ...text.matchAll(/(https:\/\/mudad\.com\.sa[^\s'")\]]+)/gi),
  ].map((m) => m[1]);

  const httpLine = text.match(/^(?:GET|POST|PUT|DELETE|PATCH)\s+(\/\S+)\s+HTTP/im);
  const httpMethod = text.match(/^(POST|GET|PUT|DELETE|PATCH)\s+\/\S+\s+HTTP/im)?.[1]?.toUpperCase();

  const method =
    text.match(/-X\s+(POST|GET|PUT|DELETE|PATCH)/i)?.[1]?.toUpperCase() ||
    httpMethod ||
    (/\bPOST\b/i.test(text) && /upload/i.test(text) ? "POST" : "GET");

  const unique = [...new Set(urls)];
  const mudadApiUrl = unique.find((u) => u.includes("api.mudad.sa"));
  const mudadWebUrl = unique.find((u) => u.includes("mudad.com.sa"));

  let pathOnly = "";
  if (httpLine) pathOnly = httpLine[1].split("?")[0];
  else if (mudadApiUrl) {
    try { pathOnly = new URL(mudadApiUrl).pathname; } catch { /* */ }
  }

  const info = { baseUrl: "https://api.mudad.sa" };

  if (pathOnly) {
    if (method === "POST" && /upload/i.test(pathOnly)) info.uploadPath = pathOnly;
    else if (/submitted-files/i.test(pathOnly)) info.filesPath = pathOnly;
    else if (/wps-bank-integrated-services/i.test(pathOnly)) info.uploadCheckPath = pathOnly;
    else if (/\{id\}|\/\d+$/.test(pathOnly)) info.detailPath = pathOnly.replace(/\/[^/]+$/, "/{id}");
    else if (method === "POST") info.uploadPath = pathOnly;
    return info;
  }

  if (mudadWebUrl && /wage-settlement-report/i.test(mudadWebUrl + text)) {
    info.filesPath = DEFAULT_FILES_PATH;
  }

  return info;
}

function extractFormFields(text) {
  const fields = {};
  for (const m of text.matchAll(/name="(month|year|fileType|mlsdUnifiedId|wageFrequencyCode)"\s*\r?\n\r?\n([^\r\n-]+)/gi)) {
    fields[m[1]] = m[2].trim();
  }
  return fields;
}

export function parseCredentialsPaste(text) {
  const headers = collectHeaders(text);
  const urlInfo = extractUrlInfo(text);
  const formFields = extractFormFields(text);

  const orgId = headers.orgId || "";
  const mlsdFromOrg = orgId ? `${orgId.split("-")[0]}-${orgId.split("-")[1]}` : "";

  const extracted = {
    bearerToken: headers.bearerToken || "",
    apiKey: headers.apiKey || "",
    orgId,
    sessionId: headers.sessionId || "",
    systemType: headers.systemType || "",
    filesPath: headers.filesPath || urlInfo.filesPath || DEFAULT_FILES_PATH,
    uploadPath: headers.uploadPath || urlInfo.uploadPath || DEFAULT_UPLOAD_PATH,
    uploadCheckPath:
      headers.uploadCheckPath ||
      urlInfo.uploadCheckPath ||
      "/compliance/resources/v1/wps-bank-integrated-services",
    detailPath: headers.detailPath || urlInfo.detailPath || "",
    baseUrl: headers.baseUrl || urlInfo.baseUrl || "",
    mlsdUnifiedId: formFields.mlsdUnifiedId || mlsdFromOrg || "",
    fileType: formFields.fileType || "1000",
    wageFrequencyCode: formFields.wageFrequencyCode || "1001",
  };

  const found = [];
  const labels = {
    bearerToken: "bearer_token",
    apiKey: "x-apikey",
    orgId: "organizationid",
    sessionId: "session_id",
    systemType: "systemtype",
    filesPath: "مسار الملفات",
    uploadPath: "مسار الرفع",
    uploadCheckPath: "فحص توفر الرفع",
    detailPath: "مسار التفاصيل",
    baseUrl: "الرابط الأساسي",
  };

  for (const [key, label] of Object.entries(labels)) {
    if (extracted[key]) found.push(label);
  }

  const required = ["bearerToken", "apiKey", "orgId"];
  const missing = required.filter((k) => !extracted[k]).map((k) => labels[k]);

  return {
    extracted,
    found,
    missing,
    ready: missing.length === 0,
  };
}

export function maskValue(value, visible = 6) {
  if (!value) return "—";
  if (value.length <= visible * 2) return "••••••";
  return `${value.slice(0, visible)}…${value.slice(-4)}`;
}
