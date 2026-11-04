# AI Multi-Provider Integration Guide | دليل ربط وإعدادات مزودات الذكاء الاصطناعي

An enterprise-grade, bilingual guide for configuring, testing, and proxying custom Large Language Model (LLM) providers within the AI Data Analytics Platform. This guide explains how the system handles cloud engines (Gemini, OpenRouter), local zero-egress models (Ollama, Private OpenAI-compatible gateways), CORS preflight resolution, and client-server synchronization.

دليل مؤسسي شامل لتهيئة واختبار وتوجيه مزودات نماذج اللغة الضخمة (LLM) المخصصة داخل منصة تحليل البيانات الذكية. يشرح هذا الدليل كيفية التعامل مع المحركات السحابية (Gemini، OpenRouter)، النماذج المحلية فائقة الخصوصية (Ollama، بوابات OpenAI المتوافقة)، وتجاوز قيود CORS ومزامنة الإعدادات.

---

## Table of Contents | جدول المحتويات
1. [Architecture Overview | نظرة عامة على البنية الهيكلية](#1-architecture-overview--نظرة-عامة-على-البنية-الهيكلية)
2. [Data Schema & Persistent State | هيكل البيانات وحالة الحفظ](#2-data-schema--persistent-state--هيكل-البيانات-وحالة-الحفظ)
3. [Server-Side Connection Testing API | واجهة اختبار الاتصال البرمجية](#3-server-side-connection-testing-api--واجهة-اختبار-الاتصال-البرمجية)
4. [Bypassing CORS via Server-Side Proxy | تجاوز قيود CORS عبر التوجيه العكسي](#4-bypassing-cors-via-server-side-proxy--تجاوز-قيود-cors-عبر-التوجيه-العكسي)
5. [Integrating Custom OpenAI-Compatible Endpoints | ربط خوادم OpenAI المتوافقة والمخصصة](#5-integrating-custom-openai-compatible-endpoints--ربط-خوادم-openai-المتوافقة-والمخصصة)
6. [Data Privacy & Schema Masking Guardrails | سياسات الخصوصية وحجب البيانات](#6-data-privacy--schema-masking-guardrails--سياسات-الخصوصية-وحجب-البيانات)
7. [Respan Gateway (Local Loopback Gateway) | بوابة Respan المحلية](#7-respan-gateway-local-loopback-gateway--بوابة-respan-المحلية)

---

## 1. Architecture Overview | نظرة عامة على البنية الهيكلية

The platform implements a unified, multi-provider LLM orchestration layer that decouples analytical clients from specific model provider backends. Users can switch their global active model with sub-second responsiveness.

تعتمد المنصة على طبقة تنسيق موحدة تدعم تعدد مزودي النماذج، مما يفصل واجهات التحليل الأمامية عن خوادم الذكاء الاصطناعي الخلفية. يتيح ذلك للمستخدمين التبديل الفوري بين النماذج النشطة.

```
       ┌────────────────────────────────────────────────────────┐
       │             Client Web UI (React SPA)                  │
       └─────────────────────────┬──────────────────────────────┘
                                 │
                     HTTP / JSON │ (Auto-Routes Local/CORS targets)
                                 ▼
       ┌────────────────────────────────────────────────────────┐
       │             Express Full-Stack Server                  │
       │                   (Port 3000)                          │
       └──────────┬──────────────────┬───────────────────┬──────┘
                  │                  │                   │
                  ▼                  ▼                   ▼
           [Google Gemini]    [Ollama Proxy]     [OpenAI Compatible]
             (Cloud API)    (:11434 Engine/Tags)   (vLLM / LM Studio /
                                                     OpenRouter Gateway)
```

---

## 2. Data Schema & Persistent State | هيكل البيانات وحالة الحفظ

The AI state is managed by the `AppContext` React Provider and persisted inside the client browser's `localStorage` (key: `carbon_ai_settings`) as JSON.

يتم إدارة حالة المحركات عبر مزود الحالة `AppContext` ومزامنتها محلياً في متصفح المستخدم تحت المفتاح `carbon_ai_settings`.

### JSON Structure (`AISettings`) | هيكل البيانات
```json
{
  "activeProvider": "gemini",
  "activeModel": "gemini-3.7-flash",
  "privacyMode": "hybrid",
  "comparisonDefaults": [
    "gemini-3.7-flash",
    "ollama/qwen2.5-coder:7b"
  ],
  "providers": {
    "ollama": {
      "providerId": "ollama",
      "name": "Ollama Local Engine",
      "enabled": true,
      "endpointUrl": "http://localhost:11434",
      "defaultModelId": "ollama/qwen2.5-coder:7b",
      "status": "unconfigured",
      "isLocalOnly": true,
      "description": "100% Local zero-data-egress engine."
    },
    "custom_openai": {
      "providerId": "custom_openai",
      "name": "Custom OpenAI-Compatible API",
      "enabled": true,
      "endpointUrl": "http://localhost:8000/v1",
      "defaultModelId": "custom_openai/default",
      "status": "unconfigured",
      "apiKey": "sk-local-key",
      "isLocalOnly": true
    }
  }
}
```

---

## 3. Server-Side Connection Testing API | واجهة اختبار الاتصال البرمجية

To verify that local or cloud-hosted engines are running and reachable, the platform provides a unified endpoint `/api/ai/test-connection`. This endpoint handles specific authentication protocols and pings targets without leaking client-side credentials.

للتحقق من تشغيل محركات الذكاء الاصطناعي وقابليتها للاتصال، توفر المنصة نقطة نهاية موحدة `/api/ai/test-connection` تقوم باختبار الاتصال والتحقق من صحة مفاتيح التعريف وعناوين الخوادم بأمان.

### API Specification | مواصفات واجهة البرمجة
* **Endpoint / الرابط**: `/api/ai/test-connection`
* **Method / الطريقة**: `POST`
* **Content-Type**: `application/json`

#### Request Payload | جسم الطلب
```json
{
  "provider": "custom_openai",
  "endpointUrl": "http://localhost:8000/v1",
  "apiKey": "optional-key-here",
  "model": "default"
}
```

#### Success Response | استجابة النجاح (Ollama)
```json
{
  "status": "connected",
  "latencyMs": 142,
  "models": ["qwen2.5-coder:7b", "deepseek-r1:8b"],
  "isLocal": true,
  "message": "Connected to Ollama at http://localhost:11434. Found 2 installed models."
}
```

#### Error Response (with Cloud Environment Notice) | استجابة الخطأ (مع إشعار بيئة السحاب)
If testing `localhost` from a Cloud deployment (e.g. Google Cloud Run), the server detects the hostname discrepancy and flags diagnostic help:

في حال فحص عنوان محلي `localhost` من خادم سحابي، يكتشف النظام ذلك تلقائياً ويقوم بتوجيه إرشاد تشخيصي للمستخدم:
```json
{
  "status": "error",
  "latencyMs": 12,
  "message": "The app backend runs in a Cloud Run container, so http://localhost:11434 checks the cloud container rather than your local PC.",
  "isLocalhostNotice": true,
  "diagnosticAr": "خادم التطبيق يعمل في بيئة Cloud Run، لذلك فإن localhost تشير إلى حاوية السحابة وليس جهازك الشخصي. يرجى استخدام ngrok أو تفعيل Gemini المدمج.",
  "diagnosticEn": "The app backend runs in a Cloud Run container, so http://localhost:11434 checks the cloud container rather than your local PC. Use ngrok or switch to Gemini."
}
```

---

## 4. Bypassing CORS via Server-Side Proxy | تجاوز قيود CORS عبر التوجيه العكسي

### The Challenge | التحدي
Browsers block direct requests from Web interfaces to local URLs (`http://localhost:11434` or local IP subnets) due to **CORS (Cross-Origin Resource Sharing) Preflight Constraints**. Directly calling these endpoints from React would result in silent connection failures or CORS block errors.

تحظر متصفحات الويب الطلبات المباشرة من الواجهات الرسومية إلى الروابط المحلية بسبب قيود CORS للمنشأ المشترك. استدعاء هذه الروابط مباشرة من طبقة React يؤدي إلى فشل صامت للاتصال.

### The Solution | الحل
The platform wraps all requests directed towards local engines using `aiFetchProxy()`. It intercepts calls and seamlessly pipes them through a secure, server-side gateway:

تقوم المنصة بتغليف كافة طلبات الاستدعاء المحلية آلياً وتوجيهها عبر بوابة خلفية آمنة على الخادم:

* **Internal Routing Endpoint**: `/api/proxy/ollama`
* **Method**: `POST`

#### Proxy Wrapper Implementation | محاكاة التغليف في الخدمة:
```typescript
import { aiFetchProxy } from '../services/aiService';

// Automatically routes localhost:11434 calls to server-side proxy
const response = await aiFetchProxy('http://localhost:11434/api/generate', {
  method: 'POST',
  body: JSON.stringify({
    model: 'qwen2.5-coder:7b',
    prompt: 'SELECT * FROM table;'
  })
});
```

---

## 5. Integrating Custom OpenAI-Compatible Endpoints | ربط خوادم OpenAI المتوافقة والمخصصة

You can easily integrate custom private deployments running on **vLLM**, **LM Studio**, **LocalAI**, **llama.cpp**, or proprietary enterprise gateways adhering to the OpenAI schema.

يمكنك بسهولة ربط الخوادم الخاصة والمغلقة العاملة بواسطة حزم vLLM أو LM Studio أو LocalAI أو أي بوابة مؤسسية تدعم مواصفات OpenAI.

### Configuration Steps | خطوات الإعداد
1. Go to **AI Model Configuration (إعدادات نماذج الذكاء الاصطناعي)**.
2. Select **Custom OpenAI / vLLM (خادم خاص مخصص)**.
3. Configure the parameters:
   * **Base Endpoint URL**: Enter the OpenAI-compatible route (e.g. `http://localhost:8000/v1` or `https://llm.enterprise.internal/v1`).
   * **API Key**: If authentication is required, provide the bearer token. For local LM Studio / vLLM setups, a mock string (like `not-needed`) can be used.
   * **Default Model Identifier**: Set the target model string (e.g. `qwen2.5-coder-32b`).
4. Click **Verify & Save Connection (التحقق وحفظ الاتصال)**.

---

## 6. Data Privacy & Schema Masking Guardrails | سياسات الخصوصية وحجب البيانات

The platform provides a strict multi-tier privacy selector that governs data egress policies:

توفر المنصة ثلاثة مستويات صارمة من الخصوصية للتحكم بحدود خروج البيانات والمخططات الهيكلية:

| Privacy Mode | الخصوصية | Metadata Shared | التوجيه الفعلي | Egress Policy |
| :--- | :--- | :--- | :--- | :--- |
| **Strict Local** | محلي صارم | Zero | Local Ollama / vLLM | **0% Cloud Egress**. Absolute compliance for government or banking datasets. |
| **Smart Hybrid** | هجين ذكي | Masked | Cloud Gemini / OpenRouter | Schema and tables are dynamically anonymized (masking columns & names) before transmission. |
| **Cloud Allowed** | سحابي كامل | Standard | Enterprise Gemini Cloud | High-speed, full reasoning capabilities on high-performance cloud infrastructure. |

---

## 7. Respan Gateway (Local Loopback Gateway) | بوابة Respan المحلية

[Respan Gateway](https://github.com/respanai/respan-gateway?utm_source=freebuff&utm_medium=paid&utm_campaign=respan-gateway&bfcid=bfc_1.eyJpZCI6IjVlOTUzN2JiLTczYTktNDA1OC04ZWEzLTUyNGZiOTNiMzBjNiIsImMiOiIyMDM2ODZkZS1mMzg0LTQ4NTQtYmViNC1hYzBiYWRmNmM1NTUiLCJrIjoiM2IxMGE4YmUtNzgyOS00MmJhLWFmNmEtYmI0YWUxZTRhY2Y4IiwiaWF0IjoxNzkzNTIyMDkyfQ.rmjjdrxmWK53NCDJre2c8At7fednpfwmxCtGw_uI9po) is an open-source LLM gateway: the app sends one OpenAI-compatible request and the gateway forwards it to the vendor that owns the model, translating between the OpenAI, Anthropic and Gemini formats. It runs on the developer's own provider keys — no Respan account, hosted credits or deployment is needed.

بوابة Respan مفتوحة المصدر تعمل كعملية محلية: التطبيق يرسل طلباً واحداً بصيغة OpenAI والبوابة تمرّره إلى المزوّد الذي يملك النموذج مع ترجمة الصيغ بين OpenAI و Anthropic و Gemini. تعمل بمفاتيح المزودين الموجودة لديك بالفعل ولا تحتاج حساباً أو رصيداً مدفوعاً.

### How it is wired | كيف تم ربطها

* `server/respanGateway.ts` — starts the sidecar (`python -m respan_gateway serve --listen 127.0.0.1:<port> --log off`), waits for it to answer, and sends each call to `<url>/v1/chat/completions`. It is loopback only; the port is free by default.
* `callUniversalAI()` in `server.ts` — every AI request that uses a **server-side** key goes through the gateway first. Ollama calls and calls carrying the user's own browser-side key stay on their existing direct path, and any gateway failure falls back to that path unchanged, so the feature is additive.
* `GET /api/health` — reports `respanGateway: { enabled, running, url, pid, startedAt }` so you can confirm the sidecar came up.
* Credentials are not duplicated: the sidecar inherits the server's environment, i.e. the same ignored `.env` that already holds `GEMINI_API_KEY`, `OPENROUTER_API_KEY`, ... A `gateway.toml` that names secrets must use `env:NAME` references.

### Setup | الإعداد

```bash
# 1) Python environment + the pinned package (wheel only; it is a native extension)
python -m venv .venv
.venv/Scripts/python.exe -m pip install --only-binary=:all: -r requirements.txt   # Windows
.venv/bin/python -m pip install --only-binary=:all: -r requirements.txt          # macOS / Linux

# 2) Switch the gateway on (or set it in .env, see .env.example section 7)
RESPAN_GATEWAY_ENABLED=true

# 3) Run the app exactly as before
npm run dev
```

Optional, only when you want routes, fallbacks or extra providers: create `./gateway.toml` (start from `respan-gateway init`) and it is picked up automatically, or point `RESPAN_GATEWAY_CONFIG` at another file. To reuse a gateway that is already running, set `RESPAN_GATEWAY_URL=http://127.0.0.1:8080` instead of installing one.

### Focused check | الفحص المركّز

```bash
npm run gateway:smoke
```

The script starts a local OpenAI-compatible fixture provider (no provider key, no outbound network), points the gateway at it, and runs the same `tryGatewayChat()` function the AI routes use. Observed result:

```
fixture provider: http://127.0.0.1:59693/v1
[Respan Gateway] serving at http://127.0.0.1:59694 (pid 22496, 452ms) — AI calls route through it.
PASS  gateway started on loopback (http://127.0.0.1:59694)
PASS  gateway returned a completion through the app code path
PASS  completion text round-tripped ("fixture-echo: hello through the gateway")
PASS  model used is reported as routed (respan-gateway:fixture-chat)
PASS  provider saw exactly one chat completion (saw 1 of 3 requests)
PASS  model reached the provider (fixture-chat)
PASS  system instruction and prompt were forwarded in order
All gateway checks passed.
```

*Verified:* the gateway starts on loopback, accepts an OpenAI-format request from the app code, forwards it to the provider, and returns the completion (plus the gateway's model list probes). *Not verified here:* a live call to a real provider — that needs your own provider key in `.env` and a normal `npm run dev`. Nothing is mocked in the app path: with the gateway off, requests take the same direct routes as before.

المتحقَّق منه: إقلاع البوابة على loopback، استقبال طلب بصيغة OpenAI من كود التطبيق، تمريره إلى المزوّد، وإرجاع الرد. غير متحقَّق منه هنا: نداء حقيقي لمزوّد سحابي — يحتاج مفتاحك في `.env` وتشغيل `npm run dev`.

*This document is maintained dynamically by the system engineering team. For API inquiries or custom engine integrations, contact `ahmad.farahat@enterprise-analytics.ai`.*
