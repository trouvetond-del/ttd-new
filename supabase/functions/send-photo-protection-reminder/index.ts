// supabase/functions/send-photo-protection-reminder/index.ts
// Cron toutes les 6h. Dès qu'une demande de devis devient complète
// (étage/cubage/inventaire renseignés -- donc visible des déménageurs),
// on rappelle au client de photographier son mobilier maintenant, avant
// le jour J : c'est la meilleure preuve en cas de litige plus tard, et
// c'est plus facile à faire calmement, à l'avance, que le jour du
// déménagement dans la précipitation.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

Deno.serve(async () => {
  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  let emailsSent = 0;

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: completeRequests, error } = await supabaseAdmin
    .from("quote_requests")
    .select("id, client_name, client_email, from_city, to_city, moving_date, created_at")
    .not("client_email", "is", null)
    .gte("created_at", sevenDaysAgo) // pas la peine de relancer sur de très vieilles demandes
    .not("from_home_size", "is", null)
    .neq("from_home_size", "")
    .not("from_home_type", "is", null)
    .neq("from_home_type", "")
    .not("to_home_size", "is", null)
    .neq("to_home_size", "")
    .not("to_home_type", "is", null)
    .neq("to_home_type", "")
    .not("volume_m3", "is", null)
    .gt("volume_m3", 0);

  if (error || !completeRequests) {
    return new Response(JSON.stringify({ error: error?.message || "Erreur chargement demandes" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  for (const request of completeRequests) {
    const { data: alreadySent } = await supabaseAdmin
      .from("photo_protection_reminder_log")
      .select("id")
      .eq("quote_request_id", request.id)
      .maybeSingle();

    if (alreadySent) continue;

    const firstName = (request.client_name || "").split(" ")[0] || "";

    if (resendApiKey && request.client_email) {
      try {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: "TrouveTonDemenageur <noreply@trouvetondemenageur.fr>",
            to: [request.client_email],
            subject: "📸 Un réflexe qui vous protège pour votre déménagement",
            html: `
              <!DOCTYPE html>
              <html><head><meta charset="UTF-8"></head>
              <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
                <div style="background: linear-gradient(135deg, #F59E0B 0%, #EF4444 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
                  <h1 style="margin:0; font-size: 22px;">📸 Un réflexe simple qui vous protège</h1>
                </div>
                <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-radius: 0 0 10px 10px;">
                  <p>Bonjour ${firstName},</p>
                  <p>Votre demande de déménagement ${request.from_city ? `(${request.from_city} → ${request.to_city})` : ''} est bien enregistrée et visible par nos déménageurs partenaires.</p>
                  <p><strong>Un conseil avant le jour J :</strong> prenez dès maintenant quelques photos de vos meubles et objets de valeur (télé, canapé, électroménager, objets fragiles). Sans précipitation, à tête reposée.</p>
                  <p>Pourquoi maintenant ? En cas de dommage constaté après le déménagement, ces photos "avant" sont la meilleure preuve pour appuyer votre déclaration de sinistre auprès du déménageur.</p>
                  <ul style="color:#374151;">
                    <li>Photographiez l'état actuel de vos meubles, sous plusieurs angles</li>
                    <li>Insistez sur les objets fragiles ou de valeur</li>
                    <li>Gardez-les, vous pourrez les associer à votre demande le jour du déménagement</li>
                  </ul>
                  <div style="text-align: center; margin: 30px 0;">
                    <a href="https://www.trouvetondemenageur.fr/client/dashboard" style="display: inline-block; background: #F59E0B; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
                      Voir ma demande
                    </a>
                  </div>
                </div>
              </body></html>
            `,
          }),
        });
        emailsSent++;
      } catch (e) {
        console.warn("Email photo-protection échoué (non bloquant):", e);
      }
    }

    await supabaseAdmin.from("photo_protection_reminder_log").insert({ quote_request_id: request.id });
  }

  return new Response(
    JSON.stringify({ requestsChecked: completeRequests.length, emailsSent }),
    { headers: { "Content-Type": "application/json" } }
  );
});
