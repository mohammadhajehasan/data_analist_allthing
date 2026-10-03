import { describe, expect, it } from 'vitest';
import { AI_PROVIDER_ORDER, computeProviderReadiness } from '../useAiReadiness';
import type { AISettings } from '../../types/aiProviders';

/** إعدادات مصغّرة: مزوّد = مفتاحه + نقطة نهايته فقط */
const settings = (over: Partial<Record<string, { apiKey?: string; endpointUrl?: string; isLocalOnly?: boolean }>> = {}) =>
  ({
    providers: {
      gemini: {},
      ollama: { isLocalOnly: true },
      qwen: {},
      deepseek: {},
      openrouter: {},
      custom_openai: {},
      ...over,
    },
  }) as unknown as AISettings;

describe('computeProviderReadiness', () => {
  it('local engines are always ready regardless of keys', () => {
    expect(computeProviderReadiness('ollama', settings(), [])).toMatchObject({
      providerId: 'ollama', ready: true, reason: 'local',
    });
  });

  it('cloud provider without any key is not ready (no-key)', () => {
    expect(computeProviderReadiness('openrouter', settings(), [])).toMatchObject({
      ready: false, reason: 'no-key',
    });
  });

  it('cloud provider enabled server-side is ready via the server key', () => {
    expect(computeProviderReadiness('openrouter', settings(), ['openrouter'])).toMatchObject({
      ready: true, reason: 'server-key',
    });
  });

  it('server fallback is per-provider — unlisted providers stay blocked', () => {
    expect(computeProviderReadiness('deepseek', settings(), ['openrouter']).ready).toBe(false);
  });

  it('a real user key wins over the server list', () => {
    expect(
      computeProviderReadiness('gemini', settings({ gemini: { apiKey: 'AIza-real' } }), ['gemini'])
    ).toMatchObject({ ready: true, reason: 'user-key' });
  });

  it('placeholder keys are treated as no key — server fallback still applies', () => {
    const s = settings({ qwen: { apiKey: 'your-api-key-here' } });
    expect(computeProviderReadiness('qwen', s, []).reason).toBe('no-key');
    expect(computeProviderReadiness('qwen', s, ['qwen'])).toMatchObject({
      ready: true, reason: 'server-key',
    });
  });

  it('custom_openai requires an endpoint even with a user key', () => {
    expect(
      computeProviderReadiness('custom_openai', settings({ custom_openai: { apiKey: 'sk-x' } }), [])
    ).toMatchObject({ ready: false, reason: 'no-endpoint' });
    expect(
      computeProviderReadiness(
        'custom_openai',
        settings({ custom_openai: { apiKey: 'sk-x', endpointUrl: 'http://localhost:8000/v1' } }),
        []
      ).ready
    ).toBe(true);
  });

  it('covers all six providers in display order', () => {
    expect(AI_PROVIDER_ORDER).toEqual(['gemini', 'openrouter', 'deepseek', 'qwen', 'custom_openai', 'ollama']);
  });
});
