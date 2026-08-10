// scripts/prerender-blog-articles.mjs
// Exécuté après `vite build` (juste après prerender-city-pages.mjs).
// Génère dist/blog/{slug}/index.html pour chaque article publié : même
// principe que les pages villes -- title, meta description, canonique,
// Open Graph, JSON-LD Article + FAQPage déjà présents dans le fichier
// HTML statique, pas injectés après coup en JavaScript.
//
// La logique de nettoyage (cleanTitle/cleanHTML), l'extrait, le schema
// Article et l'extraction FAQ reproduisent EXACTEMENT ce que fait
// src/pages/BlogArticle.tsx côté client (voir injectSchemaOrg,
// injectFAQSchema, setMetaTags) -- si l'un des deux évolue, l'autre
// doit être mis à jour en miroir pour ne pas diverger.
//
// Contrairement aux pages villes (figées à la compilation), de
// nouveaux articles arrivent en continu via le webhook GetAutoSEO
// (api/getautoseo-webhook.ts) entre deux déploiements. C'est pour ça
// que ce webhook déclenche un redeploy Vercel (VERCEL_DEPLOY_HOOK_URL)
// après chaque publication réussie -- sans ça, un article publié
// aujourd'hui ne serait statiquement pré-rendu qu'au prochain déploiement
// manuel, potentiellement des jours plus tard.

import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';

const SITE_URL = 'https://www.trouvetondemenageur.fr';
const DIST_DIR = path.resolve(process.cwd(), 'dist');

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('[prerender-blog-articles] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY manquantes -- prerendering ignoré (le build reste valide, seuls les articles ne seront pas pré-générés).');
  process.exit(0);
}

if (!fs.existsSync(path.join(DIST_DIR, 'index.html'))) {
  console.error('[prerender-blog-articles] dist/index.html introuvable -- lancer ce script après `vite build`.');
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

// Miroir exact de cleanTitle() dans BlogArticle.tsx
function cleanTitle(title) {
  const safe = title || '';
  return safe
    .replace(/```html?/g, '')
    .replace(/```/g, '')
    .replace(/<[^>]*>/g, '')
    .trim() || 'Article sans titre';
}

// Miroir exact de cleanHTML() dans BlogArticle.tsx
function cleanHTML(content) {
  const safe = content || '';
  return safe
    .replace(/^```html?\n?/gm, '')
    .replace(/^```\s*$/gm, '')
    .trim();
}

// Miroir exact de injectFAQSchema() dans BlogArticle.tsx
function extractFaqItems(content) {
  const faqMatches = content.matchAll(/<h[23][^>]*>(.*?)<\/h[23]>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/gi);
  const items = [];
  for (const match of faqMatches) {
    const q = match[1].replace(/<[^>]*>/g, '').trim();
    const a = match[2].replace(/<[^>]*>/g, '').trim();
    if (q.endsWith('?') && a.length > 20) items.push({ question: q, answer: a });
  }
  return items;
}

function buildHtml(article) {
  const title = cleanTitle(article.titre);
  const cleanedContent = cleanHTML(article.contenu);
  const excerpt = cleanedContent.replace(/<[^>]*>/g, '').substring(0, 155).trim();
  const excerptLong = cleanedContent.replace(/<[^>]*>/g, '').substring(0, 200).trim();
  const url = `${SITE_URL}/blog/${article.slug}`;
  const fullTitle = `${title} | TrouveTonDéménageur`;

  const articleSchema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: title,
    description: excerptLong,
    datePublished: article.created_at,
    dateModified: article.created_at,
    author: { '@type': 'Organization', name: 'TrouveTonDéménageur', url: SITE_URL },
    publisher: {
      '@type': 'Organization',
      name: 'TrouveTonDéménageur',
      url: SITE_URL,
      logo: { '@type': 'ImageObject', url: `${SITE_URL}/logo.png` },
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    keywords: article.mot_cle,
    ...(article.ville && { locationCreated: { '@type': 'City', name: article.ville } }),
  };

  const faqItems = extractFaqItems(cleanedContent);
  const faqSchema = faqItems.length > 0 ? {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqItems.map(item => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })),
  } : null;

  // Contenu statique minimal mais réel : ce que verra un crawler qui
  // n'exécute pas le JS. Le rendu visuel définitif (mise en page,
  // articles liés, partage) reste géré par BlogArticle.tsx une fois
  // React monté -- même principe que les pages villes.
  const staticContent = `
    <div id="root">
      <div style="max-width:48rem;margin:0 auto;padding:3rem 1.5rem;font-family:system-ui,sans-serif;">
        <h1 style="font-size:2rem;font-weight:800;color:#111827;margin-bottom:1rem;">${escapeHtml(title)}</h1>
        <div style="font-size:1.05rem;color:#374151;line-height:1.75;">${cleanedContent}</div>
      </div>
    </div>`;

  let html = baseTemplate;
  html = html.replace(/<title>.*?<\/title>/s, `<title>${escapeHtml(fullTitle)}</title>`);
  html = html.replace(/<meta\s+name="description"\s+content="[^"]*"\s*\/>/s, `<meta name="description" content="${escapeHtml(excerpt)}" />`);
  html = html.replace(/<link rel="canonical" href="[^"]*"\s*\/>/, `<link rel="canonical" href="${url}" />`);
  html = html.replace(/<meta property="og:url" content="[^"]*"\s*\/>/, `<meta property="og:url" content="${url}" />`);
  html = html.replace(/<meta property="og:title" content="[^"]*"\s*\/>/, `<meta property="og:title" content="${escapeHtml(title)}" />`);
  html = html.replace(/<meta property="og:description" content="[^"]*"\s*\/>/, `<meta property="og:description" content="${escapeHtml(excerpt)}" />`);
  html = html.replace(/<meta property="og:type" content="[^"]*"\s*\/>/, `<meta property="og:type" content="article" />`);

  let headInjection = `  <script type="application/ld+json">${JSON.stringify(articleSchema)}</script>\n`;
  if (faqSchema) {
    headInjection += `  <script type="application/ld+json">${JSON.stringify(faqSchema)}</script>\n`;
  }
  html = html.replace('</head>', `${headInjection}  </head>`);

  html = html.replace('<div id="root"></div>', staticContent);

  return html;
}

async function main() {
  const { data: articles, error } = await supabase
    .from('articles')
    .select('slug, titre, contenu, mot_cle, ville, created_at')
    .eq('statut', 'publie');

  if (error) {
    console.error('[prerender-blog-articles] Erreur chargement articles:', error.message);
    process.exit(1);
  }
  if (!articles || articles.length === 0) {
    console.log('[prerender-blog-articles] Aucun article publié, rien à générer.');
    return;
  }

  let generated = 0;
  for (const article of articles) {
    if (!article.slug || !article.titre || !article.contenu) {
      console.warn(`[prerender-blog-articles] Article ignoré (champs manquants): slug=${article.slug}`);
      continue;
    }
    const html = buildHtml(article);
    const outDir = path.join(DIST_DIR, 'blog', article.slug);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'index.html'), html, 'utf-8');
    generated++;
  }

  console.log(`[prerender-blog-articles] ${generated} article(s) pré-généré(s) sur ${articles.length}.`);
}

main().catch((err) => {
  // Comme pour les pages villes : jamais bloquant pour le build principal.
  console.error('[prerender-blog-articles] Erreur non bloquante, build principal non affecté:', err.message);
});
