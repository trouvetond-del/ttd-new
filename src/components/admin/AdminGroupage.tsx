import { useEffect, useState } from 'react';
import { Truck, Send, RefreshCw, ArrowRight, EyeOff } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { showToast } from '../../utils/toast';

interface Req { id: string; client_name: string; from_city: string; to_city: string; moving_date: string; volume_m3?: number | null; status: string; accepts_groupage?: boolean | null }
interface Alert { id: string; kind: 'same_route' | 'return_trip'; distance_1_km: number; distance_2_km: number; days_apart: number; movers_alerted_at: string | null; movers_alerted_count: number; created_at: string; a?: Req; b?: Req }

const fmt = (d: string) => new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });

export default function AdminGroupage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('groupage_alerts').select('*').is('dismissed_at', null).order('created_at', { ascending: false }).limit(200);
    const rows = (data || []) as any[];
    const ids = [...new Set(rows.flatMap((r) => [r.request_a, r.request_b]))];
    const { data: reqs } = ids.length
      ? await supabase.from('quote_requests').select('id, client_name, from_city, to_city, moving_date, volume_m3, status, accepts_groupage').in('id', ids)
      : { data: [] as Req[] };
    const map = new Map((reqs || []).map((r: any) => [r.id, r]));
    const today = new Date().toISOString().slice(0, 10);
    setAlerts(rows.map((r) => ({ ...r, a: map.get(r.request_a), b: map.get(r.request_b) }))
      .filter((r) => r.a && r.b && r.a.moving_date >= today && r.b.moving_date >= today));
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const alertMovers = async (id: string) => {
    setBusy(id);
    const { data, error } = await supabase.rpc('admin_groupage_alert_movers', { p_alert: id });
    setBusy(null);
    if (error) { showToast("Impossible d'alerter les déménageurs : " + error.message, 'error'); return; }
    showToast(`${data} déménageur(s) vérifié(s) prévenu(s)`, 'success');
    load();
  };
  const dismiss = async (id: string) => {
    await supabase.from('groupage_alerts').update({ dismissed_at: new Date().toISOString() }).eq('id', id);
    load();
  };

  const Leg = ({ r }: { r: Req }) => (
    <div className="flex-1 rounded-lg border border-gray-200 bg-gray-50 p-3">
      <div className="flex items-center gap-2 font-semibold text-gray-900">{r.from_city} <ArrowRight className="w-4 h-4" /> {r.to_city}</div>
      <div className="text-sm text-gray-600 mt-1">{fmt(r.moving_date)} · {r.client_name}{r.volume_m3 ? ` · ${r.volume_m3} m³` : ''}</div>
      {r.accepts_groupage && <span className="inline-block mt-1 text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-800">Client accepte le groupage</span>}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Truck className="w-6 h-6" /> Groupage</h2>
          <p className="text-gray-600 text-sm mt-1">Déménagements à moins de 200 km l'un de l'autre, à 3 jours d'écart maximum. Vérifié toutes les heures ; les déménageurs vérifiés sont prévenus automatiquement.</p>
        </div>
        <button onClick={load} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"><RefreshCw className="w-4 h-4" /> Actualiser</button>
      </div>
      {loading ? <p className="text-gray-500">Chargement…</p> : alerts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 p-10 text-center text-gray-500">Aucun groupage possible pour le moment.</div>
      ) : alerts.map((g) => (
        <div key={g.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <span className={`text-sm font-semibold px-3 py-1 rounded-full ${g.kind === 'same_route' ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'}`}>
              {g.kind === 'same_route' ? 'Même trajet' : 'Éviter le retour à vide'}
            </span>
            <span className="text-sm text-gray-600">
              {g.kind === 'same_route' ? `Départs à ${g.distance_1_km} km · arrivées à ${g.distance_2_km} km` : `Arrivée du 1er à ${g.distance_1_km} km du départ du 2e`} · {g.days_apart} jour(s) d'écart
            </span>
          </div>
          <div className="flex flex-col md:flex-row gap-3"><Leg r={g.a!} /><Leg r={g.b!} /></div>
          <div className="flex flex-wrap items-center justify-between gap-2 mt-3">
            <span className="text-xs text-gray-500">{g.movers_alerted_at ? `${g.movers_alerted_count} déménageur(s) prévenu(s) le ${new Date(g.movers_alerted_at).toLocaleString('fr-FR')}` : 'Déménageurs pas encore prévenus'}</span>
            <div className="flex gap-2">
              <button onClick={() => dismiss(g.id)} className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100"><EyeOff className="w-4 h-4" /> Masquer</button>
              <button disabled={busy === g.id} onClick={() => alertMovers(g.id)} className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50"><Send className="w-4 h-4" /> {busy === g.id ? '…' : 'Alerter les déménageurs'}</button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
