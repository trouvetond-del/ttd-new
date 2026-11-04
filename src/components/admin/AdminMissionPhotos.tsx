import { useState } from 'react';
import { Search, Loader2, Camera } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface Photo { id: string; storage_path: string; photo_type: string; created_at: string; metadata: any }

const STEP_LABEL: Record<string, string> = {
  not_started: 'Pas démarrée', loading: 'Chargement en cours', loaded: 'Chargement terminé', unloading: 'Déchargement en cours', completed: 'Terminée',
};

// Photos de mission par étape, pour vérifier une réclamation (en plus de l'analyse IA).
export default function AdminMissionPhotos() {
  const [ref, setRef] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ qr: any; state: any; photos: Photo[] } | null>(null);
  const [error, setError] = useState('');
  const [zoom, setZoom] = useState<string | null>(null);

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(''); setResult(null);
    const q = ref.trim().toUpperCase();
    const { data: qr } = await supabase.from('quote_requests').select('id, reference, from_city, to_city, moving_date, client_name')
      .ilike('reference', q.startsWith('TTD') ? q : `%${q}%`).limit(1).maybeSingle();
    if (!qr) { setError('Aucune demande avec cette référence'); setBusy(false); return; }
    const [{ data: state }, { data: photos }] = await Promise.all([
      supabase.rpc('mission_state', { p_qr: qr.id }),
      supabase.from('moving_photos').select('id, storage_path, photo_type, created_at, metadata').eq('quote_request_id', qr.id).order('created_at'),
    ]);
    setResult({ qr, state, photos: photos || [] });
    setBusy(false);
  };

  const url = (p: string) => supabase.storage.from('moving-photos').getPublicUrl(p).data.publicUrl;
  const t = (d?: string | null) => (d ? new Date(d).toLocaleString('fr-FR') : '—');
  const groups = result ? [
    { title: 'Chargement', items: result.photos.filter((p) => p.photo_type === 'loading') },
    { title: 'Déchargement', items: result.photos.filter((p) => p.photo_type === 'unloading') },
    { title: 'Autres photos (client, dommages…)', items: result.photos.filter((p) => !['loading', 'unloading'].includes(p.photo_type)) },
  ] : [];

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Photos de mission</h2>
        <p className="text-sm text-gray-500">Conservées 1 an après la fin de la mission, plus longtemps si une réclamation est ouverte.</p>
      </div>
      <form onSubmit={search} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Référence, ex. TTD-318444" className="w-full rounded-xl border border-gray-300 py-2.5 pl-9 pr-3" />
        </div>
        <button className="rounded-xl bg-blue-600 px-5 font-semibold text-white">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Chercher'}</button>
      </form>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {result && (
        <div className="space-y-5">
          <div className="rounded-2xl border border-gray-200 bg-white p-4">
            <p className="font-semibold text-gray-900">{result.qr.reference} · {result.qr.from_city} → {result.qr.to_city}</p>
            <p className="text-sm text-gray-500">{result.qr.client_name} · {new Date(result.qr.moving_date).toLocaleDateString('fr-FR')} · {STEP_LABEL[result.state?.step] || '—'}</p>
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
              <div><p className="text-gray-400">Chargement démarré</p>{t(result.state?.loading_started_at)}</div>
              <div><p className="text-gray-400">Chargement terminé</p>{t(result.state?.loading_completed_at)}</div>
              <div><p className="text-gray-400">Déchargement démarré</p>{t(result.state?.unloading_started_at)}</div>
              <div><p className="text-gray-400">Mission terminée</p>{t(result.state?.unloading_completed_at)}</div>
            </div>
          </div>
          {groups.map((g) => (
            <div key={g.title}>
              <h3 className="mb-2 flex items-center gap-2 font-semibold text-gray-800"><Camera className="h-4 w-4" />{g.title} ({g.items.length})</h3>
              {g.items.length === 0 ? <p className="text-sm text-gray-400">Aucune photo</p> : (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                  {g.items.map((p) => (
                    <button key={p.id} onClick={() => setZoom(url(p.storage_path))} className="overflow-hidden rounded-lg border border-gray-200">
                      <img src={url(p.storage_path)} alt="" loading="lazy" className="aspect-square w-full object-cover" />
                      <p className="bg-white py-0.5 text-[10px] text-gray-500">{new Date(p.created_at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {zoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setZoom(null)}>
          <img src={zoom} alt="" className="max-h-full max-w-full rounded-lg" />
        </div>
      )}
    </div>
  );
}
