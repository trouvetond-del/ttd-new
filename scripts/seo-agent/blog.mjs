// Agent SEO — articles de blog longs pour Google (table `articles`, visible sur /blog).
// Lancé par .github/workflows/seo-agent.yml. 2 articles / semaine (lundi : client, jeudi : déménageur).
// Le sujet vient d'une liste de recherches Google réelles, en évitant ceux déjà traités.
import { createClient } from "@supabase/supabase-js";

const env = (k) => { const v = process.env[k]; if (!v) throw new Error(`${k} manquant`); return v; };
const sb = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
const MODEL = process.env.OPENAI_MODEL || "gpt-4.1";

const CLIENT_TOPICS = [
  "trouver un déménageur pas cher", "prix d'un déménagement", "devis déménagement gratuit",
  "comment choisir son déménageur", "déménagement petit volume", "calculer le volume de son déménagement",
  "déménagement longue distance prix", "aide au déménagement CAF", "check-list déménagement",
  "déménagement étudiant pas cher", "assurance déménagement casse", "autorisation de stationnement déménagement",
  "déménager un piano", "déménagement en hiver", "meilleure période pour déménager",
  "déménagement d'entreprise", "garde-meuble pendant un déménagement", "arnaque déménageur comment l'éviter",
  "monte-meuble déménagement prix", "déménagement sans ascenseur",
];
const MOVER_TOPICS = [
  "trouver des clients déménagement", "éviter les retours à vide", "développer son entreprise de déménagement",
  "devis déménagement comment le calculer", "plateforme pour déménageurs professionnels", "acompte déménagement sécurisé",
  "litige client déménagement", "assurance RC Pro déménageur", "rentabilité d'un camion de déménagement",
  "trouver des chantiers de déménagement", "fidéliser ses clients déménagement", "avis clients déménageur",
];

async function gpt(messages, json = true) {
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${env("OPENAI_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, messages, temperature: 0.7, ...(json ? { response_format: { type: "json_object" } } : {}) }),
  });
  if (!r.ok) throw new Error(`OpenAI ${r.status}: ${await r.text()}`);
  return (await r.json()).choices[0].message.content;
}

const slugify = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);

export async function writeArticle(audience) {
  const { data: existing } = await sb.from("articles").select("mot_cle, titre");
  const done = new Set((existing || []).map((a) => (a.mot_cle || "").toLowerCase()));
  const pool = audience === "mover" ? MOVER_TOPICS : CLIENT_TOPICS;
  const topic = pool.find((t) => !done.has(t)) || pool[Math.floor(Math.random() * pool.length)];

  const { data: cities } = await sb.from("city_pages").select("slug, nom_ville").eq("statut", "published");
  const cityLinks = (cities || []).slice(0, 50).map((c) => `${c.nom_ville}: /demenagement/${c.slug}`).join(", ");

  const system = `Tu es rédacteur SEO pour www.trouvetondemenageur.fr, plateforme française qui met en relation clients (particuliers et pros) et déménageurs professionnels vérifiés (KBIS, RC Pro, URSSAF).
Fonctionnement réel (n'invente rien d'autre) : le client crée un compte et décrit son déménagement (adresses, étages, volume, date) ; des déménageurs vérifiés envoient leurs devis ; acompte sécurisé ; contrat signé en ligne ; photos avant/après et arbitrage neutre en cas de casse. Inscription gratuite pour les déménageurs.
Règles : français simple, aucun chiffre inventé (pas de statistiques, pas de faux avis, pas de prix précis : donne des fourchettes seulement si elles sont prudentes et présentées comme indicatives), pas de promesse de résultat.
Style humain (obligatoire) : écris comme un professionnel du déménagement qui parle à un ami. Phrases de longueur variée, quelques phrases courtes. Exemples concrets du quotidien (cartons, escalier sans ascenseur, place de stationnement, clés à rendre). Tutoiement interdit, vouvoiement naturel. Bannis ces tournures typiques d'IA : « Dans cet article », « En conclusion », « Il est important de noter », « N'hésitez pas », « plongeons », « incontournable », « en somme », « que vous soyez… ou… ». Pas de listes à rallonge : maximum 2 listes dans l'article. Pas d'emojis.`;
  const user = `Écris un article de blog de 900 à 1300 mots ciblant la recherche Google « ${topic} » (public : ${audience === "mover" ? "déménageurs professionnels" : "particuliers et entreprises qui déménagent"}).
Structure HTML (uniquement ces balises : h2, h3, p, ul, li, strong, a) : introduction qui répond directement à la question, 4 à 6 sections h2, une section « Questions fréquentes » avec 3 h3, une conclusion avec un lien <a href="${audience === "mover" ? "/mover/signup" : "/client/quote"}">${audience === "mover" ? "inscription gratuite déménageur" : "demander vos devis gratuits"}</a>.
Ajoute 2 ou 3 liens internes pertinents vers des pages ville parmi : ${cityLinks}.
Réponds en JSON : {"titre": "titre de 50 à 65 caractères contenant le mot-clé", "contenu": "<h2>...</h2>..."}`;

  const out = JSON.parse(await gpt([{ role: "system", content: system }, { role: "user", content: user }]));
  const titre = String(out.titre || "").trim().slice(0, 200);
  const contenu = String(out.contenu || "").replace(/```html?|```/g, "").trim();
  if (!titre || contenu.length < 3000) throw new Error(`Article trop court ou vide (${contenu.length} caractères)`);

  let slug = slugify(titre);
  if ((existing || []).some((a) => slugify(a.titre || "") === slug)) slug = `${slug}-${Date.now().toString(36)}`;

  const { error } = await sb.from("articles").upsert({
    titre, contenu, mot_cle: topic, ville: null,
    type_article: audience === "mover" ? "Guide" : (/prix|coût|cher/.test(topic) ? "Prix" : "Guide"),
    slug, statut: "publie",
  }, { onConflict: "slug" });
  if (error) throw new Error(`Insertion article : ${error.message}`);
  console.log(`[seo-blog] Publié : /blog/${slug} (« ${topic} »)`);
  return { slug, titre, topic };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const day = new Date().getUTCDay(); // 1 = lundi, 4 = jeudi
  const audience = process.env.FORCE_AUDIENCE || (day === 4 ? "mover" : "client");
  writeArticle(audience).catch((e) => { console.error(e); process.exit(1); });
}
