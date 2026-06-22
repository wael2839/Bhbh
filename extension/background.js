importScripts("auth-headers.js");

const PROXY = "http://localhost:3001";
const DEFAULT_FILES =
  "/compliance/resources/v1/establishment/mlsd-unified-id/submitted-files";
const DEFAULT_UPLOAD = "/compliance/v1/upload-wage-file";
const DEFAULT_CHECK = "/compliance/resources/v1/wps-bank-integrated-services";

const MUDAD_URLS = [
  "https://api.mudad.sa/*",
  "https://*.mudad.sa/*",
];

const MUDAD_TAB_PATTERNS = [
  "https://mudad.com.sa/*",
  "https://*.mudad.com.sa/*",
];

let captureState = {
  headers: {},
  filesPath: DEFAULT_FILES,
  uploadPath: DEFAULT_UPLOAD,
  uploadCheckPath: DEFAULT_CHECK,
  updatedAt: null,
};

let lastSentKey = "";
let pendingCapture = null;
let retryTimer = null;
const debuggedTabs = new Set();

function toCredentials(cap) {
  const h = cap?.headers || {};
  return {
    bearerToken: h.bearer_token || "",
    apiKey: h["x-apikey"] || "",
    orgId: h.organizationid || "",
    sessionId: h.session_id || "",
    systemType: h.systemtype || "MUDAD_COMPLIANCE_APP",
    filesPath: cap?.filesPath || DEFAULT_FILES,
    uploadPath: cap?.uploadPath || DEFAULT_UPLOAD,
    uploadCheckPath: cap?.uploadCheckPath || DEFAULT_CHECK,
  };
}

function credsKey(creds) {
  return `${creds.bearerToken}|${creds.sessionId}|${creds.orgId}`;
}

function isComplete(creds) {
  return Boolean(creds.bearerToken && creds.apiKey && creds.orgId);
}

function setBadge(ok, text) {
  chrome.action.setBadgeText({ text: text || (ok ? "✓" : "…") });
  chrome.action.setBadgeBackgroundColor({ color: ok ? "#16a34a" : "#dc2626" });
}

function isMudadApiUrl(url) {
  const s = String(url || "");
  return s.includes("api.mudad.sa") || /\/compliance\//i.test(s);
}

function isMudadTabUrl(url) {
  return String(url || "").includes("mudad.com.sa");
}

function notePaths(method, url) {
  if (!isMudadApiUrl(url)) return false;
  let changed = false;
  try {
    const p = new URL(url).pathname;
    if (method === "GET" && p.includes("submitted-files") && captureState.filesPath !== p) {
      captureState.filesPath = p;
      changed = true;
    }
    if (method === "POST" && p.includes("upload-wage-file") && captureState.uploadPath !== p) {
      captureState.uploadPath = p;
      changed = true;
    }
    if (method === "GET" && p.includes("wps-bank-integrated-services") && captureState.uploadCheckPath !== p) {
      captureState.uploadCheckPath = p;
      changed = true;
    }
  } catch { /* */ }
  return changed;
}

function ingestHeaders(headerList) {
  const { headers, changed } = mudadAuthHeaders.mudadIngestHeaderList(
    headerList,
    captureState.headers
  );
  captureState.headers = headers;
  return changed;
}

function saveDebug(meta) {
  chrome.storage.local.set({
    lastCaptureDebug: { ...meta, at: new Date().toISOString() },
  });
}

function publishCapture(source, meta = {}) {
  captureState.updatedAt = new Date().toISOString();
  const snapshot = { ...captureState, headers: { ...captureState.headers } };
  chrome.storage.local.set({ mudadCapture: snapshot });
  saveDebug({ source, ...meta, hasToken: Boolean(snapshot.headers.bearer_token) });
  tryAutoSend(snapshot);
  return snapshot;
}

