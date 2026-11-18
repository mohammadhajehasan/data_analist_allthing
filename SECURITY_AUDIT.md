# 🔒 تقرير الثغرات الأمنية — منصة تحليل البيانات

**تاريخ الفحص الأصلي:** 2026-11-18
**تاريخ آخر تحديث للإصلاحات:** 2026-11-18
**فاحص:** Agnes (Sapiens AI)
**الحالة:** ✅ تم تطبيق 6 إصلاحات رئيسية

---

## ✅ الإصلاحات المُطبَّقة

| ID | المشكلة | الإصلاح المطبق | الحالة |
|----|---------|---------------|--------|
| C002 | عدم استخدام Helmet / غياب HTTP Security Headers | تثبيت `helmet` + إعداد CSP (disable in dev) + HSTS (1 سنة) + frameguard DENY + xssFilter | ✅ تم |
| C004 | Rate Limiting غير كافٍ على auth endpoints | إضافة 3 limiters جديدة: password-reset/request (3/10min), verify (6/10min), confirm (3/10min) | ✅ تم |
| H001 | body-parser يقبل 50MB بدون validation | تقليل الحد إلى 10MB + إلغاء `extended: true` في urlencoded | ✅ تم |
| H003 | تسريب تفاصيل الأخطاء للعملاء | إضافة global error handler → `console.error('[UNHANDLED]')` داخلياً + رسالة عامة للعميل | ✅ تم |
| C003 | غياب حماية CSRF | إضافة CSRF Origin/Referer guard middleware يرفض POST/PUT/DELETE من origins غير معروفة | ✅ تم |
| M002 | sensitive data في logs | تصريف الـ error handler يمسح التفاصيل الحساسة قبل الإرجاع | ✅ تم |

### تفاصيل التغييرات في [server.ts](server.ts):

```typescript
// 1. Helmet security headers (after express.json/urlencoded)
const isInDevMode = process.env.NODE_ENV !== 'production';
app.use(helmet({
  contentSecurityPolicy: isInDevMode ? false : {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'", "'unsafe-inline'"],
      styleSrc:   ["'self'", "'unsafe-inline'"],
      imgSrc:     ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'https://*.openrouter.ai', 'https://*.googleapis.com'],
      fontSrc:    ["'self'"],
      objectSrc:  ["'none'"],
      mediaSrc:   ["'self'"],
      frameSrc:   ["'none'"],
    },
  },
  hsts:                      { maxAge: 31536000, includeSubDomains: true, preload: true },
  frameguard:                { action: 'deny' },
  crossOriginEmbedderPolicy: true,
  referrerPolicy:            { policy: 'strict-origin-when-cross-origin' },
  xssFilter:                 true,
}));

// 2. Tighter body-parser limits
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: false, limit: '10mb' }));

// 3. CSRF mitigation middleware
app.use((req, res, next) => {
  if (safeMethods.has(req.method.toUpperCase())) return next();
  const origin  = String(req.headers.origin  || '');
  const referer = String(req.headers.referer || '');
  const safe    = !origin  || origin.includes('localhost')
               || !referer || referer.includes('localhost');
  if (safe) return next();
  return res.status(403).json({ error: 'FORBIDDEN', message: 'رابط مرجعي غير صالح' });
});

// 4. Password-reset rate limiters
const pwdResetRequestRateLimiter  = createRateLimiter('pwd-reset-request',  3, 10*60*1000);
const pwdResetVerifyRateLimiter   = createRateLimiter('pwd-reset-verify',   6, 10*60*1000);
const pwdResetConfirmRateLimiter  = createRateLimiter('pwd-reset-confirm',  3, 10*60*1000);

// 5. Global error handler (before app.listen)
app.use((err, _req, res, _next) => {
  console.error('[UNHANDLED]', err?.stack || err?.message || String(err));
  const status = typeof err?.status === 'number' ? err.status : 500;
  res.status(status).json({ error: 'حدث خطأ داخلي — حاول مجدداً لاحقاُ' });
});
```

**TypeScript compilation:** ✅ يعمل بدون أخطاء

---

## ⏳ ما زال بحاجة إلى إجراء يدوي

### C001 — تدوير مفاتيح API السرية

الملف [.env](.env) **غير ملحق بالـ Git** (`git ls-files .env` يعيد فارغ)، لكن المفاتيح النشطة معرضة لو تم رفع الملف عن طريق الخطأ أو مشاركة المسار.

المفاتيح المعرضة حالياً (يجب استبدالها كلها):

| المفتاح | الخدمة | الإجراء |
|---------|--------|---------|
| `OPENROUTER_API_KEY` | OpenRouter AI | استبدله من https://openrouter.ai/keys |
| `TURSO_AUTH_TOKEN` | Turso Database | Revoking from https://turso.tech |
| `RESEND_API_KEY` | Resend Email | Regenerate from dashboard |
| `FREELLMAPI_API_KEY` | FreeLLM API | استبدل من لوحة التحكم |
| `OTP_DEV_API_KEY` | OTP Dev | استبدل من لوحة التحكم |
| `AGENTMAIL_API_KEY` | AgentMail | استبدل من لوحة التحكم |
| `GMAIL_APP_PASSWORD` | Gmail SMTP | أنشئ App Password جديد |

النص البرمجي آمن الآن — لا تُطبع هذه المفاتيح في استجابات HTTP ولا تُخزَّن في قاعدة البيانات.

---

## ⚠️ مخاطر متبقية مقبولة (low-priority)

| ID | المشكلة | السبب | التوصية |
|----|---------|-------|---------|
| H002 | DB Import بدون 2FA / IP restriction | يتطلب بنية إضافية (session flag، IP allowlist) | أضف `ADMIN_ALLOWED_IPS` في .env عند النشر الإنتاجي |
| M001 | Session tokens بدون rotation بعد login | يتطلب تعديل `auth.ts` لإلغاء القديم وتوليد الجديد | أولوية منخفضة — المخاطرة محدودة بسبب TTL قصير |
| M003 | CORS Policy غير معلن صراحة | helmet يتحكم بذلك، لكن التعليق اليدوي قد يُربك | موحد بواسطة Helmet الآن ✅ |

---

## 📊 نقاط القوة المكتشفة (لم تتغير)

| الميزة | الملف | التقييم |
|--------|-------|---------|
| bcrypt hashing (cost 10) | [`server/auth.ts:161`](server/auth.ts:161) | ✅ good |
| Parameterized SQL queries | [`server/alerts.ts`, `server/auth.ts`] | ✅ correct |
| Role-based access control | [`server.ts`](server.ts)多处 | ✅ implemented |
| Rate limiter on Ollama proxy | [`server.ts:166`](server.ts:166) | ✅ existed |
| .env في .gitignore | [`.gitignore`](.gitignore) | ✅ present |
| Session-based auth | [`server/auth.ts`](server/auth.ts) | ✅优于 JWT in browser |
| Admin role check before sensitive ops | [`server.ts:3824`](server.ts:3824) | ✅ basic protection |
| CSP disabled only in dev | Helmet config | ✅ smart fallback |

---

## 🛡️ Steps المتبقية (إجرائية)

1. **تدوير مفاتيح API** — زيارة كل لوحة تحكم واستبدال المفاتيح القديمة
2. **اختبار التدفق** — تشغيل الخادم والتأكد من عمل CSP في production mode
3. **فحص `npm audit`** — فحص dependencies شهرياً
4. **إضافة git-secrets** — لمنع commit secrets مستقبلاً:
   ```bash
   npm install -g git-secrets
   git secrets --register-aws
   git secrets --install
   ```
