export default function InterceptTerminal({
  enabled,
  onToggle,
  lastLog,
  repeaterHistory,
  running,
  activeStep,
  onSelectStep,
}) {
  if (!enabled && !repeaterHistory?.length && !lastLog) return null;

  const done = repeaterHistory?.filter((r) => r.state === "done").length ?? 0;
  const total = repeaterHistory?.length ?? 0;

  return (
    <div style={{
      borderTop: "2px solid #334155",
      background: "#0f172a",
      color: "#e2e8f0",
      display: "flex",
      flexDirection: "column",
      flexShrink: 0,
      fontFamily: "Consolas, monospace",
      fontSize: 12,
    }}>
      <div style={{
        padding: "8px 14px",
        borderBottom: "1px solid #1e293b",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 10,
        flexWrap: "wrap",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{
            width: 8, height: 8, borderRadius: "50%",
            background: running ? "#22c55e" : enabled ? "#f59e0b" : "#64748b",
            boxShadow: running ? "0 0 8px #22c55e" : "none",
          }} />
          <strong style={{ color: enabled ? "#fbbf24" : "#94a3b8" }}>
            Repeater {enabled ? "(مفعّل)" : "(معطّل)"}
          </strong>
          <span style={{ color: "#64748b", fontSize: 11 }}>
            — رفع أصلي → إن «مسبقاً» يعدّل راتب+توقيع (حتى 10)
          </span>
          {total > 0 && (
            <span style={{ color: "#c4b5fd", fontSize: 11 }}>
              ({done}/{total} اكتمل)
            </span>
          )}
        </div>
        <button onClick={onToggle} style={btnStyle(enabled ? "#7c2d12" : "#14532d")}>
          {enabled ? "إيقاف Repeater" : "تفعيل Repeater"}
        </button>
      </div>

      {(running || lastLog) && (
        <div style={{
          padding: "8px 14px",
          color: running ? "#86efac" : "#94a3b8",
          fontSize: 11,
        }}>
          {running
            ? `⏳ جاري الطلب ${activeStep ?? "…"}/${total || 10} — الرد لكل طلب في القائمة الجانبية يميناً`
            : lastLog}
        </div>
      )}

      {repeaterHistory?.length > 0 && !running && (
        <div style={{
          padding: "6px 14px 10px",
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          borderTop: repeaterHistory.length && lastLog ? "1px solid #1e293b" : "none",
        }}>
          {repeaterHistory.map((item) => {
            const active = activeStep === item.request;
            const color = item.state === "done"
              ? (item.ok ? "#4ade80" : "#f87171")
              : item.state === "loading" ? "#fbbf24" : "#64748b";
            return (
              <button
                key={item.request}
                type="button"
                disabled={item.state === "pending"}
                onClick={() => onSelectStep?.(item.request)}
                style={{
                  background: active ? "rgba(59,130,246,0.2)" : "#1e293b",
                  border: `1px solid ${active ? "#3b82f6" : "#334155"}`,
                  borderRadius: 6,
                  padding: "4px 10px",
                  color,
                  fontSize: 10,
                  cursor: item.state === "pending" ? "default" : "pointer",
                  fontFamily: "inherit",
                  opacity: item.state === "pending" ? 0.5 : 1,
                }}
              >
                #{item.request}{" "}
                {item.state === "done"
                  ? (item.message || `HTTP ${item.status}`)
                  : item.state === "loading" ? "…"
                    : item.state === "skipped" ? "تخطّي" : "—"}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function btnStyle(bg) {
  return {
    background: bg,
    border: "none",
    borderRadius: 6,
    padding: "5px 12px",
    color: "#fff",
    fontSize: 11,
    cursor: "pointer",
    fontFamily: "inherit",
    whiteSpace: "nowrap",
  };
}
