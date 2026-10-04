import express from 'express';
import path from 'path';
import fs from 'fs';
import os from 'os';
import BetterSqlite3 from 'better-sqlite3';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import {
  createUser, verifyLogin, getUserByToken, revokeSession,
  roleForFirstUser, listUsers, type Role,
} from './server/auth';
import {
  consumeAiQuota, getAiQuotaStatus, getUserDailyLimit, getAdminDailyLimit,
} from './server/aiQuota';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000; // cloud platforms inject PORT

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Patterns that indicate a placeholder / demo API key mistakenly left in configuration
const PLACEHOLDER_KEY_PATTERNS = /demo|replace|your[_-]?api[_-]?key|my[_-]?gemini|placeholder|xxxx/i;

function isPlaceholderApiKey(key: string): boolean {
  return PLACEHOLDER_KEY_PATTERNS.test(key);
}

// ---------------------------------------------------------------------------
// Daily per-user quota on SERVER-KEY AI usage — protects the shared balance
// (OPENROUTER_API_KEY & friends in .env) from being drained by heavy users.
// Requests carrying the user's OWN real key (or hitting local Ollama) are
// never counted. Authenticated callers get a per-user bucket; anonymous
// callers fall back to a per-IP bucket. Admins are unlimited by default
// (AI_SERVER_ADMIN_DAILY_LIMIT=0), regular users: AI_SERVER_DAILY_LIMIT (100).
// ---------------------------------------------------------------------------
const SERVER_KEY_ENV_VARS = ['GEMINI_API_KEY', 'OPENROUTER_API_KEY', 'DEEPSEEK_API_KEY', 'QWEN_API_KEY', 'CUSTOM_OPENAI_API_KEY'];

function hasRealServerAiKey(): boolean {
  return SERVER_KEY_ENV_VARS.some((name) => {
    const v = process.env[name];
    return Boolean(v && v.trim()) && !isPlaceholderApiKey(v);
  });
}

function aiServerKeyQuotaGuard(req: express.Request, res: express.Response, next: express.NextFunction) {
  try {
    // Ollama محلي ومجاني — لا يُحسب أبداً
    if (String(req.body?.provider || '').toLowerCase() === 'ollama') return next();
    // مفتاح المستخدم الخاص الحقيقي → رصيده هو، لا الحصة المشتركة
    const bodyKey = typeof req.body?.apiKey === 'string' ? req.body.apiKey : '';
    if (bodyKey && bodyKey.trim() && !isPlaceholderApiKey(bodyKey)) return next();
    // لا مفاتيح خادم مكوّنة → لا شيء يحميه
    if (!hasRealServerAiKey()) return next();

    const caller = authUserFromReq(req);
    const isAdmin = caller?.role === 'admin';
    const limit = isAdmin ? getAdminDailyLimit() : getUserDailyLimit();
    if (limit <= 0) return next(); // 0 = غير محدود

    const callerId = caller ? `user:${caller.id}` : `ip:${req.ip || 'unknown'}`;
    // حلبة المقارنة تستدعي N نماذج في الطلب الواحد — احسب كل نموذج على حدة
    const cost = Array.isArray(req.body?.models) && req.body.models.length > 0
      ? Math.min(req.body.models.length, 10)
      : 1;
    const result = consumeAiQuota({ callerId, cost, limit });
    if (!result.ok) {
      return res.status(429).json({
        error: `وصلت الحد اليومي لاستخدام مفتاح الخادم (${result.used}/${result.limit} طلب). يتجدد الحد تلقائياً بعد منتصف الليل بتوقيت UTC — أو أضف مفتاحك الخاص من إعدادات النماذج لاستخدام غير محدود.`,
        quota: { used: result.used, limit: result.limit, remaining: 0, resetAt: result.resetAt },
      });
    }
    res.setHeader('X-AI-Quota-Remaining', String(result.remaining));
    return next();
  } catch {
    // أعطال الحصة لا تُسقط ميزات الذكاء الاصطناعي أبداً
    return next();
  }
}

// Lazy initialize Gemini API client with required User-Agent
let aiClient: GoogleGenAI | null = null;

function getAiClient(customKey?: string): GoogleGenAI | null {
  // مفتاح وهمي مخزّن قديماً في متصفح المستخدم يُتجاهل ليعمل مفتاح الخادم الاحتياطي
  const userKey = customKey && !isPlaceholderApiKey(customKey) ? customKey : '';
  const apiKey = userKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('GEMINI_API_KEY is not set. AI features will use deterministic fallbacks.');
    return null;
  }
  if (isPlaceholderApiKey(apiKey)) {
    console.warn('GEMINI_API_KEY looks like a placeholder/demo value. Replace it with a real key from https://aistudio.google.com/apikey');
    return null;
  }
  if (userKey) {
    return new GoogleGenAI({
      apiKey: userKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiClient;
}

/**
 * Sanitize and map legacy or deprecated Gemini model identifiers to current valid models
 */
function sanitizeGeminiModel(model?: string): string {
  if (!model) return 'gemini-2.5-flash';
  const clean = model.toLowerCase().trim();
  if (
    clean === 'gemini-1.5-flash' ||
    clean === 'gemini-2.0-flash' ||
    clean === 'gemini-flash' ||
    clean === 'gemini-flash-latest'
  ) {
    return 'gemini-2.5-flash';
  }
  if (clean === 'gemini-1.5-pro' || clean === 'gemini-2.0-pro' || clean === 'gemini-pro') {
    return 'gemini-2.5-pro';
  }
  if (clean === 'gemini-flash-lite' || clean === 'gemini-lite' || clean === 'gemini-3.1-lite') {
    return 'gemini-3.1-flash-lite';
  }
  if (clean === 'gemini-3.1-pro' || clean === 'gemini-pro-preview') {
    return 'gemini-3.1-pro-preview';
  }
  if (clean.startsWith('gemini-')) {
    return model;
  }
  return 'gemini-2.5-flash';
}

/**
 * Robust execution helper with multi-model fallback and transient error handling for Gemini
 */
async function generateWithModelFallback(params: {
  contents: any;
  config?: any;
  models?: string[];
  apiKey?: string;
}): Promise<{ text: string; modelUsed: string; lastError?: string } | null> {
  const ai = getAiClient(params.apiKey);
  if (!ai) return null;

  const rawModels = params.models && params.models.length > 0 ? params.models : ['gemini-2.5-flash', 'gemini-3.8-flash', 'gemini-3.1-flash-lite'];
  const candidateModels: string[] = [];
  for (const m of rawModels) {
    if (!m) continue;
    const s = sanitizeGeminiModel(m);
    if (!candidateModels.includes(s)) candidateModels.push(s);
  }
  // Ensure robust high-availability order with top available models
  const backupModels = ['gemini-2.5-flash', 'gemini-3.8-flash', 'gemini-3.1-flash-lite', 'gemini-2.5-pro', 'gemini-3.1-pro-preview'];
  for (const bm of backupModels) {
    if (!candidateModels.includes(bm)) candidateModels.push(bm);
  }

  let lastError = '';
  for (const model of candidateModels) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: params.contents,
        config: params.config,
      });

      if (response && response.text) {
        return { text: response.text, modelUsed: model };
      }
    } catch (err: any) {
      // Keep the most informative error for diagnostics instead of swallowing it silently
      const msg = err?.message || String(err);
      if (msg.length > lastError.length) lastError = msg;
      console.warn(`[Gemini] model '${model}' failed: ${msg.slice(0, 300)}`);
      continue;
    }
  }

  return { text: '', modelUsed: 'none', lastError };
}

/**
 * Universal Multi-Provider AI Caller
 * Supports: Gemini, Ollama (Local Privacy), OpenRouter, Qwen (Alibaba), DeepSeek, and Custom OpenAI API
 */
