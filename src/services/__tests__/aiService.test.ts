import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { aiFetchProxy, checkOllamaEngineHealth, optimizeSqlQuery } from '../aiService';
import { fetchOllamaTags } from '../OllamaProxy';

// Mock OllamaProxy helpers
vi.mock('../OllamaProxy', () => ({
  fetchOllamaTags: vi.fn(),
}));

describe('AI Service Layer Unit Tests', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.resetAllMocks();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('aiFetchProxy routing checks', () => {
    it('should intercept Ollama endpoints and route through /api/proxy/ollama', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, models: [] }),
      });
      global.fetch = mockFetch;

      await aiFetchProxy('http://localhost:11434/api/tags');

      expect(mockFetch).toHaveBeenCalledWith('/api/proxy/ollama', expect.any(Object));
      const callArgs = mockFetch.mock.calls[0];
      const requestBody = JSON.parse(callArgs[1].body);
      expect(requestBody.endpointUrl).toBe('http://localhost:11434');
      expect(requestBody.path).toBe('/api/tags');
    });

    it('should NOT intercept standard non-Ollama requests', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true });
      global.fetch = mockFetch;

      const targetUrl = 'https://api.external-provider.com/v1/chat';
      await aiFetchProxy(targetUrl);

      expect(mockFetch).toHaveBeenCalledWith(targetUrl, undefined);
    });
  });

  describe('checkOllamaEngineHealth', () => {
    it('should report online when fetchOllamaTags succeeds', async () => {
      const mockTags = {
        success: true,
        status: 200,
        models: [
          { name: 'qwen2.5-coder:7b' },
          { name: 'deepseek-r1:8b' },
        ],
      };
      vi.mocked(fetchOllamaTags).mockResolvedValue(mockTags);

      const health = await checkOllamaEngineHealth('http://localhost:11434');

      expect(health.status).toBe('online');
      expect(health.engineReady).toBe(true);
      expect(health.modelCount).toBe(2);
      expect(health.installedModels).toContain('qwen2.5-coder:7b');
      expect(health.installedModels).toContain('deepseek-r1:8b');
      expect(health.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('should report offline and return diagnostics when fetchOllamaTags fails', async () => {
      const mockTags = {
        success: false,
        status: 500,
        models: [],
        message: 'Engine down',
        isLocalhostNotice: true,
      };
      vi.mocked(fetchOllamaTags).mockResolvedValue(mockTags);

      const health = await checkOllamaEngineHealth('http://localhost:11434');

      expect(health.status).toBe('offline');
      expect(health.engineReady).toBe(false);
      expect(health.modelCount).toBe(0);
      expect(health.isLocalhostNotice).toBe(true);
    });
  });

  describe('optimizeSqlQuery custom configurations', () => {
    it('should use custom parameters for local Ollama providers', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ optimizedSql: 'SELECT 1;' }),
      });
      global.fetch = mockFetch;

      const req = {
        sql: 'SELECT * FROM retail',
        datasetSchema: { name: 'retail', columns: [] },
        provider: 'ollama',
      };

      await optimizeSqlQuery(req);

      expect(mockFetch).toHaveBeenCalledWith('/api/nl2sql/optimize', expect.any(Object));
      const callArgs = mockFetch.mock.calls[0];
      const requestBody = JSON.parse(callArgs[1].body);
      expect(requestBody.provider).toBe('ollama');
      expect(requestBody.options.temperature).toBe(0.1);
      expect(requestBody.options.format).toBe('json');
    });

    it('should use default parameters for Gemini provider', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ optimizedSql: 'SELECT 1;' }),
      });
      global.fetch = mockFetch;

      const req = {
        sql: 'SELECT * FROM retail',
        datasetSchema: { name: 'retail', columns: [] },
        provider: 'gemini',
      };

      await optimizeSqlQuery(req);

      const callArgs = mockFetch.mock.calls[0];
      const requestBody = JSON.parse(callArgs[1].body);
      expect(requestBody.provider).toBe('gemini');
      expect(requestBody.options.temperature).toBe(0.2);
      expect(requestBody.options.format).toBeUndefined();
    });
  });
});
