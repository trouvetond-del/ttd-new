// Studio Social Media : exécute les actions demandées par l'admin (publier, republier, modifier le texte,
// refaire la voix off, supprimer) puis met à jour les statistiques Facebook / Instagram.
// Lancé toutes les 30 min, à la suite de la modération des commentaires.
import { createClient } from "@supabase/supabase-js";
import { buildVideo, loadVoiceConfig } from "./media.mjs";
import { generateImage } from "./openai-image.mjs";

const GRAPH = "https://graph.facebook.com/v21.0";
const env = (k) => { const v = process.env[k]; if (!v) throw new Error(`Secret manquant : ${k}`); return v; };
const sb = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false }, realtime: { transport: class NoRealtime {} } });
const TOKEN = env("META_PAGE_TOKEN"), PAGE = env("FB_PAGE_ID");

async function meta(method, path, params = {}) {
  const u = new URL(`${GRAPH}${path}`);
  const init = { method };
  if (method === "GET" || method === "DELETE") { for (const [k, v] of Object.entries({ ...params, access_token: TOKEN })) u.searchParams.set(k, v); }
  else init.body = new URLSearchParams({ ...params, access_token: TOKEN });
  const r = await fetch(u, init); const t = await r.text();
  if (!r.ok) throw new Error(`Meta ${method} ${path} [${r.status}] ${t.slice(0, 500)}`);
  return JSON.parse(t);
}
let IG = process.env.IG_USER_ID;
try { IG = (await meta("GET", `/${PAGE}`, { fields: "instagram_business_account" })).instagram_business_account?.id || IG; } catch {}

