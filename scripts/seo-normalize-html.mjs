// scripts/seo-normalize-html.mjs
// Exécuté en tout dernier après le build : pour chaque page HTML générée,
// raccourcit le titre (<= 60) et la description (<= 160) et écrit les balises
// Open Graph et Twitter correspondantes.
import fs from 'node:fs';
import path from 'node:path';
import { fitDescription, fitTitle } from '../src/utils/seoText.mjs';

const DIST = path.resolve(process.cwd(), 'dist');
const decode = (s) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function setMeta(html, attr, key, value) {
  const re = new RegExp(`<meta\\s+(?:name|property)="${key}"\\s+content="[^"]*"\\s*/?>`, 'g');
  const tag = `<meta ${attr}="${key}" content="${esc(value)}" />`;
  if (re.test(html)) return html.replace(re, tag);
  return html.replace('</head>', `    ${tag}\n  </head>`);
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : e.name.endsWith('.html') ? [p] : [];
  });
}

let count = 0;
for (const file of walk(DIST)) {
  let html = fs.readFileSync(file, 'utf-8');
  const t = html.match(/<title>(.*?)<\/title>/s);
  if (!t) continue;
  const title = fitTitle(decode(t[1]));
  const d = html.match(/<meta\s+name="description"\s+content="([^"]*)"/s);
  const description = fitDescription(decode(d ? d[1] : ''));
  html = html.replace(/<title>.*?<\/title>/s, `<title>${esc(title)}</title>`);
  html = html.replace(/<meta\s+name="title"\s+content="[^"]*"\s*\/?>/s, `<meta name="title" content="${esc(title)}" />`);
  if (d) html = html.replace(/<meta\s+name="description"\s+content="[^"]*"\s*\/?>/s, `<meta name="description" content="${esc(description)}" />`);
  html = setMeta(html, 'property', 'og:title', title);
  html = setMeta(html, 'property', 'og:image:alt', title);
  if (description) html = setMeta(html, 'property', 'og:description', description);
  html = setMeta(html, 'name', 'twitter:card', 'summary_large_image');
  html = setMeta(html, 'name', 'twitter:title', title);
  if (description) html = setMeta(html, 'name', 'twitter:description', description);
  const ogUrl = html.match(/<meta property="og:url" content="([^"]*)"/);
  if (ogUrl) html = setMeta(html, 'name', 'twitter:url', decode(ogUrl[1]));
  const ogImage = html.match(/<meta property="og:image" content="([^"]*)"/);
  if (ogImage) html = setMeta(html, 'name', 'twitter:image', decode(ogImage[1]));
  fs.writeFileSync(file, html, 'utf-8');
  count++;
}
console.log(`[seo-normalize-html] ${count} pages vérifiées (titre <= 60, description <= 160, balises Twitter).`);
