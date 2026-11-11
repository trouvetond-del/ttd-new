// Coût par demande de devis : dépenses publicitaires (rapport SEA quotidien)
// divisées par les demandes terminées venues de chaque plateforme.
export type Provider = 'google' | 'meta';
export type ProviderReport = { ok?: boolean; campaigns?: { spend?: number }[]; period?: { start: string; end: string } };
export type CostRow = { provider: Provider; spend: number; requests: number; costPerRequest: number | null; overThreshold: boolean };

const SOURCE: Record<Provider, string> = { google: 'google_ads', meta: 'meta_ads' };

export function computeCostRows(
  summary: { google?: ProviderReport; meta?: ProviderReport } | null,
  requests: { acquisition_source: string | null }[],
  threshold: number | null,
): CostRow[] {
  return (['google', 'meta'] as Provider[]).map(provider => {
    const rep = summary?.[provider];
    const spend = Math.round((rep?.campaigns || []).reduce((s, c) => s + (Number(c.spend) || 0), 0) * 100) / 100;
    const n = requests.filter(r => r.acquisition_source === SOURCE[provider]).length;
    const cpr = n > 0 ? Math.round((spend / n) * 100) / 100 : null;
    const over = threshold != null && threshold > 0 && ((cpr != null && cpr > threshold) || (n === 0 && spend > threshold));
    return { provider, spend, requests: n, costPerRequest: cpr, overThreshold: over };
  });
}
