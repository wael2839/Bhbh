# نشر على Hostinger — حل 503

## ماذا تعني صفحة 503؟

الصفحة العامة `Service Unavailable` من Hostinger = **تطبيق Node لا يعمل**.
ليست مشكلة في React أو المتصفح.

**السبب الشائع لـ 503:** `"type": "module"` في `package.json` يكسر نظام بناء Hostinger (`ERR_REQUIRE_ESM`). تم إزالته — Entry file: `app.cjs`.

## الإعدادات في hPanel (Deployments → Settings)

| الحقل | القيمة |
|-------|--------|
| Framework | **Express.js** |
| Build command | `npm install && npm run build` |
| Start command | `npm start` |
| **Entry file** | **`app.cjs`** |
| Output directory | `dist` |
| Node.js | 20.x |

ثم: **Settings & Redeploy** → **Restart**

## تحقق

1. `https://bahbah.waelaloush.com/api/health` → يجب `{"ok":true}`
2. إن ظهر `mode:"fallback"` و`bootError` — انسخ الرسالة وأرسلها

## إن استمر 503

### أ) تأكد من نوع الموقع
**Websites → bahbah** يجب أن يكون **Node.js Web App** وليس WordPress.

### ب) اقرأ السجل
- **Deployments → Runtime logs**
- **File Manager** → مجلد `nodejs` → `stderr.log`

### ج) تواصل مع دعم Hostinger
قل لهم: «Node.js app returns 503, build succeeds, need help checking if process starts on PORT env variable. Entry file: app.cjs»

## بديل سريع
إن تعذّر الإصلاح على Hostinger، جرّب [Render.com](https://render.com) (مجاني) مع نفس مستودع GitHub.
