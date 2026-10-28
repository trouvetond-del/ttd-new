// scripts/prerender-static-pages.mjs
// Exécuté après `vite build` :
// 1) génère dist/tarifs-demenagement-2026/index.html (contenu lisible sans JavaScript) ;
// 2) génère dist/404.html : Vercel le sert avec un vrai statut 404 pour
//    toute adresse qui ne correspond à aucune page (voir vercel.json).
import fs from 'node:fs';
import path from 'node:path';

const SITE_URL = 'https://www.trouvetondemenageur.fr';
const DIST = path.resolve(process.cwd(), 'dist');
const base = fs.readFileSync(path.join(DIST, 'index.html'), 'utf-8');
const seo = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'src/data/seo-content.json'), 'utf-8'));
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function withHead(html, { title, description, url, extraHead = '', root }) {
  html = html.replace(/<title>.*?<\/title>/s, `<title>${esc(title)}</title>`);
  html = html.replace(/<meta\s+name="description"\s+content="[^"]*"\s*\/>/s, `<meta name="description" content="${esc(description)}" />`);
  if (url) {
    html = html.replace(/<link rel="canonical" href="[^"]*"\s*\/>/, `<link rel="canonical" href="${url}" />`);
    html = html.replace(/<meta property="og:url" content="[^"]*"\s*\/>/, `<meta property="og:url" content="${url}" />`);
  } else {
    html = html.replace(/<link rel="canonical" href="[^"]*"\s*\/>/, '');
  }
  html = html.replace(/<meta property="og:title" content="[^"]*"\s*\/>/, `<meta property="og:title" content="${esc(title)}" />`);
  html = html.replace(/<meta property="og:description" content="[^"]*"\s*\/>/, `<meta property="og:description" content="${esc(description)}" />`);
  html = html.replace('</head>', `${extraHead}\n  </head>`);
  return html.replace('<div id="root"></div>', `<div id="root">${root}</div>`);
}

// --- Tarifs 2026 ---
const faq = [
  ["Quel est le prix moyen d'un déménagement en 2026 ?", "Pour un déménagement local, comptez en général de 400 à 1 000 € pour un studio, de 1 000 à 2 300 € pour un T3 et de 1 600 à 3 500 € pour une maison, selon la formule. Ces fourchettes sont indicatives : seul un devis basé sur votre volume réel donne le bon prix."],
  ['Comment payer moins cher son déménagement ?', "Comparez plusieurs devis, choisissez une date en semaine ou hors fin de mois, emballez vous-même (formule économique) et indiquez si vos dates sont flexibles : certains déménageurs proposent des prix réduits sur leurs trajets retour."],
  ['Comment calculer le volume de mon déménagement ?', "Une règle simple : environ 10 m³ pour un studio, puis 10 m³ de plus par pièce. Sur TrouveTonDéménageur, vous décrivez vos pièces et vos meubles pour obtenir des devis précis."],
  ['Les devis sont-ils gratuits ?', "Oui. Demander des devis sur TrouveTonDéménageur est gratuit et sans engagement. Tous les déménageurs sont vérifiés (KBIS, assurance RC Pro, attestation URSSAF)."],
];
const url = `${SITE_URL}/tarifs-demenagement-2026`;
const faqLd = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) };
const tarifsRoot = `<div style="max-width:56rem;margin:0 auto;padding:3rem 1.5rem;font-family:system-ui,sans-serif;">
<h1>Tarifs déménagement 2026 : combien ça coûte ?</h1>
<p>Voici les prix moyens d'un déménagement en France en 2026, selon la taille du logement et la formule choisie. Utilisez-les pour préparer votre budget, puis comparez de vrais devis de déménageurs vérifiés, gratuitement.</p>
<table><thead><tr><th>Logement</th><th>Volume</th><th>Formule économique</th><th>Formule standard</th></tr></thead><tbody>${seo.prix.lignes.map((l) => `<tr><td>${esc(l.logement)}</td><td>${esc(l.volume)}</td><td>${esc(l.eco)}</td><td>${esc(l.standard)}</td></tr>`).join('')}</tbody></table>
<p>${esc(seo.prix.note)}</p>
<h2>Ce qui fait varier le prix</h2><ul>${seo.prix.facteurs.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>
<p><a href="/client/quote">Recevoir mes devis gratuits</a></p>
<h2>Questions fréquentes sur le prix d'un déménagement</h2>${faq.map(([q, a]) => `<h3>${esc(q)}</h3><p>${esc(a)}</p>`).join('')}
<h2>Prix du déménagement par ville</h2><ul>${Object.keys(seo.villes).map((s) => `<li><a href="/demenagement/${s}">Déménagement ${s}</a></li>`).join('')}</ul>
</div>`;
fs.mkdirSync(path.join(DIST, 'tarifs-demenagement-2026'), { recursive: true });
fs.writeFileSync(path.join(DIST, 'tarifs-demenagement-2026', 'index.html'), withHead(base, {
  title: 'Tarifs déménagement 2026 : prix moyens par m³ et par logement | TrouveTonDéménageur',
  description: 'Prix moyen d’un déménagement en 2026 : studio, T2, T3, maison. Fourchettes par volume et formule, conseils pour payer moins cher et devis gratuits.',
  url,
  extraHead: `<script type="application/ld+json">${JSON.stringify(faqLd)}</script>`,
  root: tarifsRoot,
}));
console.log('[prerender-static-pages] Généré: /tarifs-demenagement-2026');

// --- 404 ---
fs.writeFileSync(path.join(DIST, '404.html'), withHead(base, {
  title: 'Page introuvable | TrouveTonDéménageur',
  description: "Cette page n'existe pas ou a été déplacée.",
  url: null,
  extraHead: '<meta name="robots" content="noindex, follow" />',
  root: '<div style="text-align:center;padding:4rem 1rem;font-family:system-ui,sans-serif;"><h1>Page introuvable</h1><p><a href="/">Retour à l\'accueil</a></p></div>',
}));
console.log('[prerender-static-pages] Généré: 404.html');
