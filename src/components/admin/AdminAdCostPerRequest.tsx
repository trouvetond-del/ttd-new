import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { AlertTriangle, Euro, RefreshCw } from 'lucide-react';
import { computeCostRows, type CostRow } from '../../utils/adCost';

const THRESHOLD_KEY = 'ttd_admin_cost_per_request_threshold';
const fmt = (n: number) => n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });

export default function AdminAdCostPerRequest() {
  const [rows, setRows] = useState<CostRow[] | null>(null);
  const [period, setPeriod] = useState<{ start: string; end: string } | null>(null);
  const [threshold, setThreshold] = useState<string>(() => { try { return localStorage.getItem(THRESHOLD_KEY) || ''; } catch { return ''; } });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{ summary: any; requests: { acquisition_source: string | null }[] } | null>(null);

  const refresh = async () => {
    setLoading(true); setError('');
    try {
      const { data: rep, error: e1 } = await supabase.from('sea_reports').select('report_day, summary').order('report_day', { ascending: false }).limit(1).maybeSingle();
      if (e1) throw e1;
      const summary = rep?.summary || null;
      const p = summary?.google?.period || summary?.meta?.period || null;
      setPeriod(p);
      let requests: { acquisition_source: string | null }[] = [];
      if (p) {
        const { data: qr, error: e2 } = await supabase.from('quote_requests').select('acquisition_source')
          .eq('is_draft', false).in('acquisition_source', ['google_ads', 'meta_ads'])
          .gte('submitted_at', `${p.start}T00:00:00`).lte('submitted_at', `${p.end}T23:59:59`).limit(5000);
        if (e2) throw e2;
        requests = qr || [];
      }
      setData({ summary, requests });
    } catch (e: any) { setError(e?.message || 'Erreur de chargement'); }
    finally { setLoading(false); }
  };
  useEffect(() => { refresh(); }, []);
  useEffect(() => {
    if (!data) return;
    const t = Number(threshold.replace(',', '.'));
    setRows(computeCostRows(data.summary, data.requests, Number.isFinite(t) && t > 0 ? t : null));
    try { localStorage.setItem(THRESHOLD_KEY, threshold); } catch { /* ignore */ }
  }, [data, threshold]);

  const label = { google: 'Google Ads', meta: 'Meta (Facebook / Instagram)' } as const;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-6">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2"><Euro className="w-5 h-5 text-blue-600" /> Coût par demande de devis</h3>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600 dark:text-gray-300">Alerte au-delà de
            <input inputMode="decimal" value={threshold} onChange={e => setThreshold(e.target.value)} placeholder="—" className="ml-2 w-20 px-2 py-1 rounded border border-gray-300 dark:bg-gray-700 dark:border-gray-600 dark:text-white" /> €
          </label>
          <button onClick={refresh} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700" aria-label="Actualiser"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button>
        </div>
      </div>
      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
      {rows && (
        <table className="w-full text-sm">
          <thead><tr className="text-left text-gray-500 dark:text-gray-400"><th className="py-2">Plateforme</th><th>Dépensé</th><th>Demandes terminées</th><th>Coût par demande</th></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.provider} className={`border-t border-gray-100 dark:border-gray-700 ${r.overThreshold ? 'bg-red-50 dark:bg-red-900/20' : ''}`}>
                <td className="py-2 font-medium text-gray-900 dark:text-white">{label[r.provider]}</td>
                <td className="text-gray-700 dark:text-gray-200">{fmt(r.spend)}</td>
                <td className="text-gray-700 dark:text-gray-200">{r.requests}</td>
                <td className="font-semibold text-gray-900 dark:text-white">
                  <span className="inline-flex items-center gap-1">{r.costPerRequest != null ? fmt(r.costPerRequest) : r.spend > 0 ? 'Aucune demande' : '—'}{r.overThreshold && <AlertTriangle className="w-4 h-4 text-red-600" aria-label="Au-dessus du seuil" />}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
        {period ? `Période : ${new Date(period.start).toLocaleDateString('fr-FR')} → ${new Date(period.end).toLocaleDateString('fr-FR')} (dernier rapport SEA). ` : 'Aucun rapport SEA disponible. '}
        Seules les demandes arrivées par la page publicité (/devis-demenagement) depuis le 11 novembre 2026 sont comptées. Le seuil d’alerte est à fixer par vous.
      </p>
    </div>
  );
}
