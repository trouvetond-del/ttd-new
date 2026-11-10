// Générateurs de la Machine d'acquisition (admin).
// Règles : aucun chiffre inventé, aucun avis/note affiché, l'humain d'abord,
// le site toujours écrit www.trouvetondemenageur.fr.

export const SITE = 'www.trouvetondemenageur.fr';
export const VOICE_CTA = 'trouve ton déménageur point FR';

export type Audience = 'b2c' | 'b2b';
export interface ScriptRow { time: string; audio: string; visual: string }
export interface VideoScript { title: string; angle: string; rows: ScriptRow[]; caption: string; hashtags: string[] }

const pick = <T,>(arr: T[], seed: number) => arr[Math.abs(seed) % arr.length];

const B2C_ANGLES = [
  {
    angle: 'Stress du déménagement',
    hook: (v: string) => `Stop. Si tu déménages à ${v}, ne fais pas cette erreur.`,
    pain: 'Les cartons, le camion, les clés… et personne pour te répondre la veille du jour J.',
    visualHook: 'Gros plan visage fatigué au milieu des cartons, texte « STOP » plein écran',
    visualPain: 'Plan rapide : téléphone qui sonne dans le vide, pile de cartons qui penche',
  },
  {
    angle: 'Arnaque aux prix',
    hook: () => 'Ton devis de déménagement a doublé le jour J ? Voilà pourquoi.',
    pain: 'Un prix flou au départ, des frais ajoutés à l’arrivée : c’est ce que tout le monde redoute.',
    visualHook: 'Main qui froisse un devis, zoom sur un total barré au feutre rouge',
    visualPain: 'Écran partagé : devis « petit prix » vs facture finale, sans marque visible',
  },
  {
    angle: 'Gagner du temps avec un humain',
    hook: () => 'J’ai trouvé mon déménageur sans passer mes soirées au téléphone.',
    pain: 'Appeler dix sociétés, recopier dix fois ton adresse, attendre des rappels qui n’arrivent pas.',
    visualHook: 'Personne face caméra, ton naturel, dans un appartement vide',
    visualPain: 'Montage rapide de 5 appels manqués à l’écran',
  },
];

const B2B_ANGLES = [
  {
    angle: 'Manque de chantiers',
    hook: () => 'Déménageur : ton planning de la semaine prochaine est vide ?',
    pain: 'Entre deux saisons, les demandes ralentissent et les équipes attendent.',
    visualHook: 'Agenda papier quasi vide, un doigt qui tape dessus',
    visualPain: 'Équipe assise près du camion, plan large, calme',
  },
  {
    angle: 'Camions qui rentrent vides',
    hook: () => 'Ton camion revient à vide après chaque livraison ? Tu paies le retour pour rien.',
    pain: 'Gasoil, péage, heures de route : un trajet retour sans chargement, c’est de l’argent perdu.',
    visualHook: 'Portes arrière d’un camion qui s’ouvrent sur une caisse vide',
    visualPain: 'Plan autoroute depuis la cabine, jauge carburant',
  },
  {
    angle: 'Rentabilité',
    hook: () => 'Arrête de payer des contacts que d’autres déménageurs reçoivent aussi.',
    pain: 'Des demandes revendues en masse, des clients injoignables, et du temps passé à rappeler.',
    visualHook: 'Pile de fiches contact barrées une par une',
    visualPain: 'Téléphone : « numéro non attribué », soupir du déménageur',
  },
];

