// Studio Social Media : discussion avec l'agent marketing (réservé aux admins).
// L'agent répond aux questions, crée des posts / vidéos et modifie des posts existants.
// Il ne publie JAMAIS : tout arrive en « À publier plus tard », l'admin valide.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { adminClient } from "../_shared/agent-utils.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const SITE = "https://www.trouvetondemenageur.fr";

const SYSTEM = `Tu es l'agent marketing de TrouveTonDéménageur (${SITE}), plateforme française qui met en relation clients (particuliers et pros) et déménageurs vérifiés (KBIS, assurance RC Pro, URSSAF). Atouts : devis comparables basés sur un formulaire complet (adresses, étages, cubage), paiement par acompte sécurisé, check-up photo avant/après et arbitrage par photos en cas de litige, inscription gratuite pour les déménageurs (missions près de chez eux, éviter les retours à vide).
Tu discutes avec l'administrateur dans le Studio Social Media. Réponds en français, court et concret.
Tu peux : répondre aux questions et donner des idées ; créer un post photo (create_post) ; créer une vidéo voix off de 20-22 s (create_video, 4 à 5 scènes, chaque scène = une phrase de voix off + une description de photo qui illustre EXACTEMENT ce que dit la phrase ; la dernière phrase de voix off doit dire « trouvetondemenageur point FR ») ; modifier un post existant (list_posts puis update_post) ; consulter les statistiques (get_stats).
Règles des textes de post : 400 à 600 caractères, phrases courtes, 1 accroche, 1 ou 2 emojis max, aucun chiffre ni statistique inventé, aucune personne citée, termine par "👉 ${SITE}" puis 3 à 5 hashtags.
Tu ne publies jamais toi-même : dis à l'admin que le post est rangé en « À publier plus tard » et qu'il peut le publier depuis « Tous les posts ».
Si la demande n'est pas claire, pose une question avant de créer.`;