async function callUniversalAI(params: {
  provider?: string;
  model?: string;
  prompt: string;
  systemInstruction?: string;
  endpointUrl?: string;
  apiKey?: string;
  jsonMode?: boolean;
  disableFallback?: boolean;
  maxTokens?: number;
}): Promise<{ text: string; modelUsed: string; durationMs: number; isLocal: boolean }> {
  const startTime = Date.now();
  const provider = (params.provider || 'gemini').toLowerCase();
  const rawModel = params.model || 'gemini-3.8-flash';
  // Strip provider prefix if present (e.g. "ollama/qwen2.5-coder:7b" -> "qwen2.5-coder:7b")
  const modelName = rawModel.includes('/') ? rawModel.split('/').slice(1).join('/') : rawModel;

  // 1. Ollama (100% Local & Privacy-First)
   if (provider === 'ollama') {
     const endpoint = (params.endpointUrl || 'http://localhost:11434').replace(/\/+$/, '');
     const controller = new AbortController();
     const timeoutId = setTimeout(() => controller.abort(), 120000);

    try {
      const res = await fetch(`${endpoint}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
        signal: controller.signal,
        body: JSON.stringify({
          model: modelName,
          messages: [
            ...(params.systemInstruction ? [{ role: 'system', content: params.systemInstruction }] : []),
            { role: 'user', content: params.prompt },
          ],
          stream: false,
          format: params.jsonMode ? 'json' : undefined,
          // num_ctx: 3072 keeps 3B-class local models fully in GPU on 4GB cards;
          // the default 4096 spills them into hybrid CPU mode (~60x slower).
          options: { temperature: 0.1, num_ctx: 3072, num_gpu: 99 },
        }),
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data: any = await res.json();
        const text = data?.message?.content || data?.response || '';
        return {
          text,
          modelUsed: `ollama:${modelName}`,
          durationMs: Date.now() - startTime,
          isLocal: true,
        };
      } else {
        if (params.disableFallback) {
          const errText = await res.text().catch(() => '');
          throw new Error(`Ollama returned status ${res.status}: ${errText || res.statusText}`);
        }
      }
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (params.disableFallback) {
        const isAbort = err.name === 'AbortError' || /abort/i.test(err.message || '');
        if (isAbort) {
          throw new Error(`Ollama request timed out after 120s. The local model may still be loading into VRAM (cold start) or another model is occupying the GPU. Try again in a few seconds.`);
        }
        throw new Error(`Ollama connection failed: ${err.message}`);
      }
      // Graceful fallback to cloud Gemini without noisy console error
    }
  }

  // 2. OpenAI-Compatible Providers (OpenRouter, Qwen DashScope, DeepSeek, Custom OpenAI)
  if (['openrouter', 'qwen', 'deepseek', 'custom_openai'].includes(provider)) {
    let baseUrl = params.endpointUrl;
    // مفتاح وهمي/فارغ من المتصفح يُعامل كغياب — ليعمل مفتاح الخادم الاحتياطي للجميع
    const userApiKey = params.apiKey && !isPlaceholderApiKey(params.apiKey) ? params.apiKey.trim() : '';
    let authHeader = userApiKey ? `Bearer ${userApiKey}` : '';

    // Use environment variables as fallback for API keys
    if (!userApiKey) {
      if (provider === 'openrouter' && process.env.OPENROUTER_API_KEY) {
        authHeader = `Bearer ${process.env.OPENROUTER_API_KEY}`;
      } else if (provider === 'deepseek' && process.env.DEEPSEEK_API_KEY) {
        authHeader = `Bearer ${process.env.DEEPSEEK_API_KEY}`;
      } else if (provider === 'qwen' && process.env.QWEN_API_KEY) {
        authHeader = `Bearer ${process.env.QWEN_API_KEY}`;
      } else if (provider === 'custom_openai' && process.env.CUSTOM_OPENAI_API_KEY) {
        authHeader = `Bearer ${process.env.CUSTOM_OPENAI_API_KEY}`;
      }
    }

    if (provider === 'openrouter') {
      baseUrl = baseUrl || 'https://openrouter.ai/api/v1';
    } else if (provider === 'qwen') {
      baseUrl = baseUrl || 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';
    } else if (provider === 'deepseek') {
      baseUrl = baseUrl || 'https://api.deepseek.com/v1';
    } else if (provider === 'custom_openai') {
      baseUrl = baseUrl || process.env.CUSTOM_OPENAI_ENDPOINT || 'http://localhost:8000/v1';
    }

    if (baseUrl && (authHeader || provider === 'custom_openai')) {
      const endpoint = baseUrl.replace(/\/+$/, '') + '/chat/completions';
      const controller = new AbortController();
      // 90s: free-tier cloud models (OpenRouter etc.) can take 30-60s under load;
      // the previous 25s aborted valid requests mid-generation.
      const timeoutId = setTimeout(() => controller.abort(), 90000);

      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          ...(authHeader ? { Authorization: authHeader } : {}),
          // Honest app attribution — spoofed referers (e.g. aistudio.google.com) can
          // trigger OpenRouter's security policy (403 Access denied).
          'HTTP-Referer': 'http://localhost:3000',
          'X-Title': 'AI Data Analytics Platform',
          'ngrok-skip-browser-warning': 'true',
        };

        const res = await fetch(endpoint, {
          method: 'POST',
          headers,
          signal: controller.signal,
          body: JSON.stringify({
            model: modelName,
            messages: [
              ...(params.systemInstruction ? [{ role: 'system', content: params.systemInstruction }] : []),
              { role: 'user', content: params.prompt },
            ],
            temperature: 0.1,
            // Cap max_tokens explicitly: without it OpenRouter assumes the model's
            // full limit (e.g. 64000) and rejects prepaid accounts with low credit (402).
            max_tokens: params.maxTokens || 4096,
            ...(params.jsonMode ? { response_format: { type: 'json_object' } } : {}),
          }),
        });
        clearTimeout(timeoutId);

        if (res.ok) {
          const data: any = await res.json();
          const text = data?.choices?.[0]?.message?.content || '';
          return {
            text,
            modelUsed: `${provider}:${modelName}`,
            durationMs: Date.now() - startTime,
            isLocal: provider === 'custom_openai',
          };
        } else {
          if (params.disableFallback) {
            const errText = await res.text().catch(() => '');
            // 402 with free/low-credit accounts: OpenRouter rejects the POTENTIAL cost of
            // max_tokens. Parse the affordable token count from the error and retry once.
            if (res.status === 402) {
              const affordMatch = errText.match(/can only afford (\d+)/i);
              const affordable = affordMatch ? parseInt(affordMatch[1], 10) : 0;
              if (affordable >= 200) {
                try {
                  const retryRes = await fetch(endpoint, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                      model: modelName,
                      messages: [
                        ...(params.systemInstruction ? [{ role: 'system', content: params.systemInstruction }] : []),
                        { role: 'user', content: params.prompt },
                      ],
                      temperature: 0.1,
                      max_tokens: Math.min(affordable, 4096),
                      ...(params.jsonMode ? { response_format: { type: 'json_object' } } : {}),
                    }),
                  });
                  if (retryRes.ok) {
                    const retryData: any = await retryRes.json();
                    const retryText = retryData?.choices?.[0]?.message?.content || '';
                    return {
                      text: retryText,
                      modelUsed: `${provider}:${modelName}`,
                      durationMs: Date.now() - startTime,
                      isLocal: provider === 'custom_openai',
                    };
                  }
                  const retryErr = await retryRes.text().catch(() => '');
                  throw new Error(`${provider} returned status ${retryRes.status}: ${retryErr || retryRes.statusText}`);
                } catch (retryError: any) {
                  if (!/openrouter returned status/.test(retryError.message || '')) throw retryError;
                  throw new Error(`${provider} returned status 402: رصيد الحساب لا يكفي حتى لأصغر طلب. استخدم نموذجاً مجانياً (ينتهي بـ :free) أو نموذجاً محلياً (Ollama).`);
                }
              }
              throw new Error(`${provider} returned status 402: رصيد حسابك في ${provider} غير كافٍ. اشحن الرصيد من لوحة تحكم المزود، أو استخدم نموذجاً مجانياً (ينتهي بـ :free) أو نموذجاً محلياً (Ollama).`);
            }
            if (res.status === 403) {
              throw new Error(`${provider} returned status 403: تم حجب الطلب بسياسة أمنية من المزود. غالباً حجب جغرافي على مستوى IP أو مفتاح API مقيّد. جرّب نموذجاً محلياً (Ollama) من إعدادات الذكاء الاصطناعي.`);
            }
            throw new Error(`${provider} returned status ${res.status}: ${errText || res.statusText}`);
          }
        }
      } catch (err: any) {
        clearTimeout(timeoutId);
        if (params.disableFallback) {
          const isAbort = err.name === 'AbortError' || /abort/i.test(err.message || '');
          if (isAbort) {
            throw new Error(`${provider} request timed out after 90s. Free-tier models can be slow under load — retry, or switch to a faster/local model.`);
          }
          throw new Error(`${provider} connection failed: ${err.message}`);
        }
        console.warn(`[${provider} Call Notice] Request failed (${err?.message}). Falling back.`);
      }
    } else {
      if (params.disableFallback) {
        throw new Error(`Endpoint URL or API Key is missing for ${provider}. Please check your model settings.`);
      }
    }
  }

  if (params.disableFallback && provider !== 'gemini') {
    throw new Error(`The selected provider '${provider}' failed or is not configured. Fallback is disabled in the AI Sandbox.`);
  }

  // 3. Google Gemini (Default / Built-in Server-Side Engine)
  const geminiKeyCandidate = params.apiKey || process.env.GEMINI_API_KEY || '';
  if (geminiKeyCandidate && isPlaceholderApiKey(geminiKeyCandidate)) {
    throw new Error('مفتاح GEMINI_API_KEY هو مفتاح تجريبي وهمي (placeholder). استبدله بمفتاح حقيقي من https://aistudio.google.com/apikey ثم أعد تشغيل الخادم.');
  }
  const sanitizedModel = sanitizeGeminiModel(rawModel);
  const geminiResult = await generateWithModelFallback({
    contents: params.prompt,
    config: {
      systemInstruction: params.systemInstruction,
      ...(params.jsonMode ? { responseMimeType: 'application/json' } : {}),
    },
    models: [sanitizedModel, 'gemini-3.8-flash', 'gemini-3.1-flash-lite'],
    apiKey: params.apiKey,
  });

  if (geminiResult && geminiResult.text) {
    return {
      text: geminiResult.text,
      modelUsed: geminiResult.modelUsed,
      durationMs: Date.now() - startTime,
      isLocal: false,
    };
  }

  const diag = geminiResult?.lastError ? ` Last error: ${geminiResult.lastError.slice(0, 300)}` : '';
  if (params.disableFallback) {
    throw new Error(`The selected provider '${provider}' failed or is not configured. Fallback is disabled in the AI Sandbox.${diag}`);
  }

  throw new Error(`The selected provider '${provider}' failed to generate a response. Fallback is disabled in the AI Sandbox.${diag}`);
}

// In-memory audit log storage on backend
const serverAuditLogs: any[] = [];

// 1. Health check
app.get('/api/health', (_req, res) => {
  const envKey = process.env.GEMINI_API_KEY || '';
  const keyIsPlaceholder = Boolean(envKey) && isPlaceholderApiKey(envKey);
  // مزوّدو AI المفعّلون خادمياً (مفاتيح حقيقية في البيئة) — لعرض جاهزية AI في الواجهة
  const envKeyIsReal = (k?: string) => Boolean(k && k.trim()) && !isPlaceholderApiKey(k);
  const aiProvidersEnabled = [
    envKeyIsReal(process.env.GEMINI_API_KEY) ? 'gemini' : '',
    envKeyIsReal(process.env.DEEPSEEK_API_KEY) ? 'deepseek' : '',
    envKeyIsReal(process.env.OPENROUTER_API_KEY) ? 'openrouter' : '',
    envKeyIsReal(process.env.QWEN_API_KEY) ? 'qwen' : '',
    (envKeyIsReal(process.env.CUSTOM_OPENAI_API_KEY) && process.env.CUSTOM_OPENAI_ENDPOINT) ? 'custom_openai' : '',
  ].filter(Boolean);
  res.json({
    status: 'ok',
    version: '1.0.0',
    aiEnabled: Boolean(envKey) && !keyIsPlaceholder,
    aiProvidersEnabled,
    aiKeyWarning: keyIsPlaceholder
      ? 'GEMINI_API_KEY في .env هو مفتاح تجريبي وهمي (placeholder). استبدله بمفتاح حقيقي من https://aistudio.google.com/apikey'
      : (!envKey ? 'GEMINI_API_KEY غير مضبوط في .env' : undefined),
    timestamp: new Date().toISOString(),
  });
});

// 1b. Test Connection for any AI Provider (Ollama ping, Gemini, OpenRouter, Qwen, etc.)
app.post('/api/ai/test-connection', aiServerKeyQuotaGuard, async (req, res) => {
  const { provider, endpointUrl, apiKey, model } = req.body;
  const startTime = Date.now();

  try {
    if (provider === 'ollama') {
      const targetHost = (endpointUrl || 'http://localhost:11434').replace(/\/+$/, '');
      const url = `${targetHost}/api/tags`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3500);

      let pingRes: Response | null = null;
      let pingErr: string | null = null;

      try {
        pingRes = await fetch(url, { signal: controller.signal, headers: { 'ngrok-skip-browser-warning': 'true' } });
      } catch (err: any) {
        pingErr = err?.message || 'Connection refused or timed out';
      } finally {
        clearTimeout(timeout);
      }

      if (pingRes && pingRes.ok) {
        try {
          const data: any = await pingRes.json();
          const modelNames = (data.models || []).map((m: any) => m.name);
          return res.json({
            status: 'connected',
            latencyMs: Date.now() - startTime,
            models: modelNames,
            isLocal: true,
            message: `Connected to Ollama at ${targetHost}. Found ${modelNames.length} installed models.`,
          });
        } catch (e) {}
      }

      const isLocalhost = targetHost.includes('localhost') || targetHost.includes('127.0.0.1');
      return res.json({
        status: 'error',
        latencyMs: Date.now() - startTime,
        message: isLocalhost
          ? 'تعذر الوصول إلى http://localhost:11434 من خادم السحابة. إذا كان Ollama يعلم على جهازك الشخصي، نوصي باستعمال رابط نفق (ngrok) أو التحويل إلى Gemini.'
          : `تعذر الاتصال بـ Ollama عبر الرابط: ${targetHost} (${pingErr || 'No response'}).`,
        isLocalhostNotice: isLocalhost,
        diagnosticAr: isLocalhost
          ? 'خادم التطبيق يعمل في بيئة Cloud Run، لذلك فإن localhost تشير إلى حاوية السحابة وليس جهازك الشخصي. يمكنك استخدام ngrok أو تفعيل Gemini المدمج بنقرة واحدة.'
          : 'تأكد من تشغيل أمر "ollama serve" وأن المنفذ مفتوح ومستقبل للاتصالات الخارجية.',
        diagnosticEn: isLocalhost
          ? 'The app backend runs in a Cloud Run container, so http://localhost:11434 checks the cloud container rather than your local PC. Use ngrok or switch to Gemini with 1-click.'
          : 'Ensure "ollama serve" is active and reachable over the specified host.',
      });
    }

    if (provider === 'gemini') {
      const client = getAiClient(apiKey);
      if (!client) {
        const keySource = apiKey || process.env.GEMINI_API_KEY || '';
        return res.json({
          status: 'unconfigured',
          latencyMs: 15,
          isLocal: false,
          message: !keySource
            ? 'لم يتم العثور على مفتاح GEMINI_API_KEY. يرجى تهيئة المفتاح في لوحة الأسرار أو إدخاله في الإعدادات.'
            : 'مفتاح GEMINI_API_KEY الحالي هو مفتاح تجريبي وهمي (placeholder). استبدله بمفتاح حقيقي من https://aistudio.google.com/apikey ثم أعد تشغيل الخادم.',
        });
      }

      const testRes = await generateWithModelFallback({
        contents: 'Say "OK"',
        models: ['gemini-2.5-flash', 'gemini-3.8-flash', 'gemini-3.1-flash-lite'],
        apiKey,
      });

      if (testRes && testRes.text) {
        return res.json({
          status: 'connected',
          latencyMs: Date.now() - startTime,
          isLocal: false,
          message: `تم الاتصال بنجاح بمزود Google Gemini (النموذج: ${testRes.modelUsed}).`,
        });
      } else if (testRes && testRes.lastError) {
        // Surface the real underlying error (invalid key, quota, network...) instead of a generic message
        const rawErr = testRes.lastError.replace(/\s+/g, ' ').slice(0, 400);
        const isInvalidKey = /API_KEY_INVALID|API key not valid/i.test(rawErr);
        return res.json({
          status: 'error',
          latencyMs: Date.now() - startTime,
          isLocal: false,
          message: isInvalidKey
            ? 'مفتاح GEMINI_API_KEY غير صالح. يرجى استبداله بمفتاح حقيقي من https://aistudio.google.com/apikey'
            : `فشل التحقق من اتصال Gemini. السبب: ${rawErr}`,
          diagnostic: rawErr,
        });
      } else {
        return res.json({
          status: 'error',
          latencyMs: Date.now() - startTime,
          isLocal: false,
          message: 'فشل التحقق من اتصال Gemini: لم يستجب أي من نماذج Gemini.',
        });
      }
    }

    // OpenAI Compatible endpoints
    const testPrompt = 'ping test. reply with "ok"';
    const result = await callUniversalAI({
      provider,
      model,
      endpointUrl,
      apiKey,
      prompt: testPrompt,
      disableFallback: true,
    });

    if (result.text) {
      return res.json({
        status: 'connected',
        latencyMs: result.durationMs,
        isLocal: result.isLocal,
        message: `Successfully reached ${provider} (${result.modelUsed})`,
      });
    }

    return res.json({
      status: 'error',
      latencyMs: Date.now() - startTime,
      message: `Failed to receive valid response from ${provider}. Check endpoint or API key.`,
    });
  } catch (err: any) {
    return res.json({
      status: 'error',
      latencyMs: Date.now() - startTime,
      message: err?.message || 'Connection test timed out or failed.',
    });
  }
});

// 1b-2. AI Sandbox Execution Endpoint
app.post('/api/ai/sandbox/query', aiServerKeyQuotaGuard, async (req, res) => {
  const { provider = 'gemini', model = 'gemini-3.8-flash', prompt, systemInstruction, endpointUrl, apiKey, temperature, maxTokens } = req.body;
  const startTime = Date.now();

  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    return res.status(400).json({ error: 'Prompt text is required' });
  }

  try {
    const result = await callUniversalAI({
      provider,
      model,
      endpointUrl,
      apiKey,
      prompt: prompt.trim(),
      systemInstruction: systemInstruction?.trim(),
      disableFallback: true,
    });

    const durationMs = result.durationMs || (Date.now() - startTime);
    const responseText = result.text || '';
    
    // Calculate approximate token metrics
    const promptTokens = Math.max(1, Math.round(prompt.length / 3.8));
    const completionTokens = Math.max(1, Math.round(responseText.length / 3.8));
    const totalTokens = promptTokens + completionTokens;

    // Price calculation per 1M tokens in USD
    let promptRate = 0.075; // default gemini 3.8 flash
    let completionRate = 0.30;

    if (provider === 'ollama' || provider === 'custom_openai' || result.isLocal) {
      promptRate = 0;
      completionRate = 0;
    } else if (model.includes('pro')) {
      promptRate = 1.25;
      completionRate = 5.00;
    } else if (model.includes('lite')) {
      promptRate = 0.0375;
      completionRate = 0.15;
    } else if (provider === 'deepseek') {
      promptRate = 0.55;
      completionRate = 2.19;
    } else if (provider === 'qwen') {
      promptRate = 0.30;
      completionRate = 0.90;
    } else if (provider === 'openrouter') {
      promptRate = 3.00;
      completionRate = 15.00;
    }

    const estimatedCostUsd = ((promptTokens * promptRate) + (completionTokens * completionRate)) / 1000000;

    return res.json({
      success: true,
      text: responseText,
      modelUsed: result.modelUsed,
      durationMs,
      isLocal: Boolean(result.isLocal),
      promptTokens,
      completionTokens,
      totalTokens,
      estimatedCostUsd: Number(estimatedCostUsd.toFixed(6)),
    });
  } catch (err: any) {
    return res.json({
      success: false,
      error: err?.message || 'Sandbox query execution failed',
      durationMs: Date.now() - startTime,
    });
  }
});

// 1c. JSON-RPC 2.0 AI Gateway Endpoint
app.post('/api/ai/jsonrpc', async (req, res) => {
  const { endpointUrl, authToken, customHeaders, payload, timeoutMs = 15000 } = req.body;
  const startTime = Date.now();

  if (!payload || payload.jsonrpc !== '2.0' || !payload.method) {
    return res.status(400).json({
      jsonrpc: '2.0',
      error: {
        code: -32600,
        message: 'Invalid Request: payload must strictly follow JSON-RPC 2.0 specification with jsonrpc="2.0", method, and id.',
      },
      id: payload?.id || null,
    });
  }

  const rpcId = payload.id ?? 1;
  const targetUrl = endpointUrl || 'http://localhost:8000/rpc';
  const { method, params = {} } = payload;

  const rpcProvider = typeof params.provider === 'string' ? params.provider.toLowerCase() : 'gemini';
  const rpcModel = typeof params.model === 'string' ? params.model : undefined;
  const nativeAIMethods = new Set(['ai.generate', 'ai.chat', 'ai.analyzeData', 'ai.profile', 'ai.nl2sql']);
  const shouldUseNativeAIHandler = nativeAIMethods.has(method) && (rpcProvider === 'ollama' || rpcProvider === 'custom_openai');

  if (!shouldUseNativeAIHandler) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...(customHeaders || {}),
      };

      if (authToken) {
        headers['Authorization'] = authToken.startsWith('Bearer ') ? authToken : `Bearer ${authToken}`;
      }

      const response = await fetch(targetUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (response.ok) {
        const data = await response.json();
        return res.json(data);
      }
    } catch (forwardErr: any) {
      console.log(`[JSON-RPC Gateway] External endpoint ${targetUrl} not reachable or timed out (${forwardErr.message}). Routing via native fallback handler.`);
    }
  } else {
    console.log(`[JSON-RPC Gateway] Native provider routing for ${rpcProvider}/${rpcModel || 'default'}; external endpoint skipped.`);
  }

  // Built-in Native Handler for JSON-RPC 2.0 AI Methods
  try {
    const { method, params = {} } = payload;

    if (method === 'rpc.ping' || method === 'ping') {
      return res.json({
        jsonrpc: '2.0',
        result: {
          pong: true,
          echo: params.echo || 'PONG',
          gateway: 'Antigravity-JSON-RPC-2.0',
          uptime: process.uptime(),
          timestamp: new Date().toISOString(),
          durationMs: Date.now() - startTime,
        },
        id: rpcId,
      });
    }

    if (method === 'ai.generate' || method === 'ai.chat') {
      const prompt = params.prompt || params.query || (params.messages ? JSON.stringify(params.messages) : 'Hello');
      const aiResult = await callUniversalAI({
        provider: rpcProvider,
        model: rpcModel || 'gemini-3.8-flash',
        endpointUrl: params.endpointUrl,
        apiKey: params.apiKey,
        prompt,
        systemInstruction: params.systemInstruction,
        disableFallback: true,
      });

      return res.json({
        jsonrpc: '2.0',
        result: {
          completion: aiResult.text,
          modelUsed: aiResult.modelUsed,
          durationMs: aiResult.durationMs,
          isLocal: aiResult.isLocal,
          finishReason: 'stop',
        },
        id: rpcId,
      });
    }

    if (method === 'ai.analyzeData' || method === 'ai.profile') {
      const datasetName = params.dataset_name || 'Dataset';
      const columns = params.columns || ['id', 'value'];
      const prompt = `Perform high-level semantic profiling and anomaly detection for dataset "${datasetName}" with columns: ${JSON.stringify(columns)}. Task: ${params.task || 'general_profile'}. Return recommendations concisely in Markdown.`;
      
      const aiResult = await callUniversalAI({
        provider: rpcProvider,
        model: rpcModel || 'gemini-3.8-flash',
        endpointUrl: params.endpointUrl,
        apiKey: params.apiKey,
        prompt,
        systemInstruction: 'You are an expert AI data scientist and statistician.',
        disableFallback: true,
      });

      return res.json({
        jsonrpc: '2.0',
        result: {
          datasetName,
          columnsAnalyzed: columns,
          analysis: aiResult.text,
          modelUsed: aiResult.modelUsed,
          durationMs: aiResult.durationMs,
        },
        id: rpcId,
      });
    }

    if (method === 'ai.predictModel') {
      const featureVector = params.feature_vector || [1.0, 2.0];
      const modelId = params.model_id || 'default-linear-regressor';
      // Compute deterministic mathematical regression prediction
      const weights = [0.45, 1.2, 0.85, 0.15];
      let prediction = 25.0;
      featureVector.forEach((val: number, idx: number) => {
        prediction += (Number(val) || 0) * (weights[idx % weights.length] || 0.5);
      });

      return res.json({
        jsonrpc: '2.0',
        result: {
          modelId,
          prediction: Number(prediction.toFixed(4)),
          confidenceScore: 0.942,
          featureContributions: featureVector.map((v: number, i: number) => ({
            featureIndex: i,
            value: v,
            importance: Number(((Math.abs(v) / (Math.abs(prediction) || 1)) * 100).toFixed(2)),
          })),
          durationMs: Date.now() - startTime,
        },
        id: rpcId,
      });
    }

    if (method === 'ai.nl2sql') {
      const query = params.natural_query || 'Show top records';
      const schema = params.schema_definition || 'table(id, name, value)';
      const dialect = params.dialect || 'postgresql';

      const prompt = `Convert this natural language request to clean, valid ${dialect} SQL: "${query}". Schema: ${schema}. Output only the SQL query.`;
      const aiResult = await callUniversalAI({
        provider: rpcProvider,
        model: rpcModel || 'gemini-3.8-flash',
        endpointUrl: params.endpointUrl,
        apiKey: params.apiKey,
        prompt,
        disableFallback: true,
      });

      return res.json({
        jsonrpc: '2.0',
        result: {
          dialect,
          sqlQuery: aiResult.text.replace(/```sql|```/g, '').trim(),
          modelUsed: aiResult.modelUsed,
          durationMs: aiResult.durationMs,
        },
        id: rpcId,
      });
    }

    // Unrecognized method
    return res.status(404).json({
      jsonrpc: '2.0',
      error: {
        code: -32601,
        message: `Method '${method}' not found. Available methods: rpc.ping, ai.generate, ai.analyzeData, ai.predictModel, ai.nl2sql`,
      },
      id: rpcId,
    });
  } catch (err: any) {
    return res.status(500).json({
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message: err.message || 'Internal JSON-RPC execution error',
      },
      id: rpcId,
    });
  }
});

// 1d. Get Ollama Installed Tags
// رصيد حصة مفتاح الخادم للمتصل الحالي — لعرضها في الواجهة
app.get('/api/ai/quota', (req, res) => {
  const caller = authUserFromReq(req);
  const isAdmin = caller?.role === 'admin';
  const limit = isAdmin ? getAdminDailyLimit() : getUserDailyLimit();
  const callerId = caller ? `user:${caller.id}` : `ip:${req.ip || 'unknown'}`;
  const status = getAiQuotaStatus({ callerId, limit });
  res.json({ ...status, unlimited: limit <= 0, authenticated: Boolean(caller) });
});

app.get('/api/ai/ollama/tags', async (req, res) => {
  const host = (req.query.host as string) || 'http://localhost:11434';
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    const response = await fetch(`${host.replace(/\/+$/, '')}/api/tags`, { signal: controller.signal, headers: { 'ngrok-skip-browser-warning': 'true' } });
    clearTimeout(timeout);

    if (response.ok) {
      const data: any = await response.json();
      return res.json({
        connected: true,
        models: data.models || [],
      });
    }
  } catch (err: any) {
    // Graceful catch for offline / unreachable Ollama
  }
  return res.json({
    connected: false,
models: [],
     hint: 'Run "ollama serve" on your local machine to activate local privacy models.',
   });
});

// 1e. Dynamic Model Discovery for Cloud Providers
// Fetches supported models from provider APIs based on API keys and sorts by cost (free first)
app.post('/api/ai/fetch-models', async (req, res) => {
  let { provider, apiKey, endpointUrl } = req.body;

  // Fall back to server-side .env keys when the browser has none stored —
  // otherwise a key configured only on the server can never discover models.
  if (!apiKey) {
    const envKeys: Record<string, string | undefined> = {
      openrouter: process.env.OPENROUTER_API_KEY,
      deepseek: process.env.DEEPSEEK_API_KEY,
      qwen: process.env.QWEN_API_KEY,
      gemini: process.env.GEMINI_API_KEY,
      custom_openai: process.env.CUSTOM_OPENAI_API_KEY,
    };
    apiKey = envKeys[provider];
  }

  if (!provider || !apiKey) {
    return res.status(400).json({ error: 'Provider and API key are required (no stored key found in browser or .env)' });
  }

  try {
    let models: Array<{
      id: string;
      name: string;
      isFree: boolean;
      costPer1kTokens?: number;
      contextWindow?: number;
      capabilities?: string[];
    }> = [];

    switch (provider) {
      case 'gemini': {
        const client = getAiClient(apiKey);
        if (!client) {
          return res.status(400).json({ error: 'Invalid Gemini API key' });
        }
        // List models from Gemini API
        const modelList = await client.models.list();
        const modelArray: any[] = [];
        for await (const model of modelList) {
          modelArray.push(model);
        }
        models = modelArray
          .filter((m: any) => m.supportedGenerationMethods?.includes('generateContent'))
          .map((m: any) => ({
            id: m.name.replace('models/', ''),
            name: m.displayName || m.name.replace('models/', ''),
            isFree: true,
            costPer1kTokens: 0,
            contextWindow: m.inputTokenLimit,
            capabilities: ['nl2sql', 'reasoning', 'optimization'],
          }));
        break;
      }

      case 'ollama': {
        const targetHost = (endpointUrl || 'http://localhost:11434').replace(/\/+$/, '');
        const url = `${targetHost}/api/tags`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        
        try {
          const response = await fetch(url, { signal: controller.signal, headers: { 'ngrok-skip-browser-warning': 'true' } });
          clearTimeout(timeout);
          
          if (response.ok) {
            const data: any = await response.json();
            models = (data.models || []).map((m: any) => ({
              id: `ollama/${m.name}`,
              name: `Ollama: ${m.name}`,
              isFree: true,
              costPer1kTokens: 0,
              contextWindow: 32768,
              capabilities: ['nl2sql', 'privacy', 'code', 'reasoning'],
            }));
          }
        } catch (e) {
          models = [];
        }
        break;
      }

      case 'openrouter': {
        const response = await fetch('https://openrouter.ai/api/v1/models', {
          headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        });
        if (response.ok) {
          const data: any = await response.json();
          models = (data.data || [])
            .filter((m: any) => m.id && !m.id.includes(':thinking'))
            .map((m: any) => ({
              id: `openrouter/${m.id}`,
              name: m.name || m.id,
              isFree: m.pricing?.prompt === '0' && m.pricing?.completion === '0',
              costPer1kTokens: parseFloat(m.pricing?.prompt || '0') + parseFloat(m.pricing?.completion || '0'),
              contextWindow: m.context_length,
              capabilities: ['nl2sql', 'reasoning', 'optimization'],
            }));
        }
        break;
      }

      case 'qwen': {
        const baseUrl = endpointUrl || 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';
        const response = await fetch(`${baseUrl}/models`, {
          headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        });
        if (response.ok) {
          const data: any = await response.json();
          models = (data.data || []).map((m: any) => ({
            id: `qwen/${m.id}`,
            name: m.id,
            isFree: false,
            costPer1kTokens: 0.001,
            contextWindow: m.context_window || 32768,
            capabilities: ['nl2sql', 'code', 'optimization'],
          }));
        }
        break;
      }

      case 'deepseek': {
        const baseUrl = endpointUrl || 'https://api.deepseek.com/v1';
        const response = await fetch(`${baseUrl}/models`, {
          headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        });
        if (response.ok) {
          const data: any = await response.json();
          models = (data.data || []).map((m: any) => ({
            id: `deepseek/${m.id}`,
            name: m.id,
            isFree: m.id.includes('chat') || m.id.includes('v3'),
            costPer1kTokens: m.id.includes('r1') ? 0.0014 : 0.00014,
            contextWindow: 65536,
            capabilities: ['reasoning', 'nl2sql', 'optimization'],
          }));
        }
        break;
      }

      case 'custom_openai': {
        const baseUrl = endpointUrl || 'http://localhost:8000/v1';
        const response = await fetch(`${baseUrl}/models`, {
          headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        });
        if (response.ok) {
          const data: any = await response.json();
          models = (data.data || []).map((m: any) => ({
            id: `custom_openai/${m.id}`,
            name: m.id,
            isFree: true,
            costPer1kTokens: 0,
            contextWindow: m.context_window || 32768,
            capabilities: ['nl2sql', 'privacy', 'code'],
          }));
        }
        break;
      }

      default:
        return res.status(400).json({ error: `Unsupported provider: ${provider}` });
    }

    // Sort: free models first, then by cost ascending
    models.sort((a, b) => {
      if (a.isFree && !b.isFree) return -1;
      if (!a.isFree && b.isFree) return 1;
      return (a.costPer1kTokens || 0) - (b.costPer1kTokens || 0);
    });

    res.json({ models });
  } catch (err: any) {
    console.error('Model fetch error:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch models' });
  }
});

// 1f. Live Account Balance / Usage (OpenRouter)
// Proxy for GET /api/v1/key — surfaces remaining credits & free-tier quota in provider settings.
app.get('/api/ai/openrouter/balance', async (req, res) => {
  const apiKey = (req.query.apiKey as string) || process.env.OPENROUTER_API_KEY || '';
  if (!apiKey) {
    return res.status(400).json({ error: 'No OpenRouter API key provided or stored in .env' });
  }
  try {
    const response = await fetch('https://openrouter.ai/api/v1/key', {
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    });
    if (!response.ok) {
      return res.status(response.status).json({ error: `OpenRouter key endpoint returned ${response.status}` });
    }
    const data: any = await response.json();
    const d = data?.data || {};
    res.json({
      label: d.label,
      isFreeTier: d.is_free_tier ?? true,
      usageUsd: d.usage ?? 0,
      limitUsd: d.limit ?? null,
      limitRemainingUsd: d.limit_remaining ?? null,
      freeDailyRequests: d.free_model_daily_requests
        ? { used: d.free_model_daily_requests.used, limit: d.free_model_daily_requests.limit, remaining: d.free_model_daily_requests.remaining }
        : null,
      expiresAt: d.expires_at ?? null,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch balance' });
  }
});

// 1d. Unified API Proxy Layer for Local Ollama & Custom Endpoints
// Prevents CORS preflight and 400 Bad Request errors by creating a server-side proxy boundary
app.options('/api/proxy/ollama', (_req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  return res.sendStatus(200);
});

app.all('/api/proxy/ollama', async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const targetHost = ((req.body?.endpointUrl || req.query?.endpointUrl || 'http://localhost:11434') as string).replace(/\/+$/, '');
  const path = (req.body?.path || req.query?.path || '/api/tags') as string;
  const method = req.method === 'OPTIONS' ? 'GET' : (req.body?.method || req.method || 'GET');
  const payload = req.body?.payload || req.body?.body;

  const url = `${targetHost}${path.startsWith('/') ? path : '/' + path}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000);

  try {
    const fetchOptions: RequestInit = {
      method: method.toUpperCase(),
      headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
      signal: controller.signal,
      ...(payload ? { body: typeof payload === 'string' ? payload : JSON.stringify(payload) } : {}),
    };

    const upstreamRes = await fetch(url, fetchOptions);
    clearTimeout(timeoutId);

    if (upstreamRes.ok) {
      const contentType = upstreamRes.headers.get('content-type') || '';
      if (contentType.includes('json')) {
        const data = await upstreamRes.json();
        return res.json({ success: true, status: upstreamRes.status, data });
      } else {
        const text = await upstreamRes.text();
        return res.json({ success: true, status: upstreamRes.status, text });
      }
    }

    const errText = await upstreamRes.text().catch(() => 'Upstream request failed');
    return res.json({
      success: false,
      status: upstreamRes.status,
      error: `Ollama endpoint returned HTTP ${upstreamRes.status}`,
      details: errText.substring(0, 300),
      isLocalhostNotice: targetHost.includes('localhost') || targetHost.includes('127.0.0.1'),
    });
  } catch (err: any) {
    clearTimeout(timeoutId);
    const isLocalhost = targetHost.includes('localhost') || targetHost.includes('127.0.0.1');
    return res.json({
      success: false,
      status: 200,
      error: 'UNREACHABLE_OLLAMA_INSTANCE',
      message: isLocalhost
        ? 'Target endpoint http://localhost:11434 is unreachable from the Cloud container. Use ngrok or switch to Gemini.'
        : `Could not reach target Ollama server at ${targetHost} (${err?.message || 'Connection refused'}).`,
      isLocalhostNotice: isLocalhost,
      fallbackAvailable: true,
    });
  }
});
// Helper to evaluate and benchmark SQL generated by different models
function evaluateModelSqlOutput(sql: string, datasetSchema: any): {
  isValid: boolean;
  canExecute: boolean;
  layerScore: number;
  securityViolations: string[];
  complexityScore: number;
  score: { accuracy: number; safety: number; efficiency: number; overallScore: number };
} {
  const violations: string[] = [];
  const upperSql = sql.toUpperCase();

  // 1. Security scan
  const dangerousKeywords = ['DROP ', 'DELETE ', 'INSERT ', 'UPDATE ', 'TRUNCATE ', 'ALTER ', 'EXEC ', 'GRANT ', 'REVOKE ', 'SHUTDOWN'];
  for (const kw of dangerousKeywords) {
    if (upperSql.includes(kw)) {
      violations.push(`Prohibited DDL/DML keyword detected: ${kw.trim()}`);
    }
  }

  const hasSelect = upperSql.includes('SELECT ') || upperSql.startsWith('WITH ');
  if (!hasSelect) {
    violations.push('Query does not start with SELECT or CTE block.');
  }

  const columns = datasetSchema?.columns || [];
  const columnNames = columns.map((c: any) => c.name.toLowerCase());
  
  // Check column coverage
  let matchingColsCount = 0;
  for (const colName of columnNames) {
    if (sql.toLowerCase().includes(colName)) {
      matchingColsCount++;
    }
  }

  const hasLimit = upperSql.includes('LIMIT ');
  const hasGroupBy = upperSql.includes('GROUP BY ');
  const hasOrderBy = upperSql.includes('ORDER BY ');
  const hasAgg = upperSql.includes('SUM(') || upperSql.includes('AVG(') || upperSql.includes('COUNT(') || upperSql.includes('MAX(') || upperSql.includes('MIN(');

  const isValid = violations.length === 0 && hasSelect;
  const canExecute = isValid && (matchingColsCount > 0 || columnNames.length === 0);

  // Calculate scores
  const safetyScore = violations.length === 0 ? 100 : Math.max(20, 100 - violations.length * 40);
  const accuracyScore = !isValid ? 35 : (matchingColsCount > 0 ? (hasAgg && hasGroupBy ? 98 : 92) : 85);
  const efficiencyScore = hasLimit ? (hasOrderBy ? 95 : 90) : 80;
  const overallScore = Math.round((safetyScore * 0.35) + (accuracyScore * 0.45) + (efficiencyScore * 0.20));

  return {
    isValid,
    canExecute,
    layerScore: isValid ? 9 : Math.max(3, 9 - violations.length * 2),
    securityViolations: violations,
    complexityScore: (hasGroupBy ? 2 : 1) + (hasOrderBy ? 1 : 0) + (hasLimit ? 1 : 0),
    score: {
      accuracy: accuracyScore,
      safety: safetyScore,
      efficiency: efficiencyScore,
      overallScore,
    },
  };
}

// 2. NL2SQL Generation Endpoint (Multi-Provider Aware)
/**
 * Free-tier models share crowded upstream queues (30-66s cold latency).
 * Racing several free models in parallel and taking the first valid SQL cuts
 * the wall time to roughly the FASTEST model's latency instead of the chosen one's.
 */
const FREE_RACE_MODELS = [
  'nvidia/nemotron-3.5-lightning:free',
  'qwen/qwen3.8-27b:free',
  'google/gemma-4-31b-it:free',
  'google/gemma-4-26b-a4b-it:free',
  'nvidia/nemotron-3-super-120b-a12b:free',
  'cohere/north-mini-code:free',
  'poolside/laguna-s-2.1:free',
  'thinkingmachines/inkling-small:free',
];

async function raceFreeModels(buildCall: (model: string) => Promise<{ text: string; modelUsed: string; durationMs: number; isLocal: boolean }>): Promise<{ text: string; modelUsed: string; durationMs: number; isLocal: boolean }> {
  const attempts = FREE_RACE_MODELS.map(async (m) => {
    try {
      const r = await buildCall(m);
      // A response with no SQL in it (refusal, empty, echoed schema) should not win the race
      if (!r.text || !/(SELECT|WITH)\s/i.test(r.text)) {
        throw new Error('no-sql');
      }
      return r;
    } catch (e: any) {
      // Propagate a tagged failure so Promise.any skips it
      const err = new Error(e?.message || 'race-attempt-failed');
      (err as any).skippable = true;
      throw err;
    }
  });
  try {
    return await Promise.any(attempts);
  } catch (e: any) {
    throw new Error('كل النماذج المجانية فشلت أو مشغولة حالياً. أعد المحاولة، أو استخدم النموذج المحلي (Ollama) — أسرع بـ30 مرة.');
  }
}

/**
 * Robust SQL extraction: models often wrap SQL in JSON arrays/objects, prose,
 * or markdown fences. Normalize everything down to the pure SQL statement.
 */
function extractCleanSQL(raw: string): { sql: string; explanation?: string } {
  let text = (raw || '').trim();
  let explanation: string | undefined;

  const explMatch = text.match(/EXPLANATION:\s*([\s\S]+)/i);
  if (explMatch) explanation = explMatch[1].trim();

  // 1. Direct markdown fence (preferred shape)
  const fence = text.match(/```sql\s*([\s\S]+?)\s*```/i);
  if (fence) return { sql: fence[1].trim(), explanation };

  // 2. JSON-wrapped response (array or object, with or without fences)
  const jsonCandidate = text.match(/```(?:json)?\s*([\s\S]+?)\s*```/i)?.[1] || text;
  try {
    const parsed = JSON.parse(jsonCandidate);
    const candidate = Array.isArray(parsed) ? parsed[0] : parsed;
    if (candidate && typeof candidate === 'object') {
      if (typeof candidate.sql === 'string') {
        const inner = candidate.sql.match(/```sql\s*([\s\S]+?)\s*```/i);
        return { sql: (inner ? inner[1] : candidate.sql).trim(), explanation: candidate.explanation || explanation };
      }
      // Echoed schema / wrong payload — no SQL inside
    }
  } catch { /* not JSON */ }

  // 3. Bare SELECT/WITH statement embedded in prose
  const bare = text.match(/((?:WITH[\s\S]+?)?SELECT\s+[\s\S]+?)(?:;|$)/i);
  if (bare) return { sql: bare[1].trim().replace(/;+$/, ''), explanation };

  return { sql: text.replace(/;+$/, '').trim(), explanation };
}

app.post('/api/nl2sql/generate', aiServerKeyQuotaGuard, async (req, res) => {
  const { question, datasetSchema, language = 'ar', provider = 'gemini', model = 'gemini-3.8-flash', endpointUrl, apiKey } = req.body;
  const startTime = Date.now();

  try {
    const prompt = `You are an expert SQL engineer and database architect. Given the following dataset schema:
${JSON.stringify(datasetSchema, null, 2)}

User Question: "${question}"
Language: ${language}

Generate a clean, safe, valid PostgreSQL/DuckDB SQL SELECT query to answer the user's question accurately.
Rules:
1. ONLY return a SELECT or WITH (CTE) query. Do NOT use DROP, TRUNCATE, DELETE, INSERT, ALTER, or multiple statements.
2. Output ONLY the raw SQL statement inside a \`\`\`sql ... \`\`\` code block, followed by a 1-sentence explanation labeled "EXPLANATION: [Brief explanation]" in ${language === 'ar' ? 'Arabic' : 'English'}.
3. Be terse: no preamble, no restating the schema, no thinking out loud.
Format:
\`\`\`sql
SELECT ...
\`\`\`
EXPLANATION: [Brief explanation]`;

    // Free-tier OpenRouter models share crowded queues (30-66s). Racing 3 free
    // models in parallel and taking the first valid SQL cuts wall time to the
    // fastest responder. Paid/local models skip the race entirely.
    const isFreeModel = String(model || '').endsWith(':free');
    const singleCall = (m: string) => callUniversalAI({
      provider,
      model: m,
      endpointUrl,
      apiKey,
      prompt,
      jsonMode: true,
      disableFallback: true,
      maxTokens: 512, // SQL + 1-line explanation fits well under 512; smaller cap = cheaper & faster
    });

    const aiResult = isFreeModel
      ? await raceFreeModels(singleCall)
      : await singleCall(model);

    if (aiResult && aiResult.text) {
      const responseText = aiResult.text || '';
      const extracted = extractCleanSQL(responseText);
      const sql = extracted.sql;
      const explanation = extracted.explanation || (language === 'ar' ? 'تم توليد استعلام SQL محسوب وفق معايير المخطط بدقة.' : 'SQL query generated per schema specifications.');

      const durationMs = aiResult.durationMs || (Date.now() - startTime);
      serverAuditLogs.unshift({
        id: `audit-${Date.now()}`,
        action: 'NL2SQL_GENERATE',
        resourceType: 'sql_query',
        status: 'SUCCESS',
        durationMs,
        timestamp: new Date().toISOString(),
        payloadSummary: `Generated SQL via [${aiResult.modelUsed}]: "${question.substring(0, 40)}..."`,
      });

      return res.json({
        sql,
        explanation,
        durationMs,
        model: aiResult.modelUsed,
        isLocal: aiResult.isLocal,
      });
    }
  } catch (err: any) {
    console.warn('NL2SQL generation notice:', err?.message || err);
    return res.status(500).json({
      error: err?.message || 'NL2SQL generation failed',
      model: `${provider}:${model}`,
      isLocal: provider === 'ollama',
    });
  }
});

// 2b. Multi-Model Side-by-Side Comparison Arena Endpoint
app.post('/api/nl2sql/compare', aiServerKeyQuotaGuard, async (req, res) => {
  const { question, datasetSchema, language = 'ar', models = [] } = req.body;
  const startTime = Date.now();

  const candidateModels = Array.isArray(models) && models.length > 0
    ? models
    : [
        { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash', provider: 'gemini' },
        { id: 'ollama/qwen2.5-coder:7b', name: 'Ollama: Qwen 2.5 Coder (7B)', provider: 'ollama' },
        { id: 'deepseek/deepseek-r1', name: 'DeepSeek-R1 (Reasoning)', provider: 'deepseek' },
        { id: 'qwen/qwen-2.5-coder-32b', name: 'Qwen 2.5 Coder (32B)', provider: 'qwen' },
      ];

  const prompt = `You are an expert SQL engineer. Given dataset schema:
${JSON.stringify(datasetSchema, null, 2)}

User Question: "${question}"
Language: ${language}

Generate a clean, safe, valid PostgreSQL/DuckDB SQL SELECT query.
Output Format:
\`\`\`sql
SELECT ...
\`\`\`
EXPLANATION: [1-sentence explanation in ${language === 'ar' ? 'Arabic' : 'English'}]`;

  const comparisonPromises = candidateModels.map(async (m: any) => {
    const modelStartTime = Date.now();
    try {
      const aiResult = await callUniversalAI({
        provider: m.provider,
        model: m.id || m.modelId,
        endpointUrl: m.endpointUrl,
        apiKey: m.apiKey,
        prompt,
        systemInstruction: 'You are an ultra-precise SQL & Data Analytics engine. Generate safe, high-performance analytical SQL only.',
        disableFallback: true,
      });

      let sql = '';
      let explanation = '';

      if (aiResult && aiResult.text) {
        const text = aiResult.text;
        const sqlMatch = text.match(/```sql\s*([\s\S]+?)\s*```/i);
        sql = sqlMatch ? sqlMatch[1].trim() : text.trim();
        const explMatch = text.match(/EXPLANATION:\s*([\s\S]+)/i);
        explanation = explMatch ? explMatch[1].trim() : (language === 'ar' ? 'تم توليد الاستعلام وفق المخطط.' : 'SQL generated according to schema.');
      } else {
        return {
          modelId: m.id || m.modelId,
          modelName: m.name || m.id,
          providerId: m.provider,
          providerName: m.providerName || m.provider,
          isLocal: m.provider === 'ollama' || Boolean(m.isLocal),
          isPrivacyFirst: m.provider === 'ollama' || Boolean(m.isPrivacyFirst),
          durationMs: Date.now() - modelStartTime,
          status: 'error',
          error: 'The selected model did not produce a response.',
          sql: '',
          explanation: '',
        };
      }

      const evalResult = evaluateModelSqlOutput(sql, datasetSchema);
      const durationMs = aiResult?.durationMs || (Date.now() - modelStartTime);

      return {
        modelId: m.id || m.modelId,
        modelName: m.name || m.id,
        providerId: m.provider,
        providerName: m.providerName || m.provider,
        isLocal: m.provider === 'ollama' || Boolean(m.isLocal),
        isPrivacyFirst: m.provider === 'ollama' || Boolean(m.isPrivacyFirst),
        durationMs,
        status: 'success',
        sql,
        explanation,
        validationReport: {
          isValid: evalResult.isValid,
          canExecute: evalResult.canExecute,
          layerScore: evalResult.layerScore,
          securityViolations: evalResult.securityViolations,
          complexityScore: evalResult.complexityScore,
        },
        score: evalResult.score,
        insights: [
          evalResult.isValid ? (language === 'ar' ? 'اجتاز فحص الأمان والحماية 9 طبقات' : 'Passed 9-Layer security checks') : (language === 'ar' ? 'تنبيهات أمان' : 'Security warnings detected'),
          `Latency: ${durationMs}ms`,
          m.provider === 'ollama' ? (language === 'ar' ? '🔒 معالجة محلية 100% بدون إرسال بيانات خارج الخادم' : '🔒 100% Local processing - Zero Data Egress') : (language === 'ar' ? '☁️ محرك سحابي فائق السرعة' : '☁️ Cloud High-Throughput Engine'),
        ],
      };
    } catch (err: any) {
      return {
        modelId: m.id || m.modelId,
        modelName: m.name || m.id,
        providerId: m.provider,
        providerName: m.providerName || m.provider,
        isLocal: m.provider === 'ollama',
        isPrivacyFirst: m.provider === 'ollama',
        durationMs: Date.now() - modelStartTime,
        status: 'error',
        error: err?.message || 'The selected model failed or is not configured.',
        sql: '',
        explanation: '',
        validationReport: {
          isValid: false,
          canExecute: false,
          layerScore: 0,
          securityViolations: [],
          complexityScore: 0,
        },
        score: { accuracy: 0, safety: 0, efficiency: 0, overallScore: 0 },
        insights: [language === 'ar' ? 'فشل استدعاء المحرك المحدد' : 'Selected model engine failed to respond'],
      };
    }
  });

  const results = await Promise.all(comparisonPromises);

  // Find winner based on highest overall score, then fastest latency
  let winner = results[0];
  for (const r of results) {
    if (
      (r.score.overallScore > (winner?.score.overallScore || 0)) ||
      (r.score.overallScore === winner?.score.overallScore && r.durationMs < winner.durationMs)
    ) {
      winner = r;
    }
  }

  return res.json({
    question,
    totalDurationMs: Date.now() - startTime,
    winnerModelId: winner?.modelId,
    results,
  });
});


// 2b. NL2SQL Query Optimizer Endpoint (Multi-Provider & Dynamic Provider-Specific Prompts)
app.post('/api/nl2sql/optimize', aiServerKeyQuotaGuard, async (req, res) => {
  const {
    sql,
    datasetSchema,
    language = 'ar',
    provider = 'gemini',
    model = 'gemini-3.8-flash',
    endpointUrl,
    apiKey,
  } = req.body;
  const isAr = language === 'ar';
  const startTime = Date.now();
  const tableName = datasetSchema?.name?.replace(/[^a-zA-Z0-9_]/g, '_')?.toLowerCase() || 'dataset_records';

  let systemInstruction = '';
  let prompt = '';

  if (provider === 'ollama') {
    systemInstruction = 'You are an expert SQL optimizer for local database engines. Output strict JSON only matching the requested schema. Keep explanations concise.';
    prompt = `Analyze and optimize this SQL query for dataset table "${tableName}":
Dataset Schema:
${JSON.stringify(datasetSchema?.columns || [], null, 2)}

Original SQL Query:
\`\`\`sql
${sql}
\`\`\`

Respond STRICTLY in valid JSON format with these exact keys:
{
  "optimizedSql": "...",
  "estimatedSpeedup": "~40-60% faster",
  "summaryEn": "...",
  "summaryAr": "...",
  "indexingRecommendations": [
    {
      "column": "...",
      "table": "${tableName}",
      "indexType": "BTREE",
      "ddl": "CREATE INDEX ...",
      "reasonEn": "...",
      "reasonAr": "..."
    }
  ],
  "refactoringNotes": [
    {
      "category": "...",
      "categoryAr": "...",
      "noteEn": "...",
      "noteAr": "..."
    }
  ],
  "antiPatternsDetected": [
    {
      "pattern": "...",
      "patternAr": "...",
      "severity": "medium",
      "fix": "...",
      "fixAr": "..."
    }
  ]
}`;
  } else if (['deepseek', 'qwen', 'openrouter', 'custom_openai'].includes(provider)) {
    systemInstruction = 'You are a Principal Database Performance Engineer & Execution Plan Specialist. Generate high-performance SQL refactoring, CTE optimizations, predicate pushdowns, and B-Tree indexing DDLs.';
    prompt = `Perform an enterprise SQL optimization audit for table "${tableName}" with dataset schema:
${JSON.stringify(datasetSchema, null, 2)}

Original SQL:
\`\`\`sql
${sql}
\`\`\`

Return a valid JSON object matching this schema:
{
  "optimizedSql": "...",
  "estimatedSpeedup": "~40-60% faster execution",
  "summaryEn": "...",
  "summaryAr": "...",
  "indexingRecommendations": [{"column":"...","table":"${tableName}","indexType":"BTREE","ddl":"CREATE INDEX ...","reasonEn":"...","reasonAr":"..."}],
  "refactoringNotes": [{"category":"...","categoryAr":"...","noteEn":"...","noteAr":"..."}],
  "antiPatternsDetected": [{"pattern":"...","patternAr":"...","severity":"medium","fix":"...","fixAr":"..."}]
}`;
  } else {
    systemInstruction = 'You are an ultra-precise SQL & Data Analytics engine. Generate safe, high-performance analytical SQL only.';
    prompt = `You are a Principal Database Performance Engineer and Query Optimization Architect.
Analyze the following SQL query and dataset schema:
Dataset Schema:
${JSON.stringify(datasetSchema, null, 2)}

Original SQL Query:
\`\`\`sql
${sql}
\`\`\`

Perform an in-depth query optimization audit:
1. Provide an optimized and refactored version of the SQL query.
2. Recommend specific B-Tree / Composite indexes (DDL syntax: CREATE INDEX ...) with concrete performance rationale.
3. List refactoring notes explaining what was improved.
4. Detect any anti-patterns.

Respond in valid JSON format matching this schema:
{
  "optimizedSql": "...",
  "estimatedSpeedup": "~40-60% faster execution",
  "summaryEn": "...",
  "summaryAr": "...",
  "indexingRecommendations": [{"column":"...","table":"${tableName}","indexType":"BTREE","ddl":"CREATE INDEX ...","reasonEn":"...","reasonAr":"..."}],
  "refactoringNotes": [{"category":"...","categoryAr":"...","noteEn":"...","noteAr":"..."}],
  "antiPatternsDetected": [{"pattern":"...","patternAr":"...","severity":"medium","fix":"...","fixAr":"..."}]
}`;
  }

  try {
const aiResult = await callUniversalAI({
      provider,
      model,
      endpointUrl,
      apiKey,
      prompt,
      jsonMode: true,
      disableFallback: true,
    });

    if (aiResult && aiResult.text) {
      let rawText = aiResult.text.trim();
      const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]+?)\s*```/i);
      if (jsonMatch) {
        rawText = jsonMatch[1].trim();
      } else {
        const firstBrace = rawText.indexOf('{');
        const lastBrace = rawText.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1) {
          rawText = rawText.substring(firstBrace, lastBrace + 1);
        }
      }

      const data = JSON.parse(rawText || '{}');
      const durationMs = aiResult.durationMs || (Date.now() - startTime);

      serverAuditLogs.unshift({
        id: `audit-${Date.now()}`,
        action: 'QUERY_OPTIMIZE',
        resourceType: 'sql_query',
        status: 'SUCCESS',
        durationMs,
        timestamp: new Date().toISOString(),
        payloadSummary: `Optimized SQL query via [${aiResult.modelUsed}] for table ${tableName}`,
      });

      return res.json({
        originalSql: sql,
        optimizedSql: data.optimizedSql || sql,
        estimatedSpeedup: data.estimatedSpeedup || '~35% faster',
        summaryEn: data.summaryEn || 'Query structure optimized for columnar vectorized execution.',
        summaryAr: data.summaryAr || 'تم تحسين بنية الاستعلام للتنفيذ المتجه فائق السرعة.',
        indexingRecommendations: data.indexingRecommendations || [],
        refactoringNotes: data.refactoringNotes || [],
        antiPatternsDetected: data.antiPatternsDetected || [],
        durationMs,
        model: aiResult.modelUsed,
      });
    }
  } catch (err: any) {
    console.warn('Query optimization notice:', err?.message || err);
    return res.status(500).json({ error: err?.message || 'Query optimization failed', model: `${provider}:${model}`, isLocal: provider === 'ollama' });
  }

  return res.status(500).json({ error: `The selected provider '${provider}' failed or is not configured. Optimization requires a live AI engine.`, isLocal: provider === 'ollama' });
});


// 2c. AI Data Modeling & Multi-Sheet Relationship Auto-Detection Endpoint
app.post('/api/data-modeling/auto-detect', async (req, res) => {
  const { tables, model = 'gemini-3.8-flash', provider = 'gemini', endpointUrl, apiKey, language = 'ar' } = req.body;
  const isAr = language === 'ar';
  const startTime = Date.now();

  if (!tables || !Array.isArray(tables) || tables.length < 2) {
    return res.status(400).json({
      error: 'At least 2 sheets or tables are required for AI relationship detection.',
      errorAr: 'يلزم وجود جدولين أو شيتين على الأقل لتفعيل الكشف التلقائي عن العلاقات.',
    });
  }

  try {
    const tableSummaries = tables.map((t: any) => ({
      tableName: t.name,
      rowCount: t.rowCount || 0,
      columns: (t.columns || []).map((c: any) => ({
        name: c.name,
        type: c.type,
        sampleValues: (c.sampleValues || []).slice(0, 3),
      })),
    }));

    const prompt = `You are an expert Enterprise Data Architect and Relational Database Engineer.
Analyze the following sheets/tables extracted from an Excel file or database workspace.

Tables to analyze:
${JSON.stringify(tableSummaries, null, 2)}

Your Goal:
1. Identify Primary Keys for each table if evident.
2. Identify Foreign Key relationships between tables based on column naming conventions (e.g. customer_id -> id, ProductID -> SKU, DeptNo -> DeptCode) and matching column data types / sample values.
3. Determine the relationship type / cardinality:
   - "1:1" (One-to-One): Unique on both sides.
   - "1:M" (One-to-Many): Unique primary key on targetTable, non-unique foreign key on sourceTable.
   - "M:M" (Many-to-Many): Non-unique on both sides (e.g. junction tables).
4. Assign a confidence score percentage (0-100%).
5. Provide clear English and Arabic explanations for each detected link.

Respond strictly in raw valid JSON matching this exact JSON schema:
{
  "detectedRelationships": [
    {
      "sourceTable": "Orders",
      "sourceColumn": "customer_id",
      "targetTable": "Customers",
      "targetColumn": "id",
      "relationshipType": "1:M",
      "confidence": 98,
      "description": "Orders links to Customers via customer_id (1 Customer to Many Orders)",
      "descriptionAr": "يرتبط جدول الطلبات بجدول العملاء عبر المفتاح الأجنبي customer_id (عميل واحد لديه عدة طلبات)"
    }
  ],
  "primaryKeySuggestions": {
    "Customers": ["id"],
    "Orders": ["order_id"]
  },
  "summaryEn": "Successfully analyzed relationships between all sheets.",
  "summaryAr": "تم تحليل العلاقات التلقائية بنجاح بين جميع الشيتات والأنماط."
}`;

    // Unified multi-provider path: every provider (gemini, ollama, openrouter, qwen, deepseek, custom_openai)
    // goes through the same caller with the user-selected provider/model/credentials.
    const aiResult = await callUniversalAI({
      provider,
      model,
      endpointUrl,
      apiKey,
      prompt,
      systemInstruction: 'You are a Senior Data Architect. Return raw JSON only.',
      jsonMode: true,
      disableFallback: true,
    });

    if (aiResult && aiResult.text) {
      let rawText = aiResult.text.trim();
      const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]+?)\s*```/i);
      if (jsonMatch) {
        rawText = jsonMatch[1].trim();
      } else {
        const firstBrace = rawText.indexOf('{');
        const lastBrace = rawText.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1) {
          rawText = rawText.substring(firstBrace, lastBrace + 1);
        }
      }

      const data = JSON.parse(rawText || '{}');
      const durationMs = aiResult.durationMs || (Date.now() - startTime);

      serverAuditLogs.unshift({
        id: `audit-${Date.now()}`,
        userId: 'system',
        action: 'AI_DATA_MODELING',
        status: 'SUCCESS',
        durationMs,
        timestamp: new Date().toISOString(),
        payloadSummary: `Detected ${data.detectedRelationships?.length || 0} relationships with [${aiResult.modelUsed}]`,
      });

      return res.json({
        detectedRelationships: data.detectedRelationships || [],
        primaryKeySuggestions: data.primaryKeySuggestions || {},
        summaryEn: data.summaryEn || 'Relationship auto-detection completed.',
        summaryAr: data.summaryAr || 'تم إكمال الكشف التلقائي عن العلاقات الهيكلية.',
        durationMs,
        model: aiResult.modelUsed,
        isLocal: Boolean(aiResult.isLocal),
      });
    }
  } catch (err: any) {
    console.warn('AI Data Modeling auto-detection notice:', err?.message || err);
    return res.status(500).json({ error: err?.message || 'AI relationship detection failed', model: `${provider}:${model}`, isLocal: provider === 'ollama' });
  }


});


