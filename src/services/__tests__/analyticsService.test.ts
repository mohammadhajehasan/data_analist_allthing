// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';

const ph = vi.hoisted(() => ({
  init: vi.fn(),
  capture: vi.fn(),
  identify: vi.fn(),
  opt_in_capturing: vi.fn(),
  opt_out_capturing: vi.fn(),
  reset: vi.fn(),
}));

vi.mock('posthog-js', () => ({ default: ph }));

/** Fresh module per test: the project key is read once at import time. */
async function loadService(projectKey = 'phc_test_key') {
  vi.resetModules();
  vi.stubEnv('VITE_POSTHOG_KEY', projectKey);
  return import('../analyticsService');
}

describe('analyticsService — PostHog consent gate', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('stays silent until the user grants consent', async () => {
    const svc = await loadService();
    svc.initAnalytics();
    svc.captureAnalyticsEvent('feature_viewed', { feature: 'datasets' });

    expect(ph.init).toHaveBeenCalledTimes(1);
    expect(ph.init.mock.calls[0][1]).toMatchObject({
      person_profiles: 'identified_only',
      opt_out_capturing_by_default: true,
      autocapture: false,
      disable_session_recording: true,
    });
    expect(ph.capture).not.toHaveBeenCalled();
    expect(ph.identify).not.toHaveBeenCalled();
  });

  it('captures events and identifies the user after consent', async () => {
    localStorage.setItem('carbon_analytics_consent', 'granted');
    const svc = await loadService();

    svc.identifyAnalyticsUser({ id: 'user-1', email: 'analyst@example.com', role: 'analyst' });
    svc.captureAnalyticsEvent('sign_in_completed', { method: 'password' });

    expect(ph.identify).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ $set: { email: 'analyst@example.com', role: 'analyst' } }),
    );
    expect(ph.capture).toHaveBeenCalledWith('sign_in_completed', { method: 'password' });
  });

  it('persists the choice and opts out when consent is declined', async () => {
    localStorage.setItem('carbon_analytics_consent', 'granted');
    const svc = await loadService();
    svc.initAnalytics();
    svc.setAnalyticsConsent('denied');

    expect(localStorage.getItem('carbon_analytics_consent')).toBe('denied');
    expect(ph.opt_out_capturing).toHaveBeenCalled();

    vi.clearAllMocks();
    svc.captureAnalyticsEvent('feature_viewed', { feature: 'reports' });
    expect(ph.capture).not.toHaveBeenCalled();
  });

  it('does nothing when no PostHog project key is configured', async () => {
    localStorage.setItem('carbon_analytics_consent', 'granted');
    const svc = await loadService('');

    expect(svc.isAnalyticsConfigured()).toBe(false);
    svc.initAnalytics();
    svc.captureAnalyticsEvent('sign_in_completed');
    svc.identifyAnalyticsUser({ id: 'user-1' });

    expect(ph.init).not.toHaveBeenCalled();
    expect(ph.capture).not.toHaveBeenCalled();
    expect(ph.identify).not.toHaveBeenCalled();
  });

  it('links a user known before consent as soon as consent is granted', async () => {
    const svc = await loadService();
    svc.identifyAnalyticsUser({ id: 'user-2', role: 'admin' });
    expect(ph.identify).not.toHaveBeenCalled();

    svc.setAnalyticsConsent('granted');

    expect(ph.identify).toHaveBeenCalledWith(
      'user-2',
      expect.objectContaining({ role: 'admin' }),
    );
    expect(ph.capture).toHaveBeenCalledWith('analytics_consent_granted', {});
  });

  it('clears the PostHog identity on sign-out', async () => {
    const svc = await loadService();
    svc.initAnalytics();
    svc.resetAnalytics();
    expect(ph.reset).toHaveBeenCalled();
  });
});
