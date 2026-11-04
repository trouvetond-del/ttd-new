// L'entreprise de déménagement invite un chauffeur : création/rattachement du compte et email pour créer le mot de passe.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    const { data: u } = await admin.auth.getUser(token);
    if (!u?.user) return json({ error: "Session invalide" }, 401);
    const { data: mover } = await admin.from("movers").select("id, company_name, user_id").eq("user_id", u.user.id).maybeSingle();
    if (!mover) return json({ error: "Réservé aux entreprises de déménagement" }, 403);

    const body = await req.json().catch(() => ({}));
    const full_name = String(body.full_name || "").trim().slice(0, 100);
    const email = String(body.email || "").trim().toLowerCase().slice(0, 200);
    const phone = String(body.phone || "").trim().slice(0, 30) || null;
    if (!full_name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: "Nom ou email invalide" }, 400);
    if (email === (u.user.email || "").toLowerCase()) return json({ error: "Utilisez un email différent du vôtre" }, 400);

    const redirectTo = "https://www.trouvetondemenageur.fr/driver/set-password";
    let link = await admin.auth.admin.generateLink({ type: "invite", email, options: { redirectTo, data: { user_type: "driver", full_name } } });
    if (link.error) {
      // Compte déjà existant : lien de réinitialisation du mot de passe
      link = await admin.auth.admin.generateLink({ type: "recovery", email, options: { redirectTo } });
    }
    if (link.error || !link.data?.user) return json({ error: "Impossible de créer le compte chauffeur" }, 500);
    const userId = link.data.user.id;

    // Un compte chauffeur ne peut pas être une entreprise ni un client existant d'une autre entreprise
    const { data: other } = await admin.from("mover_drivers").select("mover_id").eq("user_id", userId).maybeSingle();
    if (other && other.mover_id !== mover.id) return json({ error: "Ce chauffeur est déjà rattaché à une autre entreprise" }, 409);
    const { data: isMover } = await admin.from("movers").select("id").eq("user_id", userId).maybeSingle();
    if (isMover) return json({ error: "Cet email appartient déjà à une entreprise" }, 409);

    const { error: upErr } = await admin.from("mover_drivers").upsert(
      { mover_id: mover.id, user_id: userId, full_name, email, phone, active: true, invited_at: new Date().toISOString() },
      { onConflict: "mover_id,email" });
    if (upErr) return json({ error: upErr.message }, 500);

    const resend = Deno.env.get("RESEND_API_KEY");
    if (!resend) return json({ error: "Service d'envoi non configuré" }, 500);
    const url = link.data.properties?.action_link;
    const html = `<html><body style="margin:0;background:#f1f5f9;font-family:Helvetica,Arial,sans-serif;padding:32px 12px">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fff;border-radius:18px;overflow:hidden">
<tr><td style="background:#2563eb;background:linear-gradient(135deg,#10b981,#2563eb);padding:26px 32px;color:#fff;font-size:22px;font-weight:700">Votre espace chauffeur</td></tr>
<tr><td style="padding:28px 32px;color:#334155;font-size:15px;line-height:1.6">
<p style="margin:0 0 14px">Bonjour ${esc(full_name)},</p>
<p style="margin:0 0 14px"><b>${esc(mover.company_name)}</b> vous a créé un compte chauffeur sur Trouve Ton Déménageur.</p>
<p style="margin:0 0 22px">Depuis votre téléphone, vous démarrez et clôturez chaque mission, avec les photos du chargement et du déchargement.</p>
<div style="text-align:center"><a href="${url}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;font-weight:700;padding:15px 30px;border-radius:999px">Créer mon mot de passe →</a></div>
<p style="margin:24px 0 0;font-size:13px;color:#64748b">Ensuite, connectez-vous sur www.trouvetondemenageur.fr/driver/login</p>
<p style="margin:24px 0 0;color:#64748b;font-size:14px">L'équipe Trouve Ton Déménageur</p></td></tr></table></body></html>`;
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resend}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: "Trouve Ton Déménageur <noreply@trouvetondemenageur.fr>", to: [email], subject: `${mover.company_name} vous invite à votre espace chauffeur`, html }),
    });
    if (!r.ok) return json({ error: "L'email n'a pas pu partir" }, 502);
    return json({ ok: true });
  } catch (e) {
    console.error(e);
    return json({ error: "Erreur inattendue" }, 500);
  }
});
