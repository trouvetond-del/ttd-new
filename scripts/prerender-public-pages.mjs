// scripts/prerender-public-pages.mjs
// Exécuté en dernier après `vite build`. Donne aux pages publiques principales
// (accueil, devis rapide, blog, guide, FAQ, tarifs, à propos, contact,
// technologie, inscription déménageur) un vrai texte lisible sans JavaScript,
// avec leur propre titre, description et adresse canonique.
// L'accueil remplace dist/index.html (Vercel le sert en priorité pour « / »).
// La base vide est copiée dans dist/app.html, que vercel.json sert pour les
// autres pages de l'application.
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';

const SITE = 'https://www.trouvetondemenageur.fr';
const DIST = path.resolve(process.cwd(), 'dist');
const base = fs.readFileSync(path.join(DIST, 'index.html'), 'utf-8');
fs.writeFileSync(path.join(DIST, 'app.html'), base, 'utf-8');
const seo = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'src/data/seo-content.json'), 'utf-8'));
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const wrap = (inner) => `<div style="max-width:56rem;margin:0 auto;padding:3rem 1.5rem;font-family:system-ui,sans-serif;line-height:1.6;">${inner}</div>`;

function page(html, { title, description, url, root, ld }) {
  html = html.replace(/<title>.*?<\/title>/s, `<title>${esc(title)}</title>`);
  html = html.replace(/<meta\s+name="title"\s+content="[^"]*"\s*\/>/s, `<meta name="title" content="${esc(title)}" />`);
  html = html.replace(/<meta\s+name="description"\s+content="[^"]*"\s*\/>/s, `<meta name="description" content="${esc(description)}" />`);
  html = html.replace(/<link rel="canonical" href="[^"]*"\s*\/>/, `<link rel="canonical" href="${url}" />`);
  html = html.replace(/<meta property="og:url" content="[^"]*"\s*\/>/, `<meta property="og:url" content="${url}" />`);
  html = html.replace(/<meta property="og:title" content="[^"]*"\s*\/>/, `<meta property="og:title" content="${esc(title)}" />`);
  html = html.replace(/<meta property="og:description" content="[^"]*"\s*\/>/, `<meta property="og:description" content="${esc(description)}" />`);
  if (ld) html = html.replace('</head>', `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>\n  </head>`);
  return html.replace('<div id="root"></div>', `<div id="root">${wrap(root)}</div>`);
}

function write(route, opts) {
  const file = route === '/' ? path.join(DIST, 'index.html') : path.join(DIST, route.slice(1), 'index.html');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, page(base, { ...opts, url: `${SITE}${route === '/' ? '/' : route}` }), 'utf-8');
  console.log(`[prerender-public-pages] Généré: ${route}`);
}

const prixTable = `<table><thead><tr><th>Logement</th><th>Volume</th><th>Formule économique</th><th>Formule standard</th></tr></thead><tbody>${seo.prix.lignes.map((l) => `<tr><td>${esc(l.logement)}</td><td>${esc(l.volume)}</td><td>${esc(l.eco)}</td><td>${esc(l.standard)}</td></tr>`).join('')}</tbody></table><p>${esc(seo.prix.note)}</p>`;
const cityNames = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'src/data/city-links.json'), 'utf-8'));
let publishedCities = [];
if (process.env.VITE_SUPABASE_URL && process.env.VITE_SUPABASE_ANON_KEY) {
  const { data, error } = await createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)
    .from('city_pages').select('slug').eq('statut', 'published');
  if (error) throw new Error(`[prerender-public-pages] city_pages: ${error.message}`);
  publishedCities = data || [];
}
const footerCities = cityNames.filter(([slug]) => publishedCities.some((c) => c.slug === slug));
const majorCities = new Set(['paris', 'marseille', 'lyon', 'toulouse', 'nice', 'nantes', 'montpellier', 'strasbourg', 'bordeaux', 'lille']);
const cityList = (items) => `<ul>${items.map(([slug, name]) => `<li><a href="/demenagement/${esc(slug)}">Déménageur à ${esc(name)}</a></li>`).join('')}</ul>`;
const villes = `<h2>Déménageurs par ville</h2>${cityList(footerCities.filter(([slug]) => majorCities.has(slug)))}<details><summary>Plus de villes</summary>${cityList(footerCities.filter(([slug]) => !majorCities.has(slug)))}</details>`;
const contact = `<p>Une question ? Appelez-nous au <a href="tel:+33189707881">01 89 70 78 81</a> ou écrivez à <a href="mailto:support@trouvetondemenageur.fr">support@trouvetondemenageur.fr</a>.</p>`;
const verif = `<p>Chaque déménageur inscrit est contrôlé avant de pouvoir proposer un devis : extrait KBIS, assurance responsabilité civile professionnelle et attestation URSSAF à jour. Un document expiré ou non conforme bloque le compte jusqu'à sa mise à jour.</p>`;
const etapes = `<h2>Comment ça marche ?</h2><ol>
<li><strong>Décrivez votre déménagement</strong> : adresses de départ et d'arrivée, étages, ascenseur, date souhaitée et volume (pièces et meubles). Plus la description est précise, plus les devis sont justes.</li>
<li><strong>Créez votre compte</strong> à la fin du formulaire : il permet de suivre votre demande, de recevoir les devis et d'échanger en toute sécurité.</li>
<li><strong>Recevez jusqu'à 3 devis sous 24 h</strong> de déménageurs vérifiés de votre région, gratuitement et sans engagement.</li>
<li><strong>Comparez et choisissez</strong> le devis qui vous convient : prix, date, prestations incluses.</li>
<li><strong>Déménagez l'esprit tranquille</strong> : des photos sont prises avant et après le déménagement et servent de preuve en cas de casse ou de litige.</li></ol>`;

