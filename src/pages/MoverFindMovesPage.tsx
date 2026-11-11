import { useEffect, useMemo, useState } from 'react';
import { Search, MapPin, Calendar, Package, Navigation, ArrowRight, Loader2, CheckCircle2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { MoverLayout } from '../components/MoverLayout';
import QuoteBidModal from '../components/QuoteBidModal';
import { regionFromPostalCode, FRENCH_REGIONS } from '../utils/frenchRegion';
import { findGroupages, type MoveCentres } from '../lib/moverGroupage';
import { showToast } from '../utils/toast';
import { coordsFromPostalCode, searchCities, distanceKm, type LatLng } from '../utils/geoFrance';

const MAX_RADIUS = 250;
const COLUMNS = `id, reference, client_user_id, client_name, client_email, client_phone, from_address, from_city, from_postal_code,
  to_address, to_city, to_postal_code, moving_date, home_size, home_type, floor_from, floor_to, elevator_from, elevator_to,
  from_home_type, from_home_size, from_surface_m2, to_home_type, to_home_size, to_surface_m2, volume_m3, surface_m2,
  furniture_lift_needed_departure, furniture_lift_needed_arrival, date_flexibility_days, additional_info, services_needed,
  furniture_inventory, furniture_photos, accepts_groupage, status, created_at, updated_at, is_data_masked, distance_km`;

export default function MoverFindMovesPage({ groupageOnly = false }: { groupageOnly?: boolean }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<any[]>([]);
  const [quoted, setQuoted] = useState<Set<string>>(new Set());
  const [coords, setCoords] = useState<Record<string, LatLng | null>>({});
  const [centres, setCentres] = useState<MoveCentres>({});
  const [loadError, setLoadError] = useState('');
  const [kind, setKind] = useState('');
  const [ref, setRef] = useState('');
  const [region, setRegion] = useState('');
  const [radius, setRadius] = useState(MAX_RADIUS);
  const [useRadius, setUseRadius] = useState(false);
  const [origin, setOrigin] = useState<{ label: string; coords: LatLng } | null>(null);
  const [companyOrigin, setCompanyOrigin] = useState<{ label: string; coords: LatLng } | null>(null);
  const [cityQuery, setCityQuery] = useState('');
  const [citySuggestions, setCitySuggestions] = useState<{ name: string; postal: string; coords: LatLng }[]>([]);
  const [bidRequest, setBidRequest] = useState<any | null>(null);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    setLoadError('');
    try {
    const { data: mover } = await supabase.from('movers').select('id, city, postal_code').eq('user_id', user.id).maybeSingle();
    if (mover?.postal_code) {
      const c = await coordsFromPostalCode(mover.postal_code);
      if (c) {
        const o = { label: `Mon entreprise (${mover.city || mover.postal_code})`, coords: c };
        setCompanyOrigin(o);
        setOrigin((prev) => prev || o);
      }
    }
    if (mover) {
      const { data: mine } = await supabase.from('quotes').select('quote_request_id').eq('mover_id', mover.id);
      setQuoted(new Set((mine || []).map((q: any) => q.quote_request_id)));
    }
    const { data, error } = await supabase.rpc('list_open_moves');
    if (error) throw error;
    const list = data || [];
    setRequests(list);
    const entries = await Promise.all(list.map(async (r: any) => {
      const [from, to] = await Promise.all([coordsFromPostalCode(r.from_postal_code), groupageOnly ? coordsFromPostalCode(r.to_postal_code) : Promise.resolve(null)]);
      return [r.id, { from, to }] as const;
    }));
    const allCentres = Object.fromEntries(entries);
    setCentres(allCentres);
    setCoords(Object.fromEntries(entries.map(([id, c]) => [id, c.from])));
    } catch { setLoadError('Impossible de charger les déménagements. Réessayez.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [user, groupageOnly]);

  // Détails complets (masqués selon les règles de confidentialité) seulement au moment de déposer un devis
  const openBid = async (r: any) => {
    const { data, error } = await supabase.from('quote_requests_with_privacy').select(COLUMNS).eq('id', r.id).maybeSingle();
    if (error || !data) { showToast('Demande indisponible. Actualisez la liste.', 'error'); return; }
    setBidRequest(data);
  };

  useEffect(() => {
    const t = setTimeout(async () => setCitySuggestions(await searchCities(cityQuery)), 250);
    return () => clearTimeout(t);
  }, [cityQuery]);

  const rows = useMemo(() => {
    const q = ref.trim().toUpperCase().replace(/^TTD-?/, '');
    return requests
      .map((r) => {
        const c = coords[r.id];
        return { ...r, region: regionFromPostalCode(r.from_postal_code), fromOrigin: origin && c ? distanceKm(origin.coords, c) : null };
      })
      .filter((r) => !q || String(r.reference || '').toUpperCase().includes(q))
      .filter((r) => !region || r.region === region || regionFromPostalCode(r.to_postal_code) === region)
      .filter((r) => !useRadius || (r.fromOrigin !== null && r.fromOrigin <= radius))
      .sort((a, b) => (useRadius ? (a.fromOrigin ?? 9999) - (b.fromOrigin ?? 9999) : 0));
  }, [requests, coords, ref, region, radius, useRadius, origin]);

  const groupages = useMemo(() => {
    const visible = new Set(rows.map(r => r.id));
    return findGroupages(requests, centres).filter(p => (!kind || p.kind === kind) && (visible.has(p.a.id) || visible.has(p.b.id)));
  }, [requests, centres, rows, kind]);

  const fmtDate = (d: string) => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <MoverLayout title={groupageOnly ? "Groupage" : "Trouver des déménagements"}>
      <div className="max-w-6xl mx-auto space-y-5">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="grid gap-4 md:grid-cols-3">
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Numéro de demande</span>
              <div className="relative mt-1.5">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="TTD-318444"
                  className="w-full rounded-xl border border-gray-300 py-2.5 pl-9 pr-3 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none" />
              </div>
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Région</span>
              <select value={region} onChange={(e) => setRegion(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-gray-300 py-2.5 px-3 text-sm bg-white focus:border-blue-500 outline-none">
                <option value="">Toutes les régions</option>
                {FRENCH_REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </label>
            <div>
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Point de départ du périmètre</span>
              <div className="relative mt-1.5">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input value={cityQuery} onChange={(e) => setCityQuery(e.target.value)} placeholder={origin?.label || 'Tapez une ville'}
                  className="w-full rounded-xl border border-gray-300 py-2.5 pl-9 pr-3 text-sm focus:border-blue-500 outline-none" />
                {citySuggestions.length > 0 && cityQuery && (
                  <div className="absolute z-20 mt-1 w-full rounded-xl border border-gray-200 bg-white shadow-lg overflow-hidden">
                    {citySuggestions.map((c) => (
                      <button key={c.name + c.postal} type="button"
                        onClick={() => { setOrigin({ label: `${c.name} (${c.postal})`, coords: c.coords }); setCityQuery(''); setCitySuggestions([]); setUseRadius(true); }}
                        className="block w-full text-left px-3 py-2 text-sm hover:bg-blue-50">{c.name} <span className="text-gray-400">{c.postal}</span></button>
                    ))}
                  </div>
                )}
              </div>
              <div className="mt-1 flex items-center justify-between text-xs text-gray-500">
                <span className="truncate">Depuis : <strong className="text-gray-700">{origin?.label || 'non défini'}</strong></span>
                {companyOrigin && origin?.label !== companyOrigin.label && (
                  <button className="text-blue-600 hover:underline shrink-0 ml-2" onClick={() => setOrigin(companyOrigin)}>Mon entreprise</button>
                )}
              </div>
            </div>
          </div>
          <div className="mt-5 flex flex-col sm:flex-row sm:items-center gap-3">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 shrink-0">
              <input type="checkbox" checked={useRadius} disabled={!origin} onChange={(e) => setUseRadius(e.target.checked)} className="h-4 w-4 rounded text-blue-600" />
              Limiter au périmètre
            </label>
            <input type="range" min={10} max={MAX_RADIUS} step={10} value={radius} disabled={!useRadius}
              onChange={(e) => setRadius(Number(e.target.value))} className="flex-1 accent-blue-600 disabled:opacity-40" />
            <span className="w-20 text-right text-sm font-semibold text-blue-700">{radius} km</span>
          </div>
        </div>

        {groupageOnly && <label className="block text-sm">Type de trajet
          <select value={kind} onChange={e => setKind(e.target.value)} className="ml-3 border rounded-lg px-3 py-2">
            <option value="">Tous</option><option value="same_route">Même trajet</option><option value="return_trip">Retour à vide</option>
          </select>
        </label>}
        {loadError && <div role="alert">{loadError} <button onClick={load}>Réessayer</button></div>}
        <p className="text-sm text-gray-600">{loading ? 'Chargement…' : groupageOnly ? `${groupages.length} groupage${groupages.length > 1 ? 's' : ''} disponible${groupages.length > 1 ? 's' : ''}` : `${rows.length} déménagement${rows.length > 1 ? 's' : ''} ouvert${rows.length > 1 ? 's' : ''}`}</p>

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div>
        ) : groupageOnly ? (
          groupages.length === 0 ? <p className="py-10 text-center text-gray-500">Aucun groupage disponible pour ces critères.</p> :
          <div className="space-y-4">{groupages.map(pair => <article key={pair.id} className="border border-gray-200 rounded-lg bg-white p-4">
            <div className="flex flex-wrap justify-between gap-2 mb-3">
              <h2 className="font-semibold">{pair.kind === 'same_route' ? 'Même trajet' : 'Retour à vide'}</h2>
              <span className="text-sm">{pair.days} jour{pair.days > 1 ? 's' : ''} d’écart · Raccordement ≈ {Math.round(pair.distance1)} km</span>
            </div>
            <div className="grid md:grid-cols-2 gap-4">{[pair.a, pair.b].map(r => <div key={r.id} className="min-w-0 space-y-2">
              <strong>{r.reference}</strong>
              <p className="break-words">{r.from_city} ({r.from_postal_code}) → {r.to_city} ({r.to_postal_code})</p>
              <p className="text-sm">{fmtDate(r.moving_date)} · {r.volume_m3 ?? '—'} m³</p>
              {quoted.has(r.id) ? <span className="text-sm text-green-700">Devis déposé</span> :
                <button onClick={() => openBid(r)} className="rounded-lg bg-blue-600 text-white px-4 py-2 text-sm">Déposer mon devis</button>}
            </div>)}</div>
          </article>)}</div>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center text-gray-500">Aucun déménagement ne correspond à ces critères.</div>
        ) : (
          <div className="grid gap-3">
            {rows.map((r) => (
              <div key={r.id} className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5 shadow-sm hover:shadow-md transition">
                <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="rounded-full bg-blue-50 px-2.5 py-0.5 font-semibold text-blue-700">{r.reference || '—'}</span>
                      {r.region && <span className="text-gray-500">{r.region}</span>}
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-lg font-semibold text-gray-900">
                      <span className="truncate">{r.from_city}</span>
                      <ArrowRight className="h-4 w-4 text-gray-400 shrink-0" />
                      <span className="truncate">{r.to_city}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-gray-600">
                      <span className="flex items-center gap-1.5"><Calendar className="h-4 w-4 text-gray-400" />{fmtDate(r.moving_date)}</span>
                      <span className="flex items-center gap-1.5"><Package className="h-4 w-4 text-gray-400" />{r.volume_m3} m³</span>
                      {r.distance_km ? <span className="flex items-center gap-1.5"><Navigation className="h-4 w-4 text-gray-400" />Trajet {Math.round(r.distance_km)} km</span> : null}
                      {r.fromOrigin !== null && <span className="flex items-center gap-1.5 text-blue-700"><MapPin className="h-4 w-4" />À {r.fromOrigin} km de vous</span>}
                    </div>
                  </div>
                  {quoted.has(r.id) ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-4 py-2 text-sm font-medium text-green-700"><CheckCircle2 className="h-4 w-4" />Devis déposé</span>
                  ) : (
                    <button onClick={() => openBid(r)}
                      className="rounded-full bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition">Déposer mon devis →</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {bidRequest && (
        <QuoteBidModal quoteRequest={bidRequest} onClose={() => setBidRequest(null)} onSuccess={() => { setBidRequest(null); load(); }} />
      )}
    </MoverLayout>
  );
}
