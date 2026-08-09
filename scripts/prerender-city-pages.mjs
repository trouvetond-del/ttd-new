// scripts/prerender-city-pages.mjs
// Exécuté après `vite build`. Génère dist/demenagement/{slug}/index.html
// pour chaque ville publiée : une vraie page HTML statique, avec le
// contenu, le <title>, la meta description, la balise canonique et le
// JSON-LD schema.org déjà présents dans le fichier -- pas injectés
// après coup en JavaScript. C'est ce qui rend la page indexable même
// par un crawler qui n'exécute pas (ou mal) le JS.
//
// Volontairement indépendant de React/react-dom/server : ce script ne
// fait QUE générer une chaîne HTML statique à partir des mêmes données
// que le composant CityPage.tsx affiche, sans exécuter le composant
// lui-même. Ça évite tout risque de SSR (hydratation, DOM manquant en
// Node, etc.) sur un chantier déjà identifié comme le plus risqué de
// cette session (rendu + routage).
//
// Le fichier statique généré et le composant React CityPage.tsx sont
// deux choses distinctes qui affichent la même information : un
// visiteur qui charge directement l'URL voit d'abord le HTML statique
// (contenu déjà là), puis React (createRoot().render(), pas
// hydrateRoot()) remplace le contenu du <div id="root"> une fois le
// bundle chargé -- pas d'hydratation, donc pas de risque de mismatch.

import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';

const SITE_URL = 'https://www.trouvetondemenageur.fr';
const DIST_DIR = path.resolve(process.cwd(), 'dist');

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('[prerender-city-pages] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY manquantes -- prerendering ignoré (le build reste valide, seules les pages villes ne seront pas pré-générées).');
  process.exit(0);
}

