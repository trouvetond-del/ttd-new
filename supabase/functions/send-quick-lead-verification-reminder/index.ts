// supabase/functions/send-quick-lead-verification-reminder/index.ts
// Déclenchée par cron toutes les 2h. Relance UNE fois les leads
// /devis-rapide dont le lien "créer mon mot de passe" (envoyé à la
// création par api/quick-lead.ts) n'a jamais été cliqué, avant qu'il
// n'expire (24h). Mesuré le 08/08 : 21 leads sur 24 n'avaient jamais
// cliqué et n'étaient jamais relancés (send-client-quote-reminder ne
// cible que les comptes déjà créés).
//
// Relance à partir de 2h après l'envoi initial, pour laisser le temps
// au premier email d'être vu naturellement, et seulement si le lien
// est encore valide (expires_at > now()).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

Deno.serve(async () => {
  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  let emailsSent = 0;

  const { data: pending, error } = await supabaseAdmin
    .from("quick_lead_verifications")
    .select("id, quote_request_id, email, token, expires_at, created_at")
    .is("used_at", null)
    .is("reminder_sent_at", null)
    .gt("expires_at", new Date().toISOString())
    .lte("created_at", new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString());

  if (error || !pending) {
    return new Response(JSON.stringify({ error: error?.message || "Erreur chargement" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  for (const lead of pending) {
    let firstName = "";
    if (lead.quote_request_id) {
      const { data: qr } = await supabaseAdmin
        .from("quote_requests")
        .select("client_name")
        .eq("id", lead.quote_request_id)
        .maybeSingle();
      firstName = (qr?.client_name || "").split(" ")[0] || "";
    }

    const baseUrl = Deno.env.get("PUBLIC_SITE_URL") || "https://www.trouvetondemenageur.fr";
    const actionUrl = `${baseUrl}/devis-rapide/mot-de-passe?token=${lead.token}`;

    if (resendApiKey) {
      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: "TrouveTonDemenageur <noreply@trouvetondemenageur.fr>",
            to: [lead.email],
            subject: `${firstName ? firstName + ", n'oubliez pas" : "N'oubliez pas"} vos devis de déménagement`,
            html: `
              <!DOCTYPE html>
              <html><head><meta charset="UTF-8"></head>
              <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
                <div style="background: linear-gradient(135deg, #F97316 0%, #3B82F6 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
                  <h1 style="margin:0; font-size: 22px;">⏰ Vos devis vous attendent toujours</h1>
                </div>
                <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-radius: 0 0 10px 10px;">
                  <p>Bonjour ${firstName},</p>
                  <p>Vous avez commencé une demande de déménagement sur <strong>TrouveTonDemenageur</strong> mais n'êtes pas allé au bout. Il ne reste qu'une étape (2 minutes) avant que nos déménageurs vérifiés puissent vous envoyer leurs devis.</p>
                  <div style="text-align: center; margin: 30px 0;">
                    <a href="${actionUrl}" style="display: inline-block; background: #F97316; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
                      Recevoir mes devis
                    </a>
                  </div>
                  <p style="text-align: center; color: #6B7280; font-size: 14px;">Ce lien expire définitivement à ${new Date(lead.expires_at).toLocaleString('fr-FR')}.</p>
                </div>
              </body></html>
            `,
          }),
        });
        if (res.ok) emailsSent++;
      } catch (e) {
        console.warn("Email de relance quick-lead échoué (non bloquant):", e);
      }
    }

    await supabaseAdmin
      .from("quick_lead_verifications")
      .update({ reminder_sent_at: new Date().toISOString() })
      .eq("id", lead.id);
  }

  return new Response(JSON.stringify({ processed: pending.length, emailsSent }), {
    headers: { "Content-Type": "application/json" },
  });
});
