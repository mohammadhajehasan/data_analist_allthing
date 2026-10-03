# دليل النشر (Deployment) — منصة تحليل البيانات

دليلان كاملان: **عرض سريع مجاني** عبر Render، و**نشر دائم مجاني** عبر Oracle Cloud.

---

## قبل النشر — نقاط إلزامية

| النقطة | لماذا |
|---|---|
| `NODE_ENV=production` | الخادم يخدم واجهة `dist/` المبنية تلقائياً بدل Vite dev |
| `PUBLIC_BASE_URL=https://نطاقك` | روابط الدعوات في بريد Gmail يجب أن تشير لنطاقك العام، لا localhost |
| متغيرات البريد وGEMINI_API_KEY | تُضبط في لوحة المنصة السحابية، **لا ترفع ملف .env إلى Git أبداً** |
| البريد عبر API بدل SMTP | المنصة تدعم الآن 3 مزودين بالترتيب: **Brevo API** (`BREVO_API_KEY`) → **Resend API** (`RESEND_API_KEY`) → SMTP كاحتياط. واجهات HTTP تعمل حتى على المنصات التي تحظر SMTP الصادر (مثل Render المجاني) |

> **أيهما تختار للبريد؟** Brevo: مجاني 300 رسالة/يوم ويعمل بعنوان Gmail مُتحقق دون نطاق خاص — الأنسب للبدء. Resend: يتطلب نطاقاً مُتحققاً (أفضل تسليماً). يبقى SMTP (Gmail App Password) خياراً ثالثاً يعمل على VPS/Oracle فقط.
| مجلد `data/` | قاعدة بيانات SQLite — انظر تحذير Render أدناه |

---

## الخيار 1: Render (نشر في 5 دقائق — للتجربة والعرض)

> ⚠️ **تحذير جوهري:** الخطة المجانية في Render تستخدم قرصاً مؤقتاً — **كل بيانات SQLite (المستخدمون، الرسائل، المجموعات) تُمسح عند إعادة تشغيل الخدمة**. ممتاز للعرض والتجربة، غير صالح للاستخدام الفعلي مع بيانات حقيقية.

### الخطوات
1. ارفع المشروع إلى مستودع GitHub (بدون `.env`).
2. في https://dashboard.render.com: **New → Web Service** واربط المستودع.
3. الإعدادات (موجودة جاهزة أيضاً في [render.yaml](../render.yaml) بجذر المستودع — Render يكتشفه تلقائياً):
   - **Build Command:** `npm ci && npm run build`
   - **Start Command:** `node dist/server.cjs`
   - **Health Check Path:** `/api/health`
4. أضف متغيرات البيئة (Environment): `BREVO_API_KEY` (أو `RESEND_API_KEY` — **ضروري على Render لأنها تحظر SMTP الصادر**)، `OPENROUTER_API_KEY` (مفتاح الخادم الجماعي — يفعّل ميزات AI وشارة «AI جاهز» لكل المستخدمين حتى بلا مفاتيح شخصية)، `GEMINI_API_KEY`, `PUBLIC_BASE_URL` (رابط Render الذي سيعطيك إياه)، إلخ.
5. اضغط **Create Web Service** — بعد الدقيقتين ستحصل على رابط `https://your-app.onrender.com` يعمل من أي متصفح.

> ملاحظة: الخطة المجانية "تنام" بعد 15 دقيقة خمول — أول زائر بعد النوم ينتظر ~50 ثانية.
> ملاحظة: SMTP الصادر محظور في الخطة المجانية — دعوات البريد تعمل عبر `BREVO_API_KEY`/`RESEND_API_KEY` (HTTPS) تلقائياً بلا أي تغيير في الكود.

---

## الخيار 2: Oracle Cloud Always Free (دائم، مجاني للأبد، للإنتاج)

VM حقيقية بـ 4 أنوية ARM + 24GB RAM + 200GB قرص — تحمّل آلاف المستخدمين، وبياناتك دائمة.

### الخطوة أ — إنشاء الحساب وVM
1. سجّل في https://cloud.oracle.com (يطلب بطاقة للتحقق — لا تُخصم ضمن Always Free).
2. من القائمة: **Compute → Instances → Create Instance**.
3. اختر: **Image:** Ubuntu 22.04+ / **Shape:** `Ampere A1` (ARM) بـ **2 OCPU + 12GB** (يمكنك حتى 4/24 مجاناً).
4. نزّل **مفتاح SSH** (.key) واحفظه — لن يتكرر.
5. بعد الإنشاء انسخ **Public IP**.
6. ⚠️ مهم جداً: من **Instance Details → Subnet → Security List** أضف Ingress Rules لفتح المنافذ **80 و443** (TCP, 0.0.0.0/0) — بخلاف ذلك لن يصل أحد للموقع حتى لو كل شيء سليم.

