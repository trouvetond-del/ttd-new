// supabase/functions/send-partial-lead-reminder/index.ts
// Cron toutes les 3h. Relance par email toute personne ayant renseigné le
// minimum exploitable sur /devis-rapide ou /inscription-demenageur
// (voir api/save-partial-lead.ts et la table partial_leads) mais n'ayant
// jamais terminé son inscription complète. Même principe que
// send-mover-profile-reminder, appliqué aux deux côtés (client + mover)
// et à un point d'entrée plus en amont.
//
// converted_at étant renseigné dès la vraie conversion (voir logique
// applicative ailleurs), un lead converti sort naturellement de cette
// relance sans action supplémentaire ici.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

Deno.serve(async () => {
  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  let emailsSent = 0;

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: leads, error } = await supabaseAdmin
    .from("partial_leads")
    .select("id, lead_type, email, phone, first_name, last_name, company_name, created_at, reminder_sent_at, reminder_count")
    .is("converted_at", null)
    .lte("created_at", oneHourAgo)
    .gte("created_at", thirtyDaysAgo);

  if (error || !leads) {
    return new Response(JSON.stringify({ error: error?.message || "Erreur chargement partial_leads" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  for (const lead of leads) {
    if (lead.reminder_count >= 5) continue; // stop après 5 relances, pas de harcèlement
    if (lead.reminder_sent_at) {
      const hoursSince = (Date.now() - new Date(lead.reminder_sent_at).getTime()) / (1000 * 60 * 60);
      const minGapHours = lead.reminder_count === 0 ? 0 : Math.min(24 * lead.reminder_count, 96); // espacement croissant, plafonné à 4 jours
      if (hoursSince < minGapHours) continue;
    }
    if (!lead.email) continue; // rien à envoyer sans email connu

    const isMover = lead.lead_type === "mover";
    const name = isMover ? lead.company_name : lead.first_name;
    const subject = isMover
      ? "Votre inscription déménageur n'est pas terminée"
      : "Votre demande de devis n'est pas terminée";
    const ctaUrl = isMover
      ? "https://www.trouvetondemenageur.fr/inscription-demenageur"
      : "https://www.trouvetondemenageur.fr/devis-rapide";
    const ctaLabel = isMover ? "Terminer mon inscription (2 min)" : "Terminer ma demande de devis (2 min)";
    const bodyText = isMover
      ? "Vous avez commencé votre inscription en tant que déménageur, mais elle n'est pas encore terminée. Tant que ce n'est pas fini, vous ne recevez aucune demande de devis."
      : "Vous avez commencé une demande de devis déménagement, mais elle n'est pas encore terminée.";

    if (resendApiKey) {
      try {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: "TrouveTonDemenageur <noreply@trouvetondemenageur.fr>",
            to: [lead.email],
            subject,
            html: `
              <!DOCTYPE html>
              <html><head><meta charset="UTF-8"></head>
              <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
                <div style="background: linear-gradient(135deg, #3B82F6 0%, #10B981 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
                  <h1 style="margin:0; font-size: 22px;">🚚 ${name ? `Bonjour ${name}, v` : "V"}ous n'avez pas terminé</h1>
                </div>
                <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-radius: 0 0 10px 10px;">
                  <p>${bodyText}</p>
                  <div style="text-align: center; margin: 30px 0;">
                    <a href="${ctaUrl}" style="display: inline-block; background: #3B82F6; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
                      ${ctaLabel}
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
        console.warn("Email de relance lead partiel échoué (non bloquant):", e);
      }
    }

    await supabaseAdmin
      .from("partial_leads")
      .update({ reminder_sent_at: new Date().toISOString(), reminder_count: (lead.reminder_count || 0) + 1 })
      .eq("id", lead.id);
  }

  return new Response(
    JSON.stringify({ leadsChecked: leads.length, emailsSent }),
    { headers: { "Content-Type": "application/json" } }
  );
});
