/**
 * Exa web search — grounded web results for the app and its agents.
 *
 * Exa (https://exa.ai/docs) is a search API built for LLMs: one call returns
 * ranked pages plus "highlights" — the excerpts most relevant to the query,
 * sized by Exa for relevance. Highlights are the SDK's recommended default for
 * retrieval workflows (RAG, previews, citations) because they carry the
 * evidence without dragging whole pages into every response.
 *
 * The client is created from EXA_API_KEY only; no key is ever read from or
 * echoed to the browser. When the variable is empty the feature stays off and
 * the route answers 503 instead of failing mid-search.
 *
 * Environment:
 *   EXA_API_KEY=...   from https://dashboard.exa.ai/api-keys (empty = feature off)
 */
import Exa from 'exa-js';

const DEFAULT_NUM_RESULTS = 5;
const MAX_NUM_RESULTS = 20;
const MAX_HIGHLIGHTS_PER_RESULT = 5;

export interface WebSearchParams {
  query: string;
  numResults?: number;
  includeDomains?: string[];
  excludeDomains?: string[];
}

export interface WebSearchHit {
  title: string;
  url: string;
  publishedDate: string | null;
  author: string | null;
  highlights: string[];
}

export interface WebSearchResponse {
  query: string;
  results: WebSearchHit[];
  durationMs: number;
}

/** A failure that already carries the HTTP status the route should answer with. */
export class WebSearchError extends Error {
  httpStatus: number;

  constructor(message: string, httpStatus = 502) {
    super(message);
    this.name = 'WebSearchError';
    this.httpStatus = httpStatus;
  }
}

let cachedClient: { apiKey: string; client: Exa } | null = null;

export function getExaApiKey(): string {
  return (process.env.EXA_API_KEY || '').trim();
}

/** True when the server may call Exa (EXA_API_KEY is set). */
export function isWebSearchConfigured(): boolean {
  return getExaApiKey().length > 0;
}

/** One client per key — re-created only if the environment changes. */
function getClient(apiKey: string): Exa {
  if (!cachedClient || cachedClient.apiKey !== apiKey) {
    cachedClient = { apiKey, client: new Exa(apiKey) };
  }
  return cachedClient.client;
}

function clampNumResults(value: unknown): number {
  const parsed = typeof value === 'number' ? value : parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return DEFAULT_NUM_RESULTS;
  return Math.min(Math.max(Math.trunc(parsed), 1), MAX_NUM_RESULTS);
}

function cleanDomains(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 20);
}

function toWebSearchError(err: unknown): WebSearchError {
  if (err instanceof WebSearchError) return err;
  const status = typeof (err as { statusCode?: unknown })?.statusCode === 'number'
    ? (err as { statusCode: number }).statusCode
    : 0;
  const message = err instanceof Error ? err.message : String(err);
  if (status === 401 || status === 403) {
    return new WebSearchError('Exa rejected the API key — check EXA_API_KEY.', 502);
  }
  if (status === 429) {
    return new WebSearchError('Exa rate limit reached — try again shortly.', 429);
  }
  return new WebSearchError(`Exa search failed${status ? ` (HTTP ${status})` : ''}: ${message}`, 502);
}

/**
 * Search the web and return the citable subset of every result.
 * Throws WebSearchError with a ready HTTP status (400 / 429 / 502 / 503).
 */
export async function searchWeb(params: WebSearchParams): Promise<WebSearchResponse> {
  const query = (params?.query || '').trim();
  if (!query) throw new WebSearchError('query is required', 400);

  const apiKey = getExaApiKey();
  if (!apiKey) {
    throw new WebSearchError('EXA_API_KEY is not set on the server — web search is disabled.', 503);
  }

  const includeDomains = cleanDomains(params.includeDomains);
  const excludeDomains = cleanDomains(params.excludeDomains);
  const started = Date.now();

  try {
    const response = await getClient(apiKey).search(query, {
      type: 'auto',
      numResults: clampNumResults(params.numResults),
      contents: { highlights: true },
      ...(includeDomains.length ? { includeDomains } : {}),
      ...(excludeDomains.length ? { excludeDomains } : {}),
    });

    const results: WebSearchHit[] = (response.results || []).map((result: any) => ({
      title: result?.title || result?.url || '',
      url: result?.url || '',
      publishedDate: result?.publishedDate || null,
      author: result?.author || null,
      highlights: Array.isArray(result?.highlights)
        ? result.highlights
            .filter((line: unknown): line is string => typeof line === 'string' && line.trim().length > 0)
            .slice(0, MAX_HIGHLIGHTS_PER_RESULT)
        : [],
    }));

    return { query, results, durationMs: Date.now() - started };
  } catch (err) {
    throw toWebSearchError(err);
  }
}