### الخطوة ب — ربط نطاق
- إن كان لديك نطاق: أضف سجل **A** يشير للـ Public IP.
- بلا نطاق؟ يمكنك البدء بـ **nip.io** مؤقتاً (مثل `34-12-34-12.nip.io`) — لكن Let's Encrypt له حدود، فالأفضل نطاق حقيقي (متوفر بأسعار زهيدة).

### الخطوة ج — نقل الكود وتشغيل السكربت
```bash
ssh -i your-key.key ubuntu@<PUBLIC_IP>

# انقل الكود (استنساخ من GitHub الخاص أو رفع مباشر):
sudo mkdir -p /opt/analytics-platform && sudo chown ubuntu /opt/analytics-platform
git clone https://github.com/you/your-repo.git /opt/analytics-platform   # أوscp

cd /opt/analytics-platform
sudo bash deploy/oracle/setup-oracle.sh your-domain.com
# السكربت سيتوقف مرة واحدة لتملأ .env (النطاق + SMTP + المفاتيح) ثم تعيد تشغيله
```

### ما يفعله السكربت تلقائياً ([setup-oracle.sh](oracle/setup-oracle.sh))
1. Node.js 24 + nginx + certbot + sqlite3
2. بناء الواجهة والحزمة (`npm run build`)
3. **systemd**: تشغيل تلقائي عند الإقلاع + إعادة تشغيل عند الانهيار (`analytics.service`)
4. **nginx**: reverse proxy مع إعدادات SSE (بلا buffering — أساسي للتحديث اللحظي) ورفع صور حتى 60MB
5. **HTTPS مجاني** من Let's Encrypt مع تجديد تلقائي وتحويل قسري
6. **جدار حماية** ufw (80/443/SSH)
7. **نسخ احتياطي يومي** لقاعدة SQLite الساعة 3 فجراً مع الاحتفاظ بـ 14 يوماً

### الصيانة اليومية
```bash
sudo systemctl status analytics        # حالة الخدمة
journalctl -u analytics -f             # سجل مباشر
sudo systemctl restart analytics       # إعادة تشغيل
ls /opt/analytics-platform/backups/    # النسخ الاحتياطية
```

### تحديث التطبيق لاحقاً
```bash
cd /opt/analytics-platform
git pull
sudo systemctl stop analytics
npm ci && npm run build
sudo systemctl start analytics
```

### النشر التلقائي من GitHub (CI/CD) — [deploy.yml](../.github/workflows/deploy.yml)
كل دفعة إلى `main` تشغّل تلقائياً: typecheck + اختبارات + بناء تحققي، ثم النشر عبر SSH:
سحب الكود على الخادم → بناء → إعادة تشغيل systemd → فحص صحة `/api/health`
(مع نسخة أمان من قاعدة SQLite قبل كل نشر واحتفاظ 14 يوماً في `backups/`).

المطلوب مرة واحدة في GitHub: **Settings → Secrets and variables → Actions**:

| السر | القيمة |
|---|---|
| `ORACLE_SSH_HOST` | IP الخادم العام أو النطاق |
| `ORACLE_SSH_USER` | `ubuntu` (له sudo بلا كلمة مرور في صور أوراكل) |
| `ORACLE_SSH_KEY` | محتوى المفتاح الخاص كاملاً (PEM) |
| `ORACLE_SSH_PORT` | اختياري — الافتراضي 22 |

> يمكن أيضاً إطلاق النشر يدوياً في أي وقت من تبويب **Actions → Deploy to Oracle → Run workflow**.
> تنبيه: قاعدة البيانات `data/` غير متتبَّعة في Git عمداً — `git reset --hard` على الخادم لا يمسّها.

---

## التوسع لاحقاً (عند آلاف المستخدمين)

1. **البريد**: حدود Gmail SMTP (~500/يوم) أو حظر المنصات له — انتقل إلى Brevo (مجاني 300/يوم بعنوان Gmail) أو Resend (بتحسين التسليم عبر نطاقك) بإضافة `BREVO_API_KEY` أو `RESEND_API_KEY` إلى .env — يستخدمهما النظام تلقائياً قبل SMTP دون أي تغيير آخر.
2. **صور الرسائل**: نقل base64 إلى ملفات على القرص أو Object Storage — يصغّر قاعدة البيانات جذرياً.
3. **نسخ احتياطي خارجي**: ارفع مجلد `backups/` إلى Oracle Object Storage (مجاني 20GB).
4. **قاعدة بيانات**: إن تجاوزت التزامن حدود SQLite الواقعية (مئات الكتابة/ثانية) — الترحيل لـ PostgreSQL المحلي على نفس الـ VM لا يزال مجانياً.

## ملفات الحزمة
- [Dockerfile](Dockerfile) — صورة إنتاج (لأي مزود يدعم Docker)
- [../render.yaml](../render.yaml) — مخطط Render الجاهز (بجذر المستودع ليكتشفه Render تلقائياً)
- [oracle/setup-oracle.sh](oracle/setup-oracle.sh) — سكربت الإعداد الشامل لأوراكل
- [../.github/workflows/deploy.yml](../.github/workflows/deploy.yml) — النشر التلقائي عبر GitHub Actions
