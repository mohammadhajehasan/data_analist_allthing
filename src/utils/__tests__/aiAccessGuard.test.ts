import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkAiAccess, fetchServerAiProviders } from '../aiAccessGuard';

/** Minimal provider config factory — shape is irrelevant to the guard. */
const cfg = (over: Record<string, unknown> = {}) =>
  ({ enabled: true, apiKey: '', ...over }) as any;

describe('checkAiAccess', () => {
  it('allows local engines without any key', () => {
    const r = checkAiAccess('ollama', undefined);
    expect(r).toMatchObject({ ok: true, isLocal: true });
  });

  it('blocks cloud providers with no user key and no server key', () => {
    const r = checkAiAccess('openrouter', cfg());
    expect(r).toMatchObject({ ok: false, isLocal: false, reason: 'no-key' });
  });

  it('allows cloud providers when the server reports the provider enabled', () => {
    const r = checkAiAccess('openrouter', cfg(), ['openrouter']);
    expect(r).toMatchObject({ ok: true, isLocal: false });
  });

  it('server fallback is per-provider — an unlisted provider stays blocked', () => {
    const r = checkAiAccess('deepseek', cfg(), ['openrouter']);
    expect(r).toMatchObject({ ok: false, reason: 'no-key' });
  });

  it('allows a real user key without needing the server list', () => {
    expect(checkAiAccess('openrouter', cfg({ apiKey: 'sk-or-real-key' })).ok).toBe(true);
  });

  it('keeps requiring a custom endpoint even with a user key', () => {
    const r = checkAiAccess('custom_openai', cfg({ apiKey: 'sk-custom' }));
    expect(r).toMatchObject({ ok: false, reason: 'no-endpoint' });
    expect(
      checkAiAccess('custom_openai', cfg({ apiKey: 'sk-custom', endpointUrl: 'http://localhost:8000/v1' })).ok
    ).toBe(true);
  });

  it('treats placeholder keys as "no key" — server fallback still applies', () => {
    const placeholder = cfg({ apiKey: 'your-api-key-here' });
    expect(checkAiAccess('openrouter', placeholder).ok).toBe(false);
    expect(checkAiAccess('openrouter', placeholder, ['openrouter']).ok).toBe(true);
  });
});

describe('fetchServerAiProviders', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** Fresh module instance per test — the guard caches at module level. */
  async function freshGuard() {
    vi.resetModules();
    return await import('../aiAccessGuard');
  }

  it('parses aiProvidersEnabled from /api/health and caches one request per session', async () => {
    const { fetchServerAiProviders } = await freshGuard();
    const fetchMock = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ status: 'ok', aiProvidersEnabled: ['openrouter', 'gemini'] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchServerAiProviders()).resolves.toEqual(['openrouter', 'gemini']);
    await expect(fetchServerAiProviders()).resolves.toEqual(['openrouter', 'gemini']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to legacy aiEnabled → gemini when the list is missing', async () => {
    const { fetchServerAiProviders } = await freshGuard();
    const fetchMock = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ status: 'ok', aiEnabled: true }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchServerAiProviders()).resolves.toEqual(['gemini']);
  });

  it('does not poison the cache when /api/health fails', async () => {
    const { fetchServerAiProviders } = await freshGuard();
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValue({ json: () => Promise.resolve({ aiProvidersEnabled: ['openrouter'] }) });
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchServerAiProviders()).resolves.toEqual([]);
    await expect(fetchServerAiProviders()).resolves.toEqual(['openrouter']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
