import { useState, useEffect, useCallback } from "react";
import {
  getFileType,
  mapMudadFile,
  extractFileList,
  extractTotal,
  getMudadConfig,
  saveMudadCredentials,
  fetchMudadFiles,
  fetchMudadFileDetail,
  uploadMudadFile,
  getInterceptState,
  setInterceptEnabled,
  extractMudadMessage,
} from "./api/mudad.js";
import { runRepeaterSequence, initRepeaterHistory, historyItemFromRow } from "./api/repeater.js";
import InterceptTerminal from "./components/InterceptTerminal.jsx";
import { parseCredentialsPaste, maskValue } from "./api/parseCredentials.js";
import { checkServerHealth } from "./api/http.js";
import { installCredentialBridge } from "./api/credentialBridge.js";

const SIDEBAR_ITEMS = [
  { label: "الرئيسية", icon: "🏠" },
  { label: "الملفات", icon: "📁" },
  { label: "إضافة ملف", icon: "➕" },
  { label: "التراسلات", icon: "✉️" },
  { label: "رأس المال الخاص", icon: "💼" },
];

const MOCK_FILES = Array.from({ length: 104 }, (_, i) => {
  const templates = [
    { name: "test.txt",    month: "يونيو 2024", date: "22/06/2024", fileNum: "2558478982", status: "Approved" },
    { name: "image.jpg",   month: "يونيو 2024", date: "22/06/2024", fileNum: "2558478982", status: "Approved" },
    { name: "report.pdf",  month: "يونيو 2024", date: "21/06/2024", fileNum: "2558478982", status: "Rejected" },
    { name: "file.txt",    month: "يوليو 2024", date: "15/07/2024", fileNum: "2558478982", status: "Approved" },
    { name: "scan.png",    month: "يوليو 2024", date: "10/07/2024", fileNum: "2558478982", status: "Rejected" },
    { name: "wages.csv",   month: "مايو 2024",  date: "30/05/2024", fileNum: "2558478982", status: "Approved" },
    { name: "backup.txt",  month: "مايو 2024",  date: "28/05/2024", fileNum: "2558478982", status: "Approved" },
    { name: "photo.jpg",   month: "أبريل 2024", date: "18/04/2024", fileNum: "2558478982", status: "Rejected" },
  ];
  const t = templates[i % templates.length];
  return { id: i + 1, ...t, fileType: getFileType(t.name) };
});

const STATUS_STYLES = {
  Approved:   { bg: "#d1fae5", color: "#065f46", label: "مقبول"         },
  Queued:     { bg: "#fef3c7", color: "#92400e", label: "قيد المعالجة"  },
  Rejected:   { bg: "#fee2e2", color: "#991b1b", label: "مرفوض"         },
  Processing: { bg: "#dbeafe", color: "#1e40af", label: "جاري المعالجة" },
  Deleted:    { bg: "#f1f5f9", color: "#475569", label: "محذوف"         },
};

const MOCK_RESPONSES = {
  upload: {
    label: "POST /wages/upload",
    color: "#4ade80",
    body: {
      status: "success",
      message: "تم رفع الملف بنجاح",
      data: {
        fileId: "WPS-2026-00847",
        referenceNumber: "2750479992",
        month: "يونيو 2026",
        uploadedAt: "2026-06-22T14:30:00Z",
        processingStatus: "Queued",
        estimatedProcessingTime: "2-4 ساعات",
        employeeCount: 47,
        totalAmount: 184500.00
      }
    }
  },
  list: {
    label: "GET /wages/files",
    color: "#60a5fa",
    body: {
      status: 200,
      message: "تم استرجاع البيانات بنجاح",
      total: 104,
      page: 1,
      data: MOCK_FILES.slice(0, 10).map(f => ({
        id: f.id,
        file_name: f.name,
        file_type: f.fileType,
        upload_date: f.date,
        document_number: f.fileNum,
        month: f.month,
        status: f.status,
      }))
    }
  },
  detail: {
    label: "GET /wages/files/{id}",
    color: "#a78bfa",
    body: {
      status: "success",
      data: {
        fileId: "WPS-2026-00847",
        referenceNumber: "2750479992",
        wageProtectionNumber: "99621",
        uploadedBy: "عبدالله المطيري",
        month: "يونيو 2026",
        uploadDate: "2026-06-22",
        processingStatus: "Approved",
        approvedAt: "2026-06-22T18:45:00Z",
        employeeCount: 47,
        totalAmount: 184500.00,
        currency: "SAR"
      }
    }
  },
  error: {
    label: "POST /wages/upload — خطأ",
    color: "#f87171",
    body: {
      status: "error",
      code: 422,
      message: "فشل التحقق من صحة الملف",
      errors: [
        { field: "employeeId", message: "رقم الموظف غير صحيح في السطر 14" },
        { field: "amount",     message: "المبلغ يجب أن يكون أكبر من صفر"  }
      ]
    }
  }
};

function ActionButtons({ onView, onDelete }) {
  return (
    <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
      <button onClick={onView} title="عرض" style={{
        background: "#dcfce7", border: "none", borderRadius: 6,
        width: 30, height: 30, cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14
      }}>👁</button>
      <button onClick={onDelete} title="حذف" style={{
        background: "#fee2e2", border: "none", borderRadius: 6,
        width: 30, height: 30, cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14
      }}>🗑</button>
    </div>
  );
}

function StatusBadge({ status }) {
  const s = STATUS_STYLES[status] || STATUS_STYLES.Queued;
  return (
    <span style={{
      background: s.bg, color: s.color,
      padding: "3px 12px", borderRadius: 20,
      fontSize: 12, fontWeight: 700, display: "inline-block"
    }}>{s.label}</span>
  );
}