function ingestNetworkRequest(url, method, headersInput, source) {
  if (!isMudadApiUrl(url)) return false;

  const headersChanged = ingestHeaders(headersInput);
  const pathsChanged = notePaths(method, url);
  const interesting = /upload-wage-file|submitted-files|wps-bank/i.test(url);

  saveDebug({
    source,
    url: url.slice(0, 120),
    method,
    headerNames: Object.keys(
      Array.isArray(headersInput)
        ? Object.fromEntries(headersInput.map((h) => [h.name, 1]))
        : headersInput || {}
    ),
    captured: Boolean(captureState.headers.bearer_token),
  });

  if (headersChanged || pathsChanged || interesting) {
    publishCapture(source, { url, method });
    return true;
  }
  return false;
}

function ingestFromWebRequest(details) {
  ingestNetworkRequest(details.url, details.method, details.requestHeaders, "webRequest");
}

function mergePageCapture(payload) {
  if (!payload?.headers) return;
  const list = Object.entries(payload.headers).map(([name, value]) => ({ name, value }));
  const headersChanged = ingestHeaders(list);
  let pathsChanged = false;
  if (payload.filesPath && captureState.filesPath !== payload.filesPath) {
    captureState.filesPath = payload.filesPath;
    pathsChanged = true;
  }
  if (payload.uploadPath && captureState.uploadPath !== payload.uploadPath) {
    captureState.uploadPath = payload.uploadPath;
    pathsChanged = true;
  }
  if (headersChanged || pathsChanged) publishCapture("page");
}

function ingestRawHttp(text) {
  const { capture } = mudadAuthHeaders.mudadParseRawHttp(text);
  captureState = { ...captureState, ...capture, headers: { ...capture.headers } };
  return publishCapture("rawHttp");
}

async function sendCredentials(creds) {
  const res = await fetch(`${PROXY}/api/mudad/credentials`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(creds),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}

async function ensureDashboardOpen() {
  const tabs = await chrome.tabs.query({
    url: ["http://localhost:5173/*", "http://localhost:5174/*", "http://localhost:5175/*"],
  });
  if (tabs.length) return;
  await chrome.tabs.create({ url: "http://localhost:5173", active: false });
}

async function tryAutoSend(cap) {
  if (!cap?.headers) return { ok: false, reason: "empty" };
  const creds = toCredentials(cap);
  if (!isComplete(creds)) return { ok: false, reason: "incomplete" };

  const key = credsKey(creds);
  if (key === lastSentKey) return { ok: true, reason: "unchanged" };

  try {
    await sendCredentials(creds);
    lastSentKey = key;
    pendingCapture = null;
    if (retryTimer) {
      clearInterval(retryTimer);
      retryTimer = null;
    }
    setBadge(true);
    await chrome.storage.local.set({ lastSendStatus: "sent", lastSendAt: Date.now() });
    await ensureDashboardOpen();
    return { ok: true, reason: "sent" };
  } catch (err) {
    pendingCapture = cap;
    scheduleRetry();
    setBadge(false, "!");
    await chrome.storage.local.set({ lastSendStatus: err.message, lastSendAt: Date.now() });
    return { ok: false, reason: err.message };
  }
}

function scheduleRetry() {
  if (retryTimer) return;
  retryTimer = setInterval(async () => {
    if (!pendingCapture) {
      clearInterval(retryTimer);
      retryTimer = null;
      return;
    }
    try {
      const health = await fetch(`${PROXY}/api/health`, { signal: AbortSignal.timeout(2000) });
      if (!health.ok) return;
      const result = await tryAutoSend(pendingCapture);
      if (result.ok && result.reason === "sent") {
        clearInterval(retryTimer);
        retryTimer = null;
      }
    } catch { /* */ }
  }, 2500);
}

async function syncFromTab(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      world: "MAIN",
      files: ["capture-core.js", "inject.js"],
    });
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: () => {
        if (typeof installMudadCapture === "function") installMudadCapture();
        if (typeof window.__mudadCaptureScanStorage === "function") {
          window.__mudadCaptureScanStorage();
        }
        try {
          const raw = sessionStorage.getItem("__mudad_capture_v1");
          return raw ? JSON.parse(raw) : window.__mudadCaptureState || null;
        } catch {
          return window.__mudadCaptureState || null;
        }
      },
    });
    if (result) mergePageCapture(result);
    return tryAutoSend(captureState);
  } catch { /* */ }
  return { ok: false, reason: "tab_sync_failed" };
}