const faq = [
  ['La demande de devis est-elle gratuite ?', "Oui. Demander des devis sur TrouveTonDéménageur est gratuit et sans engagement. Vous ne payez que le déménagement que vous choisissez."],
  ['Combien de devis vais-je recevoir ?', "Jusqu'à 3 devis de déménageurs vérifiés, en général sous 24 h. Le nombre dépend des déménageurs disponibles près de chez vous à votre date."],
  ['Pourquoi dois-je créer un compte ?', "Le compte permet de recevoir vos devis, de les comparer, d'échanger avec le déménageur et de garder une trace de votre dossier. Il est créé à la fin du formulaire, au moment de l'envoi de votre demande."],
  ['Quelles informations dois-je fournir ?', "Les adresses de départ et d'arrivée, les étages, la présence d'un ascenseur, la date et le volume à déménager. Sans ces informations, un déménageur ne peut pas donner un prix fiable."],
  ['Comment les déménageurs sont-ils vérifiés ?', "Nous contrôlons l'extrait KBIS, l'assurance responsabilité civile professionnelle et l'attestation URSSAF. Un document expiré ou non conforme suspend le compte jusqu'à sa mise à jour."],
  ['Que se passe-t-il en cas de casse ?', "Des photos sont prises avant et après le déménagement. En cas de désaccord, elles servent de preuve pour trouver une solution avec le déménageur."],
  ['Je n’ai pas le temps de remplir le formulaire, que faire ?', "Laissez vos coordonnées sur la page Devis rapide : un conseiller vous rappelle pour vous aider à compléter votre demande."],
  ['Je suis déménageur, comment recevoir des demandes ?', "Inscrivez votre entreprise, envoyez vos documents (KBIS, RC Pro, URSSAF) et, une fois vérifié, vous recevez les demandes de votre zone et proposez vos devis."],
  ['Comment est calculé le prix d’un déménagement ?', "Le prix dépend surtout du volume, de la distance, des étages et de l'accès, de la date et de la formule (économique ou standard). Notre calculateur donne une première fourchette."],
];
const faqHtml = faq.map(([q, a]) => `<h3>${esc(q)}</h3><p>${esc(a)}</p>`).join('');
const faqLd = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) };

