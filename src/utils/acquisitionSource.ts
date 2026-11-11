// Mémorise l'origine d'un visiteur (calculateur, publicité Google/Meta...)
// jusqu'à l'envoi de sa demande de devis, même s'il crée son compte entre-temps. Valable 7 jours.
const KEY = 'ttd_acquisition_source';
const TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const ACQUISITION_SOURCES = ['calculateur', 'calculateur-volume', 'google_ads', 'meta_ads', 'landing'] as const;
export type AcquisitionSource = typeof ACQUISITION_SOURCES[number];

export function isAcquisitionSource(v: unknown): v is AcquisitionSource {
  return typeof v === 'string' && (ACQUISITION_SOURCES as readonly string[]).includes(v);
}

/** Déduit la source publicitaire depuis l'URL (?src=google, gclid, fbclid...). */
export function sourceFromUrl(search: string): AcquisitionSource {
  const p = new URLSearchParams(search);
  const src = (p.get('src') || p.get('utm_source') || '').toLowerCase();
  if (p.has('gclid') || p.has('gbraid') || p.has('wbraid') || src === 'google' || src === 'google_ads') return 'google_ads';
  if (p.has('fbclid') || ['meta', 'facebook', 'instagram', 'fb', 'ig', 'meta_ads'].includes(src)) return 'meta_ads';
  return 'landing';
}

export function rememberAcquisitionSource(source: AcquisitionSource) {
  try { localStorage.setItem(KEY, JSON.stringify({ source, at: Date.now() })); } catch { /* ignore */ }
}

export function readAcquisitionSource(now = Date.now()): AcquisitionSource | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (!isAcquisitionSource(v?.source) || typeof v.at !== 'number' || now - v.at > TTL_MS) return null;
    return v.source;
  } catch { return null; }
}

export function clearAcquisitionSource() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