export function generateVideoScript(audience: Audience, city: string, seed = Date.now()): VideoScript {
  const v = city.trim() || 'ta ville';
  const a = pick(audience === 'b2c' ? B2C_ANGLES : B2B_ANGLES, seed);
  const solution = audience === 'b2c'
    ? `Sur ${SITE}, tu décris ton déménagement une fois, et des déménageurs vérifiés (KBIS, URSSAF) t’envoient leurs devis. Une vraie équipe te suit jusqu’au jour J.`
    : `Sur ${SITE}, tu vois les demandes de déménagement ouvertes près de chez toi et tu déposes ton devis quand ça t’arrange. Inscription gratuite, dossier vérifié.`;
  const rows: ScriptRow[] = [
    { time: '0s-3s', audio: a.hook(v), visual: a.visualHook },
    { time: '3s-10s', audio: a.pain, visual: a.visualPain },
    { time: '10s-22s', audio: solution, visual: audience === 'b2c'
      ? 'Écran du formulaire sur téléphone en vrai, puis plan d’une équipe qui charge un camion en souriant'
      : 'Capture de la page « Mission » sur téléphone, puis camion qui repart chargé' },
    { time: '22s-28s', audio: `Va sur ${VOICE_CTA}.`, visual: `Texte plein écran : ${SITE} + flèche vers le lien en bio` },
  ];
  return {
    title: `${audience === 'b2c' ? 'Client' : 'Déménageur'} — ${a.angle}${city ? ` — ${city}` : ''}`,
    angle: a.angle,
    rows,
    caption: audience === 'b2c'
      ? `Déménagement${city ? ` à ${city}` : ''} : compare des devis de pros vérifiés 👉 ${SITE}`
      : `Déménageurs${city ? ` de ${city}` : ''} : trouvez des chantiers près de chez vous 👉 ${SITE}`,
    hashtags: audience === 'b2c'
      ? ['#demenagement', '#déménager', `#${(city || 'france').toLowerCase().replace(/[^a-z0-9]/g, '')}`, '#astucedemenagement']
      : ['#demenageur', '#transport', '#artisan', '#chantier'],
  };
}

export const VIRAL_CONCEPTS_2026 = [
  { name: 'POV : la veille du jour J', format: 'Face caméra + texte', why: 'Format POV très partagé, situation que tout le monde reconnaît.', audience: 'b2c' as Audience },
  { name: 'Avant / après en 10 secondes', format: 'Timelapse appartement plein → vide → nouveau logement', why: 'Transformation visuelle, retient jusqu’à la fin.', audience: 'b2c' as Audience },
  { name: '3 questions à poser à ton déménageur', format: 'Liste rapide, texte à l’écran', why: 'Contenu utile qu’on enregistre et partage.', audience: 'b2c' as Audience },
  { name: 'Lire les petites lignes d’un devis', format: 'Écran partagé, feutre rouge', why: 'Sujet « arnaque » qui génère des commentaires.', audience: 'b2c' as Audience },
  { name: 'Une journée avec une équipe de déménageurs', format: 'Vlog mains/camion, sans visages si refus', why: 'Met les personnes en avant, crédible.', audience: 'b2c' as Audience },
  { name: 'Le trajet retour à vide', format: 'Cabine de camion, voix off', why: 'Douleur directe des déménageurs, très concret.', audience: 'b2b' as Audience },
  { name: 'Mon planning avant / après', format: 'Agenda filmé', why: 'Montre un résultat business simple.', audience: 'b2b' as Audience },
  { name: 'Réponse à un commentaire', format: 'Réponse vidéo à une vraie question reçue', why: 'Favorisé par TikTok/Reels, crée la conversation.', audience: 'b2c' as Audience },
];

// ---------- Google Ads ----------
export interface AdSet { headlines: string[]; descriptions: string[]; keywords: string[]; path: string }
const cut = (s: string, n: number) => (s.length <= n ? s : s.slice(0, n - 1).trimEnd() + '…');

export function generateGoogleAds(city: string, slug: string): AdSet {
  const c = city.trim();
  const raw = [
    `Déménageur à ${c}`, `Devis Déménagement ${c}`, `Déménageurs Vérifiés ${c}`,
    `Comparez 3 Devis à ${c}`, 'Devis Gratuit en 2 Minutes', 'Pros Vérifiés KBIS URSSAF',
    'Assurance Incluse', 'Suivi en Temps Réel', `Déménager à ${c} Sereinement`,
    'Une Équipe à Votre Écoute', 'Sans Engagement', `Déménagement ${c} Pas Cher`,
    'Prix Clairs, Sans Surprise', 'Particuliers et Familles', 'Demande en Ligne Simple',
  ];
  return {
    headlines: raw.map((h) => cut(h, 30)),
    descriptions: [
      `Décrivez votre déménagement à ${c} une fois, recevez jusqu’à 3 devis de pros vérifiés.`,
      'Déménageurs contrôlés (KBIS, URSSAF), assurance incluse et suivi en temps réel.',
      'Une vraie équipe vous accompagne jusqu’au jour J. Demande gratuite et sans engagement.',
      `Comparez les prix des déménageurs à ${c} et choisissez en toute confiance.`,
    ].map((d) => cut(d, 90)),
    keywords: [
      `[déménageur ${c.toLowerCase()}]`, `[devis déménagement ${c.toLowerCase()}]`,
      `"déménagement ${c.toLowerCase()}"`, `"société de déménagement ${c.toLowerCase()}"`,
      `"déménageur pas cher ${c.toLowerCase()}"`, `"prix déménagement ${c.toLowerCase()}"`,
    ],
    path: `https://${SITE}/demenagement/${slug}`,
  };
}

