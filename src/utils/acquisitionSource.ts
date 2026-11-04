// Mémorise l'origine d'un visiteur (ex. calculateur de prix) jusqu'à l'envoi
// de sa demande de devis, même s'il crée son compte entre-temps. Valable 7 jours.
const KEY = 'ttd_acquisition_source';
const TTL_MS = 7 * 24 * 60 * 60 * 1000;
export type AcquisitionSource = 'calculateur';

export function rememberAcquisitionSource(source: AcquisitionSource) {
  try { localStorage.setItem(KEY, JSON.stringify({ source, at: Date.now() })); } catch { /* ignore */ }
}

export function readAcquisitionSource(now = Date.now()): AcquisitionSource | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (v?.source !== 'calculateur' || typeof v.at !== 'number' || now - v.at > TTL_MS) return null;
    return v.source;
  } catch { return null; }
}

export function clearAcquisitionSource() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
