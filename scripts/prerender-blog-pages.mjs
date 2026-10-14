// scripts/prerender-blog-pages.mjs
// Exécuté après `vite build`. Génère dist/blog/{slug}/index.html pour chaque
// article publié, avec title, description, canonical et contenu déjà dans le
// HTML. Sans ça, chaque article servait le HTML de l'accueil (canonical = "/"),
// ce qui pousse Google à ignorer les articles.
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';

const SITE_URL = 'https://www.trouvetondemenageur.fr';
const DIST_DIR = path.resolve(process.cwd(), 'dist');
const url_ = process.env.VITE_SUPABASE_URL;
const key_ = process.env.VITE_SUPABASE_ANON_KEY;
if (!url_ || !key_) { console.warn('[prerender-blog] env manquantes, ignoré'); process.exit(0); }
const supabase = createClient(url_, key_);
const tpl = fs.readFileSync(path.join(DIST_DIR, 'index.html'), 'utf-8');
const esc = (s) => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const clean = (t) => String(t || '').replace(/^#+\s*/, '').replace(/\*\*/g, '').trim();
const isValidSlug = (s) => typeof s === 'string' && s.trim() !== '' && s !== 'null' && s !== 'undefined';

function build(a) {
  const title = `${clean(a.titre)} | TrouveTonDéménageur`;
  const text = (a.contenu || '').replace(/<[^>]*>/g, ' ').replace(/[#*_>`]/g, '').replace(/\s+/g, ' ').trim();
  const desc = text.substring(0, 155).trim();
  const url = `${SITE_URL}/blog/${a.slug}`;
  const ld = { '@context': 'https://schema.org', '@type': 'Article', headline: clean(a.titre), datePublished: a.created_at, dateModified: a.updated_at || a.created_at, mainEntityOfPage: url, publisher: { '@type': 'Organization', name: 'TrouveTonDéménageur', logo: { '@type': 'ImageObject', url: `${SITE_URL}/ttd-logo.png` } } };
  const paras = text.substring(0, 4000).split(/(?<=\.)\s+/).reduce((acc, s, i) => { const k = Math.floor(i / 4); acc[k] = (acc[k] || '') + ' ' + s; return acc; }, []);
  const body = `<div id="root"><article style="max-width:48rem;margin:0 auto;padding:3rem 1.5rem;font-family:system-ui,sans-serif;"><p><a href="/blog">Blog</a></p><h1>${esc(clean(a.titre))}</h1>${paras.map(p => `<p>${esc(p.trim())}</p>`).join('')}<p><a href="/client/auth-choice">Obtenir mon devis gratuit</a></p></article></div>`;
  let h = tpl;
  h = h.replace(/<title>.*?<\/title>/s, `<title>${esc(title)}</title>`);
  h = h.replace(/<meta\s+name="title"\s+content="[^"]*"\s*\/>/s, `<meta name="title" content="${esc(title)}" />`);
  h = h.replace(/<meta\s+name="description"\s+content="[^"]*"\s*\/>/s, `<meta name="description" content="${esc(desc)}" />`);
  h = h.replace(/<link rel="canonical" href="[^"]*"\s*\/>/, `<link rel="canonical" href="${url}" />`);
  h = h.replace(/<meta property="og:url" content="[^"]*"\s*\/>/, `<meta property="og:url" content="${url}" />`);
  h = h.replace(/<meta property="og:type" content="[^"]*"\s*\/>/, `<meta property="og:type" content="article" />`);
  h = h.replace(/<meta property="og:title" content="[^"]*"\s*\/>/, `<meta property="og:title" content="${esc(clean(a.titre))}" />`);
  h = h.replace(/<meta property="og:description" content="[^"]*"\s*\/>/, `<meta property="og:description" content="${esc(desc)}" />`);
  h = h.replace('</head>', `  <script type="application/ld+json">${JSON.stringify(ld).replace(/</g,'\\u003c')}</script>\n  </head>`);
  h = h.replace('<div id="root"></div>', body);
  return h;
}

async function main() {
  const { data, error } = await supabase.from('articles').select('slug, titre, contenu, created_at, updated_at').eq('statut', 'publie');
  if (error) { console.error('[prerender-blog]', error.message); return; }
  let n = 0;
  for (const a of data || []) {
    if (!isValidSlug(a.slug)) continue;
    const dir = path.join(DIST_DIR, 'blog', a.slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), build(a), 'utf-8');
    n++;
  }
  console.log(`[prerender-blog] ${n} article(s) générés.`);
}
main().catch((e) => console.error('[prerender-blog] non bloquant:', e.message));
