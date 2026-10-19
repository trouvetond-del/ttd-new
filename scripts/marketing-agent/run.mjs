// Agent marketing TrouveTonDemenageur — lancé chaque jour par GitHub Actions.
// Planning (heure de Paris) :
//   Lun/Mer/Ven : article CLIENT   — Mar/Jeu/Sam : article DÉMÉNAGEUR
//   Mer : vidéo Reel (dernier article client) — Dim : vidéo Reel (dernier article déménageur)
// Chaque article part d'un vrai problème lu sur des forums/avis, et propose la solution
// avec les fonctionnalités RÉELLES du site. Aucun chiffre, avis ou témoignage inventé.
import { createClient } from "@supabase/supabase-js";
import { buildVideo, loadVoiceConfig } from "./media.mjs";

const SITE = "www.trouvetondemenageur.fr";
const GRAPH = "https://graph.facebook.com/v21.0";
const TEXT_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const env = (k) => { const v = process.env[k]; if (!v) throw new Error(`Secret manquant : ${k}`); return v; };

const sb = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false }, realtime: { transport: class NoRealtime {} } });

// Fonctionnalités vérifiées dans le code du site — seules affirmations autorisées.
const FEATURES = `
- Le client crée un compte et décrit tout son déménagement (adresses, étages, ascenseur, volume/cubage, date) : les déménageurs envoient leurs devis sur cette base, ce qui évite les devis « au doigt mouillé ».
- Plusieurs déménageurs peuvent proposer un devis, le client compare et choisit.
- Déménageurs contrôlés avant d'être acceptés : KBIS, assurance RC Pro et attestation URSSAF vérifiés.
- Paiement sécurisé en ligne par acompte ; le reste est réglé selon les conditions du contrat.
- Arbitrage par photos : des photos horodatées sont prises avant le départ et à l'arrivée. En cas de litige (meuble abîmé, objet cassé), l'outil d'analyse compare les photos avant/après et produit un rapport factuel, sans parti pris, qui sert de base pour régler le désaccord. Il protège aussi le déménageur contre les fausses accusations.
- Messagerie intégrée entre client et déménageur, contrat et facture générés par la plateforme.
- Pour les déménageurs : des demandes de clients déjà détaillées (adresses, étages, volume), donc des devis plus justes ; inscription avec vérification des documents ; paiement par acompte sécurisé avant la mission ; preuves photos en cas de contestation.
`;

const RULES = `Règles absolues : français naturel ; aucun chiffre, statistique, pourcentage, note, avis ou témoignage inventé ; ne jamais citer de concurrent par son nom ; ne jamais copier les propos d'un internaute ni le nommer — reformule le problème de façon générale ; ne promettre que les fonctionnalités listées ; toujours écrire le site exactement « ${SITE} ».`;

// ---------- Planning ----------
function parisNow() {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" }).formatToParts(new Date());
  const g = (t) => p.find((x) => x.type === t).value;
  return { date: `${g("year")}-${g("month")}-${g("day")}`, weekday: g("weekday") };
}
const PLAN = { Mon: "article_client", Tue: "article_mover", Wed: "article_client", Thu: "article_mover", Fri: "article_client", Sat: "article_mover", Sun: null };
const VIDEO = { Wed: "video_client", Sun: "video_mover" };

