// supabase/functions/send-draft-reminder/index.ts
// Déclenchée par cron toutes les 12h (throttle 24h par demande via
// client_quote_reminder_log, reminder_type='draft_incomplete').
// Relance les clients qui ont un compte (client_user_id renseigné) mais
// dont la demande est toujours is_draft=true -- ils n'ont jamais cliqué
// sur "envoyer". Version automatique de admin-send-draft-reminder.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

Deno.serve(async () => {
  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  let emailsSent = 0;

  // Mêmes bornes que send-client-quote-reminder : 3h (laisse le temps de
  // finir normalement) à 30 jours (au-delà, abandon considéré définitif).
  const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: draftRequests, error } = await supabaseAdmin
    .from("quote_requests")
    .select("id, client_name, client_email, from_city, to_city, resume_token, created_at")
    .not("client_user_id", "is", null)
    .not("client_email", "is", null)
    .eq("is_draft", true)
    .lte("created_at", threeHoursAgo)
    .gte("created_at", thirtyDaysAgo);

  if (error || !draftRequests) {
    return new Response(JSON.stringify({ error: error?.message || "Erreur chargement brouillons" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  for (const request of draftRequests) {
    const { data: lastReminder } = await supabaseAdmin
      .from("client_quote_reminder_log")
      .select("sent_at")
      .eq("quote_request_id", request.id)
      .eq("reminder_type", "draft_incomplete")
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastReminder) {
      const hoursSince = (Date.now() - new Date(lastReminder.sent_at).getTime()) / (1000 * 60 * 60);
      if (hoursSince < 24) continue;
    }

    const firstName = (request.client_name || "").split(" ")[0] || "";
    const resumeUrl = `https://www.trouvetondemenageur.fr/client/quote/reprendre?token=${request.resume_token}`;

    if (resendApiKey && request.client_email) {
      try {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: "TrouveTonDemenageur <noreply@trouvetondemenageur.fr>",
            to: [request.client_email],
            subject: "Vous n'avez pas terminé votre demande de déménagement",
            html: `
              <!DOCTYPE html>
              <html><head><meta charset="UTF-8"></head>
              <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
                <div style="background: linear-gradient(135deg, #3B82F6 0%, #10B981 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
                  <h1 style="margin:0; font-size: 22px;">🏠 Il vous reste une étape</h1>
                </div>
                <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-radius: 0 0 10px 10px;">
                  <p>Bonjour ${firstName},</p>
                  <p>Vous avez commencé une demande de déménagement${request.from_city ? ` (${request.from_city} → ${request.to_city})` : ''} sur TrouveTonDemenageur, mais vous ne l'avez pas envoyée.</p>
                  <p><strong>Tant qu'elle n'est pas envoyée, aucun déménageur ne peut la voir ni vous répondre.</strong></p>
                  <div style="text-align: center; margin: 30px 0;">
                    <a href="${resumeUrl}" style="display: inline-block; background: #3B82F6; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
                      Reprendre ma demande
                    </a>
                  </div>
                </div>
              </body></html>
            `,
          }),
        });
        emailsSent++;
      } catch (e) {
        console.warn("Email de relance brouillon échoué (non bloquant):", e);
      }
    }

    await supabaseAdmin.from("client_quote_reminder_log").insert({
      quote_request_id: request.id,
      reminder_type: "draft_incomplete",
    });
  }

  return new Response(
    JSON.stringify({ requestsChecked: draftRequests.length, emailsSent }),
    { headers: { "Content-Type": "application/json" } }
  );
});