function attachDebugger(tabId) {
  if (!tabId || debuggedTabs.has(tabId)) return;
  chrome.debugger.attach({ tabId }, "1.3", () => {
    if (chrome.runtime.lastError) return;
    debuggedTabs.add(tabId);
    chrome.debugger.sendCommand({ tabId }, "Network.enable", {}, () => {
      saveDebug({ source: "debugger", attached: tabId });
    });
  });
}

function detachDebugger(tabId) {
  if (!tabId || !debuggedTabs.has(tabId)) return;
  chrome.debugger.detach({ tabId }, () => {
    debuggedTabs.delete(tabId);
  });
}

function attachAllMudadTabs() {
  chrome.tabs.query({ url: MUDAD_TAB_PATTERNS }, (tabs) => {
    for (const tab of tabs || []) {
      if (tab.id) attachDebugger(tab.id);
    }
  });
}

function registerWebRequestCapture() {
  const filter = { urls: MUDAD_URLS };
  const specs = ["requestHeaders", "extraHeaders"];
  const handler = ingestFromWebRequest;
  try {
    chrome.webRequest.onBeforeSendHeaders.addListener(handler, filter, specs);
  } catch {
    chrome.webRequest.onBeforeSendHeaders.addListener(handler, filter, ["requestHeaders"]);
  }
}

registerWebRequestCapture();

chrome.debugger.onEvent.addListener((source, method, params) => {
  if (method !== "Network.requestWillBeSent") return;
  const req = params.request || {};
  ingestNetworkRequest(req.url, req.method || "GET", req.headers || {}, "debugger");
});

chrome.debugger.onDetach.addListener((source) => {
  if (source.tabId) debuggedTabs.delete(source.tabId);
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "CAPTURE_UPDATE") {
    mergePageCapture(msg.payload);
    tryAutoSend(captureState).then(sendResponse);
    return true;
  }
  if (msg.type === "RAW_HTTP_CAPTURE") {
    try {
      const cap = ingestRawHttp(msg.text || "");
      tryAutoSend(cap).then(sendResponse);
    } catch (e) {
      sendResponse({ ok: false, reason: e.message });
    }
    return true;
  }
  if (msg.type === "FORCE_SYNC") {
    chrome.tabs.query({ active: true, currentWindow: true }, async ([tab]) => {
      if (tab?.id && isMudadTabUrl(tab.url)) attachDebugger(tab.id);
      if (!tab?.id) return sendResponse({ ok: false });
      const r = await syncFromTab(tab.id);
      sendResponse(r);
    });
    return true;
  }
  if (msg.type === "GET_STATUS") {
    sendResponse({
      capture: captureState,
      creds: toCredentials(captureState),
      debuggedTabs: [...debuggedTabs],
    });
    return true;
  }
});

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (!isMudadTabUrl(tab.url)) return;
  if (info.status === "loading" || info.status === "complete") {
    attachDebugger(tabId);
  }
  if (info.status === "complete") {
    setTimeout(() => syncFromTab(tabId), 1500);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => detachDebugger(tabId));

chrome.runtime.onInstalled.addListener(() => {
  setBadge(false, "…");
  attachAllMudadTabs();
  chrome.storage.local.get("mudadCapture", ({ mudadCapture }) => {
    if (mudadCapture?.headers) {
      captureState = { ...captureState, ...mudadCapture, headers: { ...mudadCapture.headers } };
      tryAutoSend(captureState);
    }
  });
});

chrome.runtime.onStartup.addListener(() => {
  attachAllMudadTabs();
});

attachAllMudadTabs();

chrome.storage.local.get("mudadCapture", ({ mudadCapture }) => {
  if (mudadCapture?.headers) {
    captureState = { ...captureState, ...mudadCapture, headers: { ...mudadCapture.headers } };
    tryAutoSend(captureState);
  }
});

setInterval(() => {
  if (pendingCapture) tryAutoSend(pendingCapture);
}, 5000);