// ---------- OpenAI ----------
async function openai(path, body, raw = false) {
  const r = await fetch(`https://api.openai.com/v1${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env("OPENAI_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`OpenAI ${path} [${r.status}] ${await r.text()}`);
  return raw ? Buffer.from(await r.arrayBuffer()) : r.json();
}
const outputText = (j) => j.output_text ?? j.output?.flatMap((o) => o.content ?? []).filter((c) => c.type === "output_text").map((c) => c.text).join("\n") ?? "";

async function research(audience, avoidTopics) {
  const who = audience === "client"
    ? "des particuliers et des entreprises qui ont déménagé avec un déménageur (devis qui explose le jour J, meubles cassés sans dédommagement, déménageur qui ne vient pas, acompte perdu, faux déménageurs, volume mal estimé…)"
    : "des déménageurs professionnels (clients qui annulent au dernier moment, impayés, fausses accusations de casse, volume sous-estimé par le client, étages/ascenseur non signalés, plateformes qui vendent des contacts bidons…)";
  const j = await openai("/responses", {
    model: TEXT_MODEL,
    tools: [{ type: "web_search_preview", search_context_size: "medium", user_location: { type: "approximate", country: "FR" } }],
    input: `Cherche sur des forums et sites d'avis francophones (Reddit, forums conso, forums pros, avis en ligne) des expériences NÉGATIVES récentes ${who}.
Choisis UN problème précis et fréquent, différent de ces sujets déjà traités : ${avoidTopics.join(" | ") || "aucun"}.
Réponds en 10 lignes maximum : le problème, comment il se produit, pourquoi les gens sont frustrés, et les URL des sources consultées.`,
  });
  const text = outputText(j);
  const urls = [...new Set((j.output ?? []).flatMap((o) => o.content ?? []).flatMap((c) => c.annotations ?? []).filter((a) => a.url).map((a) => a.url))];
  return { notes: text, sources: urls.slice(0, 8) };
}

async function writeArticle(audience, notes) {
  const schema = {
    type: "object", additionalProperties: false,
    required: ["topic", "title", "article", "image_prompt"],
    properties: {
      topic: { type: "string", description: "Sujet en 6 mots max" },
      title: { type: "string" },
      article: { type: "string", description: "Post Facebook/Instagram court, 400 à 600 caractères maximum" },
      image_prompt: { type: "string", description: "Description en anglais d'une photo réaliste, sans texte ni logo" },
    },
  };
  const j = await openai("/responses", {
    model: TEXT_MODEL,
    input: [
      { role: "system", content: `Tu es le rédacteur de TrouveTonDemenageur, plateforme qui met en relation clients (particuliers et pros) et déménageurs vérifiés partout en France.\nFonctionnalités réelles :\n${FEATURES}\n${RULES}` },
      { role: "user", content: `Public : ${audience === "client" ? "CLIENTS qui vont déménager" : "DÉMÉNAGEURS professionnels (recrutement de partenaires)"}.
Problème repéré sur les forums :\n${notes}\n
Écris un post réseaux sociaux COURT (400 à 600 caractères maximum, les gens lisent peu) : 1 phrase d'accroche sur le problème, 1 à 2 phrases sur la solution avec UNE fonctionnalité de la plateforme (si pertinent, l'arbitrage par photos avant/après en une phrase simple), phrases courtes, pas de liste longue, puis un appel à l'action ${audience === "client" ? "pour créer son compte et décrire son déménagement" : "pour rejoindre le réseau de déménageurs"}, puis la ligne « 👉 ${SITE} », puis 3 à 5 hashtags.` },
    ],
    text: { format: { type: "json_schema", name: "article", strict: true, schema } },
  });
  return JSON.parse(outputText(j));
}

async function writeVideoScript(article) {
  const schema = {
    type: "object", additionalProperties: false, required: ["caption", "scenes"],
    properties: {
      caption: { type: "string", description: `Légende Instagram courte, avec « 👉 ${SITE} » et 5 hashtags` },
      scenes: { type: "array", minItems: 5, maxItems: 6, items: {
        type: "object", additionalProperties: false, required: ["voiceover", "image_prompt"],
        properties: { voiceover: { type: "string", description: "1 à 2 phrases parlées" }, image_prompt: { type: "string", description: "Photo réaliste verticale en anglais, sans texte" } },
      } },
    },
  };
  const j = await openai("/responses", {
    model: TEXT_MODEL,
    input: [
      { role: "system", content: `Tu écris des scripts de Reels de 30 à 45 secondes pour TrouveTonDemenageur.\n${FEATURES}\n${RULES}\nLa dernière scène dit « Rendez-vous sur trouve ton déménageur point fr ».` },
      { role: "user", content: `Transforme cet article en script de voix off découpé en scènes :\n\n${article.title}\n${article.body}` },
    ],
    text: { format: { type: "json_schema", name: "reel", strict: true, schema } },
  });
  return JSON.parse(outputText(j));
}