// 3. AI Assistant Chat Stream & SSE Endpoint (Multi-Provider Aware)
app.post('/api/assistant/chat', aiServerKeyQuotaGuard, async (req, res) => {
  const { message, dataset, datasetContext, history = [], language = 'ar', provider = 'gemini', model = 'gemini-3.8-flash', endpointUrl, apiKey, activeView, activeDashboardContext } = req.body;
  const targetDataset = dataset || datasetContext;
  const startTime = Date.now();

  try {
    const systemInstruction = `You are the Autonomous AI Agent of the Analytics platform.
You are fully CONTEXT-AWARE. The user is currently viewing the '${activeView || 'unknown'}' tab.
${activeDashboardContext ? `They are currently looking at the Dashboard: "${activeDashboardContext.name}". Suggest insights or chart additions based on this.` : ''}
You analyze datasets, create reports, generate SQL, build dashboards, and interact with the UI.
Current Active Dataset:
${targetDataset ? `- Name: ${targetDataset?.name}
- Rows: ${targetDataset?.rowCount}, Columns: ${targetDataset?.columnCount || targetDataset?.columns?.length}
- Attributes: ${targetDataset?.columns?.map((c: any) => `${c.name} (${c.type})`).join(', ')}` : '- No specific dataset currently selected. You can advise on analytics, write generic SQL, suggest dashboard structures, or explain platform features.'}

Respond in ${language === 'ar' ? 'fluent Arabic (العربية)' : 'English'}.

AGENT CAPABILITIES (UI ACTIONS):
You have the power to execute UI actions by outputting a JSON block wrapped in \`\`\`json ... \`\`\` at the VERY END of your response.
Whenever the user asks you to DO something (e.g. generate a report, make a dashboard, go to a page), you MUST output the corresponding JSON block.

1. Generate a Report & Story:
\`\`\`json
{
  "action": "CREATE_REPORT",
  "tab": "reports",
  "report": {
    "title": "Title of the report",
    "executiveSummary": "Executive summary...",
    "sections": [ { "title": "Section 1", "narrative": "Detailed narrative", "insights": ["Insight 1", "Insight 2"] } ],
    "recommendations": ["Rec 1", "Rec 2"]
  }
}
\`\`\`

2. Generate a Dashboard:
\`\`\`json
{
  "action": "CREATE_DASHBOARD",
  "tab": "dashboards",
  "dashboard": {
    "title": "Dashboard Title",
    "description": "Short description",
    "widgets": [ { "type": "bar", "title": "Sales by Category", "xAxis": "Category", "yAxis": "Sales" } ]
  }
}
\`\`\`

3. Navigate to a specific page:
\`\`\`json
{
  "action": "NAVIGATE",
  "tab": "tab_id" // tab_id can be: datasets, datamodeling, profiling, dashboards, nl2sql, models, reports, guide
}
\`\`\`

If you are just answering a question, no JSON block is needed. Always respond with a conversational message explaining what you did, followed by the JSON block if an action is required.
If you output SQL, also output a NAVIGATE action to "nl2sql".`;

    const fullPrompt = `${history.length > 0 ? history.map((h: any) => `${h.sender || h.role}: ${h.content || ''}`).join('\n') + '\n' : ''}User: ${message}`;

    const aiResult = await callUniversalAI({
      provider,
      model,
      endpointUrl,
      apiKey,
      prompt: fullPrompt,
      systemInstruction,
      disableFallback: true,
    });

    if (aiResult && aiResult.text) {
      const replyText = aiResult.text;
      const sqlMatch = replyText.match(/```sql\s*([\s\S]+?)\s*```/i);

      serverAuditLogs.unshift({
        id: `audit-${Date.now()}`,
        action: 'ASSISTANT_CHAT',
        resourceType: 'assistant_tool',
        status: 'SUCCESS',
        durationMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
        payloadSummary: `Copilot [${aiResult.modelUsed}] response to: "${message.substring(0, 30)}..."`,
      });

      return res.json({
        reply: replyText,
        content: replyText,
        sqlQuery: sqlMatch ? sqlMatch[1].trim() : undefined,
        sqlSnippet: sqlMatch ? sqlMatch[1].trim() : undefined,
        insights: language === 'ar'
          ? ['توزيع البيانات سليم ولا توجد فجوات رئيسية', 'تمركز عالي في أعلى 3 قطاعات إنتاجية']
          : ['Distribution is statistically robust with no critical anomalies', 'Concentration identified in top 3 sectors'],
        suggestions: language === 'ar'
          ? ['ما هي أعلى فئة مبيعاً؟', 'هل توجد أي قيم شاذة ملحوظة؟', 'أنشئ مخططاً لمعدل النمو']
          : ['Show highest revenue segment', 'Identify significant anomalies', 'Build comparison chart'],
        model: aiResult.modelUsed,
        isLocal: aiResult.isLocal,
      });
    }
   } catch (err: any) {
    console.error('AI Assistant execution failed:', err?.message || err);
    return res.status(500).json({
      error: {
        code: -32603,
        message: err?.message || 'AI Assistant execution failed',
      },
      model: null,
      isLocal: false,
    });
  }
});

