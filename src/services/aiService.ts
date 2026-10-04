import { fetchOllamaTags } from './OllamaProxy';
import { aiAuthHeaders } from '../utils/aiAccessGuard';

/**
 * AI Service Layer - Proxy Wrapper & Health Check Utilities
 * 
 * Provides a fetch-based proxy wrapper that automatically detects calls to Ollama Base URLs
 * (e.g., http://localhost:11434) or local endpoints, routing them through a server-side proxy
 * route (/api/proxy/ollama) to bypass browser CORS preflight restrictions and resolve 400 Bad Request errors.
 */

export interface OllamaHealthResult {
  status: 'online' | 'offline' | 'pinging' | 'idle';
  engineReady: boolean;
  modelCount: number;
  installedModels: string[];
  latencyMs: number | null;
  endpointUrl: string;
  httpStatus?: number;
  lastPingTime: string;
  details: string;
  errorLog?: string;
  isLocalhostNotice?: boolean;
}

/**
 * Fetch-based proxy wrapper for the AI Service Layer.
 * Automatically detects calls directed to Ollama Base URLs (e.g. localhost:11434, 127.0.0.1:11434)
 * or Ollama API endpoints (/api/tags, /api/generate, /api/chat) and routes them through the server-side
 * proxy endpoint (/api/proxy/ollama) to avoid CORS preflight errors and 400 Bad Requests.
 */
export async function aiFetchProxy(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const urlString = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
  
  // Detect if the call targets an Ollama Base URL or endpoint
  const isOllamaCall = 
    urlString.includes('localhost:11434') || 
    urlString.includes('127.0.0.1:11434') ||
    urlString.includes(':11434') ||
    urlString.includes('/api/tags') ||
    urlString.includes('/api/generate') ||
    urlString.includes('/api/chat');

  if (isOllamaCall && !urlString.startsWith('/api/proxy/ollama') && !urlString.startsWith('/api/ai/')) {
    let endpointUrl = 'http://localhost:11434';
    let path = '/api/tags';

    try {
      if (urlString.startsWith('http://') || urlString.startsWith('https://')) {
        const parsed = new URL(urlString);
        endpointUrl = `${parsed.protocol}//${parsed.host}`;
        path = parsed.pathname + parsed.search;
        if (!path || path === '/') path = '/api/tags';
      } else {
        path = urlString;
      }
    } catch (e) {
      // Fallback defaults if parsing fails
    }

    // Proxy request through backend endpoint to bypass browser CORS constraints
    return fetch('/api/proxy/ollama', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endpointUrl,
        path,
        method: init?.method || 'GET',
        payload: init?.body ? (typeof init.body === 'string' ? JSON.parse(init.body) : init.body) : undefined,
      }),
    });
  }

  // Standard fetch pass-through
  return fetch(input, init);
}

/**
 * Health-check utility that validates model engine readiness by querying the `/api/tags` endpoint of Ollama.
 * Uses the proxy wrapper to bypass CORS issues and returns structured status, model count, latency metrics,
 * and diagnostic error logs for UI rendering.
 */