async function image(prompt, size) {
  const j = await openai("/images/generations", {
    model: "gpt-image-1", size, quality: "medium",
    prompt: `${prompt}. Realistic photo, natural light, French setting, moving context. Brand accent colors blue #3B82F6 and green #10B981 subtly present (e.g. clothing). Absolutely no text, letters, logos or watermarks.`,
  });
  return Buffer.from(j.data[0].b64_json, "base64");
}

// ---------- Stockage public ----------
async function upload(path, buf, contentType) {
  const { error } = await sb.storage.from("marketing-media").upload(path, buf, { contentType, upsert: true });
  if (error) throw new Error(`Stockage : ${error.message}`);
  return sb.storage.from("marketing-media").getPublicUrl(path).data.publicUrl;
}

// ---------- Meta ----------
async function graph(path, params) {
  const r = await fetch(`${GRAPH}${path}`, { method: "POST", body: new URLSearchParams({ ...params, access_token: env("META_PAGE_TOKEN") }) });
  const t = await r.text();
  if (!r.ok) throw new Error(`Meta ${path} [${r.status}] ${t}`);
  return JSON.parse(t);
}
async function waitIgReady(id) {
  for (let i = 0; i < 40; i++) {
    const r = await fetch(`${GRAPH}/${id}?fields=status_code&access_token=${env("META_PAGE_TOKEN")}`);
    const j = await r.json();
    if (j.status_code === "FINISHED") return;
    if (j.status_code === "ERROR") throw new Error(`Instagram a refusé le média : ${JSON.stringify(j)}`);
    await new Promise((s) => setTimeout(s, 10_000));
  }
  throw new Error("Instagram : média toujours en traitement après 6 min");
}
async function publishImage(imageUrl, message) {
  const fb = await graph(`/${env("FB_PAGE_ID")}/photos`, { url: imageUrl, message });
  const c = await graph(`/${env("IG_USER_ID")}/media`, { image_url: imageUrl, caption: message.slice(0, 2200) });
  await waitIgReady(c.id);
  const ig = await graph(`/${env("IG_USER_ID")}/media_publish`, { creation_id: c.id });
  return { fb: fb.post_id ?? fb.id, ig: ig.id };
}
async function publishReel(videoUrl, caption) {
  const c = await graph(`/${env("IG_USER_ID")}/media`, { media_type: "REELS", video_url: videoUrl, caption, share_to_feed: "true" });
  await waitIgReady(c.id);
  const ig = await graph(`/${env("IG_USER_ID")}/media_publish`, { creation_id: c.id });
  const fb = await graph(`/${env("FB_PAGE_ID")}/videos`, { file_url: videoUrl, description: caption });
  return { fb: fb.id, ig: ig.id };
}

// ---------- Vidéo (diaporama + voix off) ----------
// Les images de chaque scène sont gardées : l'admin peut corriger la voix off dans le Studio et remonter la vidéo.
async function makeVideo(slot, kind, scenes) {
  const voice = await loadVoiceConfig(sb);
  const saved = [];
  for (let i = 0; i < scenes.length; i++) {
    const img = await image(scenes[i].image_prompt, "1024x1536");
    const image_url = await upload(`${slot}/${kind}-s${i}.png`, img, "image/png");
    saved.push({ voiceover: scenes[i].voiceover, image_prompt: scenes[i].image_prompt, image_url, image: img });
  }
  const buf = await buildVideo(saved, { openaiRaw: (p, b) => openai(p, b, true), voice });
  return { buf, scenes: saved.map(({ image, ...rest }) => rest) };
}

// ---------- Alerte admin ----------
async function notifyAdmins(title, message) {
  const { data: admins } = await sb.from("admins").select("user_id");
  if (!admins?.length) return;
  const { error } = await sb.from("notifications").insert(admins.map((a) => ({ user_id: a.user_id, user_type: "admin", title, message: message.slice(0, 900), type: "system", read: false })));
  if (error) console.warn("Notification admin :", error.message);
}