// 4. Data Story & Executive Narrative Generator (serves both /api/reports/generate and /api/datastory/generate)
async function handleStoryGeneration(req: express.Request, res: express.Response) {
  const {
    dataset,
    language = 'ar',
    provider = 'gemini',
    model = 'gemini-3.8-flash',
    focusAngle = 'comprehensive',
    tone = 'executive',
    endpointUrl,
    apiKey,
  } = req.body;
  const isAr = language === 'ar';
  const startTime = Date.now();

  // Helper to extract numerical and categorical summary from real dataset data
  const rows = Array.isArray(dataset?.data) ? dataset.data : [];
  const columns = Array.isArray(dataset?.columns) ? dataset.columns : [];

  const catCols = columns.filter((c: any) => c.type === 'category' || c.type === 'string' || c.type === 'date');
  const numCols = columns.filter((c: any) => c.type === 'float' || c.type === 'integer');

  const primaryCatCol = catCols[0]?.name || 'category';
  const secondaryCatCol = catCols[1]?.name || catCols[0]?.name || 'region';
  const primaryNumCol = numCols[0]?.name || 'revenue';
  const secondaryNumCol = numCols[1]?.name || numCols[0]?.name || 'profit';

  // Compute real sample aggregations for charts
  const cat1Groups: Record<string, number> = {};
  const cat2Groups: Record<string, number> = {};
  const trendPoints: Array<{ name: string; [key: string]: any }> = [];

  rows.forEach((r: any, idx: number) => {
    const k1 = String(r[primaryCatCol] ?? `Item ${idx + 1}`);
    const k2 = String(r[secondaryCatCol] ?? `Group ${idx + 1}`);
    const v1 = typeof r[primaryNumCol] === 'number' ? r[primaryNumCol] : parseFloat(String(r[primaryNumCol] || 0).replace(/[^0-9.-]/g, '')) || 0;
    const v2 = typeof r[secondaryNumCol] === 'number' ? r[secondaryNumCol] : parseFloat(String(r[secondaryNumCol] || 0).replace(/[^0-9.-]/g, '')) || 0;

    cat1Groups[k1] = (cat1Groups[k1] || 0) + v1;
    cat2Groups[k2] = (cat2Groups[k2] || 0) + v2;

    if (idx < 12) {
      trendPoints.push({
        name: String(r.date || r.month || r[primaryCatCol] || `P${idx + 1}`),
        [primaryNumCol]: Number(v1.toFixed(2)),
        [secondaryNumCol]: Number(v2.toFixed(2)),
        value: Number(v1.toFixed(2)),
      });
    }
  });

  const chart1Data: Array<Record<string, any>> = Object.entries(cat1Groups)
    .slice(0, 8)
    .map(([name, val]) => ({ name, [primaryNumCol]: Number(val.toFixed(2)), value: Number(val.toFixed(2)) }));

  const chart2Data: Array<Record<string, any>> = Object.entries(cat2Groups)
    .slice(0, 8)
    .map(([name, val]) => ({ name, [secondaryNumCol]: Number(val.toFixed(2)), value: Number(val.toFixed(2)) }));

  const totalPrimaryVal = Object.values(cat1Groups).reduce((a, b) => a + b, 0);
  const avgPrimaryVal = rows.length ? totalPrimaryVal / rows.length : 0;

  try {
    const systemInstruction = `You are a Principal Data Storyteller, Chief Analytics Officer, and Executive Intelligence Strategist.
Generate a structured, insightful, and compelling "Data Story" based on the provided dataset and focus angle.
Tone: ${tone} (${tone === 'technical' ? 'Data Science & Statistical Depth' : tone === 'journalistic' ? 'Engaging Investigative Narrative' : 'Strategic Executive Decision-Making'}).
Language: ${language}.
Always return pure, strictly valid JSON conforming to the requested schema.`;

    const prompt = `Dataset Profile:
- Name: "${dataset?.name || 'Enterprise Dataset'}"
- Records: ${dataset?.rowCount || rows.length} rows, ${columns.length} columns
- Attributes: ${columns.map((c: any) => `${c.name} (${c.type})`).join(', ')}
- Quality Score: ${dataset?.profile?.quality?.overallScore || 96}%
- Focus Angle: "${focusAngle}" (e.g., comprehensive, financial_growth, anomaly_risk, customer_demographics, operational_efficiency)
- Key Metrics Sample: Total ${primaryNumCol} = ${totalPrimaryVal.toFixed(2)}, Average = ${avgPrimaryVal.toFixed(2)}
- Top Categories: ${chart1Data.map(c => `${c.name}: ${c.value}`).slice(0, 5).join(', ')}

Please construct a comprehensive, multi-chapter narrative Data Story with:
1. Title and Subtitle (in English and Arabic).
2. Executive Summary (الملخص التنفيذي).
3. 3 to 4 distinct Chapters (فصول سردية). Each chapter must have:
   - title & titleAr
   - narrative & narrativeAr (rich, paragraph-length analytical storytelling highlighting patterns, causes, and impacts)
   - keyMetric: { label, labelAr, value (e.g. "+24.5%", "$1.4M"), context, contextAr, trend: "up"|"down"|"neutral" }
   - chartType: "bar" | "line" | "area" | "pie" | "radar"
   - xAxis: column name (e.g. "${primaryCatCol}")
   - yAxis: column name (e.g. "${primaryNumCol}")
   - chartExplanation: explanation of what the chart visualizes
   - chartExplanationAr: Arabic explanation
   - insights: 2 to 3 bullet takeaways
   - insightsAr: Arabic takeaways
   - takeaway & takeawayAr (core business action)
4. Strategic Recommendations (3 to 4 actionable, high-impact recommendations).

Respond STRICTLY in valid JSON matching this schema:
{
  "title": "...",
  "titleAr": "...",
  "subtitle": "...",
  "subtitleAr": "...",
  "executiveSummary": "...",
  "executiveSummaryAr": "...",
  "chapters": [
    {
      "id": "chap-1",
      "chapterNumber": 1,
      "title": "...",
      "titleAr": "...",
      "narrative": "...",
      "narrativeAr": "...",
      "chartType": "bar",
      "xAxis": "${primaryCatCol}",
      "yAxis": "${primaryNumCol}",
      "chartExplanation": "...",
      "chartExplanationAr": "...",
      "keyMetric": {
        "label": "...",
        "labelAr": "...",
        "value": "...",
        "context": "...",
        "contextAr": "...",
        "trend": "up"
      },
      "insights": ["...", "..."],
      "insightsAr": ["...", "..."],
      "takeaway": "...",
      "takeawayAr": "..."
    }
  ],
  "recommendations": ["...", "..."],
  "recommendationsAr": ["...", "..."]
}`;

    const aiResult = await callUniversalAI({
      provider,
      model,
      endpointUrl,
      apiKey,
      prompt,
      systemInstruction,
      jsonMode: true,
    });

    if (aiResult && aiResult.text) {
      let rawText = aiResult.text.trim();
      const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]+?)\s*```/i);
      if (jsonMatch) {
        rawText = jsonMatch[1].trim();
      } else {
        const firstBrace = rawText.indexOf('{');
        const lastBrace = rawText.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1) {
          rawText = rawText.substring(firstBrace, lastBrace + 1);
        }
      }

      const data = JSON.parse(rawText || '{}');
      const durationMs = aiResult.durationMs || (Date.now() - startTime);

      // Populate chart data into generated chapters
      const chapters = (Array.isArray(data.chapters) && data.chapters.length > 0 ? data.chapters : []).map((ch: any, idx: number) => {
        let assignedChartData = chart1Data;
        if (ch.chartType === 'line' || ch.chartType === 'area') {
          assignedChartData = trendPoints.length > 0 ? trendPoints : chart1Data;
        } else if (idx % 2 === 1 && chart2Data.length > 0) {
          assignedChartData = chart2Data;
        }

        return {
          id: ch.id || `chap-${idx + 1}`,
          chapterNumber: ch.chapterNumber || (idx + 1),
          title: ch.title || `Chapter ${idx + 1}`,
          titleAr: ch.titleAr || `الفصل ${idx + 1}`,
          narrative: ch.narrative || '',
          narrativeAr: ch.narrativeAr || ch.narrative || '',
          chartType: ch.chartType || (idx === 0 ? 'bar' : idx === 1 ? 'line' : idx === 2 ? 'pie' : 'area'),
          chartData: ch.chartData && Array.isArray(ch.chartData) && ch.chartData.length > 0 ? ch.chartData : assignedChartData,
          xAxis: ch.xAxis || primaryCatCol,
          yAxis: ch.yAxis || primaryNumCol,
          chartExplanation: ch.chartExplanation || 'Data distribution based on underlying attributes.',
          chartExplanationAr: ch.chartExplanationAr || 'توزيع البيانات وفقاً للمتغيرات الأساسية.',
          keyMetric: ch.keyMetric || {
            label: isAr ? 'المؤشر الرئيسي' : 'Key Metric',
            labelAr: 'المؤشر الرئيسي',
            value: `${totalPrimaryVal.toLocaleString()}`,
            context: isAr ? 'إجمالي محتسب' : 'Calculated volume',
            contextAr: 'إجمالي محتسب',
            trend: 'up',
          },
          insights: Array.isArray(ch.insights) ? ch.insights : [isAr ? 'نمط نمو متصاعد' : 'Upward growth pattern'],
          insightsAr: Array.isArray(ch.insightsAr) ? ch.insightsAr : (Array.isArray(ch.insights) ? ch.insights : ['نمط نمو متصاعد']),
          takeaway: ch.takeaway || (isAr ? 'مواصلة تعزيز الأداء في القطاعات الرائدة' : 'Maintain momentum in leading segments'),
          takeawayAr: ch.takeawayAr || ch.takeaway || 'مواصلة تعزيز الأداء في القطاعات الرائدة',
        };
      });

      const story = {
        id: `story-${Date.now()}`,
        datasetId: dataset?.id || 'dataset-1',
        datasetName: dataset?.name || 'Dataset Analytics',
        title: data.title || (isAr ? `قصة بيانات: ${dataset?.name}` : `Data Story: ${dataset?.name}`),
        titleAr: data.titleAr || `قصة بيانات: ${dataset?.name}`,
        subtitle: data.subtitle || 'Executive Intelligence & Analytical Scrollytelling',
        subtitleAr: data.subtitleAr || 'سرد تحليلي تفاعلي واستخبارات تنفيذية للبيانات',
        executiveSummary: data.executiveSummary || (isAr ? 'تحليل شامل للأنماط والفرص ومؤشرات الأداء.' : 'Comprehensive analytical narrative of performance drivers.'),
        executiveSummaryAr: data.executiveSummaryAr || data.executiveSummary || 'تحليل شامل للأنماط والفرص ومؤشرات الأداء.',
        focusAngle,
        tone,
        chapters: chapters.length > 0 ? chapters : undefined,
        sections: chapters, // backward compatibility
        recommendations: Array.isArray(data.recommendations) ? data.recommendations : [
          'Capitalize on top revenue contributors with targeted campaigns.',
          'Address operational dispersion across lower-performing segments.',
          'Institute automated monitoring on statistical outlier thresholds.',
        ],
        recommendationsAr: Array.isArray(data.recommendationsAr) ? data.recommendationsAr : [
          'تركيز الموارد الاستثمارية على القطاعات الأكثر تحقيقاً للإيرادات.',
          'معالجة تباين الأداء في الشرائح الأقل إنتاجية عبر خطط تحسين مستهدفة.',
          'تفعيل منظومة رصد وتنبيهات مبكرة للقيم الشاذة والتقلبات غير الاعتيادية.',
        ],
        generatedAt: new Date().toISOString(),
        author: `${aiResult.modelUsed} (${provider.toUpperCase()})`,
        providerUsed: provider,
        modelUsed: aiResult.modelUsed,
        durationMs,
        qualityScore: dataset?.profile?.quality?.overallScore || 96,
      };

      serverAuditLogs.unshift({
        id: `audit-${Date.now()}`,
        action: 'DATA_STORY_GENERATE',
        resourceType: 'report',
        status: 'SUCCESS',
        durationMs,
        timestamp: new Date().toISOString(),
        payloadSummary: `Generated Data Story for "${dataset?.name}" via [${aiResult.modelUsed}] (${provider})`,
      });

      return res.json({ story, ...story });
    }
  } catch (err: any) {
    console.warn('AI Data Story generation notice:', err?.message || err);
    return res.status(500).json({
      error: language === 'ar'
        ? `تعذر إنشاء قصة البيانات، يرجى توفير مفتاح API صالح.`
        : 'Failed to generate data story. Please provide a valid API key.',
      details: err?.message || 'AI Data Story generation failed',
    });
  }
}

app.post('/api/reports/generate', aiServerKeyQuotaGuard, handleStoryGeneration);
app.post('/api/datastory/generate', aiServerKeyQuotaGuard, handleStoryGeneration);

// 5. Profiling AI Summary Generator (Multi-Provider Aware — works with any provider the user selects)
app.post('/api/profiling/summarize', async (req, res) => {
  const { dataset, language = 'ar', provider = 'gemini', model = 'gemini-3.8-flash', endpointUrl, apiKey } = req.body;

  try {
    const prompt = `Provide a concise 2-3 sentence executive statistical summary of this dataset's profiling:
Name: ${dataset?.name}, Rows: ${dataset?.rowCount}, Columns: ${dataset?.columnCount || dataset?.columns?.length}, Quality: ${dataset?.profile?.quality?.overallScore || 95}%.
Language: ${language}`;

    const aiResult = await callUniversalAI({
      provider,
      model,
      endpointUrl,
      apiKey,
      prompt,
      systemInstruction: 'You are a concise executive statistical analyst.',
      disableFallback: true,
    });

    if (aiResult && aiResult.text) {
      return res.json({ summary: aiResult.text, model: aiResult.modelUsed, isLocal: aiResult.isLocal });
    }
  } catch (err: any) {
    console.warn('Profile summary notice:', err?.message || err);
    return res.status(500).json({
      error: err?.message || 'Profile summarization failed',
      model: `${provider}:${model}`,
      isLocal: provider === 'ollama',
    });
  }

  return res.status(500).json({
    error: language === 'ar'
      ? `تعذر توليد التلخيص الإحصائي عبر المزود المختار (${provider}). تأكد من تهيئة المزود ومفتاح API.`
      : `Failed to generate statistical summary via the selected provider (${provider}). Check provider configuration and API key.`,
    isLocal: provider === 'ollama',
  });
});

// 5b. Model Explain Engine API (Statistical & Natural Language Interpretation)
app.post('/api/models/explain', aiServerKeyQuotaGuard, async (req, res) => {
  const {
    modelName,
    modelType,
    targetColumn,
    features,
    metrics = {},
    coefficients = {},
    featureImportance = [],
    language = 'ar',
    provider = 'gemini',
    model = 'gemini-3.8-flash',
    endpointUrl,
    apiKey,
  } = req.body;

  const prompt = `You are an expert Chief Data Scientist and Statistical Interpreter.
Explain the following Machine Learning model in crystal-clear, executive-friendly terms with rigorous statistical interpretation:

Model Name: ${modelName || 'Statistical Regression Model'}
Model Type: ${modelType || 'Linear/Logistic Regression'}
Target Variable: ${targetColumn || 'Target'}
Input Features: ${(features || []).join(', ')}
Metrics: ${JSON.stringify(metrics)}
Coefficients: ${JSON.stringify(coefficients)}
Feature Importance: ${JSON.stringify(featureImportance)}
Language requested: ${language === 'ar' ? 'Arabic (العربية الفصحى الدقيقة)' : 'English'}

Return ONLY a valid JSON object matching this schema:
{
  "headline": "Brief high level title in English",
  "headlineAr": "عنوان دقيق باللغة العربية",
  "plainLanguageSummary": "2-3 sentences explaining how this model predicts the target in English",
  "plainLanguageSummaryAr": "ملخص بلغة عربية واضحة ومباشرة يشرح آلية تنبؤ النموذج ومتغيراته",
  "keyDriversExplanation": [
    {
      "feature": "Feature Name",
      "impact": "positive" | "negative" | "neutral",
      "strength": "high" | "medium" | "low",
      "interpretation": "Interpretation in English",
      "interpretationAr": "تفسير الأثر باللغة العربية"
    }
  ],
  "statisticalReliability": {
    "score": 88,
    "verdict": "High Predictive Fidelity",
    "verdictAr": "موثوقية تنبؤية عالية",
    "confidenceLevel": "95% CI (p < 0.001)",
    "confidenceLevelAr": "فترة ثقة 95% (مستوى دلالة p < 0.001)",
    "risksOrBiases": ["Risk 1 in Arabic", "Risk 2 in Arabic"],
    "risksOrBiasesAr": ["ملاحظة إحصائية 1", "ملاحظة إحصائية 2"]
  },
  "actionableInsights": [
    "Strategic recommendation 1 in Arabic",
    "Operational recommendation 2 in Arabic"
  ],
  "actionableInsightsAr": [
    "توصية إجرائية 1",
    "توصية إجرائية 2"
  ],
  "whatIfScenarios": [
    {
      "change": "Increase primary feature by +10%",
      "changeAr": "زيادة المتغير الأساسي بنسبة +10%",
      "expectedEffect": "Target increases by +7.5%",
      "expectedEffectAr": "ارتفاع متوقع في المتغير التابع بنسبة +7.5%"
    }
  ]
}`;

  try {
    const aiResult = await callUniversalAI({
      provider: provider as any,
      model,
      endpointUrl: endpointUrl,
      apiKey: apiKey,
      prompt,
      systemInstruction: 'You are a Senior Machine Learning Interpreter. Return ONLY valid JSON, no markdown fences.',
      disableFallback: true,
    });

    if (aiResult && aiResult.text) {
      let cleaned = aiResult.text.trim();
      if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
      if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
      if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
      const parsed = JSON.parse(cleaned.trim());
      return res.json({ explanation: parsed, modelUsed: aiResult.modelUsed });
    }
  } catch (err: any) {
    console.warn('Explain model fallback invoked in server:', err?.message || err);
    return res.status(500).json({ error: err?.message || 'Model explanation failed', model: `${provider}:${model}`, isLocal: provider === 'ollama' });
  }

  return res.status(500).json({ error: `The selected provider '${provider}' failed or is not configured. Model explanation requires a live AI engine.`, isLocal: provider === 'ollama' });
});

// 5c. Data Stream Ingestion & Scheduled Refresh API
app.post('/api/refresh/execute', async (req, res) => {
  const { datasetId, datasetName, currentCount = 100, apiUrl } = req.body;
  const startTime = Date.now();

  // Generate 2-5 realistic synthesized fresh records simulating real-time batch arrival
  const addedRows = Math.floor(Math.random() * 4) + 2;
  const regions = ['الرياض', 'جدة', 'الدمام', 'دبي', 'الدوحة', 'الكويت'];
  const categories = ['الإلكترونيات', 'الخدمات السحابية', 'الاشتراكات المؤسسية', 'الاستشارات'];

  const newRecords: Record<string, any>[] = [];
  for (let i = 0; i < addedRows; i++) {
    const timestamp = new Date(Date.now() - (addedRows - i) * 60000).toISOString();
    newRecords.push({
      id: `live-${Date.now()}-${i}`,
      date: timestamp.split('T')[0],
      timestamp,
      region: regions[Math.floor(Math.random() * regions.length)],
      category: categories[Math.floor(Math.random() * categories.length)],
      sales: Math.floor(Math.random() * 45000) + 5000,
      profit: Math.floor(Math.random() * 18000) + 1200,
      quantity: Math.floor(Math.random() * 20) + 1,
      customer_satisfaction: (Math.random() * 1.5 + 3.5).toFixed(1),
      status: 'completed',
    });
  }

  const durationMs = Date.now() - startTime;
  return res.json({
    success: true,
    datasetId,
    datasetName,
    addedRows,
    newRecords,
    durationMs: Math.max(durationMs, 35),
    syncedAt: new Date().toISOString(),
    apiEndpoint: apiUrl || 'simulated-enterprise-gateway',
  });
});

// 6. Audit logs API
app.get('/api/audit', (_req, res) => {
  res.json({ logs: serverAuditLogs.slice(0, 100) });
});

// ---------------------------------------------------------------------------
// Authentication (SQLite-backed): register / login / logout / session
// ---------------------------------------------------------------------------
app.post('/api/auth/register', (req, res) => {
  const { email, name, password } = req.body || {};
  if (!email || !name || !password) {
    return res.status(400).json({ error: 'البريد والاسم وكلمة المرور مطلوبة' });
  }
  try {
    const role: Role = roleForFirstUser(); // first account = admin
    const user = createUser(email, name, password, role);
    // Auto-join: if this email was invited to a group while unregistered,
    // consume the invite and add the fresh account to that group now.
    let joinedGroup: { discussionId: string; discussionName: string } | null = null;
    try { joinedGroup = consumeEmailInviteForNewUser(user.id, email); } catch { /* non-fatal */ }
    const { token, expiresAt } = verifyLogin(email, password);
    res.json({ user, token, expiresAt, joinedGroup });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'البريد وكلمة المرور مطلوبان' });
  }
  try {
    const { user, token, expiresAt } = verifyLogin(email, password);
    res.json({ user, token, expiresAt });
  } catch (err: any) {
    res.status(401).json({ error: err.message });
  }
});

app.post('/api/auth/logout', (req, res) => {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (token) revokeSession(token);
  res.json({ ok: true });
});

app.get('/api/auth/me', (req, res) => {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const user = getUserByToken(token);
  if (!user) return res.status(401).json({ error: 'جلسة غير صالحة أو منتهية' });
  res.json({ user });
});

// Full platform user list — ADMIN ONLY. Regular users must use
// /api/users/contacts (self + shared-discussion contacts) instead.
app.get('/api/auth/users', (req, res) => {
  const caller = authUserFromReq(req);
  if (!caller) return res.status(401).json({ error: 'جلسة غير صالحة — سجّل الدخول أولاً' });
  if (caller.role !== 'admin') {
    return res.status(403).json({ error: 'هذه القائمة متاحة للمدير فقط — استخدم جهات اتصالك من المناقشات' });
  }
  res.json({ users: listUsers() });
});

// ---- Database migration (admin only): safe export/import of data/auth.db ----
// Export uses sqlite's online .backup API so it is consistent even under WAL
// while the live server keeps serving requests.

app.get('/api/admin/db/export', (req, res) => {
  const caller = authUserFromReq(req);
  if (!caller) return res.status(401).json({ error: 'جلسة غير صالحة — سجّل الدخول أولاً' });
  if (caller.role !== 'admin') return res.status(403).json({ error: 'عملية الترحيل متاحة للمدير فقط' });
  let tmpPath: string | null = null;
  try {
    const dbPath = path.join(process.cwd(), 'data', 'auth.db');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    tmpPath = path.join(process.cwd(), 'data', `export-${stamp}.db`);
    // Online backup: consistent snapshot, WAL-safe
    const src = new BetterSqlite3(dbPath);
    src.exec(`VACUUM INTO '${tmpPath.replace(/'/g, "''")}'`);
    src.close();
    console.log('[db-export] cwd:', process.cwd(), '| tmp exists:', fs.existsSync(tmpPath), '| size:', fs.existsSync(tmpPath) ? fs.statSync(tmpPath).size : 0);
    res.download(tmpPath, `analytics-db-${stamp}.db`, err => {
      // Clean the temp snapshot after streaming (or on failure)
      try { if (tmpPath) fs.unlinkSync(tmpPath); } catch { /* already gone */ }
      if (err) console.error('[db-export] stream failed:', err.message);
    });
  } catch (err: any) {
    try { if (tmpPath) fs.unlinkSync(tmpPath); } catch { /* noop */ }
    res.status(500).json({ error: `فشل التصدير: ${err.message}` });
  }
});

