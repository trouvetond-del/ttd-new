import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Calendar, Package, Navigation, Loader2, Truck } from 'lucide-react';
import { supabase } from '../lib/supabase';

// Page publique : déménagements ouverts, sans aucune donnée client. Clic → connexion / inscription déménageur.
export default function PublicMovesPage() {
  const navigate = useNavigate();
  const [moves, setMoves] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.title = 'Déménagements disponibles pour les déménageurs | TrouveTonDéménageur';
    supabase.rpc('list_open_moves').then(({ data }) => { setMoves(data || []); setLoading(false); });
  }, []);

  const fmtDate = (d: string) => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  const go = () => navigate('/mover/login');

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <button onClick={() => navigate('/')} className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900">
            <ArrowLeft className="h-4 w-4" />Accueil
          </button>
          <button onClick={go} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">Espace Déménageur</button>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-8 sm:py-12">
        <h1 className="text-2xl sm:text-4xl font-bold text-gray-900">Déménagements disponibles</h1>
        <p className="mt-2 text-gray-600 max-w-2xl">Ces clients attendent des devis. Inscrivez-vous gratuitement ou connectez-vous pour voir le détail et déposer votre devis.</p>
        <p className="mt-6 text-sm text-gray-500">{loading ? 'Chargement…' : `${moves.length} déménagement${moves.length > 1 ? 's' : ''} ouvert${moves.length > 1 ? 's' : ''}`}</p>
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div>
        ) : moves.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center text-gray-500">Aucun déménagement ouvert pour le moment. Revenez bientôt.</div>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {moves.map((m) => (
              <button key={m.id} onClick={go} className="text-left rounded-2xl border border-gray-200 bg-white p-5 shadow-sm hover:shadow-md hover:border-blue-300 transition">
                <div className="flex items-center gap-2 text-lg font-semibold text-gray-900">
                  <span className="truncate">{m.from_city}</span><ArrowRight className="h-4 w-4 text-gray-400 shrink-0" /><span className="truncate">{m.to_city}</span>
                </div>
                <div className="mt-3 space-y-1.5 text-sm text-gray-600">
                  <div className="flex items-center gap-2"><Calendar className="h-4 w-4 text-gray-400" />{fmtDate(m.moving_date)}</div>
                  {m.volume_m3 ? <div className="flex items-center gap-2"><Package className="h-4 w-4 text-gray-400" />{m.volume_m3} m³</div> : null}
                  {m.distance_km ? <div className="flex items-center gap-2"><Navigation className="h-4 w-4 text-gray-400" />{Math.round(m.distance_km)} km</div> : null}
                </div>
                <div className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600"><Truck className="h-4 w-4" />Déposer un devis →</div>
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
