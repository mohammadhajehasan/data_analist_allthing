# Ollama & FreeLLMAPI على Render — الدليل الكامل

## المشكلة الأساسية

```
localhost:11434 (Ollama)  ←── لا يصل من Render
localhost:31415 (FreeLLMAPI) ←── لا يصل من Render
```

Render containers معزولة — لا يمكنها الوصول إلى `127.0.0.1` أو `localhost` من خارج الحاوية.

---

## الحل 1: Docker Compose (الأنسب — Render付费 plan)

### المتطلبات
- خطة Render مدفوعة تدعم Docker (حوالي $7/شهرياً)
- أو استخدام **Railway** / **Fly.io** (كلها تدعم multi-container)

### الخطوات

```bash
# 1. انسخ الملفات المضافة إلى المشروع
#    - deploy/docker-compose.yml
#    - deploy/Dockerfile (محدث)

# 2. اختبر محلياً قبل النشر
docker-compose up --build -d

# 3. تأكد من عمل كل شيء
curl http://localhost:3000/api/health
curl http://localhost:11434/api/tags        # Ollama
curl http://localhost:31415/v1/models       # FreeLLMAPI

# 4. ارفع إلى GitHub
git add docker-compose.yml deploy/Dockerfile
git commit -m "feat: add Docker Compose for Ollama/FreeLLMAPI"
git push

# 5. على Render: أنشئ Web Service جديد
#    - Source: نفس المستودع
#    - Dockerfile Path: docker-compose.yml
#    - Environment Variables:
#        GEMINI_API_KEY=<your-key>
#        OPENROUTER_API_KEY=<your-key>
#        BREVO_API_KEY=<your-key>
#        PUBLIC_BASE_URL=https://your-app.onrender.com
```

### هيكل Docker Compose

```
analytics-platform :3000
├── depends_on: ollama (http://ollama:11434)
├── depends_on: freellmapi (http://freellmapi:31415)
│
ollama              ← حاوية Ollama مستقلة
└── Volume: /root/.ollama (بيانات النماذج دائمة)
│
freellmapi          ← حاوية FreeLLMAPI Router
└── يربط بـ Ollama تلقائياً
```

---

## الحل 2: Railway.app (مجاني للتجربة — Multi-Container)

Railway يدعم عدة خدمات في مشروع واحد مع شبكة داخلية مشتركة.

### الخطوات

```bash
# 1. نصّب railway CLI
npm install -g @railway/cli

# 2. سجل الدخول
railway login

# 3. أنشئ مشروع جديد
railway init
railway add           # أضف خدمة Ollama
railway add           # أضف خدمة FreeLLMAPI
railway add           # أضف خدمة Analytics Platform

# 4. ارفع الكود
railway push

# 5. اضبط المتغيرات البيئية
railway variables set GEMINI_API_KEY=...
railway variables set OPENROUTER_API_KEY=...
```

### إعداد Railway.app
في لوحة Railway Dashboard:
- **Service 1** (`ollama`): Image = `ollama/ollama:latest`, Command = `ollama serve --host 0.0.0.0 --port 11434`
- **Service 2** (`freellmapi`): Image = `ghcr.io/freellmapi/freellmapi:latest`, Port = `31415`
- **Service 3** (`analytics-platform`): Variable = `OLLAMA_ENDPOINT_URL=http://ollama:11434`

---

## الحل 3: VPS مع ngrok (أسهل حل مؤقت)

### على VPS (Oracle Free Tier / DigitalOcean)

```bash
# 1. ثبت Ollama على الـ VPS
curl -fsSL https://ollama.ai/install.sh | sh

# 2. شغل Ollama
ollama serve &
ollama pull qwen2.5-coder:7b

# 3. ثبت ngrok
# https://dashboard.ngrok.com/get-started/linux
ngrok config add-authtoken <token>

# 4. أنشئ tunnel
ngrok http 11434

# 5. انسخ الرابط الناتج (مثل https://abc123.ngrok.io)
# وأضفه في Render:
# OLLAMA_ENDPOINT_URL=https://abc123.ngrok.io
```

