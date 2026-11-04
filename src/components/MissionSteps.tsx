import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Camera, CheckCircle2, Loader2, Play, Truck, PackageCheck, Lock, UserCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { compressImage } from '../utils/compressImage';
import { showToast } from '../utils/toast';

type Step = 'not_started' | 'loading' | 'loaded' | 'unloading' | 'completed';
interface MissionState {
  actor: 'owner' | 'driver' | null;
  step: Step;
  loading_started_at: string | null;
  loading_completed_at: string | null;
  unloading_started_at: string | null;
  unloading_completed_at: string | null;
  assigned_driver_id: string | null;
  driver_required: boolean;
  drivers_count: number;
  loading_photos: number;
  unloading_photos: number;
}

const MIN_PHOTOS = 3;
const STEPS: { key: Step; label: string; at: keyof MissionState }[] = [
  { key: 'loading', label: 'Chargement démarré', at: 'loading_started_at' },
  { key: 'loaded', label: 'Chargement terminé', at: 'loading_completed_at' },
  { key: 'unloading', label: 'Déchargement démarré', at: 'unloading_started_at' },
  { key: 'completed', label: 'Mission terminée', at: 'unloading_completed_at' },
];
const ORDER: Step[] = ['not_started', 'loading', 'loaded', 'unloading', 'completed'];