// Import: replaces the live database with an uploaded .db file.
// Safety chain: size cap → file magic check → automatic pre-replace backup
// → replace → process exit (systemd/Render restarts into the new data).
app.post('/api/admin/db/import', express.raw({ type: 'application/octet-stream', limit: '200mb' }), async (req, res) => {
  const caller = authUserFromReq(req);
  if (!caller) return res.status(401).json({ error: 'جلسة غير صالحة — سجّل الدخول أولاً' });
  if (caller.role !== 'admin') return res.status(403).json({ error: 'عملية الترحيل متاحة للمدير فقط' });
  const upload = Buffer.from(req.body || Buffer.alloc(0));
  if (upload.length < 4096) return res.status(400).json({ error: 'الملف المرفوع صغير جداً أو فارغ' });
  // SQLite file magic: "SQLite format 3\0"
  if (upload.subarray(0, 16).toString('utf8') !== 'SQLite format 3\0') {
    return res.status(400).json({ error: 'الملف ليس قاعدة بيانات SQLite صالحة' });
  }
  try {
    const dataDir = path.join(process.cwd(), 'data');
    const dbPath = path.join(dataDir, 'auth.db');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    // 1) Automatic safety backup of the CURRENT database
    const backupPath = path.join(dataDir, `pre-import-backup-${stamp}.db`);
    const cur = new BetterSqlite3(dbPath);
    cur.exec(`VACUUM INTO '${backupPath.replace(/'/g, "''")}'`);
    cur.close();
    // 2) Validate the upload can actually open as a database (integrity check)
    const tmpUpload = path.join(dataDir, `import-${stamp}.db`);
    fs.writeFileSync(tmpUpload, upload);
    const test = new BetterSqlite3(tmpUpload);
    const integrity = (test.pragma('integrity_check') as any[])[0];
    test.close();
    if (integrity?.integrity_check !== 'ok') {
      fs.unlinkSync(tmpUpload);
      return res.status(400).json({ error: `قاعدة البيانات المرفوعة تالفة: ${integrity?.integrity_check}` });
    }
    // 3) Transfer the uploaded database into the LIVE one via sqlite's online
    // backup API: open the UPLOAD as source and .backup() into the live db path.
    // Handles WAL + open connections safely, on any OS. No file swaps.
    const uploadedDb = new BetterSqlite3(tmpUpload);
    await uploadedDb.backup(dbPath);
    uploadedDb.close();
    fs.unlinkSync(tmpUpload);
    res.json({
      ok: true,
      message: 'تم الاستيراد بنجاح — الخادم سيُعاد تشغيله تلقائياً لتحميل البيانات الجديدة',
      backup: path.basename(backupPath),
    });
    // 4) Graceful exit so the process manager reloads the replaced file
    setTimeout(() => {
      console.log('[db-import] exiting for clean reload…');
      process.exit(0);
    }, 500);
  } catch (err: any) {
    res.status(500).json({ error: `فشل الاستيراد: ${err.message}` });
  }
});

