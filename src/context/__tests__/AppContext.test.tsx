// @vitest-environment happy-dom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AppProvider, useApp } from '../AppContext';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('AppContext & AI Provider State Management Integration Tests', () => {
  let container: HTMLDivElement | null = null;
  let root: any = null;

  beforeEach(() => {
    localStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root.unmount();
      });
    }
    if (container) {
      container.remove();
    }
    localStorage.clear();
  });

  it('provides the correct default multi-provider AI state', async () => {
    let capturedSettings: any = null;

    const TestComponent = () => {
      const { aiSettings } = useApp();
      capturedSettings = aiSettings;
      return null;
    };

    await act(async () => {
      root.render(
        <AppProvider>
          <TestComponent />
        </AppProvider>
      );
    });

    expect(capturedSettings).not.toBeNull();
    expect(capturedSettings.activeProvider).toBe('gemini');
    expect(capturedSettings.activeModel).toBe('gemini-3.8-flash');
    expect(capturedSettings.privacyMode).toBe('hybrid');
  });

  it('reacts correctly when switching active providers via setActiveAIProvider', async () => {
    let capturedContext: any = null;

    const TestComponent = () => {
      const context = useApp();
      capturedContext = context;
      return null;
    };

    await act(async () => {
      root.render(
        <AppProvider>
          <TestComponent />
        </AppProvider>
      );
    });

    // Call state update wrapped in act()
    await act(async () => {
      capturedContext.setActiveAIProvider('ollama');
    });

    // State should switch active provider and default its model
    expect(capturedContext.aiSettings.activeProvider).toBe('ollama');
    expect(capturedContext.aiSettings.activeModel).toBe('ollama/qwen2.5-coder:7b');
  });

  it('syncs correctly when selecting specific models via setActiveAIModel', async () => {
    let capturedContext: any = null;

    const TestComponent = () => {
      const context = useApp();
      capturedContext = context;
      return null;
    };

    await act(async () => {
      root.render(
        <AppProvider>
          <TestComponent />
        </AppProvider>
      );
    });

    // Set model to Ollama model
    await act(async () => {
      capturedContext.setActiveAIModel('ollama/deepseek-r1:8b');
    });

    // Should auto-toggle provider to ollama
    expect(capturedContext.aiSettings.activeModel).toBe('ollama/deepseek-r1:8b');
    expect(capturedContext.aiSettings.activeProvider).toBe('ollama');
  });

  it('enforces local restrictions under strict_local privacy mode', async () => {
    let capturedContext: any = null;

    const TestComponent = () => {
      const context = useApp();
      capturedContext = context;
      return null;
    };

    await act(async () => {
      root.render(
        <AppProvider>
          <TestComponent />
        </AppProvider>
      );
    });

    await act(async () => {
      capturedContext.setAIPrivacyMode('strict_local');
    });

    // Strict local forces Ollama as active provider and the default local coder model
    expect(capturedContext.aiSettings.privacyMode).toBe('strict_local');
    expect(capturedContext.aiSettings.activeProvider).toBe('ollama');
    expect(capturedContext.aiSettings.activeModel).toBe('ollama/qwen2.5-coder:7b');
  });

  it('updates individual provider credentials correctly', async () => {
    let capturedContext: any = null;

    const TestComponent = () => {
      const context = useApp();
      capturedContext = context;
      return null;
    };

    await act(async () => {
      root.render(
        <AppProvider>
          <TestComponent />
        </AppProvider>
      );
    });

    await act(async () => {
      capturedContext.updateProviderConfig('openrouter', {
        apiKey: 'sk-or-new-test-token',
        enabled: true,
      });
    });

    expect(capturedContext.aiSettings.providers.openrouter.apiKey).toBe('sk-or-new-test-token');
    expect(capturedContext.aiSettings.providers.openrouter.enabled).toBe(true);
  });

  it('supports dynamic language switching and localization utilities', async () => {
    let capturedContext: any = null;

    const TestComponent = () => {
      const context = useApp();
      capturedContext = context;
      return null;
    };

    await act(async () => {
      root.render(
        <AppProvider>
          <TestComponent />
        </AppProvider>
      );
    });

    // Default language is 'ar'
    expect(capturedContext.language).toBe('ar');
    expect(capturedContext.isRTL).toBe(true);
    expect(capturedContext.dir).toBe('rtl');
    expect(capturedContext.t.nav.landing).toBe('نظرة عامة');
    expect(capturedContext.translate('common.save')).toBe('حفظ');

    // Switch to English dynamically via toggleLanguage
    await act(async () => {
      capturedContext.toggleLanguage();
    });

    expect(capturedContext.language).toBe('en');
    expect(capturedContext.isRTL).toBe(false);
    expect(capturedContext.dir).toBe('ltr');
    expect(capturedContext.t.nav.landing).toBe('Overview');
    expect(capturedContext.translate('common.save')).toBe('Save');

    // Switch explicitly via setLanguage
    await act(async () => {
      capturedContext.setLanguage('ar');
    });

    expect(capturedContext.language).toBe('ar');
    expect(capturedContext.isRTL).toBe(true);
    expect(capturedContext.dir).toBe('rtl');
  });
});
