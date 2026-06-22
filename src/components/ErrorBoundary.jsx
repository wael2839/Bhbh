import { Component } from "react";

export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          padding: 32, fontFamily: "Segoe UI, sans-serif", direction: "rtl",
          maxWidth: 560, margin: "40px auto", lineHeight: 1.7,
        }}>
          <h1 style={{ color: "#dc2626", fontSize: 20 }}>خطأ في تحميل اللوحة</h1>
          <p style={{ color: "#475569" }}>{this.state.error.message}</p>
          <pre style={{
            background: "#f8fafc", padding: 16, borderRadius: 8,
            fontSize: 12, overflow: "auto", direction: "ltr",
          }}>
            {this.state.error.stack}
          </pre>
          <p style={{ color: "#64748b", fontSize: 14 }}>
            جرّب: أوقف الطرفية ثم من مجلد المشروع:
            <code style={{ display: "block", marginTop: 8, background: "#f1f5f9", padding: 8 }}>
              npm run dev
            </code>
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
