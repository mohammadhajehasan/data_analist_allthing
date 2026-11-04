/**
 * PostHog product analytics — the single entry point for the whole app.
 *
 * Rules enforced here so feature code stays trivial:
 *  - Nothing is imported or initialised until a project key is configured
 *    (VITE_POSTHOG_KEY), so the SDK is inert in local/offline builds.
 *  - Consent first: capture is opted out by default and only starts after the
 *    user grants consent in AnalyticsConsentBanner (persisted in localStorage,
 *    like every other UI preference in this app).
 *  - Session recording, autocapture and automatic pageviews are off: this app
 *    handles user datasets, so only the explicit events below leave the browser.
 *  - Analytics must never break the product — every SDK call is guarded.
 */
import posthog from 'posthog-js';

const CONSENT_STORAGE_KEY = 'carbon_analytics_consent';
const DEFAULT_API_HOST = 'https://us.i.posthog.com';

export type AnalyticsConsent = 'granted' | 'denied';

export interface AnalyticsUser {
  id: string;
  email?: string;
  name?: string;
  role?: string;
}

const projectKey = (import.meta.env.VITE_POSTHOG_KEY || '').trim();
const apiHost = (import.meta.env.VITE_POSTHOG_HOST || '').trim() || DEFAULT_API_HOST;

let initialized = false;

/** True when a PostHog project key was baked in at build time. */
export function isAnalyticsConfigured(): boolean {
  return projectKey.length > 0;
}

/** The user's stored analytics choice, or null when they have not decided yet. */
export function getAnalyticsConsent(): AnalyticsConsent | null {
  try {
    const stored = localStorage.getItem(CONSENT_STORAGE_KEY);
    return stored === 'granted' || stored === 'denied' ? stored : null;
  } catch {
    return null;
  }
}

/**
 * Create the PostHog client once per page load. Capturing starts opted-out;
 * consent (if already granted) switches it on in the `loaded` callback.
 */
export function initAnalytics(): void {
  if (initialized || !isAnalyticsConfigured()) return;
  initialized = true;
  try {
    posthog.init(projectKey, {
      api_host: apiHost,
      persistence: 'localStorage',
      person_profiles: 'identified_only',
      capture_pageview: false, // SPA: navigations are explicit feature_viewed events
      capture_pageleave: false,
      autocapture: false,
      disable_session_recording: true,
      opt_out_capturing_by_default: true,
      loaded: (client) => {
        if (getAnalyticsConsent() === 'granted') client.opt_in_capturing();
      },
    });
  } catch {
    initialized = false;
  }
}

/** Record the analytics choice and apply it to the running client. */
export function setAnalyticsConsent(decision: AnalyticsConsent): void {
  try {
    localStorage.setItem(CONSENT_STORAGE_KEY, decision);
  } catch {
    /* private mode: the choice lasts for this page only */
  }
  if (decision === 'granted') {
    initAnalytics();
    if (initialized) {
      try {
        posthog.opt_in_capturing();
      } catch {
        /* ignore */
      }
    }
    captureAnalyticsEvent('analytics_consent_granted');
    return;
  }
  if (initialized) {
    try {
      posthog.opt_out_capturing();
    } catch {
      /* ignore */
    }
  }
}

/**
 * Tie events to the signed-in account. PostHog merges anything captured before
 * this call (the anonymous session) into the person, so funnels start at sign-in.
 */
export function identifyAnalyticsUser(user: AnalyticsUser): void {
  if (!isAnalyticsConfigured() || !user.id || getAnalyticsConsent() !== 'granted') return;
  initAnalytics();
  const personProperties: Record<string, string> = {};
  if (user.email) personProperties.email = user.email;
  if (user.name) personProperties.name = user.name;
  if (user.role) personProperties.role = user.role;
  try {
    posthog.identify(user.id, {
      $set: personProperties,
      role: user.role,
    });
  } catch {
    /* ignore */
  }
}

/** Capture one product event. No-ops when analytics is not configured/consented. */
export function captureAnalyticsEvent(
  event: string,
  properties: Record<string, unknown> = {},
): void {
  if (!isAnalyticsConfigured() || getAnalyticsConsent() !== 'granted') return;
  initAnalytics();
  try {
    posthog.capture(event, properties);
  } catch {
    /* ignore */
  }
}

/** Clear the PostHog identity on sign-out / session expiry. */
export function resetAnalytics(): void {
  if (!initialized) return;
  try {
    posthog.reset();
  } catch {
    /* ignore */
  }
}