// --- Accueil ---
write('/', {
  title: 'Devis gratuit déménagement : comparez des déménageurs vérifiés | TrouveTonDéménageur',
  description: "Recevez jusqu'à 3 devis gratuits de déménageurs vérifiés sous 24 h. Particuliers et professionnels, partout en France. Un humain vous accompagne à chaque étape.",
  root: `<h1>Devis gratuit déménagement : comparez des déménageurs vérifiés</h1>
<p>TrouveTonDéménageur met en relation les particuliers et les professionnels qui déménagent avec des déménageurs vérifiés partout en France. Vous décrivez votre déménagement une seule fois et vous recevez jusqu'à 3 devis sous 24 h, gratuitement et sans engagement. Un humain reste joignable à chaque étape, du premier devis à la dernière caisse.</p>
<p><a href="/client/auth-choice">Obtenir mes devis gratuits</a> · <a href="/calculateur-prix-demenagement">Estimer le prix de mon déménagement</a></p>
${etapes}
<h2>Des déménageurs vérifiés</h2>${verif}
<h2>Combien coûte un déménagement ?</h2><p>Voici des fourchettes indicatives pour un déménagement local. Le prix exact dépend de votre volume, des étages, de l'accès et de la date.</p>${prixTable}
<p><a href="/tarifs-demenagement-2026">Voir tous les tarifs 2026</a></p>
<h2>Vous êtes déménageur ?</h2><p>Rejoignez notre réseau de professionnels vérifiés et recevez des demandes de clients de votre zone, avec toutes les informations utiles pour chiffrer : adresses, étages, volume et date. <a href="/mover/signup">Inscrire mon entreprise</a>.</p>
${villes}${contact}`,
  ld: faqLd,
});

// --- Devis rapide ---
write('/devis-rapide', {
  title: 'Devis déménagement rapide : laissez vos coordonnées, on vous rappelle | TrouveTonDéménageur',
  description: "Pas le temps de tout remplir ? Laissez votre nom et votre téléphone : un conseiller TrouveTonDéménageur vous rappelle pour préparer vos devis de déménagement gratuits.",
  root: `<h1>Devis déménagement rapide : on vous rappelle</h1>
<p>Vous préparez un déménagement mais vous n'avez pas le temps de remplir tout le formulaire maintenant ? Laissez simplement votre nom, votre téléphone et votre ville. Un conseiller TrouveTonDéménageur vous rappelle pour comprendre votre besoin et vous aider à compléter votre demande.</p>
<h2>Pourquoi un rappel ?</h2><p>Pour recevoir des devis fiables, un déménageur a besoin de connaître les adresses de départ et d'arrivée, les étages, l'accès, la date et le volume à transporter. Ces informations prennent quelques minutes à rassembler. Notre conseiller vous guide par téléphone pour ne rien oublier : c'est plus simple, et vos devis seront plus justes.</p>
<h2>Ce qui se passe ensuite</h2><ol><li>Vous laissez vos coordonnées.</li><li>Un conseiller vous rappelle rapidement aux heures ouvrées.</li><li>Votre demande complète est envoyée aux déménageurs vérifiés de votre région.</li><li>Vous recevez jusqu'à 3 devis sous 24 h, gratuits et sans engagement.</li></ol>
<h2>Des déménageurs contrôlés</h2>${verif}
<p>Vous préférez faire votre demande vous-même ? <a href="/client/auth-choice">Remplir le formulaire complet</a> ou <a href="/calculateur-prix-demenagement">estimer d'abord le prix</a>.</p>
<h2>Questions fréquentes</h2>${faqHtml.split('</p>').slice(0, 4).join('</p>')}</p>
${contact}`,
});

// --- Guide ---
write('/guide-demenagement', {
  title: 'Guide du déménagement : checklist et conseils étape par étape | TrouveTonDéménageur',
  description: "Checklist complète pour réussir votre déménagement : 2 mois avant, 1 mois avant, la semaine du jour J et après. Démarches, cartons, volume et choix du déménageur.",
  root: `<h1>Guide du déménagement : la checklist étape par étape</h1>
<p>Un déménagement réussi se prépare. Voici les étapes à suivre pour ne rien oublier, que vous déménagiez un studio ou une maison.</p>
<h2>2 à 3 mois avant</h2><ul><li>Fixez votre date et, si possible, évitez les fins de mois et les samedis d'été, plus demandés et plus chers.</li><li>Estimez votre volume : environ 10 m³ pour un studio, puis 10 m³ de plus par pièce.</li><li>Comparez plusieurs devis de déménageurs vérifiés et vérifiez ce qui est inclus (emballage, démontage, assurance).</li><li>Prévenez votre propriétaire en respectant votre préavis.</li></ul>
<h2>1 mois avant</h2><ul><li>Triez, donnez ou vendez ce que vous ne voulez pas emporter : moins de volume, c'est un prix plus bas.</li><li>Demandez les autorisations de stationnement pour le camion au départ et à l'arrivée.</li><li>Faites suivre votre courrier et prévenez votre banque, votre assurance, votre employeur et les administrations.</li><li>Commencez les cartons des pièces peu utilisées.</li></ul>
<h2>La semaine du déménagement</h2><ul><li>Résiliez ou transférez électricité, gaz, internet et assurance habitation.</li><li>Étiquetez chaque carton avec la pièce de destination.</li><li>Préparez un sac avec l'essentiel des premiers jours : papiers, chargeurs, médicaments, vêtements.</li><li>Photographiez vos meubles fragiles avant le chargement.</li></ul>
<h2>Le jour J et après</h2><ul><li>Vérifiez l'état des meubles à l'arrivée avant de signer.</li><li>Faites l'état des lieux de sortie de l'ancien logement.</li><li>Mettez à jour votre adresse sur vos papiers.</li></ul>
<p><a href="/client/auth-choice">Recevoir jusqu'à 3 devis gratuits</a> · <a href="/tarifs-demenagement-2026">Tarifs 2026</a> · <a href="/faq">FAQ</a></p>${contact}`,
});

