// supabase/functions/send-client-no-request-reminder/index.ts
// Cron toutes les 6h. Relance par email tout client ayant un compte
// (table clients) mais AUCUNE demande de déménagement, quel que soit
// le chemin d'inscription emprunté (compte simple via verify-signup-otp,
// step 0 de /client/quote resté sans suite, etc.) -- même principe que
// send-mover-profile-reminder, appliqué au cas symétrique côté client.
//
// Trouvé en creusant le cas de "Besma Sandas" : compte créé via le
// parcours d'inscription standard (email + mot de passe + code), qui ne
// crée jamais de quote_requests -- rien dans le système ne relançait ces
// comptes avant cette fonction.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

Deno.serve(async () => {
  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  let emailsSent = 0;

  const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: clients, error } = await supabaseAdmin
    .from("clients")
    .select("id, user_id, email, first_name, created_at, reminder_sent_at, reminder_count")
    .lte("created_at", threeHoursAgo)
    .gte("created_at", thirtyDaysAgo);

  if (error || !clients) {
    return new Response(JSON.stringify({ error: error?.message || "Erreur chargement clients" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  for (const client of clients) {
    if (client.reminder_count >= 5) continue;
    if (client.reminder_sent_at) {
      const hoursSince = (Date.now() - new Date(client.reminder_sent_at).getTime()) / (1000 * 60 * 60);
      const minGapHours = Math.min(24 * client.reminder_count, 96);
      if (hoursSince < minGapHours) continue;
    }
    if (!client.email) continue;

    // A-t-il déjà au moins une demande (peu importe le statut/brouillon) ?
    if (!client.user_id) continue; // pas de user_id lié, rien à vérifier proprement
    const { count } = await supabaseAdmin
      .from("quote_requests")
      .select("id", { count: "exact", head: true })
      .eq("client_user_id", client.user_id);

    if (count && count > 0) {
      // A fini par en créer une entre temps : on arrête de le relancer,
      // pas besoin de marquer quoi que ce soit de plus.
      continue;
    }

    if (resendApiKey) {
      try {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: "TrouveTonDemenageur <noreply@trouvetondemenageur.fr>",
            to: [client.email],
            subject: "Votre déménagement n'attend plus que vous",
            html: `
              <!DOCTYPE html>
              <html><head><meta charset="UTF-8"></head>
              <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
                <div style="background: linear-gradient(135deg, #3B82F6 0%, #10B981 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
                  <h1 style="margin:0; font-size: 22px;">🚚 ${client.first_name ? `Bonjour ${client.first_name}, v` : "V"}otre compte est prêt</h1>
                </div>
                <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-radius: 0 0 10px 10px;">
                  <p>Vous avez créé votre compte sur TrouveTonDéménageur, mais vous n'avez pas encore fait de demande de devis.</p>
                  <p>Ça prend 2 minutes, et vous recevez vos premiers devis de déménageurs vérifiés sous 24-48h.</p>
                  <div style="text-align: center; margin: 30px 0;">
                    <a href="https://www.trouvetondemenageur.fr/client/quote" style="display: inline-block; background: #3B82F6; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
                      Faire ma demande de devis (2 min)
                    </a>
                  </div>
                  <p style="font-size: 13px; color: #6b7280;">Si vous n'êtes plus intéressé, vous pouvez ignorer cet email -- nous ne relançons pas indéfiniment.</p>
                </div>
              </body></html>
            `,
          }),
        });
        emailsSent++;
      } catch (e) {
        console.warn("Email de relance client sans demande échoué (non bloquant):", e);
      }
    }

    await supabaseAdmin
      .from("clients")
      .update({ reminder_sent_at: new Date().toISOString(), reminder_count: (client.reminder_count || 0) + 1 })
      .eq("id", client.id);
  }

  return new Response(
    JSON.stringify({ clientsChecked: clients.length, emailsSent }),
    { headers: { "Content-Type": "application/json" } }
  );
});