function ResponsePanel({
  response,
  loading,
  liveMode,
  repeaterHistory,
  selectedRepeaterStep,
  onSelectRepeaterStep,
}) {
  const [copied, setCopied] = useState(false);

  const hasRepeater = repeaterHistory?.length > 0;
  const selected = hasRepeater
    ? repeaterHistory.find((h) => h.request === selectedRepeaterStep) || repeaterHistory[repeaterHistory.length - 1]
    : null;

  const displayResponse = hasRepeater && selected
    ? {
        label: selected.responseLabel || selected.label || `طلب #${selected.request}`,
        color: selected.color || "#475569",
        body: selected.body,
      }
    : response;

  const displayLoading = hasRepeater
    ? selected?.state === "loading"
    : loading;

  const handleCopy = () => {
    navigator.clipboard.writeText(JSON.stringify(displayResponse?.body, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  function statusBadge(item) {
    if (item.state === "skipped") return { text: item.message || "تخطّي", color: "#64748b" };
    if (item.state === "pending") return { text: "انتظار", color: "#64748b" };
    if (item.state === "loading") return { text: "إرسال…", color: "#fbbf24" };
    if (item.message) return { text: item.message, color: item.ok ? "#4ade80" : "#f87171" };
    if (item.ok) return { text: `✓ ${item.status}`, color: "#4ade80" };
    return { text: `✗ ${item.status || "خطأ"}`, color: "#f87171" };
  }

  const mudadBanner = displayResponse?.body?.رسالة_مدد
    || displayResponse?.body?.message
    || (hasRepeater && selected?.message)
    || "";

  return (
    <div style={{
      width: hasRepeater ? 420 : 340,
      background: "#0f172a",
      display: "flex",
      flexDirection: "row",
      height: "100%",
      borderLeft: "1px solid #1e293b",
    }}>
      {hasRepeater && (
        <div style={{
          width: 172,
          borderLeft: "1px solid #1e293b",
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
          background: "#0c1222",
        }}>
          <div style={{
            padding: "10px 12px",
            borderBottom: "1px solid #1e293b",
            color: "#94a3b8",
            fontSize: 10,
            fontFamily: "monospace",
            fontWeight: 700,
          }}>
            طلبات Repeater
          </div>
          <div style={{ flex: 1, overflow: "auto" }}>
            {repeaterHistory.map((item) => {
              const badge = statusBadge(item);
              const active = selectedRepeaterStep === item.request;
              return (
                <button
                  key={item.request}
                  type="button"
                  onClick={() => onSelectRepeaterStep?.(item.request)}
                  disabled={item.state === "pending" || item.state === "skipped"}
                  style={{
                    width: "100%",
                    textAlign: "right",
                    padding: "10px 12px",
                    border: "none",
                    borderBottom: "1px solid #1e293b",
                    background: active ? "rgba(59,130,246,0.2)" : "transparent",
                    cursor: item.state === "pending" ? "default" : "pointer",
                    fontFamily: "monospace",
                    opacity: item.state === "pending" ? 0.5 : 1,
                  }}
                >
                  <div style={{ color: active ? "#93c5fd" : "#e2e8f0", fontSize: 11, marginBottom: 4 }}>
                    #{item.request} {item.phase === "original" ? "أصلي" : "معدّل"}
                  </div>
                  <div style={{ color: "#fbbf24", fontSize: 10, marginBottom: 2 }}>
                    راتب {item.salary ?? "—"}
                  </div>
                  <div style={{ color: badge.color, fontSize: 10, lineHeight: 1.35, wordBreak: "break-word" }}>
                    {badge.text}
                  </div>
                  {item.state === "done" && item.status ? (
                    <div style={{ color: "#64748b", fontSize: 9, marginTop: 2 }}>HTTP {item.status}</div>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
      <div style={{
        padding: "14px 16px", borderBottom: "1px solid #1e293b",
        display: "flex", justifyContent: "space-between", alignItems: "center"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <span style={{
            width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
            background: displayResponse ? displayResponse.color : "#475569",
            display: "inline-block",
            boxShadow: displayResponse ? `0 0 6px ${displayResponse.color}` : "none"
          }} />
          <span style={{
            color: "#e2e8f0", fontSize: 11, fontFamily: "monospace", fontWeight: 700,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {displayResponse ? displayResponse.label : "API Response"}
          </span>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={handleCopy} style={{
            background: "#1e293b", border: "none", borderRadius: 6,
            padding: "4px 10px", color: copied ? "#4ade80" : "#94a3b8",
            fontSize: 11, cursor: "pointer", fontFamily: "monospace"
          }}>
            {copied ? "✓ نسخ" : "نسخ"}
          </button>
          <div style={{ display: "flex", gap: 4 }}>
            {["#ff5f56","#ffbd2e","#27c93f"].map(c => (
              <div key={c} style={{ width: 10, height: 10, borderRadius: "50%", background: c }} />
            ))}
          </div>
        </div>
      </div>

      <div style={{
        display: "flex", borderBottom: "1px solid #1e293b",
        padding: "0 16px"
      }}>
        {["Response","Headers","Request"].map((t, i) => (
          <button key={t} style={{
            background: "none", border: "none",
            borderBottom: i === 0 ? "2px solid #3b82f6" : "2px solid transparent",
            color: i === 0 ? "#60a5fa" : "#475569",
            padding: "8px 12px", fontSize: 12,
            cursor: "pointer", fontFamily: "monospace"
          }}>{t}</button>
        ))}
      </div>

      <div style={{
        flex: 1, overflow: "auto", padding: 16,
        fontFamily: "monospace", fontSize: 12.5, lineHeight: 1.7
      }}>
        {mudadBanner && !displayLoading ? (
          <div style={{
            marginBottom: 14,
            padding: "12px 14px",
            borderRadius: 8,
            background: displayResponse?.color === "#4ade80" ? "rgba(34,197,94,0.12)" : "rgba(248,113,113,0.12)",
            border: `1px solid ${displayResponse?.color === "#4ade80" ? "#22c55e55" : "#f8717155"}`,
            color: displayResponse?.color === "#4ade80" ? "#86efac" : "#fca5a5",
            fontSize: 13,
            fontWeight: 700,
            lineHeight: 1.5,
            fontFamily: "inherit",
          }}>
            {mudadBanner}
          </div>
        ) : null}
        {displayLoading ? (
          <div style={{ color: "#fbbf24", textAlign: "center", paddingTop: 40 }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>⏳</div>
            <div>جاري إرسال الطلب…</div>
          </div>
        ) : displayResponse?.body ? (
          <JsonRenderer data={displayResponse.body} indent={0} />
        ) : hasRepeater && selected?.state === "pending" ? (
          <div style={{ color: "#64748b", textAlign: "center", paddingTop: 40, fontSize: 12 }}>
            في انتظار هذا الطلب…
          </div>
        ) : response ? (
          <JsonRenderer data={response.body} indent={0} />
        ) : (
          <div style={{ color: "#475569", textAlign: "center", paddingTop: 40 }}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>📡</div>
            <div style={{ fontSize: 13 }}>في انتظار طلب API</div>
          </div>
        )}
      </div>

      {!liveMode && !hasRepeater && (
        <div style={{ padding: "12px 16px", borderTop: "1px solid #1e293b" }}>
          <div style={{ color: "#475569", fontSize: 11, marginBottom: 8, fontFamily: "monospace" }}>
            // محاكاة استجابات API
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {Object.entries(MOCK_RESPONSES).map(([key, val]) => (
              <button key={key} style={{
                background: "#1e293b", border: `1px solid ${val.color}33`,
                borderRadius: 6, padding: "4px 10px",
                color: val.color, fontSize: 11,
                cursor: "pointer", fontFamily: "monospace"
              }}
                onClick={() => window.__setResp && window.__setResp(val)}
              >
                {key}
              </button>
            ))}
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

function JsonRenderer({ data, indent }) {
  if (data === null) return <span style={{ color: "#f87171" }}>null</span>;
  if (typeof data === "boolean") return <span style={{ color: "#fb923c" }}>{String(data)}</span>;
  if (typeof data === "number") return <span style={{ color: "#34d399" }}>{data}</span>;
  if (typeof data === "string") return <span style={{ color: "#fbbf24" }}>"{data}"</span>;

  if (Array.isArray(data)) {
    if (data.length === 0) return <span style={{ color: "#94a3b8" }}>[]</span>;
    return (
      <span>
        <span style={{ color: "#94a3b8" }}>[</span>
        {data.map((item, i) => (
          <div key={i} style={{ paddingRight: (indent + 1) * 14 }}>
            <JsonRenderer data={item} indent={indent + 1} />
            {i < data.length - 1 && <span style={{ color: "#475569" }}>,</span>}
          </div>
        ))}
        <span style={{ color: "#94a3b8" }}>]</span>
      </span>
    );
  }

  if (typeof data === "object") {
    const entries = Object.entries(data);
    return (
      <span>
        <span style={{ color: "#94a3b8" }}>{"{"}</span>
        {entries.map(([k, v], i) => (
          <div key={k} style={{ paddingRight: (indent + 1) * 14 }}>
            <span style={{ color: "#93c5fd" }}>"{k}"</span>
            <span style={{ color: "#94a3b8" }}>: </span>
            <JsonRenderer data={v} indent={indent + 1} />
            {i < entries.length - 1 && <span style={{ color: "#475569" }}>,</span>}
          </div>
        ))}
        <span style={{ color: "#94a3b8" }}>{"}"}</span>
      </span>
    );
  }
  return <span style={{ color: "#e2e8f0" }}>{String(data)}</span>;
}

function UploadModal({ onClose, onUpload, liveMode, configured, interceptEnabled }) {
  const [file, setFile] = useState(null);
  const [month, setMonth] = useState(6);
  const [year, setYear] = useState(2026);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const MONTH_OPTIONS = [
    { v: 1, l: "يناير" }, { v: 2, l: "فبراير" }, { v: 3, l: "مارس" },
    { v: 4, l: "أبريل" }, { v: 5, l: "مايو" }, { v: 6, l: "يونيو" },
    { v: 7, l: "يوليو" }, { v: 8, l: "أغسطس" }, { v: 9, l: "سبتمبر" },
    { v: 10, l: "أكتوبر" }, { v: 11, l: "نوفمبر" }, { v: 12, l: "ديسمبر" },
  ];

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      await onUpload({ file, name: file.name, month, year });
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100
    }}>
      <div style={{
        background: "#fff", borderRadius: 16, padding: 32,
        width: 420, boxShadow: "0 8px 40px rgba(0,0,0,0.2)", direction: "rtl"
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "#1e293b" }}>رفع ملف أجور جديد</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#94a3b8" }}>✕</button>
        </div>

        <label style={{ display: "block", marginBottom: 6, fontSize: 13, color: "#64748b", fontWeight: 600 }}>الشهر والسنة</label>
        <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
          <select value={month} onChange={e => setMonth(Number(e.target.value))} style={{
            flex: 1, padding: "10px 12px", borderRadius: 8,
            border: "1.5px solid #e2e8f0", fontSize: 14, color: "#1e293b", background: "#f8fafc"
          }}>
            {MONTH_OPTIONS.map(m => (
              <option key={m.v} value={m.v}>{m.l}</option>
            ))}
          </select>
          <select value={year} onChange={e => setYear(Number(e.target.value))} style={{
            width: 100, padding: "10px 12px", borderRadius: 8,
            border: "1.5px solid #e2e8f0", fontSize: 14, color: "#1e293b", background: "#f8fafc"
          }}>
            {[2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        <label style={{ display: "block", marginBottom: 6, fontSize: 13, color: "#64748b", fontWeight: 600 }}>ملف الأجور</label>
        <div onClick={() => document.getElementById("fi").click()} style={{
          border: "2px dashed #cbd5e1", borderRadius: 10,
          padding: "28px 20px", textAlign: "center", cursor: "pointer",
          marginBottom: 20, background: file ? "#f0fdf4" : "#f8fafc",
          color: file ? "#16a34a" : "#94a3b8", fontSize: 14
        }}>
          {file ? `✅ ${file.name}` : "📂 اضغط لاختيار الملف (.txt, .csv)"}
        </div>
        <input id="fi" type="file" accept=".txt,.csv" style={{ display: "none" }}
          onChange={e => { setFile(e.target.files[0]); setError(""); }} />

        {liveMode && !configured && (
          <p style={{ fontSize: 12, color: "#d97706", margin: "0 0 12px" }}>
            ⚠ اربط الاعتماد أولاً من خانة «ربط اعتماد مدد»
          </p>
        )}
        {error && (
          <p style={{ fontSize: 12, color: "#dc2626", margin: "0 0 12px" }}>{error}</p>
        )}

        <button onClick={handleUpload} disabled={!file || uploading} style={{
          width: "100%", padding: 12,
          background: file && !uploading ? "#1d4ed8" : "#e2e8f0",
          color: file && !uploading ? "#fff" : "#94a3b8",
          border: "none", borderRadius: 10, fontSize: 15,
          fontWeight: 700, cursor: file ? "pointer" : "not-allowed"
        }}>
          {uploading
            ? (interceptEnabled ? "⏳ Repeater — حتى 10 طلبات…" : "⏳ جاري الرفع...")
            : interceptEnabled ? "رفع وتشغيل Repeater (حتى ×10)" : "رفع الملف"}
        </button>
      </div>
    </div>
  );
}

const PAGE_SIZE = 10;

function CredentialsPanel({ onConnected, onClose, waiting }) {
  const [pasteText, setPasteText] = useState("");
  const [parsed, setParsed] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showManual, setShowManual] = useState(false);

  useEffect(() => {
    if (!pasteText.trim()) {
      setParsed(null);
      return;
    }
    setParsed(parseCredentialsPaste(pasteText));
    setError("");
    setSuccess("");
  }, [pasteText]);

  const handleConnect = async () => {
    if (!parsed?.ready) {
      setError("تعذّر استخراج الحقول المطلوبة — تأكد من لصق cURL أو رؤوس الطلب كاملة");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const { config } = await saveMudadCredentials(parsed.extracted);
      setSuccess("تم الربط بنجاح — جاري تحميل البيانات...");
      onConnected(config);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const preview = parsed?.extracted;

  return (
    <div style={{
      background: "#fff", borderRadius: 14, padding: 24, marginBottom: 20,
      boxShadow: "0 1px 8px rgba(0,0,0,0.07)", border: "1px solid #e2e8f0"
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "#1e293b" }}>الربط التلقائي</h3>
          {waiting ? (
            <div style={{
              marginTop: 10, padding: 14, borderRadius: 10, background: "#eff6ff",
              border: "1px solid #bfdbfe", fontSize: 13, color: "#1e40af", lineHeight: 1.7
            }}>
              <div style={{ fontWeight: 800, marginBottom: 6 }}>⏳ بانتظار الاعتماد من مدد...</div>
              <ol style={{ margin: "8px 0 0", paddingRight: 18 }}>
                <li>ثبّت إضافة Chrome من مجلد <code>extension/</code> (مرة واحدة)</li>
                <li>افتح <a href="https://mudad.com.sa" target="_blank" rel="noreferrer" style={{ color: "#1d4ed8" }}>mudad.com.sa</a> وسجّل الدخول</li>
                <li>تصفّح أي صفحة — تُربط اللوحة <strong>تلقائياً</strong></li>
              </ol>
            </div>
          ) : (
            <p style={{ margin: "6px 0 0", fontSize: 13, color: "#64748b" }}>
              تحديث يدوي من DevTools (اختياري)
            </p>
          )}
        </div>
        {onClose && (
          <button onClick={onClose} style={{
            background: "#f1f5f9", border: "none", borderRadius: 8,
            width: 32, height: 32, cursor: "pointer", color: "#64748b", fontSize: 16
          }}>✕</button>
        )}
      </div>

      {!showManual && waiting && (
        <button
          type="button"
          onClick={() => setShowManual(true)}
          style={{
            marginBottom: 12, background: "transparent", border: "1px dashed #cbd5e1",
            borderRadius: 8, padding: "8px 12px", cursor: "pointer", fontSize: 12, color: "#64748b", width: "100%"
          }}
        >
          لصق يدوي من Network (احتياطي)
        </button>
      )}

      {(showManual || !waiting) && (
      <>
      <textarea
        value={pasteText}
        onChange={(e) => setPasteText(e.target.value)}
        placeholder={`الصق هنا...\n\nمثال:\ncurl 'https://api.mudad.sa/compliance-app/api/v1/...' \\\n  -H 'bearer_token: ...' \\\n  -H 'x-apikey: ...' \\\n  -H 'organizationid: ...' \\\n  -H 'session_id: ...'`}
        style={{
          width: "100%", minHeight: 140, padding: 14, borderRadius: 10,
          border: "1.5px solid #e2e8f0", fontSize: 12, fontFamily: "Consolas, monospace",
          resize: "vertical", direction: "ltr", textAlign: "left", background: "#f8fafc"
        }}
      />

      {preview && (
        <div style={{
          marginTop: 14, padding: 14, borderRadius: 10,
          background: parsed.ready ? "#f0fdf4" : "#fffbeb",
          border: `1px solid ${parsed.ready ? "#bbf7d0" : "#fde68a"}`
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: parsed.ready ? "#166534" : "#92400e", marginBottom: 10 }}>
            {parsed.ready ? "✓ تم استخراج الاعتماد" : "⚠ بيانات ناقصة"}
            {parsed.missing.length > 0 && ` — مطلوب: ${parsed.missing.join("، ")}`}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 8, fontSize: 11.5 }}>
            {[
              ["bearer_token", maskValue(preview.bearerToken)],
              ["x-apikey", maskValue(preview.apiKey)],
              ["organizationid", preview.orgId || "—"],
              ["session_id", maskValue(preview.sessionId)],
              ["مسار الملفات", preview.filesPath || "/compliance/.../submitted-files"],
              ["مسار الرفع", preview.uploadPath || "/compliance/v1/upload-wage-file"],
              ["mlsdUnifiedId", preview.mlsdUnifiedId || "—"],
            ].map(([label, val]) => (
              <div key={label} style={{ background: "rgba(255,255,255,0.7)", padding: "8px 10px", borderRadius: 8 }}>
                <div style={{ color: "#94a3b8", marginBottom: 2 }}>{label}</div>
                <div style={{ color: "#1e293b", fontFamily: "monospace", wordBreak: "break-all" }}>{val}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {error && <p style={{ color: "#dc2626", fontSize: 13, margin: "12px 0 0" }}>{error}</p>}
      {success && <p style={{ color: "#16a34a", fontSize: 13, margin: "12px 0 0" }}>{success}</p>}

      <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
        <button
          onClick={handleConnect}
          disabled={!parsed?.ready || saving}
          style={{
            padding: "10px 20px", borderRadius: 10, border: "none",
            background: parsed?.ready && !saving ? "#1d4ed8" : "#e2e8f0",
            color: parsed?.ready && !saving ? "#fff" : "#94a3b8",
            fontWeight: 700, fontSize: 14, cursor: parsed?.ready && !saving ? "pointer" : "not-allowed"
          }}
        >
          {saving ? "⏳ جاري الربط..." : "🔗 استخراج وربط"}
        </button>
        <button
          onClick={() => { setPasteText(""); setParsed(null); setError(""); setSuccess(""); }}
          style={{
            padding: "10px 16px", borderRadius: 10, border: "1px solid #e2e8f0",
            background: "#fff", color: "#64748b", fontSize: 13, cursor: "pointer"
          }}
        >
          مسح
        </button>
      </div>
      </>
      )}
    </div>
  );
}

export default function MudadDashboard() {
  const [files, setFiles] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const [activeTab, setActiveTab] = useState("الملفات");
  const [apiConfig, setApiConfig] = useState(null);
  const [liveMode, setLiveMode] = useState(true);
  const [apiError, setApiError] = useState("");
  const [showApiInput, setShowApiInput] = useState(false);
  const [showCredentials, setShowCredentials] = useState(false);
  const [serverOnline, setServerOnline] = useState(true);
  const [response, setResponse] = useState(null);
  const [loadingResp, setLoadingResp] = useState(false);
  const [page, setPage] = useState(1);
  const [interceptEnabled, setInterceptEnabledState] = useState(false);
  const [interceptLog, setInterceptLog] = useState("");
  const [repeaterHistory, setRepeaterHistory] = useState(null);
  const [selectedRepeaterStep, setSelectedRepeaterStep] = useState(null);
  const [repeaterRunning, setRepeaterRunning] = useState(false);
  const [repeaterActiveStep, setRepeaterActiveStep] = useState(null);

  const refreshIntercept = useCallback(async () => {
    try {
      const data = await getInterceptState();
      setInterceptEnabledState(Boolean(data.enabled));
    } catch { /* */ }
  }, []);

  const establishmentNum = apiConfig?.orgId?.split("-")?.[1] || apiConfig?.orgId || "—";

  const loadFiles = useCallback(async (pageNum = page) => {
    if (!liveMode) {
      const mock = MOCK_FILES;
      const start = (pageNum - 1) * PAGE_SIZE;
      setFiles(mock.slice(start, start + PAGE_SIZE));
      setTotalCount(mock.length);
      setResponse({
        label: "GET /wages/files (mock)",
        color: "#60a5fa",
        body: MOCK_RESPONSES.list.body,
      });
      return;
    }

    setLoadingResp(true);
    setApiError("");
    try {
      const result = await fetchMudadFiles(pageNum, PAGE_SIZE);
      const list = extractFileList(result);
      const total = extractTotal(result, list.length);
      const mapped = list.map(mapMudadFile);

      setFiles(mapped);
      setTotalCount(total);
      setResponse({
        label: `GET ${apiConfig?.filesPath || "/compliance/.../submitted-files"}`,
        color: "#60a5fa",
        body: result.data ?? result,
      });
    } catch (err) {
      setApiError(err.message);
      if (err.message.includes("صلاحية") || err.message.includes("403")) {
        setShowCredentials(true);
      }
      setFiles([]);
      setTotalCount(0);
      setResponse({
        label: "GET api.mudad.sa — خطأ",
        color: "#f87171",
        body: { error: err.message },
      });
    } finally {
      setLoadingResp(false);
    }
  }, [liveMode, page, apiConfig?.filesPath]);

  useEffect(() => {
    const ping = async () => {
      const ok = await checkServerHealth();
      setServerOnline((prev) => {
        if (!prev && ok) {
          getMudadConfig()
            .then((cfg) => {
              setApiConfig(cfg);
              setLiveMode(cfg.configured);
            })
            .catch(() => setLiveMode(false));
        }
        return ok;
      });
    };
    ping();
    const ms = serverOnline ? 8000 : 2000;
    const id = setInterval(ping, ms);
    return () => clearInterval(id);
  }, [serverOnline]);

  useEffect(() => {
    if (!serverOnline) return;
    refreshIntercept();
  }, [serverOnline, refreshIntercept]);

  useEffect(() => {
    if (!serverOnline) return;
    getMudadConfig()
      .then(cfg => {
        setApiConfig(cfg);
        setLiveMode(cfg.configured);
        if (!cfg.configured) setShowCredentials(true);
        else {
          setActiveTab("الملفات");
          setShowCredentials(false);
        }
      })
      .catch(() => {
        setLiveMode(false);
        setShowCredentials(true);
      });
  }, [serverOnline]);

  const handleCredentialsConnected = (config) => {
    setApiConfig(config);
    setLiveMode(config.configured);
    setShowCredentials(false);
    setShowApiInput(false);
    setActiveTab("الملفات");
    setPage(1);
    loadFiles(1);
  };

  useEffect(() => {
    if (!serverOnline || apiConfig?.configured) return undefined;
    const poll = setInterval(async () => {
      try {
        const cfg = await getMudadConfig();
        if (cfg.configured) handleCredentialsConnected(cfg);
      } catch { /* */ }
    }, 2000);
    return () => clearInterval(poll);
  }, [serverOnline, apiConfig?.configured]);

  useEffect(() => {
    return installCredentialBridge(handleCredentialsConnected);
  }, []);

  useEffect(() => {
    if (apiConfig !== null) loadFiles(page);
  }, [page, liveMode, apiConfig, loadFiles]);

  window.__setResp = (val) => {
    setLoadingResp(true);
    setTimeout(() => { setResponse(val); setLoadingResp(false); }, 300);
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const pageStart = (page - 1) * PAGE_SIZE;
  const pageFiles = files;
  const rangeLabel = totalCount
    ? `${pageStart + 1}-${Math.min(pageStart + PAGE_SIZE, totalCount)} من ${totalCount}`
    : "لا توجد بيانات";

  const handleUpload = async ({ file, name, month, year }) => {
    if (!liveMode) {
      setFiles(prev => [{
        id: Date.now(), name, month,
        date: new Date().toLocaleDateString("ar-SA"),
        fileNum: establishmentNum,
        fileType: getFileType(name),
        status: "Queued"
      }, ...prev]);
      setTotalCount(c => c + 1);
      setPage(1);
      setActiveTab("الملفات");
      setResponse({ label: "POST /wages/upload (mock)", color: "#4ade80", body: MOCK_RESPONSES.upload.body });
      return;
    }

    setLoadingResp(true);
    setApiError("");
    setRepeaterRunning(interceptEnabled);
    if (!interceptEnabled) {
      setRepeaterHistory(null);
      setSelectedRepeaterStep(null);
    }
    try {
      const plan = await uploadMudadFile(file, {
        month, year, orgId: apiConfig?.orgId, repeater: interceptEnabled,
      });
      if (plan.repeaterPlan) {
        if (plan.error) {
          setRepeaterHistory(null);
          setInterceptLog(plan.error);
          setResponse({
            label: plan.error,
            color: "#f87171",
            body: { رسالة_مدد: plan.error, error: plan.error },
          });
          return;
        }
        const history = initRepeaterHistory(plan);
        setRepeaterHistory(history);
        setSelectedRepeaterStep(1);
        setInterceptLog(
          `Repeater — رفع أصلي أولاً؛ إن ظهر «مسبقاً» يعدّل راتب+توقيع حتى ${plan.total || 10} مرات`
        );
        setRepeaterActiveStep(null);
        setLoadingResp(false);
        const result = await runRepeaterSequence(plan, (ev) => {
          const stepInfo = plan.steps?.[ev.current - 1];
          const stepLabel = stepInfo?.label
            || (ev.current === 1 ? "رفع أصلي" : `معدّل (راتب ${ev.salary})`);
          if (ev.status === "sending") {
            setRepeaterActiveStep(ev.current);
            setSelectedRepeaterStep(ev.current);
            setRepeaterHistory((prev) => (prev || []).map((h) => (
              h.request === ev.current ? { ...h, state: "loading" } : h
            )));
            setInterceptLog(`Repeater — ${stepLabel} — إرسال ${ev.current}/${ev.total}…`);
            return;
          }
          if (ev.status === "done" && ev.lastRow) {
            const item = historyItemFromRow(ev.lastRow, stepInfo);
            setRepeaterHistory((prev) => (prev || []).map((h) => (
              h.request === ev.current ? item : h
            )));
            setRepeaterActiveStep(ev.current);
            setSelectedRepeaterStep(ev.current);
            setInterceptLog(
              `Repeater — رد #${ev.lastRow.request} (${stepLabel}): ${ev.lastRow.message || `HTTP ${ev.lastRow.status}`}`
            );
          }
        });
        setRepeaterHistory((prev) => (prev || []).map((h) => {
          if (h.state === "done" || h.state === "loading") return h;
          const sent = result.results.some((r) => r.request === h.request);
          if (sent) return h;
          return {
            ...h,
            state: "skipped",
            message: result.stopReason === "success" ? "تخطّي — نجح الرفع" : "تخطّي",
            color: "#64748b",
          };
        }));
        const summary = `${result.sent}/${result.total} أُرسل — ${result.success} نجح`;
        const stopNote = result.stopReason === "success"
          ? " — توقف عند نجاح الرفع"
          : result.stopReason === "no_retry"
            ? " — توقف (لا حاجة لتعديل)"
            : "";
        setInterceptLog(`Repeater — اكتمل: ${summary}${stopNote}`);
        if (result.success > 0) {
          setPage(1);
          await loadFiles(1);
        }
        return;
      }
      const result = plan;
      const mudadMsg = extractMudadMessage(result);
      setResponse({
        label: mudadMsg || `POST ${apiConfig?.uploadPath || "/compliance/v1/upload-wage-file"}`,
        color: result.ok !== false ? "#4ade80" : "#f87171",
        body: {
          رسالة_مدد: mudadMsg || null,
          httpStatus: result.status,
          ok: result.ok !== false,
          mudadResponse: result.data ?? result,
        },
      });
      setActiveTab("الملفات");
      setPage(1);
      await loadFiles(1);
    } catch (err) {
      setApiError(err.message);
      setResponse({ label: "POST upload — خطأ", color: "#f87171", body: { error: err.message } });
      throw err;
    } finally {
      setLoadingResp(false);
      setRepeaterRunning(false);
    }
  };

  const handleToggleIntercept = async () => {
    const data = await setInterceptEnabled(!interceptEnabled);
    setInterceptEnabledState(Boolean(data.enabled));
    setInterceptLog(data.enabled
      ? "وضع Repeater — رفع أصلي؛ عند «مسبقاً» يعدّل راتب+توقيع حتى 10 مرات"
      : "وضع Repeater متوقف — الرفع مباشر لمدد");
  };

  const handleView = async (file) => {
    if (!liveMode) {
      setResponse({
        label: "GET /wages/files/{id} (mock)",
        color: "#a78bfa",
        body: { data: file._raw || file },
      });
      return;
    }

    setLoadingResp(true);
    try {
      const result = await fetchMudadFileDetail(file.id);
      setResponse({
        label: `GET ${apiConfig?.detailPath || "file/" + file.id}`,
        color: result.ok ? "#a78bfa" : "#f87171",
        body: result.data,
      });
    } catch (err) {
      setResponse({ label: "GET file detail — خطأ", color: "#f87171", body: { error: err.message } });
    } finally {
      setLoadingResp(false);
    }
  };

  const handleDelete = (id) => {
    if (liveMode) {
      setApiError("الحذف غير متاح عبر API — استخدم بوابة مدد");
      return;
    }
    setFiles(prev => prev.filter(f => f.id !== id));
    setTotalCount(c => Math.max(0, c - 1));
  };

  const statsSource = !liveMode ? MOCK_FILES : files;
  const approvedCount = statsSource.filter(f => f.status === "Approved").length;
  const rejectedCount = statsSource.filter(f => f.status === "Rejected").length;
  const queuedCount = statsSource.filter(f => f.status === "Queued" || f.status === "Processing").length;

  const tabTitles = {
    "الرئيسية": "لوحة التحكم",
    "الملفات": "الملفات المرفوعة سابقاً",
    "التراسلات": "التراسلات",
    "رأس المال الخاص": "رأس المال الخاص",
  };

  const renderMainContent = () => {
    if (activeTab === "الرئيسية") {
      const stats = [
        { label: "إجمالي الملفات", value: totalCount, color: "#1d4ed8", bg: "#dbeafe" },
        { label: "مقبول", value: approvedCount, color: "#065f46", bg: "#d1fae5" },
        { label: "مرفوض", value: rejectedCount, color: "#991b1b", bg: "#fee2e2" },
        { label: "قيد المعالجة", value: queuedCount, color: "#92400e", bg: "#fef3c7" },
      ];
      return (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginBottom: 24 }}>
          {stats.map(s => (
            <div key={s.label} style={{ background: "#fff", borderRadius: 14, padding: 20, boxShadow: "0 1px 8px rgba(0,0,0,0.07)" }}>
              <div style={{ fontSize: 12, color: "#64748b", marginBottom: 8 }}>{s.label}</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: s.color }}>{s.value}</div>
              <div style={{ marginTop: 10, height: 4, borderRadius: 2, background: s.bg }} />
            </div>
          ))}
        </div>
      );
    }

    if (activeTab === "التراسلات" || activeTab === "رأس المال الخاص") {
      return (
        <div style={{
          background: "#fff", borderRadius: 14, padding: 48, textAlign: "center",
          boxShadow: "0 1px 8px rgba(0,0,0,0.07)", color: "#94a3b8"
        }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>{activeTab === "التراسلات" ? "✉️" : "💼"}</div>
          <p style={{ margin: 0, fontSize: 15 }}>هذا القسم غير متاح عبر API حالياً</p>
          <p style={{ margin: "8px 0 0", fontSize: 13 }}>استخدم بوابة mudad.com.sa للوصول الكامل</p>
        </div>
      );
    }

    return (
      <div style={{ background: "#fff", borderRadius: 14, boxShadow: "0 1px 8px rgba(0,0,0,0.07)", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f8fafc", borderBottom: "2px solid #e2e8f0" }}>
              {["#","اسم الملف","الشهر","الحالة","تاريخ الرفع","رقم الملف","نوع الملف","الإجراءات"].map(h => (
                <th key={h} style={{
                  padding: "12px 14px", fontSize: 12, fontWeight: 700,
                  color: "#64748b", textAlign: h === "الإجراءات" ? "center" : "right"
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loadingResp && pageFiles.length === 0 ? (
              <tr><td colSpan={8} style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>جاري التحميل...</td></tr>
            ) : pageFiles.length === 0 ? (
              <tr><td colSpan={8} style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>لا توجد ملفات</td></tr>
            ) : pageFiles.map((f, i) => (
              <tr key={f.id}
                style={{ borderBottom: "1px solid #f1f5f9", background: i % 2 === 0 ? "#fff" : "#fafafa" }}
              >
                <td style={{ padding: "11px 14px", fontSize: 12, color: "#94a3b8" }}>{pageStart + i + 1}</td>
                <td style={{ padding: "11px 14px", fontSize: 13, fontWeight: 600, color: "#1e293b" }}>{f.name}</td>
                <td style={{ padding: "11px 14px", fontSize: 12, color: "#475569" }}>{f.month}</td>
                <td style={{ padding: "11px 14px" }}><StatusBadge status={f.status} /></td>
                <td style={{ padding: "11px 14px", fontSize: 12, color: "#475569" }}>{f.date}</td>
                <td style={{ padding: "11px 14px", fontSize: 11.5, color: "#475569", fontFamily: "monospace" }}>{f.fileNum}</td>
                <td style={{ padding: "11px 14px", fontSize: 11, fontWeight: 700, color: "#64748b" }}>{f.fileType}</td>
                <td style={{ padding: "11px 14px" }}>
                  <ActionButtons onView={() => handleView(f)} onDelete={() => handleDelete(f.id)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {totalPages > 1 && (
          <div style={{
            display: "flex", justifyContent: "center", alignItems: "center",
            gap: 8, padding: "14px 16px", borderTop: "1px solid #f1f5f9"
          }}>
            <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
              style={{ background: page === 1 ? "#f1f5f9" : "#fff", border: "1px solid #e2e8f0", borderRadius: 6, padding: "6px 14px", fontSize: 12, cursor: page === 1 ? "not-allowed" : "pointer", color: page === 1 ? "#cbd5e1" : "#475569" }}
            >السابق</button>
            <span style={{ fontSize: 12, color: "#64748b", padding: "0 8px" }}>{rangeLabel}</span>
            <button disabled={page === totalPages} onClick={() => setPage(p => p + 1)}
              style={{ background: page === totalPages ? "#f1f5f9" : "#fff", border: "1px solid #e2e8f0", borderRadius: 6, padding: "6px 14px", fontSize: 12, cursor: page === totalPages ? "not-allowed" : "pointer", color: page === totalPages ? "#cbd5e1" : "#475569" }}
            >التالي</button>
          </div>
        )}
      </div>
    );
  };

  const handleSidebarClick = (label) => {
    setActiveTab(label);
    if (label === "إضافة ملف") setShowModal(true);
    if (label === "الملفات") loadFiles(page);
  };

  return (
    <div style={{
      display: "flex", height: "100vh", direction: "rtl",
      fontFamily: "'Segoe UI', 'Noto Sans Arabic', sans-serif",
      background: "#f1f5f9", overflow: "hidden"
    }}>
      <div style={{
        width: 190, background: "#1e3a5f", display: "flex",
        flexDirection: "column", padding: "20px 0", gap: 4,
        flexShrink: 0
      }}>
        <div style={{ padding: "0 16px 20px", borderBottom: "1px solid rgba(255,255,255,0.1)", marginBottom: 8 }}>
          <div style={{
            background: "#fff", borderRadius: 10, padding: "8px 12px",
            textAlign: "center", fontWeight: 800, fontSize: 16, color: "#1e3a5f"
          }}>مدد <span style={{ color: "#16a34a" }}>●</span></div>
        </div>

        {SIDEBAR_ITEMS.map(item => (
          <button key={item.label} onClick={() => handleSidebarClick(item.label)} style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "11px 16px", margin: "0 8px", borderRadius: 10,
            background: activeTab === item.label ? "#22c55e" : "transparent",
            border: "none", color: "#fff", fontSize: 13, fontWeight: activeTab === item.label ? 700 : 400,
            cursor: "pointer", textAlign: "right"
          }}>
            <span>{item.icon}</span><span>{item.label}</span>
          </button>
        ))}

        <div style={{ marginTop: "auto", padding: "16px 12px", borderTop: "1px solid rgba(255,255,255,0.1)" }}>
          <button
            onClick={() => { setLiveMode(v => !v); setPage(1); }}
            style={{
              width: "100%", padding: 9, marginBottom: 8,
              background: liveMode ? "rgba(34,197,94,0.2)" : "rgba(255,255,255,0.08)",
              border: `1px solid ${liveMode ? "#22c55e" : "rgba(255,255,255,0.15)"}`,
              borderRadius: 8, color: liveMode ? "#4ade80" : "#94a3b8",
              fontSize: 11, cursor: "pointer", fontWeight: 600
            }}
          >
            {liveMode ? "🟢 API حقيقي" : "🟡 وضع محاكاة"}
          </button>

          <button
            onClick={handleToggleIntercept}
            style={{
              width: "100%", padding: 9, marginBottom: 8,
              background: interceptEnabled ? "rgba(245,158,11,0.25)" : "rgba(255,255,255,0.08)",
              border: `1px solid ${interceptEnabled ? "#f59e0b" : "rgba(255,255,255,0.15)"}`,
              borderRadius: 8, color: interceptEnabled ? "#fbbf24" : "#94a3b8",
              fontSize: 11, cursor: "pointer", fontWeight: 600
            }}
          >
            {interceptEnabled ? "⚡ Repeater: مفعّل" : "⚡ Repeater"}
          </button>

          {showApiInput ? (
            <button onClick={() => { setShowCredentials(true); setShowApiInput(false); }} style={{
              width: "100%", padding: 7, marginBottom: 6,
              background: "#2563eb", border: "none", borderRadius: 8,
              color: "#fff", fontSize: 11, cursor: "pointer", fontWeight: 700
            }}>📋 لصق الاعتماد</button>
          ) : null}

          <button onClick={() => {
            if (apiConfig?.configured) setShowCredentials(v => !v);
            else { setShowCredentials(true); setShowApiInput(true); }
          }} style={{
              width: "100%", padding: 9, background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8,
              color: apiConfig?.configured ? "#4ade80" : "#94a3b8",
              fontSize: 12, cursor: "pointer", fontWeight: 600
            }}>
            {apiConfig?.configured ? (showCredentials ? "🔑 تحديث الاعتماد" : "✅ الاعتماد مضبوط") : "🔑 إعداد API"}
          </button>
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
        <div style={{
          background: "#fff", padding: "14px 24px",
          display: "flex", justifyContent: "space-between", alignItems: "center",
          boxShadow: "0 1px 4px rgba(0,0,0,0.06)", borderBottom: "1px solid #e2e8f0", flexShrink: 0
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: "#1e293b" }}>
              {tabTitles[activeTab] || "الملفات المرفوعة سابقاً"}
            </h2>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: apiError ? "#dc2626" : "#64748b" }}>
              {apiError || (activeTab === "الملفات" ? rangeLabel : liveMode ? "متصل بـ api.mudad.sa" : "وضع المحاكاة")}
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {activeTab === "الملفات" && liveMode && (
              <button
                onClick={() => loadFiles(page)}
                disabled={loadingResp}
                style={{
                  padding: "8px 14px", borderRadius: 8, border: "1px solid #e2e8f0",
                  background: "#fff", fontSize: 12, cursor: loadingResp ? "wait" : "pointer", color: "#475569"
                }}
              >
                {loadingResp ? "⏳" : "🔄"} تحديث
              </button>
            )}
          <div style={{
            background: "#f8fafc", border: "1px solid #e2e8f0",
            borderRadius: 8, padding: "8px 16px", textAlign: "center"
          }}>
            <div style={{ fontSize: 10, color: "#94a3b8", marginBottom: 2 }}>رقم المنشأة</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#1e293b", fontFamily: "monospace" }}>{establishmentNum}</div>
          </div>
          </div>
        </div>

        {!serverOnline && (
          <div style={{
            background: "#fef2f2", borderBottom: "1px solid #fecaca",
            padding: "12px 24px", color: "#991b1b", fontSize: 13, flexShrink: 0
          }}>
            {import.meta.env.PROD ? (
              <>
                <strong>الخادم غير متصل.</strong>{" "}
                هذا الموقع يحتاج استضافة Node.js (وليس رفع ملفات HTML فقط).
                تأكد من تشغيل التطبيق بملف <code style={{ background: "#fff", padding: "2px 6px", borderRadius: 4 }}>server/index.js</code>
                {" "}وأن مسار <code style={{ background: "#fff", padding: "2px 6px", borderRadius: 4 }}>/api/health</code> يعمل.
              </>
            ) : (
              <>
                <strong>جاري تشغيل الخادم تلقائياً...</strong> إن لم يبدأ خلال 30 ثانية، شغّل يدوياً:
                <code style={{ margin: "0 8px", background: "#fff", padding: "2px 8px", borderRadius: 4 }}>npm run dev</code>
                — ستُحدَّث الصفحة تلقائياً عند الاتصال
              </>
            )}
          </div>
        )}

        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          <div style={{ flex: 1, overflow: "auto", padding: 20, minWidth: 0 }}>
            {showCredentials && (
              <CredentialsPanel
                waiting={!apiConfig?.configured}
                onConnected={handleCredentialsConnected}
                onClose={apiConfig?.configured ? () => setShowCredentials(false) : null}
              />
            )}
            {renderMainContent()}
          </div>
          <ResponsePanel
            response={response}
            loading={loadingResp}
            liveMode={liveMode}
            repeaterHistory={repeaterHistory}
            selectedRepeaterStep={selectedRepeaterStep}
            onSelectRepeaterStep={setSelectedRepeaterStep}
          />
        </div>

        <InterceptTerminal
          enabled={interceptEnabled}
          onToggle={handleToggleIntercept}
          lastLog={interceptLog}
          repeaterHistory={repeaterHistory}
          running={repeaterRunning}
          activeStep={repeaterActiveStep}
          onSelectStep={(request) => setSelectedRepeaterStep(request)}
        />
      </div>

      {showModal && (
        <UploadModal
          onClose={() => setShowModal(false)}
          onUpload={handleUpload}
          liveMode={liveMode}
          configured={apiConfig?.configured}
          interceptEnabled={interceptEnabled}
        />
      )}
    </div>
  );
}