// ---------- Tâches ----------
async function claim(slot, kind, audience) {
  const { data: existing } = await sb.from("marketing_posts").select("id,status").eq("slot_date", slot).eq("kind", kind).maybeSingle();
  if (existing?.status === "published") { console.log(`${kind} du ${slot} déjà publié, rien à faire.`); return null; }
  if (existing) return existing.id;
  const { data, error } = await sb.from("marketing_posts").insert({ slot_date: slot, kind, audience }).select("id").single();
  if (error) throw new Error(`Base : ${error.message}`);
  return data.id;
}

async function doArticle(slot, kind, audience) {
  const id = await claim(slot, kind, audience); if (!id) return;
  const { data: past } = await sb.from("marketing_posts").select("topic").eq("audience", audience).not("topic", "is", null).order("created_at", { ascending: false }).limit(30);
  const r = await research(audience, (past ?? []).map((p) => p.topic));
  const a = await writeArticle(audience, r.notes);
  if (!a.article.includes(SITE)) a.article += `\n\n👉 ${SITE}`;
  const url = await upload(`${slot}/${kind}.png`, await image(a.image_prompt, "1024x1024"), "image/png");
  await sb.from("marketing_posts").update({ topic: a.topic, title: a.title, body: a.article, sources: r.sources, image_urls: [url] }).eq("id", id);
  const message = `${a.title}\n\n${a.article}`;
  const p = await publishImage(url, message);
  await sb.from("marketing_posts").update({ status: "published", fb_post_id: p.fb, ig_media_id: p.ig, published_at: new Date().toISOString(), error: null }).eq("id", id);
  console.log(`Publié : ${a.title}`);
}

async function doVideo(slot, kind, audience) {
  const { data: src } = await sb.from("marketing_posts").select("id,title,body").eq("audience", audience).like("kind", "article_%").eq("status", "published").order("published_at", { ascending: false }).limit(1).maybeSingle();
  if (!src) { console.log(`Pas encore d'article ${audience} publié : vidéo reportée.`); return; }
  const id = await claim(slot, kind, audience); if (!id) return;
  const s = await writeVideoScript(src);
  let caption = s.caption.includes(SITE) ? s.caption : `${s.caption}\n\n👉 ${SITE}`;
  const v = await makeVideo(slot, kind, s.scenes);
  const url = await upload(`${slot}/${kind}.mp4`, v.buf, "video/mp4");
  await sb.from("marketing_posts").update({ title: src.title, body: caption, video_script: s.scenes.map((x) => x.voiceover).join("\n"), video_scenes: v.scenes, video_url: url, source_post_id: src.id }).eq("id", id);
  const p = await publishReel(url, caption);
  await sb.from("marketing_posts").update({ status: "published", fb_post_id: p.fb, ig_media_id: p.ig, published_at: new Date().toISOString(), error: null }).eq("id", id);
  console.log(`Reel publié à partir de : ${src.title}`);
}

const { date, weekday } = parisNow();
const tasks = process.env.FORCE_KIND ? [process.env.FORCE_KIND] : [PLAN[weekday], VIDEO[weekday]].filter(Boolean);
let failed = false;
for (const kind of tasks) {
  const audience = kind.endsWith("client") ? "client" : "mover";
  try {
    if (kind.startsWith("article")) await doArticle(date, kind, audience);
    else await doVideo(date, kind, audience);
  } catch (e) {
    failed = true;
    const msg = String(e?.message ?? e);
    console.error(kind, msg);
    await sb.from("marketing_posts").update({ status: "failed", error: msg.slice(0, 2000) }).eq("slot_date", date).eq("kind", kind);
    await notifyAdmins("Agent marketing : publication échouée", `${kind} du ${date} : ${msg}`);
    if (/Meta .*\[(400|401|403)\]/.test(msg) && /OAuth|token|permission/i.test(msg)) break; // jeton Meta invalide : on arrête la journée
  }
}
process.exit(failed ? 1 : 0);