const fmt = (d: string | null) => (d ? new Date(d).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');

export function MissionSteps({ quoteRequestId, children }: { quoteRequestId: string; children?: ReactNode }) {
  const [state, setState] = useState<MissionState | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(0);
  const [drivers, setDrivers] = useState<{ id: string; full_name: string }[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    const { data, error } = await supabase.rpc('mission_state', { p_qr: quoteRequestId });
    if (error) { setError(error.message); return; }
    setState(data as MissionState);
    if ((data as MissionState).actor === 'owner') {
      const { data: d } = await supabase.from('mover_drivers').select('id, full_name').eq('active', true).order('full_name');
      setDrivers(d || []);
    }
  };
  useEffect(() => { load(); }, [quoteRequestId]);

  if (error) return <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>;
  if (!state) return <div className="flex justify-center p-4"><Loader2 className="h-5 w-5 animate-spin text-blue-600" /></div>;

  const canAct = state.actor !== null;
  const idx = ORDER.indexOf(state.step);
  const photoStep = state.step === 'loading' || state.step === 'unloading';
  const photoCount = state.step === 'loading' ? state.loading_photos : state.unloading_photos;

  const advance = async () => {
    setBusy(true);
    const { error } = await supabase.rpc('mission_advance', { p_qr: quoteRequestId });
    setBusy(false);
    if (error) showToast(error.message, 'error');
    else { showToast('Étape enregistrée', 'success'); load(); }
  };

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(files.length);
    let ok = 0;
    for (const f of Array.from(files)) {
      const blob = await compressImage(f);
      const path = `${quoteRequestId}/mission_${state.step}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
      const up = await supabase.storage.from('moving-photos').upload(path, blob, { contentType: 'image/jpeg' });
      if (!up.error) {
        const { error } = await supabase.rpc('mission_add_photo', { p_qr: quoteRequestId, p_path: path });
        if (!error) ok++;
      }
      setUploading((n) => n - 1);
    }
    if (fileRef.current) fileRef.current.value = '';
    showToast(ok ? `${ok} photo${ok > 1 ? 's' : ''} ajoutée${ok > 1 ? 's' : ''}` : "Échec de l'envoi des photos", ok ? 'success' : 'error');
    load();
  };

  const assign = async (driverId: string) => {
    const { error } = await supabase.rpc('mission_assign_driver', { p_qr: quoteRequestId, p_driver: driverId || null });
    if (error) showToast(error.message, 'error'); else { showToast('Chauffeur enregistré', 'success'); load(); }
  };

  const action: Record<Step, { label: string; icon: ReactNode } | null> = {
    not_started: { label: 'Démarrer le chargement', icon: <Play className="h-5 w-5" /> },
    loading: { label: 'Chargement terminé', icon: <PackageCheck className="h-5 w-5" /> },
    loaded: { label: 'Démarrer le déchargement', icon: <Truck className="h-5 w-5" /> },
    unloading: { label: 'Clôturer la mission', icon: <CheckCircle2 className="h-5 w-5" /> },
    completed: null,
  };
  const next = action[state.step];
  const blockedByPhotos = photoStep && photoCount < MIN_PHOTOS;
  const blockedByDriver = state.step === 'not_started' && state.driver_required && !state.assigned_driver_id;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">Suivi de la mission</h3>
        <span className="text-xs text-gray-500">Étapes obligatoires</span>
      </div>

      <ol className="grid grid-cols-4 gap-1.5">
        {STEPS.map((s, i) => {
          const done = idx >= i + 1;
          return (
            <li key={s.key} className="text-center">
              <div className={`h-1.5 rounded-full ${done ? 'bg-emerald-500' : 'bg-gray-200'}`} />
              <p className={`mt-1.5 text-[11px] leading-tight ${done ? 'text-emerald-700 font-medium' : 'text-gray-400'}`}>{s.label}</p>
              {done && <p className="text-[10px] text-gray-500">{fmt(state[s.at] as string | null)}</p>}
            </li>
          );
        })}
      </ol>

      {state.actor === 'owner' && state.step !== 'completed' && (
        <label className="block">
          <span className="flex items-center gap-1.5 text-sm font-medium text-gray-700"><UserCheck className="h-4 w-4" />Chauffeur de la mission{state.driver_required ? ' (obligatoire)' : ''}</span>
          {drivers.length === 0 ? (
            <a href="/mover/drivers" className="mt-1 block text-sm text-blue-600 underline">
              {state.driver_required ? 'Créez un compte chauffeur pour pouvoir démarrer' : 'Ajouter un chauffeur (facultatif)'}
            </a>
          ) : (
            <select value={state.assigned_driver_id || ''} onChange={(e) => assign(e.target.value)} disabled={state.step !== 'not_started'}
              className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-3 py-3 text-base">
              <option value="">{state.driver_required ? 'Choisir un chauffeur' : "Moi-même (pas de chauffeur)"}</option>
              {drivers.map((d) => <option key={d.id} value={d.id}>{d.full_name}</option>)}
            </select>
          )}
        </label>
      )}

      {canAct && photoStep && (
        <div className="rounded-xl bg-blue-50 p-3">
          <p className="text-sm text-blue-900">
            Photos du {state.step === 'loading' ? 'chargement' : 'déchargement'} : <strong>{photoCount}/{MIN_PHOTOS} minimum</strong>
          </p>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} />
          <button onClick={() => fileRef.current?.click()} disabled={uploading > 0}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-blue-300 bg-white py-4 text-base font-semibold text-blue-700 active:bg-blue-50">
            {uploading > 0 ? <><Loader2 className="h-5 w-5 animate-spin" />Envoi ({uploading})…</> : <><Camera className="h-5 w-5" />Prendre une photo</>}
          </button>
        </div>
      )}

      {canAct && next && (
        <button onClick={advance} disabled={busy || blockedByPhotos || blockedByDriver}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-4 text-base font-semibold text-white disabled:bg-gray-300 active:bg-blue-700">
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : (blockedByPhotos || blockedByDriver) ? <Lock className="h-5 w-5" /> : next.icon}
          {next.label}
        </button>
      )}
      {blockedByPhotos && <p className="text-center text-xs text-gray-500">Ajoutez encore {MIN_PHOTOS - photoCount} photo{MIN_PHOTOS - photoCount > 1 ? 's' : ''} pour continuer.</p>}

      {state.step === 'completed' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-sm font-medium text-emerald-800"><CheckCircle2 className="h-5 w-5" />Mission clôturée avec photos</div>
          {state.actor === 'owner' && children}
        </div>
      )}
    </div>
  );
}