// ---------- Landing page ----------
export interface LandingBlock { block: string; content: string }
export function generateLandingStructure(city: string): LandingBlock[] {
  return [
    { block: 'En-tête', content: 'Logo seul, aucun menu, aucun lien sortant. Téléphone cliquable à droite.' },
    { block: 'H1', content: `Déménageur à ${city}` },
    { block: 'Sous-titre', content: 'Déménagez sereinement. Des pros vérifiés, une équipe à votre écoute.' },
    { block: 'Formulaire (au-dessus de la ligne de flottaison)', content: 'Étape 1 : ville de départ, ville d’arrivée, date. Étape 2 : logement, étage, ascenseur. Étape 3 : nom, email, téléphone → création du compte. Barre de progression, moins de 2 minutes.' },
    { block: 'Triptyque de confiance', content: 'Assurance incluse · Déménageurs vérifiés (KBIS, URSSAF) · Suivi en temps réel' },
    { block: 'H2', content: `Comment ça marche pour votre déménagement à ${city}` },
    { block: '3 étapes', content: 'Vous décrivez · Des pros vérifiés vous répondent · Vous choisissez' },
    { block: 'FAQ courte', content: '3 questions maximum : prix, délai de réponse, engagement.' },
    { block: 'Bouton collant mobile', content: '« Obtenir mes devis » qui remonte au formulaire.' },
    { block: 'Microdonnées', content: `Schema.org MovingCompany avec areaServed = ${city}` },
    { block: 'Pied de page minimal', content: 'Mentions légales et confidentialité uniquement.' },
  ];
}

export function landingSchema(city: string) {
  return JSON.stringify({
    '@context': 'https://schema.org', '@type': 'MovingCompany',
    name: 'Trouve Ton Déménageur', url: `https://${SITE}`, areaServed: { '@type': 'City', name: city },
    address: { '@type': 'PostalAddress', streetAddress: '60 rue François Ier', postalCode: '75008', addressLocality: 'Paris', addressCountry: 'FR' },
  }, null, 2);
}

// ---------- Pitch déménageurs ----------
export interface CityStats { quotes90d: number; openQuotes: number; verifiedMovers: number }
export function generatePitch(city: string, stats: CityStats | null) {
  const facts: string[] = [];
  if (stats) {
    facts.push(`${stats.quotes90d} demande(s) de déménagement au départ de ${city} sur les 90 derniers jours sur notre site.`);
    facts.push(`${stats.openQuotes} demande(s) actuellement ouverte(s) qui attendent des devis.`);
    facts.push(`${stats.verifiedMovers} déménageur(s) vérifié(s) inscrit(s) à ${city} aujourd’hui.`);
  }
  const factLine = facts.length ? facts.map((f) => `• ${f}`).join('\n') : '• (chiffres indisponibles — ne pas en inventer)';
  return {
    facts,
    phone: `Bonjour, ici l’équipe Trouve Ton Déménageur. Je vous appelle car nous recevons des demandes de particuliers qui déménagent depuis ${city}.\n${factLine}\nL’inscription est gratuite : vous voyez les demandes près de chez vous et vous déposez vos devis quand vous avez de la place, notamment pour éviter les retours à vide. Est-ce que je peux vous envoyer le lien par email ?`,
    emailSubject: `Des demandes de déménagement à ${city} pour votre entreprise`,
    email: `Bonjour,\n\nNous recevons des demandes de particuliers qui déménagent depuis ${city} :\n${factLine}\n\nSur ${SITE}, vous consultez les demandes ouvertes, vous filtrez par région ou distance et vous déposez votre devis en quelques minutes. L’inscription est gratuite et chaque dossier est vérifié (KBIS, URSSAF).\n\nVoir les demandes disponibles : https://${SITE}/demenagements-disponibles\n\nL’équipe Trouve Ton Déménageur\n${SITE}`,
  };
}
