// Calculateur de volume pièce par pièce. Le résultat est affiché après
// l'email, qui sert aussi à relancer la personne si elle ne termine pas.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Minus, Plus, Box } from 'lucide-react';
import { VOLUME_ROOMS, computeVolume, homeSizeForVolume } from '../utils/volumeCalculator';
import { rememberAcquisitionSource } from '../utils/acquisitionSource';
import { saveQuotePrefill } from '../utils/quotePrefill';

const TITLE = 'Calculateur de volume de déménagement (m³) pièce par pièce | TrouveTonDéménageur';

export default function VolumeCalculatorPage() {
  const navigate = useNavigate();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [revealed, setRevealed] = useState(false);
  const volume = useMemo(() => computeVolume(counts), [counts]);

  useEffect(() => { window.scrollTo(0, 0); document.title = TITLE; }, []);

  const change = (id: string, d: number) => setCounts(c => ({ ...c, [id]: Math.max(0, Math.min(99, (c[id] || 0) + d)) }));

  async function reveal(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (volume === 0) return setError('Ajoutez au moins un meuble ou carton.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError('Indiquez une adresse email valide.');
    rememberAcquisitionSource('calculateur-volume');
    saveQuotePrefill({ client_email: email.trim(), volume_m3: volume, from_home_size: homeSizeForVolume(volume) });
    await fetch('/api/save-partial-lead', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ leadType: 'client', email, source: 'calculateur-volume' }) }).catch(() => {});
    setRevealed(true);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
      <header className="border-b border-gray-100 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <button onClick={() => navigate('/')} className="flex items-center gap-2"><img src="/logo.png" alt="TrouveTonDéménageur" className="h-8 w-auto" /></button>
          <span className="text-sm font-semibold text-blue-700">{volume} m³</span>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-10">
        <h1 className="text-3xl md:text-4xl font-extrabold text-gray-900 mb-3">Calculateur de volume de déménagement</h1>
        <p className="text-gray-600 mb-8">Indiquez vos meubles pièce par pièce. Nous ajoutons 10 % pour les petits objets, comme le font les déménageurs.</p>
        <div className="space-y-6">
          {VOLUME_ROOMS.map(room => (
            <section key={room.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h2 className="font-semibold text-gray-900 mb-3">{room.label}</h2>
              <ul className="divide-y divide-gray-100">
                {room.items.map(item => (
                  <li key={item.id} className="flex items-center justify-between py-2">
                    <span className="text-sm text-gray-700">{item.label} <span className="text-gray-400">· {String(item.m3).replace('.', ',')} m³</span></span>
                    <span className="flex items-center gap-2">
                      <button type="button" aria-label={`Retirer ${item.label}`} onClick={() => change(item.id, -1)} className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center hover:bg-gray-50"><Minus className="w-4 h-4" /></button>
                      <span className="w-6 text-center font-semibold tabular-nums">{counts[item.id] || 0}</span>
                      <button type="button" aria-label={`Ajouter ${item.label}`} onClick={() => change(item.id, 1)} className="w-8 h-8 rounded-full border border-blue-200 text-blue-700 flex items-center justify-center hover:bg-blue-50"><Plus className="w-4 h-4" /></button>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <div className="mt-8 bg-white rounded-2xl border border-blue-100 shadow-md p-6">
          {!revealed ? (
            <form onSubmit={reveal} className="space-y-3" noValidate>
              <p className="font-semibold text-gray-900 flex items-center gap-2"><Box className="w-5 h-5 text-blue-600" />Recevoir mon volume estimé</p>
              <p className="text-sm text-gray-600">Nous vous l’affichons tout de suite et le gardons pour votre demande de devis.</p>
              <div className="flex flex-col sm:flex-row gap-3">
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="votre@email.fr" autoComplete="email" className="flex-1 px-3 py-2.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <button className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-5 py-2.5 rounded-lg">Voir mon volume</button>
              </div>
              {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
            </form>
          ) : (
            <div className="text-center">
              <p className="text-sm text-gray-500">Volume estimé</p>
              <p className="text-5xl font-extrabold text-gray-900 my-2">{String(volume).replace('.', ',')} m³</p>
              <p className="text-sm text-gray-600 mb-5">Équivalent à un logement {homeSizeForVolume(volume)} environ. Vous pouvez encore ajuster vos meubles ci-dessus.</p>
              <button onClick={() => { saveQuotePrefill({ volume_m3: volume, from_home_size: homeSizeForVolume(volume) }); navigate('/client/quote'); }} className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-xl">Recevoir jusqu’à 3 devis <ArrowRight className="w-4 h-4" /></button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
