// Studio Social Media : rédige le texte d'un post à partir d'une photo ou d'images d'une vidéo (réservé aux admins).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { adminClient } from "../_shared/agent-utils.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const SITE = "https://www.trouvetondemenageur.fr";

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

  const { images, audience, isVideo, hint } = await req.json().catch(() => ({}));
  const imgs = (Array.isArray(images) ? images : [])
    .filter((s: unknown) => typeof s === "string" && s.startsWith("data:image/") && s.length < 2_000_000).slice(0, 4);
  if (!imgs.length) return json({ error: "Aucune image reçue" }, 400);
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) return json({ error: "Clé IA manquante" }, 500);

  const target = audience === "client" ? "des particuliers et professionnels qui vont déménager"
    : audience === "mover" ? "des déménageurs professionnels et transporteurs (inscription gratuite, sans abonnement)"
    : "des clients qui déménagent et des déménageurs professionnels";
  const prompt = `Tu es le community manager de TrouveTonDéménageur, plateforme française qui met en relation clients et déménageurs vérifiés (KBIS, assurance RC Pro, URSSAF), avec devis comparables, paiement par acompte et protocole photo en cas de litige.
Voici ${isVideo ? "des images extraites d'une vidéo" : "une photo"} que nous allons publier sur Facebook et Instagram. Regarde ce qu'on voit et écris le texte du post pour ${target}.
Règles : 400 à 600 caractères, en français, phrases courtes, 1 accroche forte au début, 1 ou 2 emojis maximum, aucun chiffre ni statistique inventé, ne cite aucune personne. Termine par la ligne "👉 ${SITE}" puis 3 à 5 hashtags.${hint ? `\nIndication de l'admin : ${String(hint).slice(0, 300)}` : ""}
Réponds uniquement avec le texte du post.`;

  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      messages: [{ role: "user", content: [{ type: "text", text: prompt },
        ...imgs.map((url: string) => ({ type: "image_url", image_url: { url, detail: "low" } }))] }],
    }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) return json({ error: d?.error?.message ?? `Erreur IA ${r.status}` }, r.status === 429 ? 429 : 502);
  let text: string = (d.choices?.[0]?.message?.content ?? "").trim();
  if (!text) return json({ error: "L'IA n'a pas renvoyé de texte" }, 502);
  if (!text.includes("trouvetondemenageur.fr")) text += `\n\n👉 ${SITE}`;
  text = text.replace(/(?<!https:\/\/)www\.trouvetondemenageur\.fr/g, "https://www.trouvetondemenageur.fr");
  return json({ text });
});
