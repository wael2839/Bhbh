/* global mudadAuthHeaders */
const MUDAD_AUTH_CANONICAL = {
  bearer_token: "bearer_token",
  x_apikey: "x-apikey",
  organizationid: "organizationid",
  session_id: "session_id",
  systemtype: "systemtype",
};

function mudadNormalizeHeader(name) {
  return String(name || "").toLowerCase().replace(/-/g, "_");
}

function mudadResolveAuthHeader(name) {
  return MUDAD_AUTH_CANONICAL[mudadNormalizeHeader(name)] || null;
}

function mudadCleanAuthValue(key, value) {
  let v = String(value || "").trim();
  if (key === "bearer_token" && /^bearer\s+/i.test(v)) {
    v = v.replace(/^bearer\s+/i, "");
  }
  return v;
}

function toHeaderList(input) {
  if (!input) return [];
  if (Array.isArray(input)) return input;
  return Object.entries(input).map(([name, value]) => ({ name, value }));
}

/** @param {Array|Object} headerList */
function mudadIngestHeaderList(headerList, into) {
  const headers = into || {};
  let changed = false;
  for (const h of toHeaderList(headerList)) {
    const key = mudadResolveAuthHeader(h.name);
    if (!key || h.value == null || h.value === "") continue;
    const value = mudadCleanAuthValue(key, h.value);
    if (headers[key] !== value) {
      headers[key] = value;
      changed = true;
    }
  }
  return { headers, changed };
}

function mudadParseRawHttp(text) {
  const headers = {};
  const lines = String(text || "").split(/\r?\n/);
  let method = "GET";
  let path = "";

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const req = trimmed.match(/^(GET|POST|PUT|DELETE|PATCH)\s+(\S+)\s+HTTP/i);
    if (req) {
      method = req[1].toUpperCase();
      path = req[2].split("?")[0];
      continue;
    }
    const hv = trimmed.match(/^([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(.*)$/);
    if (!hv) continue;
    const key = mudadResolveAuthHeader(hv[1]);
    if (!key) continue;
    headers[key] = mudadCleanAuthValue(key, hv[2]);
  }

  const capture = {
    headers,
    filesPath: "/compliance/resources/v1/establishment/mlsd-unified-id/submitted-files",
    uploadPath: "/compliance/v1/upload-wage-file",
    uploadCheckPath: "/compliance/resources/v1/wps-bank-integrated-services",
    updatedAt: new Date().toISOString(),
  };

  if (path.includes("submitted-files")) capture.filesPath = path;
  if (path.includes("upload-wage-file")) capture.uploadPath = path;
  if (path.includes("wps-bank-integrated-services")) capture.uploadCheckPath = path;

  return { capture, method, path };
}

const mudadAuthHeaders = {
  mudadNormalizeHeader,
  mudadResolveAuthHeader,
  mudadCleanAuthValue,
  mudadIngestHeaderList,
  mudadParseRawHttp,
};

if (typeof globalThis !== "undefined") {
  globalThis.mudadAuthHeaders = mudadAuthHeaders;
}
