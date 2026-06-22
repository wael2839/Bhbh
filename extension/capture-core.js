/* eslint-disable */
function installMudadCapture() {
  if (window.__mudadCaptureInstalled) {
    window.__mudadCaptureScanStorage?.();
    return window.__mudadCaptureState;
  }
  window.__mudadCaptureInstalled = true;

  const AUTH_KEYS = new Set([
    "bearer_token",
    "x-apikey",
    "organizationid",
    "session_id",
    "systemtype",
  ]);

  const FIELD_MAP = {
    bearer_token: ["bearer_token", "bearertoken", "bearer", "access_token", "accesstoken", "token", "id_token", "idtoken", "jwt"],
    x_apikey: ["x-apikey", "x_apikey", "apikey", "api_key", "xapikey"],
    organizationid: ["organizationid", "organization_id", "orgid", "org_id", "establishmentid"],
    session_id: ["session_id", "sessionid", "session"],
    systemtype: ["systemtype", "system_type"],
  };

  const state = {
    headers: {},
    filesPath: "",
    uploadPath: "",
    uploadCheckPath: "",
    lastUrl: "",
    updatedAt: null,
  };
  window.__mudadCaptureState = state;

  function save() {
    state.updatedAt = new Date().toISOString();
    try {
      sessionStorage.setItem("__mudad_capture_v1", JSON.stringify(state));
    } catch { /* */ }
    try {
      window.postMessage({ source: "mudad-capture", type: "UPDATE", payload: state }, "*");
    } catch { /* */ }
  }

  function ingestHeader(name, value) {
    const key = String(name).toLowerCase().replace(/-/g, "_");
    if (key === "authorization" && value) {
      ingestHeader("bearer_token", String(value).replace(/^bearer\s+/i, ""));
      return;
    }
    if (!AUTH_KEYS.has(key) || value == null || value === "") return;
    state.headers[key] = String(value).trim();
    save();
  }

  function ingestFromHeaders(headers) {
    if (!headers) return;
    if (headers instanceof Headers) {
      headers.forEach((v, k) => ingestHeader(k, v));
      return;
    }
    if (Array.isArray(headers)) {
      headers.forEach((pair) => {
        if (Array.isArray(pair)) ingestHeader(pair[0], pair[1]);
      });
      return;
    }
    if (typeof headers === "object") {
      Object.entries(headers).forEach(([k, v]) => ingestHeader(k, v));
    }
  }

  function isMudadApi(url) {
    const s = String(url || "");
    return (
      s.includes("api.mudad.sa") ||
      s.includes("mudad.sa/compliance") ||
      /\/compliance[-/]/.test(s)
    );
  }

  function noteUrl(method, url) {
    if (!isMudadApi(url)) return;
    try {
      const u = new URL(url, location.origin);
      state.lastUrl = u.toString();
      const p = u.pathname;
      if (method === "GET" && p.includes("submitted-files")) state.filesPath = p;
      if (method === "POST" && p.includes("upload-wage-file")) state.uploadPath = p;
      if (method === "GET" && p.includes("wps-bank-integrated-services")) state.uploadCheckPath = p;
      save();
    } catch { /* */ }
  }

  function mapFieldKey(key) {
    const k = String(key).toLowerCase().replace(/-/g, "_");
    for (const [target, aliases] of Object.entries(FIELD_MAP)) {
      if (aliases.includes(k)) return target;
    }
    return null;
  }

  function ingestFromObject(obj, depth = 0) {
    if (!obj || depth > 8) return;
    if (typeof obj === "string") {
      if (obj.length > 20 && obj.length < 8000 && /^eyJ[A-Za-z0-9_-]+\./.test(obj)) {
        ingestHeader("bearer_token", obj);
      }
      return;
    }
    if (typeof obj !== "object") return;
    if (Array.isArray(obj)) {
      obj.forEach((item) => ingestFromObject(item, depth + 1));
      return;
    }
    for (const [k, v] of Object.entries(obj)) {
      const mapped = mapFieldKey(k);
      if (mapped && (typeof v === "string" || typeof v === "number")) {
        ingestHeader(mapped, v);
        continue;
      }
      if (v && typeof v === "object") ingestFromObject(v, depth + 1);
      else if (typeof v === "string" && mapped) ingestHeader(mapped, v);
    }
  }

  function scanStorage() {
    try {
      const raw = sessionStorage.getItem("__mudad_capture_v1");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.headers) Object.assign(state.headers, parsed.headers);
        if (parsed?.filesPath) state.filesPath = parsed.filesPath;
        if (parsed?.uploadPath) state.uploadPath = parsed.uploadPath;
      }
    } catch { /* */ }

    const stores = [localStorage, sessionStorage];
    for (const store of stores) {
      try {
        for (let i = 0; i < store.length; i++) {
          const k = store.key(i);
          const v = store.getItem(k);
          if (!v) continue;
          try {
            ingestFromObject(JSON.parse(v));
          } catch {
            const mapped = mapFieldKey(k);
            if (mapped) ingestHeader(mapped, v);
            else if (/bearer|token|session|apikey|organization/i.test(k) && v.length < 2000) {
              if (/bearer|token/i.test(k)) ingestHeader("bearer_token", v.replace(/^Bearer\s+/i, ""));
              if (/apikey|api_key/i.test(k)) ingestHeader("x-apikey", v);
              if (/organization/i.test(k)) ingestHeader("organizationid", v);
              if (/session/i.test(k)) ingestHeader("session_id", v);
            }
          }
        }
      } catch { /* */ }
    }
    save();
    return state;
  }

  window.__mudadCaptureScanStorage = scanStorage;

  const origFetch = window.fetch;
  window.fetch = function mudadFetch(input, init) {
    let url = typeof input === "string" ? input : input?.url;
    let method = (init?.method || "GET").toUpperCase();
    if (typeof Request !== "undefined" && input instanceof Request) {
      method = (input.method || method).toUpperCase();
      ingestFromHeaders(input.headers);
    }
    noteUrl(method, url);
    ingestFromHeaders(init?.headers);
    return origFetch.apply(this, arguments);
  };

  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__mudadMethod = method;
    this.__mudadUrl = url;
    this.__mudadHeaders = {};
    return origOpen.apply(this, arguments);
  };

  const origSet = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
    this.__mudadHeaders = this.__mudadHeaders || {};
    this.__mudadHeaders[String(name).toLowerCase()] = value;
    return origSet.apply(this, arguments);
  };

  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function () {
    noteUrl((this.__mudadMethod || "GET").toUpperCase(), this.__mudadUrl);
    ingestFromHeaders(this.__mudadHeaders);
    return origSend.apply(this, arguments);
  };

  scanStorage();
  return state;
}

if (typeof window !== "undefined") installMudadCapture();
