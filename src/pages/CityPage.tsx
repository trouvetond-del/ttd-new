import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowRight, MapPin, Shield, Star, CheckCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface CityPageData {
  slug: string;
  nom_ville: string;
  departement: string | null;
  intro_locale: string;
  zones_desservies: string[];
}

interface MoverCounts {
  local: number;
  regional: number;
}

export default function CityPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [city, setCity] = useState<CityPageData | null>(null);
  const [counts, setCounts] = useState<MoverCounts | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    window.scrollTo(0, 0);
    if (!slug) return;
    load(slug);
  }, [slug]);

  async function load(citySlug: string) {
    setLoading(true);
    const { data, error } = await supabase
      .from('city_pages')
      .select('slug, nom_ville, departement, intro_locale, zones_desservies')
      .eq('slug', citySlug)
      .eq('statut', 'published')
      .single();

    if (error || !data) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    setCity(data);

    // Comptage dynamique, jamais un chiffre fixe : nombre de déménageurs
    // vérifiés+actifs réellement basés dans la ville (comptage "local"),
    // séparé des déménageurs à couverture nationale (comptage "regional").
    // Un chiffre local à 0 ne doit JAMAIS afficher "0 déménageur" ni un
    // faux chiffre local -- uniquement basculer sur le message régional
    // si des déménageurs all_france existent, pour ne jamais mentir sur
    // la disponibilité locale (cf. incident des faux "2 847 déménagements"
    // corrigé le 09/08).
    const { data: moversData } = await supabase
      .from('movers_with_privacy')
      .select('city, coverage_type, activity_departments')
      .eq('verification_status', 'verified')
      .eq('is_active', true);

    if (moversData) {
      const local = moversData.filter(
        (m) => (m.city || '').trim().toLowerCase() === data.nom_ville.trim().toLowerCase()
      ).length;
      const regional = moversData.filter(
        (m) =>
          m.coverage_type === 'all_france' ||
          (Array.isArray(m.activity_departments) && data.departement && m.activity_departments.includes(data.departement))
      ).length;
      setCounts({ local, regional });
    }

    setLoading(false);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (notFound || !city) {
    navigate('/', { replace: true });
    return null;
  }

  const hasLocal = (counts?.local ?? 0) > 0;
  const hasRegional = (counts?.regional ?? 0) > 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
      <header className="border-b border-gray-100 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <button onClick={() => navigate('/')} className="flex items-center gap-2">
            <img src="/logo.png" alt="TrouveTonDéménageur" className="h-8 w-auto" />
            <span className="font-bold text-gray-900 hidden sm:inline">TrouveTonDéménageur</span>
          </button>
          <button
            onClick={() => navigate('/client/quote')}
            className="bg-blue-600 text-white px-5 py-2.5 rounded-xl font-semibold text-sm hover:bg-blue-700 transition-colors"
          >
            Obtenir un devis
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex items-center gap-2 text-blue-600 text-sm font-semibold mb-4">
          <MapPin className="w-4 h-4" />
          {city.departement && <span>Département {city.departement}</span>}
        </div>

        <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 mb-6 tracking-tight">
          Déménagement à {city.nom_ville}
        </h1>

        <p className="text-lg text-gray-600 leading-relaxed max-w-3xl mb-8">{city.intro_locale}</p>

        {/* Comptage honnête : jamais de chiffre local inventé */}
        <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-6 mb-10 max-w-2xl">
          {hasLocal ? (
            <div className="flex items-center gap-3">
              <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0" />
              <span className="text-gray-800 font-medium">
                {counts!.local} déménageur{counts!.local > 1 ? 's' : ''} vérifié{counts!.local > 1 ? 's' : ''} basé{counts!.local > 1 ? 's' : ''} à {city.nom_ville}
              </span>
            </div>
          ) : hasRegional ? (
            <div className="flex items-center gap-3">
              <CheckCircle className="w-6 h-6 text-blue-600 flex-shrink-0" />
              <span className="text-gray-800 font-medium">
                Déménageurs vérifiés disponibles dans votre région
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <Shield className="w-6 h-6 text-gray-400 flex-shrink-0" />
              <span className="text-gray-600">
                Décrivez votre demande, nous la transmettons à nos déménageurs vérifiés.
              </span>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-4 mb-12 text-sm text-gray-500">
          <div className="flex items-center gap-1.5">
            <Shield className="w-4 h-4 text-blue-600" />
            KBIS, assurance RC Pro et URSSAF vérifiés
          </div>
          <div className="flex items-center gap-1.5">
            <Star className="w-4 h-4 text-blue-600" />
            Gratuit, sans engagement
          </div>
        </div>

        <div className="text-center mb-16">
          <button
            onClick={() => navigate('/client/quote')}
            className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-2xl font-bold text-lg hover:from-blue-700 hover:to-blue-800 transition-all duration-300 transform hover:scale-105 shadow-lg"
          >
            Obtenir mon devis pour {city.nom_ville}
            <ArrowRight className="w-5 h-5" />
          </button>
        </div>

        {city.zones_desservies.length > 0 && (
          <div className="border-t border-gray-100 pt-10">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Zones desservies près de {city.nom_ville}</h2>
            <div className="flex flex-wrap gap-2">
              {city.zones_desservies.map((zone) => (
                <span key={zone} className="bg-white border border-gray-200 rounded-full px-4 py-2 text-sm text-gray-700">
                  {zone}
                </span>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