const TOOLS = [
  { type: "function", function: { name: "list_posts", description: "Liste les 30 derniers posts du Studio (id, type, statut, titre, début du texte).", parameters: { type: "object", properties: {}, additionalProperties: false } } },
  { type: "function", function: { name: "get_stats", description: "Totaux des vues, clics, j'aime, commentaires et partages des publications Facebook/Instagram, et les 5 meilleures.", parameters: { type: "object", properties: {}, additionalProperties: false } } },
  { type: "function", function: { name: "create_post", description: "Crée un post photo en brouillon avec une image générée.", parameters: { type: "object", properties: {
    audience: { type: "string", enum: ["client", "mover", "all"] }, title: { type: "string", description: "Titre court" },
    body: { type: "string", description: "Texte complet du post" }, image_prompt: { type: "string", description: "Description en anglais de la photo réaliste à générer" },
  }, required: ["audience", "title", "body", "image_prompt"], additionalProperties: false } } },
  { type: "function", function: { name: "create_video", description: "Crée une vidéo voix off en brouillon ; elle est montée en 2 à 5 minutes.", parameters: { type: "object", properties: {
    audience: { type: "string", enum: ["client", "mover", "all"] }, title: { type: "string" }, body: { type: "string", description: "Légende du post" },
    scenes: { type: "array", items: { type: "object", properties: { voiceover: { type: "string" }, image_prompt: { type: "string", description: "Photo en anglais" } }, required: ["voiceover", "image_prompt"], additionalProperties: false } },
  }, required: ["audience", "title", "body", "scenes"], additionalProperties: false } } },
  { type: "function", function: { name: "update_post", description: "Modifie un post existant (texte, titre et/ou scènes de voix off de la vidéo, ce qui la remonte).", parameters: { type: "object", properties: {
    id: { type: "string" }, title: { type: ["string", "null"] }, body: { type: ["string", "null"] },
    scenes: { type: ["array", "null"], items: { type: "object", properties: { voiceover: { type: "string" }, image_prompt: { type: ["string", "null"] } }, required: ["voiceover", "image_prompt"], additionalProperties: false } },
  }, required: ["id", "title", "body", "scenes"], additionalProperties: false } } },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

  const sb = adminClient();
  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  const { data: { user } } = await sb.auth.getUser(token);
  if (!user) return json({ error: "Non connecté" }, 401);
  const { data: admin } = await sb.from("admins").select("id").eq("user_id", user.id).maybeSingle();
  if (!admin) return json({ error: "Réservé aux admins" }, 403);

  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) return json({ error: "Clé IA manquante" }, 500);
  const { messages } = await req.json().catch(() => ({}));
  const history = (Array.isArray(messages) ? messages : [])
    .filter((m: any) => (m?.role === "user" || m?.role === "assistant") && typeof m.content === "string")
    .slice(-30).map((m: any) => ({ role: m.role, content: m.content.slice(0, 6000) }));
  if (!history.length) return json({ error: "Message vide" }, 400);

  const created: { id: string; kind: string; title: string }[] = [];
  const fixLink = (t: string) => {
    let s = t.replace(/(?<!https:\/\/)www\.trouvetondemenageur\.fr/g, SITE);
    if (!s.includes("trouvetondemenageur.fr")) s += `\n\n👉 ${SITE}`;
    return s;
  };
  const cleanScenes = (sc: any[]) => sc.filter((s) => s && typeof s.voiceover === "string" && s.voiceover.trim())
    .slice(0, 6).map((s) => ({ voiceover: s.voiceover.trim(), image_prompt: s.image_prompt ?? null, image_url: null }));

  async function run(name: string, a: any): Promise<unknown> {
    if (name === "list_posts") {
      const { data } = await sb.from("marketing_posts").select("id,kind,status,title,body,created_at").order("created_at", { ascending: false }).limit(30);
      return (data ?? []).map((p) => ({ ...p, body: (p.body ?? "").slice(0, 160) }));
    }
    if (name === "get_stats") {
      const { data } = await sb.from("social_publications").select("platform,views,clicks,likes,comments,shares,permalink,target_id").is("deleted_at", null).limit(1000);
      const rows = data ?? []; const t = (k: string) => rows.reduce((s, r: any) => s + (r[k] ?? 0), 0);
      return { publications: rows.length, vues: t("views"), clics: t("clicks"), jaime: t("likes"), commentaires: t("comments"), partages: t("shares"),
        top: [...rows].sort((x: any, y: any) => (y.views ?? 0) - (x.views ?? 0)).slice(0, 5) };
    }
    if (name === "create_post") {
      const r = await fetch("https://api.openai.com/v1/images/generations", { method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "gpt-image-1", prompt: `${a.image_prompt}. Realistic photo, no text, no logo.`, size: "1024x1024" }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d?.data?.[0]?.b64_json) return { error: `Image impossible : ${d?.error?.message ?? r.status}` };
      const bytes = Uint8Array.from(atob(d.data[0].b64_json), (c) => c.charCodeAt(0));
      const path = `studio/agent/${Date.now()}.png`;
      const up = await sb.storage.from("marketing-media").upload(path, bytes, { contentType: "image/png" });
      if (up.error) return { error: up.error.message };
      const url = sb.storage.from("marketing-media").getPublicUrl(path).data.publicUrl;
      const { data, error } = await sb.from("marketing_posts").insert({ kind: "manual_image", audience: a.audience, status: "draft", topic: "agent_chat",
        title: a.title, body: fixLink(String(a.body)), image_urls: [url] }).select("id").single();
      if (error) return { error: error.message };
      created.push({ id: data.id, kind: "post", title: a.title });
      return { ok: true, id: data.id };
    }
    if (name === "create_video") {
      const scenes = cleanScenes(Array.isArray(a.scenes) ? a.scenes : []);
      if (scenes.length < 2) return { error: "Il faut au moins 2 scènes." };
      const { data, error } = await sb.from("marketing_posts").insert({ kind: "manual_video", audience: a.audience, status: "draft", topic: "agent_chat",
        title: a.title, body: fixLink(String(a.body)), video_scenes: scenes, video_script: scenes.map((s) => s.voiceover).join("\n") }).select("id").single();
      if (error) return { error: error.message };
      await sb.from("social_jobs").insert({ action: "rerender_video", target_table: "marketing_posts", target_id: data.id, payload: { scenes }, created_by: user!.id });
      created.push({ id: data.id, kind: "vidéo", title: a.title });
      return { ok: true, id: data.id, note: "Montage en cours, prêt dans 2 à 5 minutes." };
    }
    if (name === "update_post") {
      const { data: row } = await sb.from("marketing_posts").select("id,video_scenes,status").eq("id", a.id).maybeSingle();
      if (!row) return { error: "Post introuvable" };
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (a.title) patch.title = a.title;
      if (a.body) patch.body = fixLink(String(a.body));
      await sb.from("marketing_posts").update(patch).eq("id", a.id);
      if (Array.isArray(a.scenes) && a.scenes.length) {
        const old = (row.video_scenes ?? []) as any[];
        const scenes = cleanScenes(a.scenes).map((s, i) => ({ ...s, image_prompt: s.image_prompt ?? old[i]?.image_prompt ?? null,
          image_url: s.image_prompt ? null : old[i]?.image_url ?? null }));
        await sb.from("social_jobs").insert({ action: "rerender_video", target_table: "marketing_posts", target_id: a.id, payload: { scenes }, created_by: user!.id });
      }
      if (a.body && row.status === "published") await sb.from("social_jobs").insert({ action: "update_text", target_table: "marketing_posts", target_id: a.id, created_by: user!.id });
      return { ok: true };
    }
    return { error: "Outil inconnu" };
  }

  const convo: any[] = [{ role: "system", content: SYSTEM }, ...history];
  for (let step = 0; step < 8; step++) {
    const r = await fetch("https://api.openai.com/v1/chat/completions", { method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-4.1", messages: convo, tools: TOOLS }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return json({ error: d?.error?.message ?? `Erreur IA ${r.status}` }, r.status === 429 ? 429 : 502);
    const msg = d.choices?.[0]?.message;
    if (!msg) return json({ error: "Réponse IA vide" }, 502);
    convo.push(msg);
    if (!msg.tool_calls?.length) return json({ reply: (msg.content ?? "").trim() || "C'est fait.", created });
    for (const c of msg.tool_calls) {
      let out: unknown;
      try { out = await run(c.function.name, JSON.parse(c.function.arguments || "{}")); } catch (e) { out = { error: String((e as Error).message) }; }
      convo.push({ role: "tool", tool_call_id: c.id, content: JSON.stringify(out).slice(0, 8000) });
    }
  }
  return json({ reply: "J'ai fait plusieurs actions, vérifie dans « Tous les posts ».", created });
});
