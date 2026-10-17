// Agent modération des commentaires Facebook + Instagram.
// Supprime les commentaires qui contiennent un téléphone, un email, un lien externe ou de la publicité
// (ex. un déménageur qui veut capter les clients hors plateforme) et alerte l'admin.
import { createClient } from "@supabase/supabase-js";

const GRAPH = "https://graph.facebook.com/v21.0";
const TEXT_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const env = (k) => { const v = process.env[k]; if (!v) throw new Error(`Secret manquant : ${k}`); return v; };
const sb = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false }, realtime: { transport: class NoRealtime {} } });
const TOKEN = env("META_PAGE_TOKEN"), PAGE = env("FB_PAGE_ID"), IG = env("IG_USER_ID");

const PHONE = /(?:\+|00)\s*33[\s.\-]*[1-9](?:[\s.\-]*\d){8}|\b0[1-9](?:[\s.\-]*\d){8}\b|(?:\d[\s.\-]?){10,}/;
const EMAIL = /[\w.+-]+\s*(?:@|\(at\)|\[at\]| arobase )\s*[\w-]+\s*(?:\.|\(dot\)| point )\s*[a-z]{2,}/i;
const LINK = /(https?:\/\/|www\.|\b[\w-]+\.(?:fr|com|net|org|io|be|eu)\b)/i;
const CONTACT = /\b(whatsapp|wa\.me|telegram|snap|appelez[- ]moi|contactez[- ]moi|écrivez[- ]moi|en mp|en privé|inbox|dm moi)\b/i;

function ruleCheck(text) {
  const t = text.replace(/trouvetondemenageur\.fr/gi, "");
  if (PHONE.test(t)) return "numéro de téléphone";
  if (EMAIL.test(t)) return "adresse email";
  if (LINK.test(t)) return "lien vers un autre site";
  if (CONTACT.test(t)) return "demande de contact hors plateforme";
  return null;
}
async function aiCheck(text) {
  const r = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { Authorization: `Bearer ${env("OPENAI_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: TEXT_MODEL,
      input: `Commentaire sous un post d'une plateforme de déménagement :\n«${text}»\nEst-ce de la PUBLICITÉ ou du démarchage (une entreprise qui fait sa promo, propose ses services, cherche à capter les clients hors plateforme, spam) ? Une simple question, un avis ou une critique n'en est PAS. Réponds uniquement OUI ou NON.` }) });
  if (!r.ok) return null;
  const j = await r.json();
  const out = (j.output_text ?? j.output?.flatMap((o) => o.content ?? []).map((c) => c.text).join("") ?? "").trim().toUpperCase();
  return out.startsWith("OUI") ? "publicité / démarchage" : null;
}
async function get(path, params) {
  const u = new URL(`${GRAPH}${path}`);
  for (const [k, v] of Object.entries({ ...params, access_token: TOKEN })) u.searchParams.set(k, v);
  const r = await fetch(u); const t = await r.text();
  if (!r.ok) throw new Error(`Meta GET ${path} [${r.status}] ${t}`);
  return JSON.parse(t);
}
async function del(id) {
  const r = await fetch(`${GRAPH}/${id}?access_token=${TOKEN}`, { method: "DELETE" });
  if (!r.ok) throw new Error(`[${r.status}] ${await r.text()}`);
}
async function notifyAdmins(title, message) {
  const { data: admins } = await sb.from("admins").select("user_id");
  if (!admins?.length) return;
  await sb.from("notifications").insert(admins.map((a) => ({ user_id: a.user_id, user_type: "admin", title, message: message.slice(0, 900), type: "system", read: false })));
}

const comments = [];
try {
  const fb = await get(`/${PAGE}/feed`, { fields: "id,comments.limit(100){id,message,from,comments.limit(50){id,message,from}}", limit: "25" });
  for (const p of fb.data ?? []) for (const c of p.comments?.data ?? []) for (const x of [c, ...(c.comments?.data ?? [])])
    if (x.from?.id !== PAGE && x.message) comments.push({ platform: "facebook", id: x.id, text: x.message, author: x.from?.name ?? "inconnu" });
} catch (e) { console.error(e.message); await notifyAdmins("Modération : lecture Facebook impossible", e.message); }
try {
  const me = await get(`/${IG}`, { fields: "username" });
  const ig = await get(`/${IG}/media`, { fields: "id,comments.limit(100){id,text,username,replies{id,text,username}}", limit: "25" });
  for (const m of ig.data ?? []) for (const c of m.comments?.data ?? []) for (const x of [c, ...(c.replies?.data ?? [])])
    if (x.username !== me.username && x.text) comments.push({ platform: "instagram", id: x.id, text: x.text, author: x.username ?? "inconnu" });
} catch (e) { console.error(e.message); await notifyAdmins("Modération : lecture Instagram impossible", e.message); }

const ids = comments.map((c) => c.id);
const { data: seen } = ids.length ? await sb.from("social_comment_checks").select("comment_id").in("comment_id", ids) : { data: [] };
const seenSet = new Set((seen ?? []).map((s) => s.comment_id));

let removed = 0;
for (const c of comments) {
  if (seenSet.has(c.id)) continue;
  const reason = ruleCheck(c.text) ?? (await aiCheck(c.text));
  let action = "ok", error = null;
  if (reason) {
    try { await del(c.id); action = "deleted"; removed++; } catch (e) { action = "delete_failed"; error = String(e.message).slice(0, 1000); }
    await notifyAdmins(
      action === "deleted" ? `Commentaire supprimé sur ${c.platform}` : `⚠️ Commentaire à supprimer à la main sur ${c.platform}`,
      `Motif : ${reason}\nAuteur : ${c.author}\nCommentaire : « ${c.text.slice(0, 500)} »${error ? `\nErreur : ${error}` : ""}`);
  }
  await sb.from("social_comment_checks").upsert({ comment_id: c.id, platform: c.platform, author: c.author, text: c.text.slice(0, 2000), verdict: reason, action, error }, { onConflict: "comment_id" });
}
console.log(`${comments.length} commentaire(s) lu(s), ${removed} supprimé(s).`);
