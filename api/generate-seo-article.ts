// api/generate-seo-article.ts - Vercel Serverless Function
// Remplace GetAutoSEO (arrêté) : génère et publie un article de blog
// automatiquement, en s'appuyant sur l'API Anthropic. Déclenché par un
// Cron Vercel (voir vercel.json), et testable manuellement avec le même
// secret que le cron (voir "Sécurité" ci-dessous).
//
// Principe volontairement simple et sûr plutôt qu'ambitieux :
// - Un pool de sujets fixe (TOPICS ci-dessous), pas de génération de sujet
//   par l'IA -- ça évite les dérives ("l'IA choisit son propre sujet") et
//   permet de savoir exactement ce qui va être publié en relisant ce fichier.
// - Un seul sujet généré par exécution. Le sujet choisi est le premier de
//   la liste dont le slug n'existe pas encore dans la table `articles`.
//   Quand tous les sujets sont épuisés, la fonction répond simplement
//   "rien à générer" -- il faut alors allonger TOPICS à la main.
// - Le contenu généré passe par la même détection de corruption que
//   l'ancien webhook GetAutoSEO (titre vide, slug invalide, balises
//   markdown résiduelles) avant publication : en cas de doute, l'article
//   est mis en 'brouillon' plutôt que publié cassé.
// - Consigne explicite au modèle : ne jamais inventer de prix, délais ou
//   garanties chiffrées -- un article marketing avec des chiffres faux
//   est un risque (confiance client, litiges), pas juste un défaut SEO.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const SITE_URL = 'https://www.trouvetondemenageur.fr';
const ANTHROPIC_MODEL = 'claude-sonnet-5';

// --- Pool de sujets -----------------------------------------------------
// slug : doit rester stable une fois publié (ne pas renommer un slug déjà
// en ligne, ça casserait les liens et le référencement déjà acquis).
// type_article : mêmes valeurs que celles déjà utilisées dans le blog
// (Guide, Comparatif, Local, Prix, Checklist, FAQ).
type Topic = { slug: string; sujet: string; type_article: string; ville: string | null };

const VILLES = ['Paris', 'Lyon', 'Saint-Étienne', 'Lille', 'Marseille', 'Nantes', 'Bordeaux', 'Toulouse'];

const TOPICS: Topic[] = [
  { slug: 'checklist-demenagement-etape-par-etape', sujet: 'Checklist complète pour préparer son déménagement, semaine par semaine, de J-60 à J-jour', type_article: 'Checklist', ville: null },
  { slug: 'comment-reconnaitre-un-devis-demenagement-fiable', sujet: "Comment reconnaître un devis de déménagement fiable et repérer les signaux d'alerte d'une arnaque, sans donner de chiffres précis mais en expliquant la méthode (devis détaillé, assurance, immatriculation, avis vérifiés)", type_article: 'Guide', ville: null },
  { slug: 'demenagement-appartement-sans-ascenseur', sujet: "Déménager un appartement sans ascenseur : les contraintes réelles (monte-meuble, étages, encombrement) et comment bien en parler à son déménageur", type_article: 'Guide', ville: null },
  { slug: 'assurance-demenagement-ce-qu-il-faut-verifier', sujet: "Assurance déménagement : ce qu'il faut vérifier avant de signer (couverture, franchise, valeur déclarée), sans donner de montants précis", type_article: 'Guide', ville: null },
  { slug: 'demenagement-professionnel-vs-entre-amis', sujet: 'Déménagement avec des professionnels ou entre amis : avantages, limites et risques concrets de chaque option, de façon équilibrée', type_article: 'Comparatif', ville: null },
  { slug: 'que-faire-en-cas-de-litige-avec-son-demenageur', sujet: "Que faire en cas de litige avec un déménageur (objet cassé, retard, désaccord sur le devis) : démarches concrètes et rôle d'une plateforme qui vérifie ses partenaires", type_article: 'Guide', ville: null },
  { slug: 'emballer-objets-fragiles-demenagement', sujet: 'Comment emballer correctement la vaisselle, les objets fragiles et les écrans pour un déménagement, conseils pratiques détaillés', type_article: 'Guide', ville: null },
  { slug: 'demenagement-garde-meuble-quand-en-avoir-besoin', sujet: "Garde-meuble pendant un déménagement : dans quels cas c'est utile (décalage entre deux baux, travaux, tri) et comment ça se passe concrètement", type_article: 'Guide', ville: null },
  { slug: 'faq-demenagement-questions-frequentes', sujet: "FAQ déménagement : réponses aux questions les plus fréquentes (délai de prévenance, que faire des plantes, des objets de valeur, des animaux le jour J), rédige au moins 5 questions sous forme de titres H2 ou H3 se terminant par un point d'interrogation suivis de leur réponse en paragraphe", type_article: 'FAQ', ville: null },
  { slug: 'demenagement-etudiant-conseils', sujet: "Déménagement étudiant : spécificités (petit volume, budget serré, rentrée universitaire), conseils pratiques adaptés", type_article: 'Guide', ville: null },
];

// Un sujet "prix moyens à [Ville]" par ville déjà couverte par les pages
// villes existantes -- contenu complémentaire, pas dupliqué (angle blog
// "conseils", pas fiche service).
for (const ville of VILLES) {
  const slugVille = ville.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '-');
  TOPICS.push({
    slug: `demenager-a-${slugVille}-ce-qu-il-faut-savoir`,
    sujet: `Ce qu'il faut savoir avant de déménager à ${ville} : spécificités locales concrètes (stationnement, types de logements, quartiers), sans donner de prix précis ni inventer de statistiques`,
    type_article: 'Local',
    ville,
  });
}

