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
// The SDK is bundled eagerly, but every call in this module sits behind the
// project-key and consent checks below, so an unconfigured build never talks
// to PostHog.
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

/**
 * The product journey PostHog funnels and retention insights are built on:
 * sign-in → onboarding → feature adoption → sign-out.
 *
 * Names are part of the analytics contract: renaming one silently breaks every
 * funnel/retention insight already configured in PostHog, so add new steps
 * here instead of renaming existing ones.
 */
export const ANALYTICS_EVENTS = {
  signInCompleted: 'sign_in_completed',
  signOut: 'sign_out',
  featureViewed: 'feature_viewed',
  onboardingStarted: 'onboarding_tour_started',
  onboardingCompleted: 'onboarding_tour_completed',
  onboardingSkipped: 'onboarding_tour_skipped',
  consentGranted: 'analytics_consent_granted',
} as const;

export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];

const projectKey = (import.meta.env.VITE_POSTHOG_KEY || '').trim();
const apiHost = (import.meta.env.VITE_POSTHOG_HOST || '').trim() || DEFAULT_API_HOST;

let initialized = false;
/** Last signed-in user, kept so consent given mid-session can still link events. */
let pendingUser: AnalyticsUser | null = null;

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

/**
 * Record the analytics choice and apply it to the running client. Granting
 * consent mid-session links the events captured from then on to the account
 * the user already signed in with, so funnels do not lose its first steps.
 */
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
    if (pendingUser) identifyAnalyticsUser(pendingUser);
    captureAnalyticsEvent(ANALYTICS_EVENTS.consentGranted);
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
  if (!user.id) return;
  pendingUser = user;
  if (!isAnalyticsConfigured() || getAnalyticsConsent() !== 'granted') return;
  initAnalytics();
  const personProperties: Record<string, string> = {};
  if (user.email) personProperties.email = user.email;
  if (user.name) personProperties.name = user.name;
  if (user.role) personProperties.role = user.role;
  try {
    posthog.identify(user.id, {
      $set: personProperties,
      // Retain the first role ever seen: retention and cohort insights stay
      // stable when an account is later promoted to admin.
      $set_once: user.role ? { initial_role: user.role } : {},
      role: user.role,
    });
  } catch {
    /* ignore */
  }
}

/** Capture one product event. No-ops when analytics is not configured/consented. */
export function captureAnalyticsEvent(
  event: AnalyticsEvent,
  properties: Record<string, unknown> = {},
): void {
  if (!isAnalyticsConfigured() || getAnalyticsConsent() !== 'granted') return;
  initAnalytics();
  try {
    // `properties` only ever carries screen ids, outcomes and step numbers —
    // never the contents of a user's dataset.
    posthog.capture(event, properties);
  } catch {
    /* ignore */
  }
}

/**
 * One adoption-funnel step: the workspace screen the user opened. The screen id
 * is the funnel breakdown key, so every navigation is one comparable event.
 */
export function captureFeatureViewed(feature: string): void {
  captureAnalyticsEvent(ANALYTICS_EVENTS.featureViewed, { feature });
}

/** Clear the PostHog identity on sign-out / session expiry. */
export function resetAnalytics(): void {
  pendingUser = null;
  if (!initialized) return;
  try {
    posthog.reset();
  } catch {
    /* ignore */
  }
}