export async function checkOllamaEngineHealth(endpointUrl: string = 'http://localhost:11434'): Promise<OllamaHealthResult> {
  const startTime = Date.now();
  const cleanEndpoint = (endpointUrl || 'http://localhost:11434').replace(/\/+$/, '');

  try {
    const tagsRes = await fetchOllamaTags(cleanEndpoint);
    const durationMs = Date.now() - startTime;

    if (tagsRes.success) {
      const rawModels = tagsRes.models || [];
      const modelNames = Array.isArray(rawModels)
        ? rawModels.map((m: any) => m.name || m.model || String(m))
        : [];

      return {
        status: 'online',
        engineReady: true,
        modelCount: modelNames.length,
        installedModels: modelNames,
        latencyMs: durationMs,
        endpointUrl: cleanEndpoint,
        httpStatus: tagsRes.status || 200,
        lastPingTime: new Date().toLocaleTimeString(),
        details: `Ollama engine verified via /api/tags (HTTP ${tagsRes.status || 200}). Found ${modelNames.length} installed model(s).`,
        isLocalhostNotice: cleanEndpoint.includes('localhost') || cleanEndpoint.includes('127.0.0.1'),
      };
    } else {
      return {
        status: 'offline',
        engineReady: false,
        modelCount: 0,
        installedModels: [],
        latencyMs: null,
        endpointUrl: cleanEndpoint,
        httpStatus: tagsRes.status,
        lastPingTime: new Date().toLocaleTimeString(),
        details: tagsRes.message ? `(Ollama Base URL Ping Status): OFFLINE ${tagsRes.message}` : '(Ollama Base URL Ping Status): OFFLINE fetch failed',
        errorLog: `HTTP ${tagsRes.status || 'ERR'} - ${tagsRes.error || tagsRes.message || 'fetch failed'}\nEndpoint: ${cleanEndpoint}/api/tags\nDetails: ${tagsRes.details || 'Target server unreachable or refused connection.'}`,
        isLocalhostNotice: Boolean(tagsRes.isLocalhostNotice),
      };
    }
  } catch (err: any) {
    return {
      status: 'offline',
      engineReady: false,
      modelCount: 0,
      installedModels: [],
      latencyMs: null,
      endpointUrl: cleanEndpoint,
      lastPingTime: new Date().toLocaleTimeString(),
      details: `(Ollama Base URL Ping Status): OFFLINE ${err?.message || 'fetch failed'}`,
      errorLog: `Network Exception: ${err?.message || 'fetch failed'}\nTarget Endpoint: ${cleanEndpoint}/api/tags\nTimestamp: ${new Date().toISOString()}`,
      isLocalhostNotice: cleanEndpoint.includes('localhost') || cleanEndpoint.includes('127.0.0.1'),
    };
  }
}

export interface OptimizeQueryRequest {
  sql: string;
  datasetSchema: {
    name: string;
    columns: Array<{ name: string; type: string }>;
  };
  language?: 'ar' | 'en';
  provider?: string;
  model?: string;
  endpointUrl?: string;
  apiKey?: string;
}

/**
 * Refactored 'Optimize Query' logic: Inspects the user's selected LLM provider from AppContext
 * and switches prompt structure and parameters dynamically (using local Ollama parameters vs Gemini cloud API formats).
 */

export async function generateWithModelFallback(params: {
  contents: any;
  config?: any;
  models?: string[];
}): Promise<any> {
  const retry = async (fn: () => Promise<any>, retries = 3, delay = 1000): Promise<any> => {
    try {
      return await fn();
    } catch (error) {
      if (retries === 0) throw error;
      console.warn(`API call failed, retrying... (${retries} attempts left)`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return retry(fn, retries - 1, delay * 2);
    }
  };

  // Assuming an existing underlying call like 'doGenerate' exists
  // This is a placeholder for the actual implementation details of your project
  return retry(() => Promise.resolve(null), 3);
}

/**
 * Refactored 'Optimize Query' logic: Inspects the user's selected LLM provider from AppContext
 * and switches prompt structure and parameters dynamically (using local Ollama parameters vs Gemini cloud API formats).
 */
export async function optimizeSqlQuery(req: OptimizeQueryRequest) {
  const provider = (req.provider || 'gemini').toLowerCase();
  
  // Custom parameters tailored for local Ollama vs cloud Gemini
  const providerOptions = provider === 'ollama'
    ? {
        temperature: 0.1,
        top_p: 0.9,
        num_ctx: 4096,
        format: 'json',
      }
    : {
        temperature: 0.2,
      };

  const res = await fetch('/api/nl2sql/optimize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...aiAuthHeaders() },
    body: JSON.stringify({
      ...req,
      provider,
      options: providerOptions,
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error || 'Optimization request failed');
  }
  return data;
}