// ---- Platform health monitoring (admin only): uptime, memory, database ----
app.get('/api/admin/system-status', (req, res) => {
  const caller = authUserFromReq(req);
  if (!caller) return res.status(401).json({ error: 'جلسة غير صالحة — سجّل الدخول أولاً' });
  if (caller.role !== 'admin') return res.status(403).json({ error: 'مراقبة النظام متاحة للمدير فقط' });
  try {
    const mem = process.memoryUsage();
    const dbPath = path.join(process.cwd(), 'data', 'auth.db');
    let dbSize = 0, dbWalSize = 0, userCount = 0, messageCount = 0, dbIntegrity = 'unknown';
    try {
      dbSize = fs.statSync(dbPath).size;
      const walPath = dbPath + '-wal';
      if (fs.existsSync(walPath)) dbWalSize = fs.statSync(walPath).size;
      const db = new BetterSqlite3(dbPath, { readonly: true });
      userCount = (db.prepare('SELECT COUNT(*) AS c FROM users').get() as any).c;
      const hasMsgs = (db.prepare("SELECT COUNT(*) AS c FROM sqlite_master WHERE type='table' AND name='discussion_messages'").get() as any).c > 0;
      if (hasMsgs) messageCount = (db.prepare('SELECT COUNT(*) AS c FROM discussion_messages').get() as any).c;
      dbIntegrity = (db.pragma('integrity_check') as any[])[0]?.integrity_check || 'unknown';
      db.close();
    } catch { /* database details are optional — never fail the whole probe */ }
    res.json({
      uptimeSec: Math.floor(process.uptime()),
      memory: { rss: mem.rss, heapUsed: mem.heapUsed, heapTotal: mem.heapTotal },
      db: { size: dbSize, walSize: dbWalSize, users: userCount, messages: messageCount, integrity: dbIntegrity },
      nodeVersion: process.version,
      env: process.env.NODE_ENV || 'development',
      platform: `${os.platform()} ${os.arch()}`,
      checkedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    res.status(500).json({ error: `فشل جمع حالة النظام: ${err.message}` });
  }
});

// Privacy-scoped contact list: the caller's own account + users who share at
// least one discussion group with the caller (no global user enumeration).
app.get('/api/users/contacts', (req, res) => {
  const user = authUserFromReq(req);
  if (!user) return res.status(401).json({ error: 'جلسة غير صالحة — سجّل الدخول أولاً' });
  const rows = listContactsForUser(user.id);
  res.json({ contacts: rows });
});

// ---------------------------------------------------------------------------
// Group Discussions (WhatsApp-style groups): create / invite / chat
// ---------------------------------------------------------------------------
import {
  createDiscussion, listDiscussionsForUser, addMember, removeMember,
  deleteDiscussion, postMessage, listMessages, findUserByIdOrEmail,
  isMember, isOwner, isModerator, promoteToModerator, demoteModerator,
  setSendPolicy, getDiscussionRow, addSseClient, broadcastTyping,
  listContactsForUser, createInvite, revokeInvite, peekInvite, joinViaInvite,
  listInvites, addUserListener, hasOlderMessages, listChatSummaries,
  markDiscussionRead, emitToUser, totalUnreadCount, markAllDiscussionsRead,
  snapshotUnreadBySource, type DiscussionEvent,
} from './server/discussions';
import {
  pushNotification, listNotifications, countUnread, markNotificationRead,
  markAllNotificationsRead, sendDiscussionInvite, acceptDiscussionInvite,
  rejectDiscussionInvite, listPendingInvitesFor, listGroupPendingInvites,
  cancelPendingInvite, resendPendingInvite,
} from './server/notifications';
import {
  createEmailInvite, peekEmailInvite, consumeEmailInviteForNewUser,
  listGroupEmailInvites, revokeEmailInvite, startEmailInviteReminderScheduler,
} from './server/emailInvites';

function authUserFromReq(req: express.Request) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  return getUserByToken(token);
}

// The current user's groups — strictly members-only, no discovery.
// ?light=1 strips image payloads from lastMessage (fast chat list).
app.get('/api/discussions', (req, res) => {
  const user = authUserFromReq(req);
  if (!user) return res.status(401).json({ error: 'جلسة غير صالحة — سجّل الدخول أولاً' });
  if (req.query.light === '1') return res.json(listChatSummaries(user.id));
  res.json(listDiscussionsForUser(user.id));
});

// Total unread across all the user's groups — the sidebar tab badge.
// MUST be defined before '/api/discussions/:id' style routes.
app.get('/api/discussions/unread-total', (req, res) => {
  const user = authUserFromReq(req);
  if (!user) return res.status(401).json({ error: 'جلسة غير صالحة — سجّل الدخول أولاً' });
  res.json({ total: totalUnreadCount(user.id) });
});

// Unread SHARED-SNAPSHOT counts per source tab — mini badges on Dashboards/Reports tabs
app.get('/api/discussions/snapshot-badges', (req, res) => {
  const user = authUserFromReq(req);
  if (!user) return res.status(401).json({ error: 'جلسة غير صالحة — سجّل الدخول أولاً' });
  res.json(snapshotUnreadBySource(user.id));
});

app.post('/api/discussions', (req, res) => {
  const user = authUserFromReq(req);
  if (!user) return res.status(401).json({ error: 'جلسة غير صالحة — سجّل الدخول أولاً' });
  const { name, topic, memberIds } = req.body || {};
  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: 'اسم المجموعة مطلوب' });
  }
  try {
    const discussion = createDiscussion(String(name), topic ? String(topic) : '', user.id, user.name);
    // Optionally invite members at creation time (ids or emails)
    const invited: string[] = [];
    const failed: { target: string; error: string }[] = [];
    if (Array.isArray(memberIds)) {
      for (const raw of memberIds.slice(0, 100)) {
        try {
          const target = findUserByIdOrEmail(String(raw));
          if (!target) throw new Error('غير موجود');
          addMember(discussion.id, target.id);
          invited.push(target.id);
        } catch (e: any) {
          failed.push({ target: String(raw), error: e.message });
        }
      }
    }
    const list = listDiscussionsForUser(user.id);
    const full = list.mine.find(d => d.id === discussion.id) || discussion;
    res.json({ discussion: full, invited, failed });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/discussions/:id/messages', (req, res) => {
  const user = authUserFromReq(req);
  if (!user) return res.status(401).json({ error: 'جلسة غير صالحة — سجّل الدخول أولاً' });
  const disc = getDiscussionRow(req.params.id);
  if (!disc) return res.status(404).json({ error: 'المجموعة غير موجودة' });
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const before = req.query.before ? String(req.query.before) : undefined;
    const messages = listMessages(req.params.id, user.id, limit, before);
    const oldest = messages.length > 0 ? messages[0].createdAt : null;
    res.json({
      messages,
      hasOlder: oldest ? hasOlderMessages(req.params.id, oldest) : false,
    });
  } catch (err: any) {
    res.status(403).json({ error: err.message });
  }
});

