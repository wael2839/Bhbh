import { saveMudadCredentials } from "./mudad.js";

const PANEL_ORIGIN = "http://localhost:5173";

function isMudadOrigin(origin) {
  try {
    const { hostname } = new URL(origin);
    return hostname === "mudad.com.sa" || hostname.endsWith(".mudad.com.sa");
  } catch {
    return false;
  }
}

/** يستمع لرسائل الإضافة/المفضلة من تبويب مدد */
export function installCredentialBridge(onSaved) {
  const handler = async (ev) => {
    if (!isMudadOrigin(ev.origin)) return;
    if (ev.data?.source !== "mudad-capture") return;

    if (ev.data.type === "BRIDGE_PING") {
      ev.source?.postMessage({ source: "mudad-capture", type: "BRIDGE_READY" }, ev.origin);
      return;
    }

    if (ev.data.type !== "SAVE_CREDENTIALS") return;

    try {
      const { config } = await saveMudadCredentials(ev.data.credentials);
      ev.source?.postMessage(
        { source: "mudad-capture", type: "CREDENTIALS_SAVED", config },
        ev.origin
      );
      onSaved?.(config);
    } catch (err) {
      ev.source?.postMessage(
        { source: "mudad-capture", type: "CREDENTIALS_ERROR", error: err.message },
        ev.origin
      );
    }
  };

  window.addEventListener("message", handler);

  if (window.location.hash === "#credential-bridge" && window.opener) {
    window.opener.postMessage({ source: "mudad-capture", type: "BRIDGE_READY" }, "*");
  }

  return () => window.removeEventListener("message", handler);
}

export { PANEL_ORIGIN };
