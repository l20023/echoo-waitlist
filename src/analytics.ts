import posthog from 'posthog-js';

const apiKey = import.meta.env.VITE_POSTHOG_API_KEY;
const host = import.meta.env.VITE_POSTHOG_HOST || 'https://eu.i.posthog.com';

type EventProperties = Record<string, unknown>;

let consentEnabled = false;
let initialized = false;

function ensureClient() {
  if (!apiKey || !host) return;
  if (!consentEnabled || initialized) return;
  if (typeof window === 'undefined') return;

  posthog.init(apiKey, {
    api_host: host,
    capture_pageview: false,
  });
  initialized = true;
}

export function setAnalyticsConsentWeb(enabled: boolean) {
  consentEnabled = enabled;
  if (enabled) {
    ensureClient();
    if (initialized) posthog.opt_in_capturing();
  } else if (initialized) {
    posthog.opt_out_capturing();
    posthog.reset();
  }
}

export function track(event: string, properties?: EventProperties) {
  if (!consentEnabled || !initialized) return;
  posthog.capture(event, properties);
}

export function identify(distinctId: string, properties?: EventProperties) {
  if (!consentEnabled || !initialized) return;
  posthog.identify(distinctId, properties);
}

