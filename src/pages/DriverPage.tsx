import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, LogOut, MapPin, Calendar, Phone, ArrowDown, Truck } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { MissionSteps } from '../components/MissionSteps';

interface DriverMission {
  quote_request_id: string; reference: string; moving_date: string; from_address: string; from_city: string;
  to_address: string; to_city: string; floor_from: string | null; floor_to: string | null; volume_m3: number | null;
  client_name: string; client_phone: string; mission_step: string; company_name: string;
}

// Espace chauffeur : seulement les missions confiées, sans prix ni devis.
export default function DriverPage() {
  const navigate = useNavigate();
  const [missions, setMissions] = useState<DriverMission[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: s } = await supabase.auth.getSession();
      if (!s.session) { navigate('/driver/login', { replace: true }); return; }
      const { data, error } = await supabase.rpc('driver_missions');
      if (error) { setMissions([]); return; }
      setMissions(data || []);
    })();
  }, []);

  const logout = async () => { await supabase.auth.signOut(); navigate('/driver/login', { replace: true }); };
  const company = missions?.[0]?.company_name;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3">
        <div className="flex items-center gap-2">
          <img src="/logo.png" alt="TrouveTonDéménageur" className="h-8 w-auto" />
          <div><p className="text-sm font-semibold text-gray-900">Espace chauffeur</p>{company && <p className="text-xs text-gray-500">{company}</p>}</div>
        </div>
        <button onClick={logout} className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-gray-600"><LogOut className="h-4 w-4" />Sortir</button>
      </header>
      <main className="mx-auto max-w-xl space-y-3 p-4">
        {missions === null ? <Loader2 className="mx-auto mt-10 h-7 w-7 animate-spin text-blue-600" /> :
          missions.length === 0 ? (
            <div className="mt-10 rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-center text-gray-500">
              <Truck className="mx-auto mb-2 h-8 w-8 text-gray-300" />Aucune mission ne vous est confiée pour l'instant.
            </div>
          ) : missions.map((m) => (
            <div key={m.quote_request_id} className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
              <button onClick={() => setOpen(open === m.quote_request_id ? null : m.quote_request_id)} className="w-full p-4 text-left">
                <div className="flex items-center justify-between text-xs">
                  <span className="rounded-full bg-blue-50 px-2.5 py-0.5 font-semibold text-blue-700">{m.reference}</span>
                  <span className="flex items-center gap-1 text-gray-500"><Calendar className="h-3.5 w-3.5" />{new Date(m.moving_date).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                </div>
                <p className="mt-2 text-lg font-semibold text-gray-900">{m.from_city} → {m.to_city}</p>
                <p className="text-xs text-gray-500">{m.mission_step === 'completed' ? 'Terminée' : m.mission_step === 'not_started' ? 'À démarrer' : 'En cours'}</p>
              </button>
              {open === m.quote_request_id && (
                <div className="space-y-3 border-t border-gray-100 p-4">
                  <div className="space-y-1 text-sm text-gray-700">
                    <p className="flex gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />{m.from_address}{m.floor_from ? ` · étage ${m.floor_from}` : ''}</p>
                    <ArrowDown className="ml-0.5 h-3 w-3 text-gray-300" />
                    <p className="flex gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />{m.to_address}{m.floor_to ? ` · étage ${m.floor_to}` : ''}</p>
                    {m.volume_m3 ? <p className="text-gray-500">Volume : {m.volume_m3} m³</p> : null}
                    <a href={`tel:${m.client_phone}`} className="mt-2 flex items-center justify-center gap-2 rounded-xl border border-gray-300 py-3 font-medium text-gray-800"><Phone className="h-4 w-4" />Appeler {m.client_name}</a>
                  </div>
                  <MissionSteps quoteRequestId={m.quote_request_id} />
                </div>
              )}
            </div>
          ))}
      </main>
    </div>
  );
}
