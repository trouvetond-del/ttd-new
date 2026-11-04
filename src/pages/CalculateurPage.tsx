import { useEffect, useState } from 'react';
import { rememberAcquisitionSource } from '../utils/acquisitionSource';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Calculator } from 'lucide-react';
import seoContent from '../data/seo-content.json';

const TITLE = 'Calculateur prix déménagement 2026 : estimation gratuite | TrouveTonDéménageur';

// "400 à 700 €" -> [400, 700]
function range(s: string): [number, number] {
  const n = s.replace(/\s/g, '').match(/\d+/g)!.map(Number);
  return [n[0], n[1]];
}
const fmt = (n: number) => `${Math.round(n / 50) * 50}`.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' €';

export default function CalculateurPage() {
  const navigate = useNavigate();
  const lignes = seoContent.prix.lignes;
  const [row, setRow] = useState(1);
  const [formule, setFormule] = useState<'eco' | 'standard'>('standard');
  const [longue, setLongue] = useState(false);
  const [sansAscenseur, setSansAscenseur] = useState(false);
  const [hauteSaison, setHauteSaison] = useState(false);

  useEffect(() => {
    window.scrollTo(0, 0);
    document.title = TITLE;
  }, []);

  const l = lignes[row];
  let [min, max] = range(formule === 'eco' ? l.eco : l.standard);
  // Règle affichée sur la page tarifs : au-delà de 100 km, 1,5 à 2 fois plus
  if (longue) { min *= 1.5; max *= 2; }

  const box = (active: boolean) =>
    `px-4 py-3 rounded-xl border text-sm font-medium text-left transition-colors ${active ? 'border-blue-600 bg-blue-50 text-blue-800' : 'border-gray-200 bg-white text-gray-700 hover:border-blue-300'}`;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
      <header className="border-b border-gray-100 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <button onClick={() => navigate('/')} className="flex items-center gap-2">
            <img src="/logo.png" alt="TrouveTonDéménageur" className="h-8 w-auto" />
            <span className="font-bold text-gray-900 hidden sm:inline">TrouveTonDéménageur</span>
          </button>
          <button onClick={() => { rememberAcquisitionSource('calculateur'); navigate('/client/quote'); }} className="bg-blue-600 text-white px-5 py-2.5 rounded-xl font-semibold text-sm hover:bg-blue-700 transition-colors">
            Obtenir un devis
          </button>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 mb-4 tracking-tight">Calculateur de prix de déménagement</h1>
        <p className="text-lg text-gray-600 mb-8">Estimez en 30 secondes le volume et le budget de votre déménagement, puis recevez jusqu'à 3 devis de déménageurs vérifiés sous 24 h.</p>

        <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-6 space-y-6">
          <div>
            <h2 className="font-semibold text-gray-900 mb-3">1. Votre logement actuel</h2>
            <div className="grid grid-cols-2 gap-3">
              {lignes.map((x, i) => (
                <button key={x.logement} onClick={() => setRow(i)} className={box(row === i)}>
                  {x.logement}<span className="block text-xs text-gray-500">{x.volume}</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <h2 className="font-semibold text-gray-900 mb-3">2. La formule</h2>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setFormule('eco')} className={box(formule === 'eco')}>Économique<span className="block text-xs text-gray-500">Vous emballez vos cartons</span></button>
              <button onClick={() => setFormule('standard')} className={box(formule === 'standard')}>Standard<span className="block text-xs text-gray-500">Le déménageur emballe le fragile</span></button>
            </div>
          </div>
          <div>
            <h2 className="font-semibold text-gray-900 mb-3">3. Votre situation</h2>
            <div className="space-y-2 text-gray-700">
              <label className="flex items-center gap-3"><input type="checkbox" checked={longue} onChange={(e) => setLongue(e.target.checked)} className="w-4 h-4" /> Plus de 100 km entre les deux adresses</label>
              <label className="flex items-center gap-3"><input type="checkbox" checked={sansAscenseur} onChange={(e) => setSansAscenseur(e.target.checked)} className="w-4 h-4" /> Étage sans ascenseur (départ ou arrivée)</label>
              <label className="flex items-center gap-3"><input type="checkbox" checked={hauteSaison} onChange={(e) => setHauteSaison(e.target.checked)} className="w-4 h-4" /> Date en fin de mois, week-end ou juillet-août</label>
            </div>
          </div>
        </div>

        <div className="mt-8 bg-blue-600 text-white rounded-2xl p-6 shadow-lg">
          <div className="flex items-center gap-2 text-blue-100 text-sm mb-2"><Calculator className="w-4 h-4" /> Estimation indicative</div>
          <p className="text-sm text-blue-100">Volume estimé : {l.volume}</p>
          <p className="text-3xl md:text-4xl font-extrabold my-2">{fmt(min)} à {fmt(max)}</p>
          {(sansAscenseur || hauteSaison) && (
            <p className="text-sm text-blue-100">
              {sansAscenseur && 'Les étages sans ascenseur augmentent le temps de portage. '}
              {hauteSaison && 'Ces dates sont plus demandées : le prix est souvent plus élevé.'}
              {' '}Ces éléments sont chiffrés précisément dans les devis.
            </p>
          )}
          <button onClick={() => { rememberAcquisitionSource('calculateur'); navigate('/client/quote'); }} className="mt-5 inline-flex items-center gap-2 px-6 py-3 bg-white text-blue-700 rounded-xl font-bold">
            Recevoir mes devis gratuits <ArrowRight className="w-5 h-5" />
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-3">{seoContent.prix.note}</p>

        <section className="border-t border-gray-100 pt-10 mt-10">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Comment est calculée cette estimation ?</h2>
          <ul className="list-disc pl-6 space-y-2 text-gray-700">{seoContent.prix.facteurs.map((f) => <li key={f}>{f}</li>)}</ul>
          <p className="mt-4 text-gray-700">Voir le détail sur notre page <a href="/tarifs-demenagement-2026" className="text-blue-600 underline">tarifs déménagement 2026</a>.</p>
        </section>
      </main>
    </div>
  );
}
