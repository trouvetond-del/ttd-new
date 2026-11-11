// Informations déjà saisies sur la page publicité ou le calculateur de volume,
// reprises dans le formulaire complet pour ne rien faire retaper. Valable 2 jours.
const KEY = 'ttd_quote_prefill';
const TTL_MS = 2 * 24 * 60 * 60 * 1000;

export type QuotePrefill = {
  client_name?: string;
  client_email?: string;
  client_phone?: string;
  moving_date?: string;
  from_home_type?: string;
  from_home_size?: string;
  volume_m3?: number;
  departure_city?: string;
  arrival_city?: string;
};

export function saveQuotePrefill(data: QuotePrefill) {
  try {
    const prev = readQuotePrefill() || {};
    localStorage.setItem(KEY, JSON.stringify({ data: { ...prev, ...data }, at: Date.now() }));
  } catch { /* ignore */ }
}

export function readQuotePrefill(now = Date.now()): QuotePrefill | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (!v?.data || typeof v.at !== 'number' || now - v.at > TTL_MS) return null;
    return v.data as QuotePrefill;
  } catch { return null; }
}

export function clearQuotePrefill() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
