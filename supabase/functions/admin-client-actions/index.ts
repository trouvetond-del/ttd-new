// Fonction appelée par l'admin depuis la page Utilisateurs / Fiche Client.
// action "activate"        : passe le client en "Actif" (clients.profile_completed = true)
// action "profile_reminder": envoie au client un email de relance pour finir son profil
//                            et faire sa demande de devis.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: cors });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Non authentifié" }, 401);
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: userData, error: userError } = await admin.auth.getUser(authHeader.replace("Bearer ", ""));
    if (userError || !userData.user) return json({ error: "Session invalide" }, 401);
    const { data: adminRow } = await admin.from("admins").select("id").eq("email", userData.user.email).maybeSingle();
    if (!adminRow) return json({ error: "Accès réservé aux administrateurs" }, 403);

    const { action, clientUserId } = await req.json();
    if (!clientUserId || !["activate", "profile_reminder"].includes(action)) {
      return json({ error: "Paramètres invalides" }, 400);
    }

    const { data: client } = await admin
      .from("clients")
      .select("id, email, first_name, reminder_count")
      .eq("user_id", clientUserId)
      .maybeSingle();

    if (action === "activate") {
      if (!client) return json({ error: "Ce client n'a pas encore de fiche (aucune information saisie)." }, 409);
      const { error } = await admin.from("clients").update({ profile_completed: true }).eq("id", client.id);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    // profile_reminder
    let email = client?.email as string | undefined;
    if (!email) {
      const { data: au } = await admin.auth.admin.getUserById(clientUserId);
      email = au?.user?.email ?? undefined;
    }
    if (!email) return json({ error: "Email du client introuvable" }, 404);

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) return json({ error: "Service d'email non configuré" }, 500);

    const hello = client?.first_name ? `Bonjour ${client.first_name},` : "Bonjour,";
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "TrouveTonDemenageur <noreply@trouvetondemenageur.fr>",
        to: [email],
        subject: "Finalisez votre profil pour recevoir vos devis de déménagement",
        html: `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="font-family: Arial, sans-serif; line-height:1.6; color:#333; max-width:600px; margin:0 auto; padding:20px; background:#ffffff;">
  <div style="background: linear-gradient(135deg, #3B82F6 0%, #10B981 100%); color:white; padding:30px; text-align:center; border-radius:10px 10px 0 0;">
    <h1 style="margin:0; font-size:22px;">🚚 Votre profil n'est pas encore terminé</h1>
  </div>
  <div style="background:#ffffff; padding:30px; border:1px solid #e5e7eb; border-radius:0 0 10px 10px;">
    <p>${hello}</p>
    <p>Vous avez créé votre compte sur TrouveTonDéménageur, mais votre profil et votre demande de déménagement ne sont pas encore complétés.</p>
    <p>Pour que nos déménageurs vérifiés puissent vous envoyer leurs devis, il suffit d'indiquer vos adresses, étages et volume. Cela prend 2 minutes.</p>
    <div style="text-align:center; margin:30px 0;">
      <a href="https://www.trouvetondemenageur.fr/client/quote" style="display:inline-block; background:#3B82F6; color:white; padding:14px 32px; text-decoration:none; border-radius:8px; font-weight:bold; font-size:16px;">Finaliser mon profil</a>
    </div>
    <p style="font-size:13px; color:#6b7280;">Une question ? Répondez simplement à cet email.<br>L'équipe TrouveTonDéménageur — www.trouvetondemenageur.fr</p>
  </div>
</body></html>`,
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      console.error("Resend error", res.status, t);
      return json({ error: `Envoi de l'email impossible (${res.status})` }, 502);
    }
    if (client) {
      await admin.from("clients")
        .update({ reminder_sent_at: new Date().toISOString(), reminder_count: (client.reminder_count || 0) + 1 })
        .eq("id", client.id);
    }
    return json({ ok: true, email });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
