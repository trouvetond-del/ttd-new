// Admin : transforme un commentaire court ("kbis expiré") en email professionnel,
// puis l'envoie et démarre les relances quotidiennes. Réservé aux admins.
// actions : draft | send | list | resolve | cancel
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { adminClient } from "../_shared/agent-utils.ts";
import { followupHtml, sendFollowupEmail } from "../_shared/followup-email.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Target = { email: string; name: string; phone: string | null; user_id: string | null; mover_id: string | null };

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

  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "");
  const targetType = body.targetType === "client" ? "client" : "mover";

  // Résout le destinataire côté serveur (on ne fait pas confiance à l'email envoyé par le navigateur)
  async function resolveTarget(): Promise<Target | null> {
    if (targetType === "mover") {
      const { data: m } = await sb.from("movers")
        .select("id, user_id, email, company_name, manager_firstname, manager_lastname, phone, manager_phone")
        .eq("id", String(body.moverId ?? "")).maybeSingle();
      if (!m?.email) return null;
      const person = `${m.manager_firstname ?? ""} ${m.manager_lastname ?? ""}`.trim();
      return { email: m.email, name: person || m.company_name || "", phone: m.manager_phone || m.phone || null, user_id: m.user_id, mover_id: m.id };
    }
    const uid = String(body.userId ?? "");
    const { data: u } = await sb.auth.admin.getUserById(uid);
    const { data: c } = await sb.from("clients").select("first_name, last_name, phone, email").eq("user_id", uid).maybeSingle();
    const email = u?.user?.email || c?.email;
    if (!email) return null;
    return { email, name: `${c?.first_name ?? ""} ${c?.last_name ?? ""}`.trim(), phone: c?.phone ?? null, user_id: uid, mover_id: null };
  }

  if (action === "list") {
    let q = sb.from("admin_followups").select("*").order("created_at", { ascending: false }).limit(10);
    q = targetType === "mover" ? q.eq("mover_id", String(body.moverId ?? "")) : q.eq("target_user_id", String(body.userId ?? ""));
    const { data, error } = await q;
    if (error) return json({ error: error.message }, 500);
    return json({ followups: data ?? [] });
  }

  if (action === "resolve" || action === "cancel") {
    const { error } = await sb.from("admin_followups")
      .update({ status: action === "resolve" ? "resolved" : "cancelled", resolved_at: new Date().toISOString() })
      .eq("id", String(body.id ?? ""));
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  }

  const target = await resolveTarget();
  if (!target) return json({ error: "Destinataire introuvable ou sans email" }, 404);

  if (action === "draft") {
    const note = String(body.note ?? "").trim().slice(0, 1500);
    if (note.length < 3) return json({ error: "Écrivez d'abord ce qui manque" }, 400);
    const key = Deno.env.get("OPENAI_API_KEY");
    if (!key) return json({ error: "Clé IA manquante" }, 500);
    const who = targetType === "mover"
      ? `un déménageur professionnel inscrit (société/contact : ${target.name || "non renseigné"}) dont le dossier d'inscription est en cours de validation`
      : `un client particulier ou professionnel (${target.name || "nom non renseigné"}) qui prépare une demande de devis de déménagement`;
    const prompt = `Tu es l'équipe administrative de TrouveTonDéménageur (www.trouvetondemenageur.fr), plateforme française qui met en relation clients et déménageurs vérifiés.
Rédige un email professionnel, courtois et clair adressé à ${who}.
Note interne de l'admin (à transformer, ne pas recopier telle quelle) : """${note}"""
Règles : vouvoiement, français correct, 80 à 180 mots, explique précisément ce qui manque ou doit être mis à jour (ex. KBIS de moins de 3 mois, attestation URSSAF à jour, licence de transport valide), pourquoi c'est nécessaire (validation du dossier / qualité des devis) et ce qu'il faut faire (se connecter à son espace et déposer le document ou compléter l'information). N'invente aucune date limite, aucun chiffre ni aucune sanction. Commence par "Bonjour${target.name ? " " + target.name : ""}," et termine par "L'équipe TrouveTonDéménageur". Pas de lien dans le texte (un bouton est ajouté automatiquement).
Réponds en JSON : {"subject": "...", "body": "..."}`;
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-4o-mini", response_format: { type: "json_object" }, messages: [{ role: "user", content: prompt }] }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return json({ error: d?.error?.message ?? `Erreur IA ${r.status}` }, r.status === 429 ? 429 : 502);
    try {
      const out = JSON.parse(d.choices?.[0]?.message?.content ?? "{}");
      if (!out.subject || !out.body) throw new Error("vide");
      return json({ subject: String(out.subject), body: String(out.body), email: target.email });
    } catch { return json({ error: "L'IA n'a pas renvoyé d'email exploitable, réessayez" }, 502); }
  }

  if (action === "send") {
    const subject = String(body.subject ?? "").trim().slice(0, 200);
    const text = String(body.body ?? "").trim().slice(0, 5000);
    const note = String(body.note ?? "").trim().slice(0, 1500);
    if (!subject || !text) return json({ error: "Objet et message obligatoires" }, 400);
    const sent = await sendFollowupEmail(target.email, subject, followupHtml(text, targetType));
    if (!sent.ok) return json({ error: `Email non envoyé : ${sent.error}` }, 502);
    const { data, error } = await sb.from("admin_followups").insert({
      target_type: targetType, mover_id: target.mover_id, target_user_id: target.user_id,
      email: target.email, display_name: target.name, phone: target.phone,
      admin_note: note || text.slice(0, 300), subject, body: text,
      last_sent_at: new Date().toISOString(), created_by: user.id,
    }).select().single();
    if (error) return json({ error: `Email envoyé mais relance non enregistrée : ${error.message}` }, 500);
    return json({ ok: true, followup: data });
  }

  return json({ error: "Action inconnue" }, 400);
});