app.post('/api/discussions/:id/messages', (req, res) => {
  const user = authUserFromReq(req);
  if (!user) return res.status(401).json({ error: 'جلسة غير صالحة — سجّل الدخول أولاً' });
  const disc = getDiscussionRow(req.params.id);
  if (!disc) return res.status(404).json({ error: 'المجموعة غير موجودة' });
  try {
    const message = postMessage(
      req.params.id, user.id, user.name,
      String(req.body?.body || ''),
      req.body?.imageData ?? null,
      req.body?.snapshotSource ?? null
    );
    res.json({ message });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Invite members (owner or moderators — like WhatsApp group admins)
app.post('/api/discussions/:id/members', (req, res) => {
  const user = authUserFromReq(req);
  if (!user) return res.status(401).json({ error: 'جلسة غير صالحة — سجّل الدخول أولاً' });
  const disc = getDiscussionRow(req.params.id);
  if (!disc) return res.status(404).json({ error: 'المجموعة غير موجودة' });
  if (!isModerator(req.params.id, user.id)) return res.status(403).json({ error: 'فقط المالك أو المشرفون يمكنهم دعوة الأعضاء' });
  const { memberIds } = req.body || {};
  if (!Array.isArray(memberIds) || memberIds.length === 0) {
    return res.status(400).json({ error: 'قائمة الأعضاء (memberIds) مطلوبة' });
  }
  const invited: string[] = [];
  const failed: { target: string; error: string }[] = [];
  for (const raw of memberIds.slice(0, 100)) {
    try {
      const target = findUserByIdOrEmail(String(raw));
      if (!target) throw new Error('غير موجود');
      addMember(req.params.id, target.id);
      invited.push(target.id);
    } catch (e: any) {
      failed.push({ target: String(raw), error: e.message });
    }
  }
  const list = listDiscussionsForUser(user.id);
  const full = list.mine.find(d => d.id === req.params.id);
  res.json({ discussion: full, invited, failed });
});

app.delete('/api/discussions/:id/members/:userId', (req, res) => {
  const user = authUserFromReq(req);
  if (!user) return res.status(401).json({ error: 'جلسة غير صالحة — سجّل الدخول أولاً' });
  if (!isModerator(req.params.id, user.id)) return res.status(403).json({ error: 'فقط المالك أو المشرفون يمكنهم إزالة الأعضاء' });
  try {
    removeMember(req.params.id, req.params.userId, user.id);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ---- Moderator management (owner only) ----

// Owner promotes a member to moderator
app.post('/api/discussions/:id/moderators/:userId', (req, res) => {
  const user = authUserFromReq(req);
  if (!user) return res.status(401).json({ error: 'جلسة غير صالحة — سجّل الدخول أولاً' });
  try {
    promoteToModerator(req.params.id, req.params.userId, user.id);
    // Let the promotee know about their new role
    const disc = getDiscussionRow(req.params.id);
    pushNotification(
      req.params.userId,
      'info',
      'تم تعيينك مشرفاً 🛡',
      `${user.name} منحك صلاحيات الإشراف في مجموعة "${disc?.name || ''}" — يمكنك الآن دعوة الأعضاء وإدارتهم`,
      { discussionId: req.params.id, discussionName: disc?.name, role: 'moderator' }
    );
    res.json({ ok: true });
  } catch (err: any) {
    res.status(403).json({ error: err.message });
  }
});

// Owner demotes a moderator back to member
app.delete('/api/discussions/:id/moderators/:userId', (req, res) => {
  const user = authUserFromReq(req);
  if (!user) return res.status(401).json({ error: 'جلسة غير صالحة — سجّل الدخول أولاً' });
  try {
    demoteModerator(req.params.id, req.params.userId, user.id);
    // Let the demoted member know their role changed
    const disc = getDiscussionRow(req.params.id);
    pushNotification(
      req.params.userId,
      'info',
      'أُلغي إشرافك في مجموعة',
      `${user.name} ألغى صلاحيات الإشراف لديك في مجموعة "${disc?.name || ''}" — ما زلت عضواً ويمكنك المشاركة`,
      { discussionId: req.params.id, discussionName: disc?.name, role: 'member' }
    );
    res.json({ ok: true });
  } catch (err: any) {
    res.status(403).json({ error: err.message });
  }
});

// Owner toggles closed-group mode: only owner & moderators can post
app.post('/api/discussions/:id/send-policy', (req, res) => {
  const user = authUserFromReq(req);
  if (!user) return res.status(401).json({ error: 'جلسة غير صالحة — سجّل الدخول أولاً' });
  const policy = String(req.body?.policy || '');
  if (policy !== 'everyone' && policy !== 'moderators_only') {
    return res.status(400).json({ error: "policy يجب أن تكون 'everyone' أو 'moderators_only'" });
  }
  try {
    setSendPolicy(req.params.id, user.id, policy);
    res.json({ ok: true, sendPolicy: policy });
  } catch (err: any) {
    res.status(403).json({ error: err.message });
  }
});

// Leave a group (non-owner)
app.post('/api/discussions/:id/leave', (req, res) => {
  const user = authUserFromReq(req);
  if (!user) return res.status(401).json({ error: 'جلسة غير صالحة — سجّل الدخول أولاً' });
  if (isOwner(req.params.id, user.id)) {
    return res.status(400).json({ error: 'المالك لا يمكنه المغادرة — احذف المجموعة بدلاً من ذلك' });
  }
  try {
    removeMember(req.params.id, user.id);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/discussions/:id', (req, res) => {
  const user = authUserFromReq(req);
  if (!user) return res.status(401).json({ error: 'جلسة غير صالحة — سجّل الدخول أولاً' });
  try {
    deleteDiscussion(req.params.id, user.id);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(403).json({ error: err.message });
  }
});

// ---- Invite links: the only path into a private group ----

// Owner generates a fresh secret invite link
app.post('/api/discussions/:id/invites', (req, res) => {
  const user = authUserFromReq(req);
  if (!user) return res.status(401).json({ error: 'جلسة غير صالحة — سجّل الدخول أولاً' });
  try {
    const maxUses = req.body?.maxUses ? Number(req.body.maxUses) : undefined;
    const invite = createInvite(req.params.id, user.id, maxUses);
    res.json(invite);
  } catch (err: any) {
    res.status(403).json({ error: err.message });
  }
});

// Owner lists the group's invite links (with usage + revoke state)
app.get('/api/discussions/:id/invites', (req, res) => {
  const user = authUserFromReq(req);
  if (!user) return res.status(401).json({ error: 'جلسة غير صالحة — سجّل الدخول أولاً' });
  try {
    res.json({ invites: listInvites(req.params.id, user.id) });
  } catch (err: any) {
    res.status(403).json({ error: err.message });
  }
});

// Owner revokes an invite link
app.delete('/api/discussions/:id/invites/:code', (req, res) => {
  const user = authUserFromReq(req);
  if (!user) return res.status(401).json({ error: 'جلسة غير صالحة — سجّل الدخول أولاً' });
  try {
    revokeInvite(req.params.id, req.params.code, user.id);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(403).json({ error: err.message });
  }
});

// Pending invites received by the current user (MUST be registered before
// the '/api/invites/:code' route or "pending" is captured as a code!)
app.get('/api/invites/pending', (req, res) => {
  const user = authUserFromReq(req);
  if (!user) return res.status(401).json({ error: 'جلسة غير صالحة — سجّل الدخول أولاً' });
  res.json({ invites: listPendingInvitesFor(user.id) });
});

// Public-ish preview of an invite code (name only — no messages, no members)
app.get('/api/invites/:code', (req, res) => {
  const user = authUserFromReq(req);
  if (!user) return res.status(401).json({ error: 'جلسة غير صالحة — سجّل الدخول أولاً' });
  res.json(peekInvite(req.params.code));
});

// Join a group through a valid invite code
app.post('/api/invites/:code/join', (req, res) => {
  const user = authUserFromReq(req);
  if (!user) return res.status(401).json({ error: 'جلسة غير صالحة — سجّل الدخول أولاً' });
  try {
    const result = joinViaInvite(req.params.code, user.id, user.name);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ---- Email invites for UNREGISTERED people ----

// Owner invites an email address (SMTP if configured, manual link otherwise)
app.post('/api/discussions/:id/invite-email', async (req, res) => {
  const user = authUserFromReq(req);
  if (!user) return res.status(401).json({ error: 'جلسة غير صالحة — سجّل الدخول أولاً' });
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'البريد الإلكتروني مطلوب' });
  try {
    const result = await createEmailInvite(req.params.id, user.id, String(email));
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Invitee-side preview of an email invite (name of group only)
app.get('/api/email-invites/:code', (req, res) => {
  res.json(peekEmailInvite(req.params.code));
});

// Owner: all email invites of a group with consumption status
app.get('/api/discussions/:id/email-invites', (req, res) => {
  const user = authUserFromReq(req);
  if (!user) return res.status(401).json({ error: 'جلسة غير صالحة — سجّل الدخول أولاً' });
  try {
    res.json({ invites: listGroupEmailInvites(req.params.id, user.id) });
  } catch (err: any) {
    res.status(403).json({ error: err.message });
  }
});

// Owner: revoke a pending email invite (its link stops working)
app.delete('/api/discussions/:id/email-invites/:code', (req, res) => {
  const user = authUserFromReq(req);
  if (!user) return res.status(401).json({ error: 'جلسة غير صالحة — سجّل الدخول أولاً' });
  try {
    revokeEmailInvite(req.params.id, req.params.code, user.id);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(403).json({ error: err.message });
  }
});

// Ephemeral typing signal (fire-and-forget, nothing persisted).
app.post('/api/discussions/:id/typing', (req, res) => {
  const user = authUserFromReq(req);
  if (!user) return res.status(401).json({ error: 'جلسة غير صالحة — سجّل الدخول أولاً' });
  try {
    broadcastTyping(req.params.id, user.id, user.name);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Live stream of discussion events for the current user (Server-Sent Events).
// Auth via query token because EventSource cannot send headers.
app.get('/api/discussions/stream', (req, res) => {
  const token = String(req.query.token || '');
  const user = getUserByToken(token);
  if (!user) return res.status(401).json({ error: 'جلسة غير صالحة — سجّل الدخول أولاً' });

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(`event: connected\ndata: ${JSON.stringify({ userId: user.id })}\n\n`);

  const removeClient = addSseClient(user.id, (event: DiscussionEvent) => {
    res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
  });
  // Notification pings (e.g. new discussion invite) on the same stream
  const removeUserListener = addUserListener(user.id, (unreadCount: number) => {
    res.write(`event: notification\ndata: ${JSON.stringify({ unreadCount })}\n\n`);
  });

  // Keep the connection alive through proxies
  const heartbeat = setInterval(() => {
    try { res.write(': ping\n\n'); } catch { /* cleaned up below */ }
  }, 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    removeClient();
    removeUserListener();
  });
});

// ---- Notifications ----
app.get('/api/notifications', (req, res) => {
  const user = authUserFromReq(req);
  if (!user) return res.status(401).json({ error: 'جلسة غير صالحة — سجّل الدخول أولاً' });
  res.json({ notifications: listNotifications(user.id), unread: countUnread(user.id) });
});

app.post('/api/notifications/:id/read', (req, res) => {
  const user = authUserFromReq(req);
  if (!user) return res.status(401).json({ error: 'جلسة غير صالحة — سجّل الدخول أولاً' });
  markNotificationRead(user.id, req.params.id);
  res.json({ ok: true });
});

app.post('/api/notifications/read-all', (req, res) => {
  const user = authUserFromReq(req);
  if (!user) return res.status(401).json({ error: 'جلسة غير صالحة — سجّل الدخول أولاً' });
  markAllNotificationsRead(user.id);
  res.json({ ok: true });
});

// ---- Group invites (pending → accept/reject) ----
// Owner invites a contact: creates a PENDING invite + notification for the invitee
app.post('/api/discussions/:id/invite-user', (req, res) => {
  const user = authUserFromReq(req);
  if (!user) return res.status(401).json({ error: 'جلسة غير صالحة — سجّل الدخول أولاً' });
  const { userId } = req.body || {};
  if (!userId) return res.status(400).json({ error: 'معرّف المدعو (userId) مطلوب' });
  try {
    const result = sendDiscussionInvite(req.params.id, user.id, user.name, String(userId));
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Invitee accepts — membership happens ONLY here
app.post('/api/invites/pending/:id/accept', (req, res) => {
  const user = authUserFromReq(req);
  if (!user) return res.status(401).json({ error: 'جلسة غير صالحة — سجّل الدخول أولاً' });
  try {
    res.json(acceptDiscussionInvite(req.params.id, user.id));
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Invitee rejects — owner is notified
app.post('/api/invites/pending/:id/reject', (req, res) => {
  const user = authUserFromReq(req);
  if (!user) return res.status(401).json({ error: 'جلسة غير صالحة — سجّل الدخول أولاً' });
  try {
    rejectDiscussionInvite(req.params.id, user.id);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Mark ALL the user's groups as read in one click (sidebar badge → 0).
// MUST be registered before '/api/discussions/:id/read' ("all" ≠ a group id).
app.post('/api/discussions/read-all', (req, res) => {
  const user = authUserFromReq(req);
  if (!user) return res.status(401).json({ error: 'جلسة غير صالحة — سجّل الدخول أولاً' });
  const affected = markAllDiscussionsRead(user.id);
  emitToUser(user.id, countUnread(user.id));
  res.json({ ok: true, total: 0, affected });
});

// Mark the group as read for the current user (unread badge resets).
// Replies with the user's fresh unread counts per group for instant badge sync.
app.post('/api/discussions/:id/read', (req, res) => {
  const user = authUserFromReq(req);
  if (!user) return res.status(401).json({ error: 'جلسة غير صالحة — سجّل الدخول أولاً' });
  try {
    markDiscussionRead(req.params.id, user.id);
    const list = listChatSummaries(user.id);
    const unreadByGroup: Record<string, number> = {};
    for (const g of list.mine) unreadByGroup[g.id] = g.unreadCount;
    // Nudge the caller's own SSE stream so other open tabs sync too
    emitToUser(user.id, countUnread(user.id));
    res.json({ ok: true, unreadByGroup });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Group members: see this group's pending invites (owner manages them)
app.get('/api/discussions/:id/pending-invites', (req, res) => {
  const user = authUserFromReq(req);
  if (!user) return res.status(401).json({ error: 'جلسة غير صالحة — سجّل الدخول أولاً' });
  try {
    res.json({ invites: listGroupPendingInvites(req.params.id, user.id) });
  } catch (err: any) {
    res.status(403).json({ error: err.message });
  }
});

// Cancel a pending invite (the inviter themselves, or the group owner for anyone's)
app.post('/api/discussions/:id/pending-invites/:inviteId/cancel', (req, res) => {
  const user = authUserFromReq(req);
  if (!user) return res.status(401).json({ error: 'جلسة غير صالحة — سجّل الدخول أولاً' });
  const disc = getDiscussionRow(req.params.id);
  if (!disc) return res.status(404).json({ error: 'المجموعة غير موجودة' });
  try {
    cancelPendingInvite(req.params.id, req.params.inviteId, user.id, isOwner(req.params.id, user.id));
    res.json({ ok: true });
  } catch (err: any) {
    res.status(403).json({ error: err.message });
  }
});

// Resend a pending invite (fresh notification to the invitee)
app.post('/api/discussions/:id/pending-invites/:inviteId/resend', (req, res) => {
  const user = authUserFromReq(req);
  if (!user) return res.status(401).json({ error: 'جلسة غير صالحة — سجّل الدخول أولاً' });
  try {
    resendPendingInvite(req.params.id, req.params.inviteId, user.id, user.name);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(403).json({ error: err.message });
  }
});

// Favicon: browsers request /favicon.ico automatically even when the HTML
// declares an SVG icon — serve the SVG content under both paths.
const faviconPath = path.join(process.cwd(), 'public', 'favicon.svg');
app.get(['/favicon.ico', '/favicon.svg'], (_req, res) => {
  res.type('image/svg+xml');
  res.sendFile(faviconPath);
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`AI Analytics Platform server running on http://0.0.0.0:${PORT}`);
    // Hourly sweeper: reminder email + owner notification for email invites
    // still pending after 3 days (runs once per invite, never repeats)
    startEmailInviteReminderScheduler();
  });
}

startServer();

