export const CONSENT_KEY = 'ttd_ad_consent';

const SIX_MONTHS_MS = 1000 * 60 * 60 * 24 * 180;

export type AdConsentChoice = 'granted' | 'refused';

export function readAdConsent(): { choice: AdConsentChoice; ts: number } | null {
  try {
    const raw = localStorage.getItem(CONSENT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.choice !== 'granted' && parsed?.choice !== 'refused') return null;
    const ts = Number(parsed.ts) || 0;
    if (Date.now() - ts > SIX_MONTHS_MS) return null;
    return { choice: parsed.choice, ts };
  } catch {
    return null;
  }
}

export function hasAdConsent(): boolean {
  return readAdConsent()?.choice === 'granted';
}

const STANDARD_EVENTS = new Set([
  'PageView',
  'Purchase',
  'Lead',
  'CompleteRegistration',
  'InitiateCheckout',
  'ViewContent',
  'Search',
  'AddToCart',
  'AddToWishlist',
  'Contact',
  'Schedule',
  'Subscribe',
  'StartTrial',
]);

/** Envoie un événement Meta Pixel uniquement si le visiteur a accepté la mesure publicitaire. */
export function trackAdEvent(name: string, params?: Record<string, unknown>) {
  if (!hasAdConsent()) return;
  const w = window as unknown as { fbq?: (...args: unknown[]) => void };
  if (typeof w.fbq !== 'function') return;
  const method = STANDARD_EVENTS.has(name) ? 'track' : 'trackCustom';
  w.fbq(method, name, params || {});
}
