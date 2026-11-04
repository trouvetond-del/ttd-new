export interface ConversionStats { requests: number; withRealQuote: number; accepted: number; quoteRate: number; acceptRate: number }

// Un « devis réel » = au moins un devis envoyé par un déménageur pour la demande.
export function computeConversion(
  requests: { id: string; accepted_quote_id?: string | null }[],
  quotes: { quote_request_id: string; status?: string | null }[],
): ConversionStats {
  const ids = new Set(requests.map(r => r.id));
  const quoted = new Set(quotes.filter(q => ids.has(q.quote_request_id)).map(q => q.quote_request_id));
  const acceptedIds = new Set(quotes.filter(q => ids.has(q.quote_request_id) && q.status === 'accepted').map(q => q.quote_request_id));
  requests.forEach(r => { if (r.accepted_quote_id) acceptedIds.add(r.id); });
  const n = requests.length;
  const pct = (x: number) => (n ? Math.round((x / n) * 1000) / 10 : 0);
  return { requests: n, withRealQuote: quoted.size, accepted: acceptedIds.size, quoteRate: pct(quoted.size), acceptRate: pct(acceptedIds.size) };
}