// --- FAQ ---
write('/faq', {
  title: 'FAQ déménagement : devis, prix, déménageurs vérifiés | TrouveTonDéménageur',
  description: "Toutes les réponses sur TrouveTonDéménageur : devis gratuits, nombre de devis, vérification des déménageurs, prix, casse et inscription des professionnels.",
  root: `<h1>Questions fréquentes</h1><p>Vous trouverez ici les réponses aux questions les plus posées par nos clients et par les déménageurs.</p>${faqHtml}<p><a href="/client/auth-choice">Obtenir mes devis gratuits</a></p>${contact}`,
  ld: faqLd,
});

// --- Tarifs / pricing ---
write('/pricing', {
  title: 'Prix d’un déménagement : combien ça coûte ? | TrouveTonDéménageur',
  description: "Combien coûte un déménagement ? Fourchettes de prix par logement et formule, facteurs qui font varier le prix et devis gratuits de déménageurs vérifiés.",
  root: `<h1>Combien coûte un déménagement ?</h1>
<p>Utiliser TrouveTonDéménageur est gratuit pour les clients : vous ne payez que le prix du déménagement convenu avec le professionnel que vous choisissez. Voici des fourchettes indicatives pour un déménagement local.</p>${prixTable}
<h2>Ce qui fait varier le prix</h2><ul>${seo.prix.facteurs.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>
<h2>Formule économique ou standard ?</h2><p>En formule économique, vous emballez et déballez vous-même vos cartons ; le déménageur charge, transporte et décharge. En formule standard, il s'occupe aussi de l'emballage des objets fragiles et du démontage des meubles. Le prix est plus élevé, mais vous gagnez du temps.</p>
<h2>Comment payer moins cher ?</h2><p>Comparez plusieurs devis, choisissez une date en semaine ou hors fin de mois, triez avant de partir et indiquez si vos dates sont flexibles : certains déménageurs proposent de meilleurs prix sur leurs trajets retour.</p>
<p><a href="/calculateur-prix-demenagement">Calculer mon prix</a> · <a href="/tarifs-demenagement-2026">Tarifs détaillés 2026</a> · <a href="/client/auth-choice">Recevoir mes devis</a></p>${contact}`,
});

// --- À propos ---
write('/about', {
  title: 'À propos de TrouveTonDéménageur : qui sommes-nous ? | TrouveTonDéménageur',
  description: "TrouveTonDéménageur, société TROUVE TON DEMENAGEUR SAS basée à Paris, met en relation clients et déménageurs vérifiés partout en France.",
  root: `<h1>À propos de TrouveTonDéménageur</h1>
<p>TrouveTonDéménageur est une plateforme française de mise en relation entre les personnes qui déménagent, particuliers comme professionnels, et des entreprises de déménagement vérifiées. Notre but : rendre le choix d'un déménageur simple, transparent et sûr.</p>
<h2>Notre mission</h2><p>Trouver un déménageur fiable prend du temps : appeler plusieurs entreprises, réexpliquer son besoin, comparer des devis qui ne contiennent pas les mêmes prestations. Avec TrouveTonDéménageur, vous décrivez votre déménagement une seule fois et vous recevez jusqu'à 3 devis comparables sous 24 h.</p>
<h2>Notre engagement</h2>${verif}<p>Des photos avant et après le déménagement servent de preuve en cas de casse, et une personne de notre équipe reste joignable à chaque étape.</p>
<h2>Pour les déménageurs</h2><p>Nous aidons aussi les entreprises de déménagement à trouver de nouveaux clients et à remplir leurs trajets retour, grâce à des demandes complètes et à des alertes de groupage quand plusieurs déménagements sont proches.</p>
<h2>Informations légales</h2><p>TROUVE TON DEMENAGEUR SAS — SIRET 101 378 248 00013 — 60 rue François Ier, 75008 Paris. Président : Heikel Nachi. <a href="https://www.societe.com/societe/trouve-ton-demenageur-101378248.html" rel="noopener">Voir la fiche Societe.com</a>.</p>${contact}`,
});

