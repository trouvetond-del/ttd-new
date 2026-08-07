// supabase/functions/send-mover-profile-reminder/index.ts
// Cron toutes les 6h. Relance les déménageurs dont l'inscription est
// restée incomplète (siret encore au format placeholder PENDING-{userId},
// posé par create-invited-mover/verify-signup-otp/MoverGoogleCallbackPage
// tant que /mover/profile-completion n'a jamais été terminé). Sans ça,
// ces comptes restent invisibles pour toujours, personne ne les relance.

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

  const { data: incompleteMovers, error } = await supabaseAdmin
    .from("movers")
    .select("id, user_id, email, siret, created_at, reminder_sent_at")
    .like("siret", "PENDING-%")
    .lte("created_at", threeHoursAgo)
    .gte("created_at", thirtyDaysAgo);

  if (error || !incompleteMovers) {
    return new Response(JSON.stringify({ error: error?.message || "Erreur chargement movers" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  for (const mover of incompleteMovers) {
    if (mover.reminder_sent_at) {
      const hoursSince = (Date.now() - new Date(mover.reminder_sent_at).getTime()) / (1000 * 60 * 60);
      if (hoursSince < 24) continue; // 1 relance/jour max
    }

    if (resendApiKey && mover.email) {
      try {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: "TrouveTonDemenageur <noreply@trouvetondemenageur.fr>",
            to: [mover.email],
            subject: "Il vous reste 5 minutes pour recevoir vos premières demandes",
            html: `
              <!DOCTYPE html>
              <html><head><meta charset="UTF-8"></head>
              <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
                <div style="background: linear-gradient(135deg, #3B82F6 0%, #10B981 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
                  <h1 style="margin:0; font-size: 22px;">🚚 Votre inscription n'est pas terminée</h1>
                </div>
                <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-radius: 0 0 10px 10px;">
                  <p>Bonjour,</p>
                  <p>Vous avez commencé votre inscription sur TrouveTonDemenageur, mais votre profil n'est pas encore complet (informations entreprise, documents).</p>
                  <p><strong>Tant que ce n'est pas fini, vous ne recevez aucune demande de devis.</strong></p>
                  <div style="text-align: center; margin: 30px 0;">
                    <a href="https://www.trouvetondemenageur.fr/mover/profile-completion" style="display: inline-block; background: #3B82F6; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
                      Terminer mon inscription (5 min)
                    </a>
                  </div>
                </div>
              </body></html>
            `,
          }),
        });
        emailsSent++;
      } catch (e) {
        console.warn("Email de relance profil mover échoué (non bloquant):", e);
      }
    }

    await supabaseAdmin.from("movers").update({ reminder_sent_at: new Date().toISOString() }).eq("id", mover.id);
  }

  return new Response(
    JSON.stringify({ moversChecked: incompleteMovers.length, emailsSent }),
    { headers: { "Content-Type": "application/json" } }
  );
});
