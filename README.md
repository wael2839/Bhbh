# لوحة مدد — Mudad Dashboard

لوحة تحكم عربية لإدارة ملفات حماية الأجور (WPS) عبر واجهة `api.mudad.sa`، مع وضع محاكاة للتجربة بدون اعتماد.

## التشغيل السريع

```bash
npm install
cp .env.example .env   # ثم املأ القيم
npm run dev
```

- الواجهة: http://localhost:5173
- الخادم الوسيط: http://localhost:3001

## إعداد الاعتماد

1. سجّل الدخول إلى [mudad.com.sa](https://mudad.com.sa)
2. افتح DevTools → Network
3. نفّذ أي عملية (عرض الملفات، رفع ملف)
4. انسخ الرؤوس والمسارات إلى ملف `.env`:

| المتغير | المصدر |
|---------|--------|
| `MUDAD_BEARER_TOKEN` | رأس `bearer_token` |
| `MUDAD_API_KEY` | رأس `x-apikey` |
| `MUDAD_ORG_ID` | رأس `organizationid` |
| `MUDAD_SESSION_ID` | رأس `session_id` |
| `MUDAD_FILES_PATH` | مسار GET لقائمة الملفات |
| `MUDAD_UPLOAD_PATH` | مسار POST لرفع الملف |
| `MUDAD_FILE_DETAIL_PATH` | مسار تفاصيل الملف (استخدم `{id}`) |

> ⚠️ الاعتماد ينتهي صلاحيته — حدّث `.env` عند انتهاء الجلسة.

## الأوضاع

- **وضع المحاكاة** (افتراضي بدون `.env`): بيانات وهمية + استجابات API تجريبية
- **API حقيقي**: يُفعّل تلقائياً عند اكتمال الاعتماد و`MUDAD_FILES_PATH`

## البناء للإنتاج

```bash
npm run build
npm start
```

يفتح موقع واحد على المنفذ `PORT` (افتراضي 3001) — الواجهة + API معاً.

## النشر على الاستضافة (بدون أوامر SSH)

هذا المشروع **لا يعمل** على استضافة ملفات ثابتة فقط (رفع `index.html` أو مجلد `src/` يسبب خطأ MIME).

على **جهازك** (مرة واحدة):

```bash
npm install
npm run pack
```

ينتج ملف `mudad-deploy.zip` جاهز للرفع. ثم من لوحة الاستضافة (cPanel → Node.js أو ما يعادلها):

1. ارفع `mudad-deploy.zip` وفكّه في مجلد التطبيق
2. ملف التشغيل: `server.js`
3. أضف متغيرات البيئة من `.env.example`
4. شغّل التطبيق من اللوحة (Restart)

تحقق: `https://موقعك.com/api/health` → `{"ok":true}`

## النشر عبر GitHub

### 1) رفع المشروع إلى GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/USERNAME/mudad-dashboard.git
git push -u origin main
```

> **مهم:** ملف `.env` مُستثنى من Git (موجود في `.gitignore`) — لا ترفع الاعتماد إلى GitHub.

### 2) Render.com (موصى به — مجاني)

1. أنشئ حساباً على [render.com](https://render.com) واربط حساب GitHub
2. **New** → **Blueprint** → اختر المستودع (يقرأ `render.yaml` تلقائياً)
   - أو **New Web Service** يدوياً:
     - **Build Command:** `npm ci && npm run build`
     - **Start Command:** `npm start`
     - **Health Check Path:** `/api/health`
3. **Environment** → أضف المتغيرات من `.env.example`:
   - `MUDAD_BEARER_TOKEN`, `MUDAD_API_KEY`, `MUDAD_ORG_ID`, `MUDAD_SESSION_ID`, `MUDAD_FILES_PATH`, …
4. **Deploy** — كل `git push` يعيد النشر تلقائياً

### 3) Railway.app (بديل)

1. [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo**
2. اختر المستودع — Railway يكتشف Node تلقائياً
3. **Settings** → **Build Command:** `npm ci && npm run build`
4. **Start Command:** `npm start`
5. **Variables** → أضف متغيرات `.env`
6. **Generate Domain** للحصول على رابط عام

### 4) Hostinger (bahbah.waelaloush.com)

**تنبيه:** إذا رأيت في الرابط `LSCWP_CTRL` فالنطاق ما زال مربوطاً بـ **WordPress + LiteSpeed** وليس بتطبيق Node. يجب حذف موقع WordPress من هذا النطاق وإنشاء **Node.js Web App** جديد (راجع [دليل Hostinger](https://www.hostinger.com/support/how-to-deploy-a-nodejs-website-in-hostinger/)).

في **hPanel → Websites → Dashboard → Deployments → Settings**:

| الإعداد | القيمة |
|---------|--------|
| Framework | **Express** |
| Build command | `npm install && npm run build` |
| Start command | `npm start` |
| Entry file | `loader.cjs` |
| Output directory | `dist` |
| Node.js version | 20.x |

ثم **Settings & Redeploy**.

**إذا استمر 503** — افتح بالترتيب:
1. **Deployments → Runtime logs** — ابحث عن `[mudad] فشل التشغيل`
2. **File Manager → stderr.log** في مجلد التطبيق
3. تأكد أن حالة التطبيق **Running** وليس Stopped

تحقق: `https://bahbah.waelaloush.com/api/health` → `{"ok":true}`

> تحذيرات `contentscript.js` من إضافة المتصفح — تجاهلها.

### 5) cPanel مع Git

إن دعمت استضافتك **Git Version Control**:

1. Clone المستودع إلى مجلد التطبيق
2. من **Setup Node.js App**: startup file = `server.js`
3. **Run NPM Install** ثم **Run JS script** أو SSH مرة واحدة: `npm run build`
4. متغيرات البيئة من لوحة Node.js
5. عند التحديث: **Pull** من Git ثم **Restart**

## هيكل المشروع

```
server/index.js      ← خادم وسيط (proxy) لـ api.mudad.sa
src/MudadDashboard.jsx ← الواجهة الرئيسية
src/api/mudad.js     ← دوال الاتصال بالخادم
```