// --- Contact ---
write('/contact', {
  title: 'Contact : joindre l’équipe TrouveTonDéménageur | TrouveTonDéménageur',
  description: "Contactez TrouveTonDéménageur par téléphone au 01 89 70 78 81 ou par email. Aide pour votre demande de devis, votre déménagement ou votre inscription déménageur.",
  root: `<h1>Contactez TrouveTonDéménageur</h1>
<p>Notre équipe vous aide à chaque étape de votre déménagement : préparation de votre demande, compréhension des devis, suivi le jour J ou question après le déménagement.</p>
<h2>Nous joindre</h2><ul><li>Téléphone : <a href="tel:+33189707881">01 89 70 78 81</a></li><li>Email : <a href="mailto:support@trouvetondemenageur.fr">support@trouvetondemenageur.fr</a></li><li>Adresse : TROUVE TON DEMENAGEUR SAS, 60 rue François Ier, 75008 Paris</li></ul>
<h2>Vous êtes client</h2><p>Pour une nouvelle demande, le plus rapide est de <a href="/client/auth-choice">remplir le formulaire de devis</a>. Si vous préférez être guidé par téléphone, laissez vos coordonnées sur la page <a href="/devis-rapide">Devis rapide</a> et un conseiller vous rappelle. Pour une demande en cours, indiquez sa référence (elle commence par TTD-) afin que nous retrouvions votre dossier immédiatement.</p>
<h2>Vous êtes déménageur</h2><p>Pour rejoindre le réseau, <a href="/mover/signup">inscrivez votre entreprise</a> et envoyez vos documents : extrait KBIS, assurance RC Pro et attestation URSSAF. Pour une question sur un document refusé ou sur une mission, contactez-nous avec le nom de votre entreprise.</p>
<h2>Réponses rapides</h2><p>Beaucoup de réponses sont déjà dans notre <a href="/faq">FAQ</a> et notre <a href="/guide-demenagement">guide du déménagement</a>.</p>`,
});

// --- Technologie ---
write('/technology', {
  title: 'Notre technologie : devis comparables et protection anti-litige | TrouveTonDéménageur',
  description: "Comment TrouveTonDéménageur utilise la technologie : demandes complètes, vérification des documents, photos avant/après et alertes de groupage.",
  root: `<h1>La technologie au service de votre déménagement</h1>
<p>Derrière TrouveTonDéménageur, des outils simples rendent le déménagement plus sûr pour les clients et plus efficace pour les déménageurs. La technologie aide notre équipe ; elle ne remplace pas l'humain que vous pouvez joindre à chaque étape.</p>
<h2>Des demandes complètes, donc des devis comparables</h2><p>Le formulaire recueille les informations qui comptent pour chiffrer : adresses, étages, ascenseur, date et volume pièce par pièce. Tous les déménageurs reçoivent la même description, ce qui rend leurs devis comparables.</p>
<h2>Vérification des déménageurs</h2>${verif}<p>Nos outils signalent automatiquement les documents expirés et les comptes suspects, puis notre équipe vérifie et relance l'entreprise concernée.</p>
<h2>Protection anti-litige</h2><p>Des photos sont prises avant et après le déménagement. En cas de casse ou de désaccord, elles servent de preuve. L'analyse assistée par intelligence artificielle aide à repérer les différences, et la décision reste humaine.</p>
<h2>Groupage et trajets retour</h2><p>Quand plusieurs déménagements sont proches en distance et en date, les déménageurs sont alertés. Ils peuvent ainsi regrouper des trajets, éviter les retours à vide et proposer de meilleurs prix.</p>
<p><a href="/client/auth-choice">Obtenir mes devis gratuits</a> · <a href="/about">Qui sommes-nous ?</a></p>${contact}`,
});

