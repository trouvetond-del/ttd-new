// supabase/functions/send-client-quote-reminder/index.ts
// Déclenchée par cron toutes les 12h. Relance les clients qui ont bien
// créé leur compte (client_user_id renseigné, donc déjà passés par
// /devis-rapide/mot-de-passe) mais n'ont jamais terminé /client/quote
// (étage, taille, type, surface, cubage manquants). Sans cette demande
// complète, aucun déménageur ne peut la voir ni y répondre.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

Deno.serve(async () => {
  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  let emailsSent = 0;

  // Demandes avec un compte client lié mais toujours incomplètes,
  // créées il y a plus de 3h (laisse le temps de finir normalement avant
  // de relancer) et pas plus vieilles que 30 jours (au-delà, on considère
  // que le client a abandonné pour de bon, pas la peine de continuer).
  const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: incompleteRequests, error } = await supabaseAdmin
    .from("quote_requests")
    .select(
      "id, client_name, client_email, from_city, to_city, created_at, moving_date, volume_m3, from_home_size, from_home_type, to_home_size, to_home_type, from_surface_m2, to_surface_m2"
    )
    .not("client_user_id", "is", null)
    .not("client_email", "is", null)
    // Un brouillon jamais soumis (is_draft=true) reçoit un message différent
    // ("vous n'avez pas terminé") via le cron send-draft-reminder --
    // pas celui-ci, qui est pour les demandes déjà soumises mais incomplètes.
    .eq("is_draft", false)
    .lte("created_at", threeHoursAgo)
    .gte("created_at", thirtyDaysAgo)
    .or(
      "moving_date.is.null,from_home_size.is.null,from_home_size.eq.,from_home_type.is.null,from_home_type.eq.,to_home_size.is.null,to_home_size.eq.,to_home_type.is.null,to_home_type.eq.,volume_m3.is.null,volume_m3.eq.0,from_surface_m2.is.null,from_surface_m2.eq.0,to_surface_m2.is.null,to_surface_m2.eq.0"
    );

  if (error || !incompleteRequests) {
    return new Response(JSON.stringify({ error: error?.message || "Erreur chargement demandes" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  for (const request of incompleteRequests) {
    // Une relance toutes les 24h maximum par demande
    const { data: lastReminder } = await supabaseAdmin
      .from("client_quote_reminder_log")
      .select("sent_at")
      .eq("quote_request_id", request.id)
      .eq("reminder_type", "missing_info")
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastReminder) {
      const hoursSince = (Date.now() - new Date(lastReminder.sent_at).getTime()) / (1000 * 60 * 60);
      if (hoursSince < 24) continue;
    }

    const firstName = (request.client_name || "").split(" ")[0] || "";

    const missingLabels: string[] = [];
    if (!request.moving_date) missingLabels.push("la date de déménagement");
    if (!request.volume_m3) missingLabels.push("le cubage (volume en m³)");
    if (!request.from_home_size || !request.from_home_type) missingLabels.push("le type de logement de départ");
    if (!request.to_home_size || !request.to_home_type) missingLabels.push("le type de logement d'arrivée");
    if (!request.from_surface_m2) missingLabels.push("la surface du logement de départ");
    if (!request.to_surface_m2) missingLabels.push("la surface du logement d'arrivée");
    if (missingLabels.length === 0) continue;

    if (resendApiKey && request.client_email) {
      try {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: "TrouveTonDemenageur <noreply@trouvetondemenageur.fr>",
            to: [request.client_email],
            subject: "Il vous reste 2 minutes pour recevoir vos devis de déménagement",
            html: `
              <!DOCTYPE html>
              <html><head><meta charset="UTF-8"></head>
              <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
                <div style="background: linear-gradient(135deg, #3B82F6 0%, #10B981 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
                  <h1 style="margin:0; font-size: 22px;">🏠 Votre demande n'est pas encore visible</h1>
                </div>
                <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-radius: 0 0 10px 10px;">
                  <p>Bonjour ${firstName},</p>
                  <p>Votre demande de déménagement ${request.from_city ? `(${request.from_city} → ${request.to_city})` : ''} n'est pas encore terminée. Il vous manque :</p>
                  <ul style="margin: 12px 0; padding-left: 20px;">
                    ${missingLabels.map((label) => `<li>${label}</li>`).join("\n                    ")}
                  </ul>
                  <p><strong>Tant que ces informations ne sont pas renseignées, aucun déménageur ne peut voir votre demande ni vous envoyer de devis.</strong></p>
                  <div style="text-align: center; margin: 30px 0;">
                    <a href="https://www.trouvetondemenageur.fr/client/quote/${request.id}/edit" style="display: inline-block; background: #3B82F6; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
                      Finaliser ma demande (2 minutes)
                    </a>
                  </div>
                </div>
              </body></html>
            `,
          }),
        });
        emailsSent++;
      } catch (e) {
        console.warn("Email de relance client échoué (non bloquant):", e);
      }
    }

    await supabaseAdmin.from("client_quote_reminder_log").insert({
      quote_request_id: request.id,
      reminder_type: "missing_info",
    });
  }

  return new Response(
    JSON.stringify({ requestsChecked: incompleteRequests.length, emailsSent }),
    { headers: { "Content-Type": "application/json" } }
  );
});
