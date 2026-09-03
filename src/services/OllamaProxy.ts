/**
 * OllamaProxy Service
 *
 * Provides a specialized fetch wrapper that relays requests to configured Ollama instances.
 * Routes requests through the server-side proxy route (/api/proxy/ollama or /api/ai/ollama)
 * to bypass browser-level CORS restrictions and resolve 400 Bad Request errors.
 */

export interface OllamaProxyRequestOptions {
  endpointUrl?: string;
  path?: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  payload?: any;
}

export interface OllamaTagsResponse {
  success: boolean;
  status: number;
  models: Array<{
    name: string;
    model?: string;
    modified_at?: string;
    size?: number;
    digest?: string;
    details?: any;
  }>;
  error?: string;
  message?: string;
  details?: string;
  isLocalhostNotice?: boolean;
}

/**
 * Custom fetch wrapper to relay requests to the local or remote Ollama instance.
 */
export async function ollamaFetchWrapper(
  inputUrl: string,
  options: RequestInit = {},
  fallbackBaseUrl: string = 'http://localhost:11434'
): Promise<Response> {
  let targetEndpoint = fallbackBaseUrl.replace(/\/+$/, '');
  let targetPath = '/api/tags';

  try {
    if (inputUrl.startsWith('http://') || inputUrl.startsWith('https://')) {
      const parsed = new URL(inputUrl);
      targetEndpoint = `${parsed.protocol}//${parsed.host}`;
      targetPath = parsed.pathname + parsed.search;
      if (!targetPath || targetPath === '/') targetPath = '/api/tags';
    } else if (inputUrl.startsWith('/')) {
      targetPath = inputUrl;
    } else {
      targetPath = `/${inputUrl}`;
    }
  } catch (e) {
    // fallback defaults
  }

  // For localhost, try direct client-side fetch first to utilize the user's OLLAMA_ORIGINS="*" setup!
  const isLocalhost = targetEndpoint.includes('localhost') || targetEndpoint.includes('127.0.0.1');
  if (isLocalhost) {
    try {
      const directUrl = `${targetEndpoint}${targetPath}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2500); // 2.5s quick timeout for responsive fallback

      const directRes = await fetch(directUrl, {
        method: options.method || 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers || {}),
        },
        body: options.body,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (directRes.ok) {
        const data = await directRes.json();
        return new Response(JSON.stringify({
          success: true,
          status: directRes.status,
          data: data
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    } catch (e) {
      // Direct client-side fetch to local daemon timed out or CORS restricted, silently route to backend proxy
    }
  }

  // Fallback to route through backend proxy endpoint if direct call fails
  return fetch('/api/proxy/ollama', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    body: JSON.stringify({
      endpointUrl: targetEndpoint,
      path: targetPath,
      method: options.method || 'GET',
      payload: options.body
        ? typeof options.body === 'string'
          ? JSON.parse(options.body)
          : options.body
        : undefined,
    }),
  });
}

/**
 * Specifically queries the Ollama /api/tags endpoint via the proxy wrapper to check model engine readiness.
 */
export async function fetchOllamaTags(endpointUrl: string = 'http://localhost:11434'): Promise<OllamaTagsResponse> {
  const cleanEndpoint = (endpointUrl || 'http://localhost:11434').replace(/\/+$/, '');

  try {
    const res = await ollamaFetchWrapper(`${cleanEndpoint}/api/tags`, { method: 'GET' }, cleanEndpoint);
    const data = await res.json();

    if (data.success && data.data) {
      const rawModels = data.data.models || [];
      return {
        success: true,
        status: data.status || 200,
        models: rawModels,
      };
    } else if (data.success === false) {
      return {
        success: false,
        status: data.status || 500,
        models: [],
        error: data.error || data.message || 'Failed to fetch tags',
        message: data.message,
        details: data.details,
        isLocalhostNotice: data.isLocalhostNotice,
      };
    } else {
      return {
        success: true,
        status: 200,
        models: data.models || [],
      };
    }
  } catch (err: any) {
    return {
      success: false,
      status: 0,
      models: [],
      error: err?.message || 'Network exception connecting to Ollama proxy',
      message: err?.message || 'Network exception',
      details: `Exception when querying ${cleanEndpoint}/api/tags via proxy`,
    };
  }
}