---

## الحل 4: استخدام Cloud AI فقط (Render مجاني — بدون Ollama)

إذا كنت تريد استخدام **الخطة المجانية** من Render:

### الإعدادات المطلوبة في Render Dashboard

| المتغير | القيمة |
|---------|--------|
| `GEMINI_API_KEY` | `<مفتاح حقيقي من aistudio.google.com>` |
| `OPENROUTER_API_KEY` | `<مفتاح من openrouter.ai>` |
| `BREVO_API_KEY` | `<مفتاح من brevo.com>` |
| `PUBLIC_BASE_URL` | `https://data-analist-allthing.onrender.com` |

### ملاحظة مهمة
- ❌ **Ollama لن يعمل** على الخطة المجانية من Render
- ✅ **Gemini + OpenRouter** سيعملان بشكل كامل
- ✅ كل ميزات NL2SQL والتحليل ستعمل

---

## الحل 5: Oracle Cloud Always Free (الإنتاج الحقيقي)

Oracle يعطيك VM ARM مجانية (4 cores + 24GB RAM) — يمكنك تثبيت Ollama مباشرة عليها!

### الخطوات

```bash
# SSH إلى الـ VPS
ssh -i key.pem ubuntu@<PUBLIC_IP>

# نصّب Ollama
curl -fsSL https://ollama.ai/install.sh | sh

# نصّب FreeLLMAPI
git clone https://github.com/nikoksr/freeLLMAPI.git /opt/freellmapi
cd /opt/freellmapi && npm install

# أنشئ خدمة systemd لـ Ollama
sudo tee /etc/systemd/system/ollama.service << 'EOF'
[Unit]
Description=Ollama Service
After=network-online.target

[Service]
ExecStart=/usr/local/bin/ollama serve --host 0.0.0.0
User=ollama
Group=ollama
Restart=always
RestartSec=3

[Install]
WantedBy=default.target
EOF

sudo systemctl enable ollama && sudo systemctl start ollama

# نصّب التطبيق
cd /opt/analytics-platform
npm ci --omit=dev
npm run build

# أنشئ خدمة النظام
sudo tee /etc/systemd/system/analytics.service << 'EOF'
[Unit]
Description=AI Analytics Platform
After=network.target

[Service]
WorkingDirectory=/opt/analytics-platform
ExecStart=/usr/bin/node dist/server.cjs
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=OLLAMA_ENDPOINT_URL=http://localhost:11434
Environment=FREELLMAPI_ENDPOINT=http://localhost:31415/v1
Restart=always
User=ubuntu

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl enable analytics && sudo systemctl start analytics
```

---

## ملخص الحلول

| الحل | التكلفة | Ollama | FreeLLMAPI | الصعوبة |
|------|---------|--------|------------|----------|
| Docker Compose على Render | ~$7/شهر | ✅ | ✅ | سهل |
| Railway.app | مجاني/رخيص | ✅ | ✅ | متوسط |
| Oracle VPS + ngrok | مجاني (VPS) | ✅ | ✅ | صعب |
| Cloud AI فقط (Render مجاني) | مجاني | ❌ | ❌ | سهل جداً |
| Oracle Always Free | مجاني | ✅ | ✅ | متوسط |

---

## ملفات الإضافة

| الملف | الوصف |
|-------|-------|
| `docker-compose.yml` | تشغّل كل الخدمات معاً محلياً أو على أي SaaS يدعم Docker |
| `deploy/render-compose.yml` | نسخة معدّلة خصيصاً لـ Render |
| `deploy/start-ollama-local.sh` | تشغيل Ollama محلياً على Linux/Mac |
| `deploy/start-ollama-local.bat` | تشغيل Ollama محلياً على Windows |
| `deploy/ollama-railway.sh` | دليل إعداد Railway |
| `deploy/DEPLOYMENT.md` | دليل النشر الكامل (محدث) |
