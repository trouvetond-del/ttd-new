// Studio ← Machine d'acquisition : prend un script vidéo du lot du lundi, crée le Reel
// (photos + voix off) et le publie sur Facebook/Instagram. Mardi : client, vendredi : déménageur.
// Lille passe en premier, puis les autres villes du lot, une seule fois chacune par semaine.
import { createClient } from "@supabase/supabase-js";
import { buildVideo, loadVoiceConfig } from "./media.mjs";
import { generateImage } from "./openai-image.mjs";

const SITE = "https://www.trouvetondemenageur.fr";
const GRAPH = "https://graph.facebook.com/v21.0";
const env = (k) => { const v = process.env[k]; if (!v) throw new Error(`Secret manquant : ${k}`); return v; };
const sb = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false }, realtime: { transport: class NoRealtime {} } });

const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" }).formatToParts(new Date());
const g = (t) => parts.find((x) => x.type === t).value;
const today = `${g("year")}-${g("month")}-${g("day")}`;
const forced = process.env.FORCE_AUDIENCE;
const audience = forced === "mover" || forced === "client" ? forced : g("weekday") === "Fri" ? "mover" : "client";
const kind = audience === "client" ? "acq_video_client" : "acq_video_mover";

async function openaiRaw(path, body) {
  const r = await fetch(`https://api.openai.com/v1${path}`, { method: "POST", headers: { Authorization: `Bearer ${env("OPENAI_API_KEY")}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`OpenAI ${path} [${r.status}] ${await r.text()}`);
  return Buffer.from(await r.arrayBuffer());
}
async function upload(path, buf, contentType) {
  const { error } = await sb.storage.from("marketing-media").upload(path, buf, { contentType, upsert: true });
  if (error) throw new Error(`Stockage : ${error.message}`);
  return sb.storage.from("marketing-media").getPublicUrl(path).data.publicUrl;
}
async function graph(path, params) {
  const r = await fetch(`${GRAPH}${path}`, { method: "POST", body: new URLSearchParams({ ...params, access_token: env("META_PAGE_TOKEN") }) });
  const t = await r.text();
  if (!r.ok) throw new Error(`Meta ${path} [${r.status}] ${t}`);
  return JSON.parse(t);
}
async function publishReel(videoUrl, caption) {
  const c = await graph(`/${env("IG_USER_ID")}/media`, { media_type: "REELS", video_url: videoUrl, caption, share_to_feed: "true" });
  for (let i = 0; ; i++) {
    const j = await (await fetch(`${GRAPH}/${c.id}?fields=status_code&access_token=${env("META_PAGE_TOKEN")}`)).json();
    if (j.status_code === "FINISHED") break;
    if (j.status_code === "ERROR" || i > 40) throw new Error(`Instagram a refusé le média : ${JSON.stringify(j)}`);
    await new Promise((s) => setTimeout(s, 10_000));
  }
  const ig = await graph(`/${env("IG_USER_ID")}/media_publish`, { creation_id: c.id });
  const fb = await graph(`/${env("FB_PAGE_ID")}/videos`, { file_url: videoUrl, description: caption });
  return { fb: fb.id, ig: ig.id };
}
async function notifyAdmins(title, message) {
  const { data: admins } = await sb.from("admins").select("user_id");
  if (admins?.length) await sb.from("notifications").insert(admins.map((a) => ({ user_id: a.user_id, user_type: "admin", title, message: message.slice(0, 900), type: "system", read: false })));
}

const { data: lot } = await sb.from("acquisition_weekly").select("week_start,items").order("week_start", { ascending: false }).limit(1).maybeSingle();
if (!lot?.items?.length) { console.log("Aucun lot de la Machine d'acquisition : rien à publier."); process.exit(0); }
const { data: done } = await sb.from("marketing_posts").select("topic,status,slot_date").eq("kind", kind).gte("slot_date", lot.week_start);
if (done?.some((d) => d.slot_date === today && d.status === "published")) { console.log("Déjà publié aujourd'hui."); process.exit(0); }
const used = new Set((done ?? []).filter((d) => d.status === "published").map((d) => d.topic));
const items = [...lot.items].sort((a, b) => (b.city === "Lille") - (a.city === "Lille"));
const item = items.find((it) => !used.has(it.city));
if (!item) { console.log("Toutes les villes du lot ont déjà leur Reel cette semaine."); process.exit(0); }
const script = audience === "client" ? item.scriptClient : item.scriptMover;
const caption = `${script.caption}\n\n${script.hashtags.join(" ")}`.replace(/👉\s*https:\/\/www\.trouvetondemenageur\.fr/, `👉 ${SITE}`);

const { data: row, error } = await sb.from("marketing_posts").upsert({ slot_date: today, kind, audience, topic: item.city, title: script.title, body: caption, status: "pending", error: null }, { onConflict: "slot_date,kind" }).select("id").single();
if (error) throw new Error(`Base : ${error.message}`);

try {
  const voice = await loadVoiceConfig(sb);
  const scenes = [];
  for (let i = 0; i < script.rows.length; i++) {
    const r = script.rows[i];
    const prompt = `Vertical realistic photo for a French moving company social video, scene: ${r.visual}. City context: ${item.city}, France. Natural light, real people, credible everyday setting. Absolutely no text, letters, logos, screens with readable text or watermarks.`;
    const img = await generateImage(prompt, "1024x1536");
    const image_url = await upload(`${today}/${kind}-s${i}.png`, img, "image/png");
    scenes.push({ voiceover: r.audio.replace(SITE, "trouvetondemenageur point FR"), image_prompt: prompt, image_url, image: img });
  }
  const buf = await buildVideo(scenes, { openaiRaw, voice });
  const url = await upload(`${today}/${kind}.mp4`, buf, "video/mp4");
  await sb.from("marketing_posts").update({ video_url: url, video_script: scenes.map((s) => s.voiceover).join("\n"), video_scenes: scenes.map(({ image, ...s }) => s) }).eq("id", row.id);
  const p = await publishReel(url, caption);
  await sb.from("marketing_posts").update({ status: "published", fb_post_id: p.fb, ig_media_id: p.ig, published_at: new Date().toISOString() }).eq("id", row.id);
  console.log(`Reel Machine publié : ${script.title}`);
} catch (e) {
  const msg = String(e?.message ?? e);
  await sb.from("marketing_posts").update({ status: "failed", error: msg.slice(0, 2000) }).eq("id", row.id);
  await notifyAdmins("Studio : Reel de la Machine d'acquisition échoué", `${script.title} : ${msg}`);
  console.error(msg);
  process.exit(1);
}