// --- Inscription déménageur ---
write('/mover/signup', {
  title: 'Déménageurs : inscrivez votre entreprise et recevez des demandes | TrouveTonDéménageur',
  description: "Entreprise de déménagement ? Inscrivez-vous sur TrouveTonDéménageur, faites vérifier vos documents et recevez des demandes complètes de clients dans votre zone.",
  root: `<h1>Déménageurs : recevez des demandes de clients près de chez vous</h1>
<p>TrouveTonDéménageur aide les entreprises de déménagement à trouver de nouveaux clients partout en France. Les demandes que vous recevez sont complètes : adresses, étages, accès, date et volume. Vous chiffrez vite et juste, sans perdre de temps au téléphone.</p>
<h2>Comment rejoindre le réseau</h2><ol><li>Créez le compte de votre entreprise.</li><li>Envoyez vos documents : extrait KBIS, assurance RC Pro et attestation URSSAF.</li><li>Notre équipe vérifie votre dossier.</li><li>Vous recevez les demandes de votre zone et proposez vos devis.</li></ol>
<h2>Pourquoi les vérifications ?</h2><p>Les clients choisissent notre plateforme parce que les déménageurs y sont contrôlés. C'est un gage de confiance qui vous distingue des offres non déclarées. Vos documents doivent rester à jour : nous vous prévenons quand l'un d'eux expire.</p>
<h2>Remplir vos trajets retour</h2><p>Grâce aux alertes de groupage, vous êtes prévenu quand plusieurs déménagements sont proches en distance et en date. Vous pouvez ainsi regrouper des missions et éviter de rouler à vide.</p>
<h2>Un suivi simple</h2><p>Depuis votre espace, vous voyez les demandes disponibles, vos devis, vos missions et vos documents. Notre équipe reste joignable pour toute question.</p>
<p><a href="/mover/signup">Inscrire mon entreprise</a> · <a href="/blog">Conseils pour déménageurs</a></p>${contact}`,
});

// --- Blog (liste des articles) ---
const url_ = process.env.VITE_SUPABASE_URL;
const key_ = process.env.VITE_SUPABASE_ANON_KEY;
let articles = [];
if (url_ && key_) {
  const { data, error } = await createClient(url_, key_).from('articles').select('slug, titre, contenu, created_at').eq('statut', 'publie').order('created_at', { ascending: false });
  if (error) console.error('[prerender-public-pages] blog:', error.message);
  articles = (data || []).filter((a) => typeof a.slug === 'string' && /^[a-z0-9-]+$/.test(a.slug) && a.slug !== 'none');
}
const clean = (t) => String(t || '').replace(/^#+\s*/, '').replace(/\*\*/g, '').trim();
const excerpt = (c) => String(c || '').replace(/<[^>]*>/g, ' ').replace(/[#*_>`]/g, '').replace(/\s+/g, ' ').trim().slice(0, 220);
write('/blog', {
  title: 'Blog déménagement : conseils, prix et astuces | TrouveTonDéménageur',
  description: "Conseils pour bien déménager et payer moins cher, guides de prix, astuces pour déménageurs professionnels : le blog de TrouveTonDéménageur.",
  root: `<h1>Blog déménagement : conseils, prix et astuces</h1>
<p>Retrouvez nos conseils pour préparer votre déménagement, comprendre les prix et choisir un déménageur fiable, ainsi que des articles pour les entreprises de déménagement qui veulent trouver plus de clients et éviter les trajets à vide.</p>
${articles.map((a) => `<article><h2><a href="/blog/${a.slug}">${esc(clean(a.titre))}</a></h2><p>${esc(excerpt(a.contenu))}…</p></article>`).join('')}
<h2>Pour aller plus loin</h2><p><a href="/guide-demenagement">Guide du déménagement</a> · <a href="/tarifs-demenagement-2026">Tarifs 2026</a> · <a href="/calculateur-prix-demenagement">Calculateur de prix</a> · <a href="/faq">FAQ</a></p>
<p>Vous déménagez bientôt ? <a href="/client/auth-choice">Recevez jusqu'à 3 devis gratuits</a> de déménageurs vérifiés sous 24 h.</p>`,
});