if (!fs.existsSync(path.join(DIST_DIR, 'index.html'))) {
  console.error('[prerender-city-pages] dist/index.html introuvable -- lancer ce script après `vite build`.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);
const baseTemplate = fs.readFileSync(path.join(DIST_DIR, 'index.html'), 'utf-8');

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildHtml(city, counts) {
  const title = `Déménagement à ${city.nom_ville} — Devis gratuit de déménageurs vérifiés | TrouveTonDéménageur`;
  const description = `Trouvez un déménageur vérifié à ${city.nom_ville}. ${city.intro_locale.split('.')[0]}. Devis gratuit et sans engagement en 2 minutes.`;
  const url = `${SITE_URL}/demenagement/${city.slug}`;

  const availability = counts.local > 0
    ? `${counts.local} déménageur${counts.local > 1 ? 's' : ''} vérifié${counts.local > 1 ? 's' : ''} basé${counts.local > 1 ? 's' : ''} à ${escapeHtml(city.nom_ville)}`
    : counts.regional > 0
      ? 'Déménageurs vérifiés disponibles dans votre région'
      : 'Décrivez votre demande, nous la transmettons à nos déménageurs vérifiés.';

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    serviceType: 'Déménagement',
    provider: {
      '@type': 'LocalBusiness',
      name: 'TrouveTonDéménageur',
      url: SITE_URL,
      image: `${SITE_URL}/ttd-logo.png`,
    },
    areaServed: {
      '@type': 'City',
      name: city.nom_ville,
    },
    description: city.intro_locale,
  };

  const zonesHtml = (city.zones_desservies || []).length > 0
    ? `<div><h2>Zones desservies près de ${escapeHtml(city.nom_ville)}</h2><ul>${city.zones_desservies.map((z) => `<li>${escapeHtml(z)}</li>`).join('')}</ul></div>`
    : '';

  // Contenu statique minimal mais réel (pas juste des balises meta) :
  // c'est ce que verra un crawler qui n'exécute pas le JS. Le rendu
  // visuel définitif reste géré par CityPage.tsx une fois React monté.
  const staticContent = `
    <div id="root">
      <div style="max-width:56rem;margin:0 auto;padding:3rem 1.5rem;font-family:system-ui,sans-serif;">
        <h1 style="font-size:2.5rem;font-weight:800;color:#111827;margin-bottom:1.5rem;">Déménagement à ${escapeHtml(city.nom_ville)}</h1>
        <p style="font-size:1.125rem;color:#4B5563;line-height:1.7;max-width:48rem;margin-bottom:2rem;">${escapeHtml(city.intro_locale)}</p>
        <p style="font-weight:600;color:#1F2937;margin-bottom:2rem;">${availability}</p>
        <a href="/client/quote" style="display:inline-block;background:#2563EB;color:white;padding:1rem 2rem;border-radius:1rem;font-weight:700;text-decoration:none;">Obtenir mon devis pour ${escapeHtml(city.nom_ville)}</a>
        ${zonesHtml}
      </div>
    </div>`;

  let html = baseTemplate;

  // Title
  html = html.replace(/<title>.*?<\/title>/s, `<title>${escapeHtml(title)}</title>`);
  // Meta description (peut être sur plusieurs lignes dans index.html)
  html = html.replace(/<meta\s+name="description"\s+content="[^"]*"\s*\/>/s, `<meta name="description" content="${escapeHtml(description)}" />`);
  // Canonical
  html = html.replace(/<link rel="canonical" href="[^"]*"\s*\/>/, `<link rel="canonical" href="${url}" />`);
  // Open Graph principaux
  html = html.replace(/<meta property="og:url" content="[^"]*"\s*\/>/, `<meta property="og:url" content="${url}" />`);
  html = html.replace(/<meta property="og:title" content="[^"]*"\s*\/>/, `<meta property="og:title" content="${escapeHtml(title)}" />`);
  html = html.replace(/<meta property="og:description" content="[^"]*"\s*\/>/, `<meta property="og:description" content="${escapeHtml(description)}" />`);

  // JSON-LD ajouté juste avant </head>
  html = html.replace('</head>', `  <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>\n  </head>`);

  // Contenu statique : remplace le <div id="root"></div> vide
  html = html.replace('<div id="root"></div>', staticContent);

  return html;
}

async function main() {
  const { data: cities, error } = await supabase
    .from('city_pages')
    .select('slug, nom_ville, departement, intro_locale, zones_desservies')
    .eq('statut', 'published');

  if (error) {
    console.error('[prerender-city-pages] Erreur chargement city_pages:', error.message);
    process.exit(1);
  }
  if (!cities || cities.length === 0) {
    console.log('[prerender-city-pages] Aucune ville publiée, rien à générer.');
    return;
  }

  const { data: movers } = await supabase
    .from('movers_with_privacy')
    .select('city, coverage_type, activity_departments')
    .eq('verification_status', 'verified')
    .eq('is_active', true);

  let generated = 0;
  for (const city of cities) {
    const local = (movers || []).filter(
      (m) => (m.city || '').trim().toLowerCase() === city.nom_ville.trim().toLowerCase()
    ).length;
    const regional = (movers || []).filter(
      (m) =>
        m.coverage_type === 'all_france' ||
        (Array.isArray(m.activity_departments) && city.departement && m.activity_departments.includes(city.departement))
    ).length;

    const html = buildHtml(city, { local, regional });
    const outDir = path.join(DIST_DIR, 'demenagement', city.slug);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'index.html'), html, 'utf-8');
    generated++;
    console.log(`[prerender-city-pages] Généré: /demenagement/${city.slug} (local=${local}, régional=${regional})`);
  }

  console.log(`[prerender-city-pages] ${generated} page(s) ville générée(s).`);
}

main().catch((err) => {
  // Ne fait jamais échouer le build global pour ça : le prerendering
  // est une amélioration SEO, pas une dépendance critique du parcours
  // applicatif. Si Supabase est injoignable au moment du build, le
  // reste du site continue de se déployer normalement.
  console.error('[prerender-city-pages] Erreur non bloquante, build principal non affecté:', err.message);
});