async function openaiRaw(path, body) {
  const r = await fetch(`https://api.openai.com/v1${path}`, { method: "POST", headers: { Authorization: `Bearer ${env("OPENAI_API_KEY")}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`OpenAI ${path} [${r.status}] ${await r.text()}`);
  return Buffer.from(await r.arrayBuffer());
}
async function genImage(prompt) {
  return generateImage(`${prompt}. Realistic photo, vertical, no text, no logo.`, "1024x1536");
}
async function upload(path, buf, contentType) {
  const { error } = await sb.storage.from("marketing-media").upload(path, buf, { contentType, upsert: true });
  if (error) throw new Error(`Stockage : ${error.message}`);
  return sb.storage.from("marketing-media").getPublicUrl(path).data.publicUrl;
}
async function waitIg(id) {
  for (let i = 0; i < 40; i++) {
    const j = await meta("GET", `/${id}`, { fields: "status_code" });
    if (j.status_code === "FINISHED") return;
    if (j.status_code === "ERROR") throw new Error(`Instagram a refusé le média : ${JSON.stringify(j)}`);
    await new Promise((s) => setTimeout(s, 10_000));
  }
  throw new Error("Instagram : média toujours en traitement après 6 min");
}

// ---------- Lecture d'un post (agent, import ou opportunité) ----------
async function loadTarget(table, id) {
  const { data, error } = await sb.from(table).select("*").eq("id", id).single();
  if (error) throw new Error(`Post introuvable : ${error.message}`);
  const fix = (m) => (m ?? "").replace(/(?<!https:\/\/)www\.trouvetondemenageur\.fr/g, "https://www.trouvetondemenageur.fr");
  if (table === "marketing_opportunity_posts") return { row: data, message: fix(data.body), image: data.image_url, video: null };
  const isArticle = data.kind.startsWith("article_");
  return { row: data, message: fix(isArticle && data.title ? `${data.title}\n\n${data.body ?? ""}` : data.body), image: data.image_urls?.[0] ?? null, video: data.video_url };
}

async function recordPub(table, id, platform, media_type, external_id) {
  let permalink = null;
  try { permalink = (await meta("GET", `/${external_id}`, { fields: platform === "instagram" ? "permalink" : (media_type === "video" ? "permalink_url" : "permalink_url") })).permalink ?? null; } catch {}
  try { if (!permalink && platform === "facebook") permalink = (await meta("GET", `/${external_id}`, { fields: "permalink_url" })).permalink_url ?? null; } catch {}
  await sb.from("social_publications").upsert({ target_table: table, target_id: id, platform, media_type, external_id, permalink }, { onConflict: "platform,external_id" });
}

async function publish(job) {
  const t = await loadTarget(job.target_table, job.target_id);
  if (!t.video && !t.image) throw new Error("Ce post n'a ni photo ni vidéo.");
  const platforms = job.platforms?.length ? job.platforms : ["facebook", "instagram"];
  const out = {}; const done = [];
  for (const p of platforms) {
    if (p === "facebook") {
      const r = t.video ? await meta("POST", `/${PAGE}/videos`, { file_url: t.video, description: t.message })
                        : await meta("POST", `/${PAGE}/photos`, { url: t.image, message: t.message });
      out.fb_post_id = r.post_id ?? r.id;
      await recordPub(job.target_table, job.target_id, "facebook", t.video ? "video" : "image", out.fb_post_id);
      done.push("Facebook");
    } else if (p === "instagram") {
      const c = t.video ? await meta("POST", `/${IG}/media`, { media_type: "REELS", video_url: t.video, caption: t.message.slice(0, 2200), share_to_feed: "true" })
                        : await meta("POST", `/${IG}/media`, { image_url: t.image, caption: t.message.slice(0, 2200) });
      await waitIg(c.id);
      out.ig_media_id = (await meta("POST", `/${IG}/media_publish`, { creation_id: c.id })).id;
      await recordPub(job.target_table, job.target_id, "instagram", t.video ? "video" : "image", out.ig_media_id);
      done.push("Instagram");
    }
  }
  await sb.from(job.target_table).update({ ...out, status: "published", published_at: new Date().toISOString(), error: null }).eq("id", job.target_id);
  return `Publié sur ${done.join(" et ")}.`;
}

async function updateText(job) {
  // le texte est déjà enregistré par l'admin ; on met à jour le post Facebook existant.
  const t = await loadTarget(job.target_table, job.target_id);
  const { data: pubs } = await sb.from("social_publications").select("external_id,media_type").eq("target_table", job.target_table).eq("target_id", job.target_id).eq("platform", "facebook").is("deleted_at", null);
  const fbIds = new Set((pubs ?? []).filter((p) => p.media_type !== "video").map((p) => p.external_id));
  if (t.row.fb_post_id && !t.video) fbIds.add(t.row.fb_post_id);
  let ok = 0;
  for (const id of fbIds) { await meta("POST", `/${id}`, { message: t.message }); ok++; }
  return `${ok} post(s) Facebook modifié(s). Instagram ne permet pas de modifier une légende : republiez si besoin.`;
}

async function rerender(job) {
  const { row } = await loadTarget("marketing_posts", job.target_id);
  const scenes = job.payload?.scenes ?? row.video_scenes;
  if (!scenes?.length) throw new Error("Aucune scène à monter.");
  const voice = await loadVoiceConfig(sb);
  const stamp = Date.now();
  const full = [];
  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i];
    let img;
    if (s.image_url) { const r = await fetch(s.image_url); if (r.ok) img = Buffer.from(await r.arrayBuffer()); }
    let image_url = s.image_url;
    if (!img) { img = await genImage(s.image_prompt || s.voiceover); image_url = await upload(`studio/${row.id}/${stamp}-s${i}.png`, img, "image/png"); }
    full.push({ voiceover: s.voiceover, image_prompt: s.image_prompt ?? null, image_url, image: img });
  }
  const url = await upload(`studio/${row.id}/${stamp}.mp4`, await buildVideo(full, { openaiRaw, voice }), "video/mp4");
  await sb.from("marketing_posts").update({ video_url: url, video_scenes: full.map(({ image, ...r }) => r), video_script: full.map((s) => s.voiceover).join("\n"), updated_at: new Date().toISOString() }).eq("id", row.id);
  if (job.platforms?.length) return `Vidéo refaite. ${await publish(job)}`;
  return "Vidéo refaite avec la nouvelle voix off (pas encore republiée).";
}

async function remove(job) {
  const { data: pubs } = await sb.from("social_publications").select("*").eq("target_table", job.target_table).eq("target_id", job.target_id).is("deleted_at", null);
  const wanted = job.platforms?.length ? job.platforms : ["facebook", "instagram"];
  const notes = [];
  for (const p of pubs ?? []) {
    if (!wanted.includes(p.platform)) continue;
    if (p.platform === "facebook") { await meta("DELETE", `/${p.external_id}`); await sb.from("social_publications").update({ deleted_at: new Date().toISOString() }).eq("id", p.id); notes.push("Facebook supprimé"); }
    else notes.push("Instagram : à supprimer depuis l'appli Instagram (Meta ne le permet pas automatiquement)");
  }
  await sb.from(job.target_table).update({ status: "archived" }).eq("id", job.target_id);
  return notes.length ? notes.join(" · ") : "Post archivé.";
}

// ---------- Statistiques ----------
const num = (x) => (typeof x === "number" ? x : null);
async function fbStats(p) {
  const s = {};
  const base = await meta("GET", `/${p.external_id}`, { fields: p.media_type === "video" ? "likes.summary(true).limit(0),comments.summary(true).limit(0)" : "reactions.summary(true).limit(0),comments.summary(true).limit(0),shares" });
  s.likes = base.reactions?.summary?.total_count ?? base.likes?.summary?.total_count ?? null;
  s.comments = base.comments?.summary?.total_count ?? null;
  s.shares = base.shares?.count ?? 0;
  const metrics = p.media_type === "video" ? ["total_video_views"] : ["post_media_view", "post_clicks"];
  for (const m of metrics) {
    try {
      const r = await meta("GET", p.media_type === "video" ? `/${p.external_id}/video_insights` : `/${p.external_id}/insights`, { metric: m });
      const v = r.data?.[0]?.values?.[0]?.value;
      if (m === "post_clicks") s.clicks = num(v); else s.views = num(v);
    } catch {}
  }
  return s;
}
async function igStats(p) {
  const base = await meta("GET", `/${p.external_id}`, { fields: "like_count,comments_count,permalink" });
  const s = { likes: num(base.like_count), comments: num(base.comments_count) };
  try {
    const r = await meta("GET", `/${p.external_id}/insights`, { metric: "views,reach,shares,saved" });
    for (const d of r.data ?? []) {
      const v = d.values?.[0]?.value ?? d.total_value?.value;
      if (d.name === "views") s.views = num(v); if (d.name === "shares") s.shares = num(v); if (d.name === "saved") s.saves = num(v);
    }
  } catch (e) { s.stats_error = "Vues Instagram indisponibles : autorisation instagram_manage_insights manquante"; }
  return s;
}

async function backfill() {
  for (const table of ["marketing_posts", "marketing_opportunity_posts"]) {
    const { data } = await sb.from(table).select(table === "marketing_posts" ? "id,fb_post_id,ig_media_id,video_url,published_at" : "id,fb_post_id,ig_media_id,published_at").eq("status", "published").limit(500);
    for (const r of data ?? []) for (const [platform, ext] of [["facebook", r.fb_post_id], ["instagram", r.ig_media_id]]) {
      if (!ext) continue;
      await sb.from("social_publications").upsert({ target_table: table, target_id: r.id, platform, media_type: r.video_url ? "video" : "image", external_id: ext, published_at: r.published_at ?? new Date().toISOString() }, { onConflict: "platform,external_id", ignoreDuplicates: true });
    }
  }
}

async function refreshStats(force) {
  const since = new Date(Date.now() - 90 * 864e5).toISOString();
  const stale = new Date(Date.now() - 3 * 3600e3).toISOString();
  let q = sb.from("social_publications").select("*").is("deleted_at", null).gte("published_at", since).limit(200);
  if (!force) q = q.or(`stats_at.is.null,stats_at.lt.${stale}`);
  const { data } = await q;
  let n = 0;
  for (const p of data ?? []) {
    try {
      const s = p.platform === "facebook" ? await fbStats(p) : await igStats(p);
      await sb.from("social_publications").update({ ...s, stats_error: s.stats_error ?? null, stats_at: new Date().toISOString() }).eq("id", p.id);
      n++;
    } catch (e) { await sb.from("social_publications").update({ stats_error: String(e.message).slice(0, 500), stats_at: new Date().toISOString() }).eq("id", p.id); }
  }
  return `${n} statistique(s) mise(s) à jour.`;
}

// ---------- Boucle ----------
await import("./import-share-pack.mjs").catch((e) => console.error("Import À partager :", e.message));
await backfill().catch((e) => console.error("Backfill :", e.message));
const { data: jobs } = await sb.from("social_jobs").select("*").eq("status", "queued").order("created_at").limit(10);
let forceStats = false;
for (const job of jobs ?? []) {
  await sb.from("social_jobs").update({ status: "running" }).eq("id", job.id);
  try {
    const result = job.action === "publish" ? await publish(job)
      : job.action === "update_text" ? await updateText(job)
      : job.action === "rerender_video" ? await rerender(job)
      : job.action === "delete" ? await remove(job)
      : (forceStats = true, "Statistiques actualisées.");
    await sb.from("social_jobs").update({ status: "done", result, done_at: new Date().toISOString() }).eq("id", job.id);
    console.log(`Studio ${job.action} : ${result}`);
  } catch (e) {
    const msg = String(e?.message ?? e).slice(0, 2000);
    console.error(`Studio ${job.action} :`, msg);
    await sb.from("social_jobs").update({ status: "failed", error: msg, done_at: new Date().toISOString() }).eq("id", job.id);
  }
}
console.log(await refreshStats(forceStats));
