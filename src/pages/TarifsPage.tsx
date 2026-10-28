import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import seoContent from '../data/seo-content.json';

const TITLE = 'Tarifs déménagement 2026 : prix moyens par m³ et par logement | TrouveTonDéménageur';

const FAQ: [string, string][] = [
  ['Quel est le prix moyen d\'un déménagement en 2026 ?', 'Pour un déménagement local, comptez en général de 400 à 1 000 € pour un studio, de 1 000 à 2 300 € pour un T3 et de 1 600 à 3 500 € pour une maison, selon la formule. Ces fourchettes sont indicatives : seul un devis basé sur votre volume réel donne le bon prix.'],
  ['Comment payer moins cher son déménagement ?', 'Comparez plusieurs devis, choisissez une date en semaine ou hors fin de mois, emballez vous-même (formule économique) et indiquez si vos dates sont flexibles : certains déménageurs proposent des prix réduits sur leurs trajets retour.'],
  ['Comment calculer le volume de mon déménagement ?', 'Une règle simple : environ 10 m³ pour un studio, puis 10 m³ de plus par pièce. Sur TrouveTonDéménageur, vous décrivez vos pièces et vos meubles pour obtenir des devis précis.'],
  ['Les devis sont-ils gratuits ?', 'Oui. Demander des devis sur TrouveTonDéménageur est gratuit et sans engagement. Tous les déménageurs sont vérifiés (KBIS, assurance RC Pro, attestation URSSAF).'],
];

export default function TarifsPage() {
  const navigate = useNavigate();
  useEffect(() => {
    window.scrollTo(0, 0);
    document.title = TITLE;
  }, []);
  const { prix } = seoContent;
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
      <header className="border-b border-gray-100 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <button onClick={() => navigate('/')} className="flex items-center gap-2">
            <img src="/logo.png" alt="TrouveTonDéménageur" className="h-8 w-auto" />
            <span className="font-bold text-gray-900 hidden sm:inline">TrouveTonDéménageur</span>
          </button>
          <button onClick={() => navigate('/client/quote')} className="bg-blue-600 text-white px-5 py-2.5 rounded-xl font-semibold text-sm hover:bg-blue-700 transition-colors">
            Obtenir un devis
          </button>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 mb-6 tracking-tight">Tarifs déménagement 2026 : combien ça coûte ?</h1>
        <p className="text-lg text-gray-600 leading-relaxed max-w-3xl mb-8">
          Voici les prix moyens d'un déménagement en France en 2026, selon la taille du logement et la formule choisie. Utilisez-les pour préparer votre budget, puis comparez de vrais devis de déménageurs vérifiés, gratuitement.
        </p>
        <div className="overflow-x-auto mb-3">
          <table className="w-full text-sm text-left border border-gray-200 bg-white rounded-xl">
            <thead className="bg-gray-50 text-gray-700">
              <tr><th className="p-3">Logement</th><th className="p-3">Volume</th><th className="p-3">Formule économique</th><th className="p-3">Formule standard</th></tr>
            </thead>
            <tbody>
              {prix.lignes.map((l) => (
                <tr key={l.logement} className="border-t border-gray-100"><td className="p-3 font-medium">{l.logement}</td><td className="p-3">{l.volume}</td><td className="p-3">{l.eco}</td><td className="p-3">{l.standard}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-500 mb-10">{prix.note}</p>

        <section className="border-t border-gray-100 pt-10">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Ce qui fait varier le prix</h2>
          <ul className="list-disc pl-6 space-y-2 text-gray-700">{prix.facteurs.map((f) => <li key={f}>{f}</li>)}</ul>
        </section>

        <div className="text-center my-12">
          <button onClick={() => navigate('/client/quote')} className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-2xl font-bold text-lg shadow-lg">
            Recevoir mes devis gratuits <ArrowRight className="w-5 h-5" />
          </button>
        </div>

        <section className="border-t border-gray-100 pt-10">
          <h2 className="text-xl font-bold text-gray-900 mb-6">Questions fréquentes sur le prix d'un déménagement</h2>
          <div className="space-y-5">
            {FAQ.map(([q, a]) => (
              <div key={q}><h3 className="font-semibold text-gray-900 mb-1">{q}</h3><p className="text-gray-600 leading-relaxed">{a}</p></div>
            ))}
          </div>
        </section>

        <section className="border-t border-gray-100 pt-10 mt-10">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Prix du déménagement par ville</h2>
          <div className="flex flex-wrap gap-2">
            {Object.keys(seoContent.villes).map((slug) => (
              <a key={slug} href={`/demenagement/${slug}`} className="bg-white border border-gray-200 rounded-full px-4 py-2 text-sm text-gray-700 hover:border-blue-400 capitalize">Déménagement {slug}</a>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}