// --- Détection de corruption (identique à l'ancien webhook GetAutoSEO) --
function detectCorruption(titre: string, slug: string, contenuHtml: string): string | null {
  if (!titre || titre.trim().length === 0) return 'titre vide';
  if (!slug || slug.length > 100) return `slug invalide (longueur ${slug?.length ?? 0}, max 100)`;
  if (!/^[a-z0-9-]+$/.test(slug)) return 'slug contient des caractères hors [a-z0-9-]';
  if (/```/.test(contenuHtml) || /<\/?(html|body|article)>/i.test(contenuHtml)) return 'balises markdown ou HTML de structure résiduelles';
  const wordCount = contenuHtml.replace(/<[^>]*>/g, ' ').split(/\s+/).filter(Boolean).length;
  if (wordCount < 200) return `contenu trop court (${wordCount} mots, minimum 200)`;
  return null;
}

async function callClaude(topic: Topic): Promise<{ titre: string; contenu_html: string; mot_cle: string }> {
  const system = `Tu écris pour le blog de TrouveTonDéménageur, une plateforme française qui met en relation des particuliers avec des déménageurs vérifiés. Tu réponds UNIQUEMENT en JSON valide, sans texte avant ou après, sans balises markdown \`\`\`.

Règles impératives :
- N'invente JAMAIS de prix, tarifs, pourcentages, statistiques ou délais chiffrés précis. Si le sujet nécessite d'en parler, reste général ("le prix dépend du volume et de la distance") plutôt que de donner un chiffre inventé.
- N'invente jamais de nom de client, d'avis, de témoignage ou de citation.
- Ton neutre, informatif, utile -- pas de survente ni de superlatifs publicitaires excessifs.
- Le contenu doit faire au moins 500 mots.
- Utilise des balises HTML simples pour le corps : <h2>, <h3>, <p>, <ul>, <li>, <strong>. Pas de <html>, <body>, <script>, ni de balises markdown.
- Le format de sortie JSON attendu est exactement : {"titre": "...", "contenu_html": "...", "mot_cle": "mot-clé principal, deuxième mot-clé"}`;

  const user = `Sujet de l'article : ${topic.sujet}${topic.ville ? `\nVille concernée : ${topic.ville}` : ''}\nType d'article : ${topic.type_article}`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 4000,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Anthropic API error: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  const rawText = (data.content || []).map((b: any) => b.text || '').join('').trim();
  const cleaned = rawText.replace(/^```json\n?/i, '').replace(/^```\n?/i, '').replace(/```\s*$/, '').trim();

  let parsed: { titre: string; contenu_html: string; mot_cle: string };
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    throw new Error(`Réponse Claude non parsable en JSON: ${cleaned.substring(0, 300)}`);
  }
  return parsed;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Sécurité : accepte soit un appel Cron Vercel authentifié (header
  // Authorization: Bearer $CRON_SECRET, ajouté automatiquement par Vercel
  // quand CRON_SECRET est configuré), soit un appel manuel avec le même
  // secret en query (?secret=...) pour pouvoir tester sans attendre le cron.
  const authHeader = req.headers.authorization || '';
  const bearerToken = authHeader.replace(/^Bearer\s+/i, '');
  const querySecret = typeof req.query.secret === 'string' ? req.query.secret : '';
  const expected = process.env.CRON_SECRET;
  if (!expected || (bearerToken !== expected && querySecret !== expected)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY manquante' });
  }

  try {
    const { data: existing, error: fetchErr } = await supabase.from('articles').select('slug');
    if (fetchErr) {
      return res.status(500).json({ error: 'Erreur lecture articles existants', details: fetchErr.message });
    }
    const existingSlugs = new Set((existing || []).map((a: { slug: string }) => a.slug));

    const nextTopic = TOPICS.find((t) => !existingSlugs.has(t.slug));
    if (!nextTopic) {
      return res.status(200).json({ success: true, note: 'Tous les sujets du pool ont déjà été générés. Ajouter de nouveaux sujets dans api/generate-seo-article.ts (TOPICS).' });
    }

    const generated = await callClaude(nextTopic);
    const titre = (generated.titre || '').substring(0, 200);
    const contenu = generated.contenu_html || '';
    const corruptionReason = detectCorruption(titre, nextTopic.slug, contenu);

    const record = {
      titre,
      contenu,
      mot_cle: generated.mot_cle || null,
      ville: nextTopic.ville,
      type_article: nextTopic.type_article,
      slug: nextTopic.slug,
      statut: corruptionReason ? 'brouillon' : 'publie',
    };

    const { data: inserted, error: insertErr } = await supabase.from('articles').insert(record).select();
    if (insertErr) {
      return res.status(500).json({ error: 'Erreur insertion article', details: insertErr.message });
    }

    // Déclenche le redeploy pour que l'article soit pré-rendu statiquement
    // (voir scripts/prerender-blog-articles.mjs) sans attendre le prochain
    // déploiement manuel.
    if (record.statut === 'publie' && process.env.VERCEL_DEPLOY_HOOK_URL) {
      fetch(process.env.VERCEL_DEPLOY_HOOK_URL, { method: 'POST' }).catch((err) => {
        console.error('[generate-seo-article] Échec déclenchement redeploy (non bloquant):', err.message);
      });
    }

    return res.status(200).json({
      success: true,
      slug: nextTopic.slug,
      statut: record.statut,
      url: `${SITE_URL}/blog/${nextTopic.slug}`,
      article: inserted?.[0] ?? null,
      ...(corruptionReason ? { warning: `Article généré mais mis en brouillon : ${corruptionReason}. Relecture manuelle nécessaire.` } : {}),
    });
  } catch (err: any) {
    console.error('[generate-seo-article] Erreur:', err);
    return res.status(500).json({ error: 'Erreur interne', details: err.message });
  }
}
