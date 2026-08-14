// supabase/functions/send-no-account-reminder/index.ts
// Déclenchée par cron toutes les 12h (throttle 24h par demande via
// client_quote_reminder_log, reminder_type='no_account'). Relance les
// demandes sans compte client (client_user_id NULL), qu'elles soient
// encore is_draft=true (jamais soumises) ou déjà is_draft=false (soumises
// et potentiellement déjà repérées par un déménageur -- seul cas où des
// devis peuvent exister malgré l'absence de compte).
// Version automatique du bouton "Inviter".

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function generateCode(): string {
  return String(Math.floor(10000000 + Math.random() * 90000000));
}

Deno.serve(async () => {
  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  let emailsSent = 0;

  const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: noAccountRequests, error } = await supabaseAdmin
    .from("quote_requests")
    .select("id, client_name, client_email, from_city, to_city, created_at")
    .is("client_user_id", null)
    .not("client_email", "is", null)
    .lte("created_at", threeHoursAgo)
    .gte("created_at", thirtyDaysAgo);

  if (error || !noAccountRequests) {
    return new Response(JSON.stringify({ error: error?.message || "Erreur chargement demandes sans compte" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  for (const request of noAccountRequests) {
    const { data: lastReminder } = await supabaseAdmin
      .from("client_quote_reminder_log")
      .select("sent_at")
      .eq("quote_request_id", request.id)
      .eq("reminder_type", "no_account")
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastReminder) {
      const hoursSince = (Date.now() - new Date(lastReminder.sent_at).getTime()) / (1000 * 60 * 60);
      if (hoursSince < 24) continue;
    }

    // Un devis n'a pu être déposé que si la demande est visible
    // (is_draft=false) -- dans ce cas le message devient urgent.
    const { count: quotesCount } = await supabaseAdmin
      .from("quotes")
      .select("id", { count: "exact", head: true })
      .eq("quote_request_id", request.id);
    const hasQuotes = (quotesCount || 0) > 0;

    const firstName = (request.client_name || "").split(" ")[0] || "";
    const leadToken = generateToken();
    const code = generateCode();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const email = (request.client_email || "").toLowerCase();

    const { error: insertError } = await supabaseAdmin.from("quick_lead_verifications").insert({
      quote_request_id: request.id,
      email,
      token: leadToken,
      code,
      expires_at: expiresAt,
    });

    if (insertError) {
      console.warn("Erreur création vérification (cron no-account):", insertError);
      continue;
    }

    const actionUrl = `https://www.trouvetondemenageur.fr/devis-rapide/mot-de-passe?token=${leadToken}`;

    if (resendApiKey && email) {
      try {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: "TrouveTonDemenageur <noreply@trouvetondemenageur.fr>",
            to: [email],
            subject: hasQuotes
              ? "Un déménageur a répondu à votre demande !"
              : "Finalisez votre demande TrouveTonDemenageur",
            html: `
              <!DOCTYPE html>
              <html><head><meta charset="UTF-8"></head>
              <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
                <div style="background: linear-gradient(135deg, #3B82F6 0%, #10B981 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
                  <h1 style="margin:0; font-size: 24px;">🏠 TrouveTonDemenageur</h1>
                  <p style="margin:8px 0 0; opacity:0.9;">${hasQuotes ? 'Une offre vous attend' : 'Encore une étape avant vos devis'}</p>
                </div>
                <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-radius: 0 0 10px 10px;">
                  <p>Bonjour ${firstName},</p>
                  ${hasQuotes
                    ? `<p><strong>Bonne nouvelle : un déménageur a déjà répondu à votre demande${request.from_city ? ` (${request.from_city} → ${request.to_city})` : ''} !</strong></p>
                       <p>Il ne vous reste plus qu'à créer votre mot de passe pour voir son offre et pouvoir l'accepter :</p>`
                    : `<p>Merci pour votre demande sur <strong>TrouveTonDemenageur</strong>. Cliquez ci-dessous pour créer votre mot de passe et finaliser votre demande :</p>`
                  }
                  <div style="text-align: center; margin: 30px 0;">
                    <a href="${actionUrl}" style="display: inline-block; background: #3B82F6; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
                      ${hasQuotes ? 'Voir mon offre' : 'Créer mon mot de passe'}
                    </a>
                  </div>
                  <p style="text-align: center; color: #6B7280; font-size: 14px;">Ce lien expire dans 24 heures.</p>
                </div>
              </body></html>
            `,
          }),
        });
        emailsSent++;
      } catch (e) {
        console.warn("Email de relance sans-compte échoué (non bloquant):", e);
      }
    }

    await supabaseAdmin.from("client_quote_reminder_log").insert({
      quote_request_id: request.id,
      reminder_type: "no_account",
    });
  }

  return new Response(
    JSON.stringify({ requestsChecked: noAccountRequests.length, emailsSent }),
    { headers: { "Content-Type": "application/json" } }
  );
});
