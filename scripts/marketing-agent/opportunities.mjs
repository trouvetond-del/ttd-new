// Agent « Déménagements disponibles » — publie sur Facebook + Instagram chaque demande de devis
// encore valide (date non dépassée, pas acceptée/terminée) pour attirer de nouveaux déménageurs.
// CONFIDENTIALITÉ : seuls la ville de départ, la ville d'arrivée, la date, le volume et la distance
// sont utilisés. Jamais de nom, téléphone, email, adresse ni commentaire du client.
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { generateImage } from "./openai-image.mjs";

const SITE = "https://www.trouvetondemenageur.fr";
const GRAPH = "https://graph.facebook.com/v21.0";
const TEXT_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const MAX_PER_RUN = Number(process.env.MAX_PER_RUN || 3);
const env = (k) => { const v = process.env[k]; if (!v) throw new Error(`Secret manquant : ${k}`); return v; };
const sb = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false }, realtime: { transport: class NoRealtime {} } });

const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date());
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]));
const titleCase = (s) => String(s || "").trim().toLowerCase().replace(/(^|[\s'-])\p{L}/gu, (m) => m.toUpperCase());
const frDate = (d) => new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));
const daysUntil = (d) => Math.round((new Date(`${d}T12:00:00Z`) - new Date(`${today}T12:00:00Z`)) / 86400000);

// ---------- Géographie ----------
async function geocode(city, postcode) {
  const u = new URL("https://api-adresse.data.gouv.fr/search/");
  u.searchParams.set("q", city); u.searchParams.set("type", "municipality"); u.searchParams.set("limit", "1");
  if (/^\d{5}$/.test(postcode || "")) u.searchParams.set("postcode", postcode);
  const j = await (await fetch(u)).json();
  const f = j.features?.[0];
  if (!f) return null;
  return { lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], name: f.properties.city || f.properties.name };
}
async function roadKm(a, b) {
  try {
    const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${a.lon},${a.lat};${b.lon},${b.lat}?overview=false`);
    const j = await r.json();
    if (j.routes?.[0]) return { km: Math.round(j.routes[0].distance / 1000), approx: false };
  } catch { /* repli ci-dessous */ }
  const R = 6371, t = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * t) / 2) ** 2 + Math.cos(a.lat * t) * Math.cos(b.lat * t) * Math.sin(((b.lon - a.lon) * t) / 2) ** 2;
  return { km: Math.round(2 * R * Math.asin(Math.sqrt(h)) * 1.3), approx: true };
}

let franceCache;
async function franceShape() {
  if (franceCache) return franceCache;
  const r = await fetch("https://raw.githubusercontent.com/gregoiredavid/france-geojson/master/metropole-version-simplifiee.geojson");
  franceCache = await r.json();
  return franceCache;
}

// ---------- Visuels ----------
const W = 1080, H = 1080;
const BLUE = "#3B82F6", GREEN = "#10B981", NAVY = "#0B1B3A";

function bannerSvg(o) {
  const last = o.lastMinute ? `<rect x="60" y="60" rx="22" width="380" height="64" fill="#F43F5E"/><text x="250" y="103" font-size="32" font-weight="700" fill="#fff" text-anchor="middle" font-family="DejaVu Sans">DERNIÈRE MINUTE</text>` : "";
  return `${last}
  <rect x="0" y="${H - 300}" width="${W}" height="300" fill="${NAVY}" opacity="0.92"/>
  <text x="60" y="${H - 225}" font-size="34" font-weight="700" fill="${GREEN}" font-family="DejaVu Sans">${esc(o.headline.toUpperCase())}</text>
  <text x="60" y="${H - 160}" font-size="${o.route.length > 30 ? 44 : 54}" font-weight="700" fill="#fff" font-family="DejaVu Sans">${esc(o.route)}</text>
  <text x="60" y="${H - 105}" font-size="32" fill="#CBD5E1" font-family="DejaVu Sans">${esc(o.details)}</text>
  <text x="60" y="${H - 50}" font-size="30" font-weight="700" fill="${BLUE}" font-family="DejaVu Sans">Inscription gratuite · ${SITE}</text>`;
}

async function mapImage(a, b, o) {
  const geo = await franceShape();
  const minLon = -5.3, maxLon = 9.7, minLat = 41.2, maxLat = 51.2;
  const k = Math.cos((46.5 * Math.PI) / 180);
  const mapH = H - 320, scale = Math.min((W - 120) / ((maxLon - minLon) * k), (mapH - 60) / (maxLat - minLat));
  const ox = (W - (maxLon - minLon) * k * scale) / 2, oy = 30;
  const P = (lon, lat) => [ox + (lon - minLon) * k * scale, oy + (maxLat - lat) * scale];
  const rings = [];
  for (const f of geo.features ?? [geo]) {
    const g = f.geometry ?? f;
    const polys = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
    for (const poly of polys) for (const ring of poly) rings.push("M" + ring.map(([x, y]) => P(x, y).map((n) => n.toFixed(1)).join(",")).join("L") + "Z");
  }
  const [x1, y1] = P(a.lon, a.lat), [x2, y2] = P(b.lon, b.lat);
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2 - Math.max(40, Math.hypot(x2 - x1, y2 - y1) * 0.25);
  const label = (x, y, t) => `<text x="${x}" y="${y - 26}" font-size="30" font-weight="700" fill="#fff" stroke="${NAVY}" stroke-width="6" paint-order="stroke" text-anchor="middle" font-family="DejaVu Sans">${esc(t)}</text>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0F2557"/><stop offset="1" stop-color="#0A3B4A"/></linearGradient></defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <path d="${rings.join("")}" fill="#1E3A8A" stroke="#60A5FA" stroke-width="2" opacity="0.9"/>
  <path d="M${x1},${y1} Q${mx},${my} ${x2},${y2}" fill="none" stroke="${GREEN}" stroke-width="8" stroke-dasharray="18 12" stroke-linecap="round"/>
  <circle cx="${x1}" cy="${y1}" r="14" fill="${BLUE}" stroke="#fff" stroke-width="4"/>
  <circle cx="${x2}" cy="${y2}" r="14" fill="${GREEN}" stroke="#fff" stroke-width="4"/>
  ${label(x1, y1, a.name)}${a.name === b.name ? "" : label(x2, y2, b.name)}
  ${bannerSvg(o)}</svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer();
}

async function openai(path, body) {
  const r = await fetch(`https://api.openai.com/v1${path}`, { method: "POST", headers: { Authorization: `Bearer ${env("OPENAI_API_KEY")}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`OpenAI ${path} [${r.status}] ${await r.text()}`);
  return r.json();
}
const outputText = (j) => j.output_text ?? j.output?.flatMap((o) => o.content ?? []).filter((c) => c.type === "output_text").map((c) => c.text).join("\n") ?? "";

const PHOTO_SCENES = [
  "a professional moving truck driving on a French motorway at golden hour, seen from the side",
  "two professional movers in work uniforms loading a moving truck in a French street",
  "an empty moving truck cargo area with straps and moving blankets, back doors open",
  "a moving truck parked in front of a French apartment building, early morning",
];
async function photoImage(o, seed) {
  const bg = await sharp(await generateImage(`${PHOTO_SCENES[seed % PHOTO_SCENES.length]}. Realistic photo, natural light. Leave the bottom third calm and simple. Absolutely no text, letters, logos or watermarks.`, "1024x1024")).resize(W, H).toBuffer();
  const overlay = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${bannerSvg(o)}</svg>`);
  return sharp(bg).composite([{ input: overlay }]).jpeg({ quality: 90 }).toBuffer();
}

// ---------- Texte ----------
async function writePost(f) {
  const schema = { type: "object", additionalProperties: false, required: ["text"], properties: { text: { type: "string" } } };
  const j = await openai("/responses", {
    model: TEXT_MODEL,
    input: [
      { role: "system", content: `Tu écris des posts Facebook/Instagram très courts pour TrouveTonDemenageur, plateforme qui met en relation des clients avec des déménageurs professionnels vérifiés (KBIS, RC Pro, URSSAF). Cible : DÉMÉNAGEURS et transporteurs pros. N'utilise QUE les informations fournies ; n'invente aucun prix, chiffre, nom ou avis. Aucune info personnelle du client. Écris le site exactement « ${SITE} ».` },
      { role: "user", content: `Angle : ${f.headline}.\nTrajet : ${f.from} → ${f.to}\nDate : ${f.date}${f.lastMinute ? " (dernière minute)" : ""}\n${f.volume ? `Volume : ${f.volume} m³\n` : ""}Distance : ${f.distance}\n
Écris 300 à 450 caractères maximum : 1 ligne titre avec un emoji (« ${f.headline} »), les infos du trajet sur 2-3 lignes courtes, 1 phrase qui donne envie (${f.angle}), puis « Inscription gratuite, vous envoyez votre devis 👉 ${SITE} », puis 4 hashtags dont un avec la ville de départ.` },
    ],
    text: { format: { type: "json_schema", name: "post", strict: true, schema } },
  });
  let t = JSON.parse(outputText(j)).text.trim();
  if (!t.includes("trouvetondemenageur.fr")) t += `\n\nInscription gratuite 👉 ${SITE}`;
  return t;
}

// ---------- Meta ----------
async function graph(path, params) {
  const r = await fetch(`${GRAPH}${path}`, { method: "POST", body: new URLSearchParams({ ...params, access_token: env("META_PAGE_TOKEN") }) });
  const t = await r.text();
  if (!r.ok) throw new Error(`Meta ${path} [${r.status}] ${t}`);
  return JSON.parse(t);
}
async function publish(imageUrl, message) {
  const fb = await graph(`/${env("FB_PAGE_ID")}/photos`, { url: imageUrl, message });
  const c = await graph(`/${env("IG_USER_ID")}/media`, { image_url: imageUrl, caption: message.replace(/(?<!https:\/\/)www\.trouvetondemenageur\.fr/g, "https://www.trouvetondemenageur.fr").slice(0, 2200) });
  for (let i = 0; i < 30; i++) {
    const s = await (await fetch(`${GRAPH}/${c.id}?fields=status_code&access_token=${env("META_PAGE_TOKEN")}`)).json();
    if (s.status_code === "FINISHED") break;
    if (s.status_code === "ERROR") throw new Error(`Instagram a refusé l'image : ${JSON.stringify(s)}`);
    await new Promise((r) => setTimeout(r, 5000));
  }
  const ig = await graph(`/${env("IG_USER_ID")}/media_publish`, { creation_id: c.id });
  return { fb: fb.post_id ?? fb.id, ig: ig.id };
}

async function notifyAdmins(title, message) {
  const { data: admins } = await sb.from("admins").select("user_id");
  if (!admins?.length) return;
  await sb.from("notifications").insert(admins.map((a) => ({ user_id: a.user_id, user_type: "admin", title, message: message.slice(0, 900), type: "system", read: false })));
}

// ---------- Boucle ----------
const { data: done } = await sb.from("marketing_opportunity_posts").select("quote_request_id,status,attempts");
const skip = new Set((done ?? []).filter((d) => d.status === "published" || d.attempts >= 3).map((d) => d.quote_request_id));
const { count: publishedCount } = await sb.from("marketing_opportunity_posts").select("id", { count: "exact", head: true }).eq("status", "published");

const { data: reqs, error } = await sb.from("quote_requests")
  .select("id,from_city,from_postal_code,to_city,to_postal_code,moving_date,volume_m3,status")
  .in("status", ["new", "assigned", "quoted"]).gte("moving_date", today).order("moving_date", { ascending: true }).limit(200);
if (error) throw new Error(`Base : ${error.message}`);

let n = 0, idx = publishedCount ?? 0, failed = false;
for (const q of reqs ?? []) {
  if (n >= MAX_PER_RUN) break;
  if (skip.has(q.id) || !q.from_city || !q.to_city) continue;
  n++;
  try {
    const a = (await geocode(q.from_city, q.from_postal_code)) ?? null;
    const b = (await geocode(q.to_city, q.to_postal_code)) ?? null;
    const fromName = a?.name ?? titleCase(q.from_city), toName = b?.name ?? titleCase(q.to_city);
    const dist = a && b ? await roadKm(a, b) : null;
    const distance = dist ? `${dist.approx ? "≈ " : ""}${dist.km} km` : "à calculer";
    const vol = q.volume_m3 ? Math.round(Number(q.volume_m3)) : null;
    const lastMinute = daysUntil(q.moving_date) <= 7;
    const returnAngle = idx % 2 === 1;
    const headline = returnAngle ? "Évitez les retours à vide" : "Déménagement disponible";
    const o = { headline, lastMinute, route: `${fromName} → ${toName}`, details: [frDate(q.moving_date), vol ? `${vol} m³` : null, dist ? distance : null].filter(Boolean).join(" · ") };
    const img = idx % 2 === 0 && a && b ? await mapImage(a, b, o) : await photoImage(o, idx);
    const path = `opportunites/${q.id}.jpg`;
    const { error: upErr } = await sb.storage.from("marketing-media").upload(path, img, { contentType: "image/jpeg", upsert: true });
    if (upErr) throw new Error(`Stockage : ${upErr.message}`);
    const url = sb.storage.from("marketing-media").getPublicUrl(path).data.publicUrl;
    const text = await writePost({ headline, lastMinute, from: fromName, to: toName, date: frDate(q.moving_date), volume: vol, distance,
      angle: returnAngle ? "un camion qui rentre à vide, c'est de l'argent perdu : ce trajet peut remplir votre retour" : "une demande réelle, déjà détaillée par le client (adresses, étages, volume) pour un devis juste" });
    const p = await publish(url, text);
    await sb.from("marketing_opportunity_posts").upsert({ quote_request_id: q.id, status: "published", body: text, image_url: url, fb_post_id: p.fb, ig_media_id: p.ig, published_at: new Date().toISOString(), error: null }, { onConflict: "quote_request_id" });
    console.log(`Publié : ${o.route}`);
    idx++;
  } catch (e) {
    failed = true;
    const msg = String(e?.message ?? e);
    console.error(q.id, msg);
    const prev = (done ?? []).find((d) => d.quote_request_id === q.id);
    await sb.from("marketing_opportunity_posts").upsert({ quote_request_id: q.id, status: "failed", error: msg.slice(0, 2000), attempts: (prev?.attempts ?? 0) + 1 }, { onConflict: "quote_request_id" });
    await notifyAdmins("Agent « Déménagements disponibles » : publication échouée", msg);
    if (/Meta .*\[(400|401|403)\]/.test(msg) && /OAuth|token|permission/i.test(msg)) break;
  }
}
console.log(`${n} demande(s) traitée(s).`);
process.exit(failed ? 1 : 0);
