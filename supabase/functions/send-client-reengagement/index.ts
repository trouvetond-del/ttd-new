// supabase/functions/send-client-reengagement/index.ts
// Cron 1x/jour. Relance les clients inscrits mais inactifs depuis 14
// jours ou plus (jamais reconnectés / jamais revenus), avec un email
// engageant. Ne renvoie jamais plus d'1 fois tous les 21 jours par
// client pour ne pas spammer quelqu'un qui a simplement changé d'avis.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

Deno.serve(async () => {
  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  let emailsSent = 0;

  const { data: inactiveClients, error } = await supabaseAdmin.rpc("get_inactive_clients", {
    days_inactive: 14,
  });

  if (error || !inactiveClients) {
    return new Response(JSON.stringify({ error: error?.message || "Erreur chargement clients inactifs" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  for (const client of inactiveClients) {
    // Max 1 relance tous les 21 jours par client
    const { data: lastSent } = await supabaseAdmin
      .from("client_reengagement_email_log")
      .select("sent_at")
      .eq("client_user_id", client.user_id)
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastSent) {
      const daysSince = (Date.now() - new Date(lastSent.sent_at).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince < 21) continue;
    }

    // Si le client a déjà une demande de déménagement en cours quelque
    // part, pas la peine de le "réengager" -- il est déjà engagé.
    const { data: activeRequest } = await supabaseAdmin
      .from("quote_requests")
      .select("id")
      .eq("client_user_id", client.user_id)
      .in("status", ["new", "assigned", "quoted", "accepted"])
      .limit(1)
      .maybeSingle();

    if (activeRequest) continue;

    const firstName = client.first_name || "";

    if (resendApiKey && client.email) {
      try {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: "TrouveTonDemenageur <noreply@trouvetondemenageur.fr>",
            to: [client.email],
            subject: "🚚 Un déménagement en tête ? On vous trouve les meilleurs devis en 2 min",
            html: `
              <!DOCTYPE html>
              <html><head><meta charset="UTF-8"></head>
              <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
                <div style="background: linear-gradient(135deg, #3B82F6 0%, #10B981 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
                  <h1 style="margin:0; font-size: 22px;">🚚 On ne vous a pas revu par ici...</h1>
                </div>
                <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-radius: 0 0 10px 10px;">
                  <p>Bonjour ${firstName || ''},</p>
                  <p>Un déménagement se prépare ou approche ? En 2 minutes, décrivez votre projet et recevez plusieurs devis de déménageurs vérifiés, prêts à s'occuper de tout.</p>
                  <ul style="color:#374151;">
                    <li>✅ Déménageurs vérifiés (KBIS, assurance, identité)</li>
                    <li>✅ Comparez plusieurs devis, en toute transparence</li>
                    <li>✅ Paiement sécurisé, protégé jusqu'à la fin de la mission</li>
                  </ul>
                  <div style="text-align: center; margin: 30px 0;">
                    <a href="https://www.trouvetondemenageur.fr/devis-rapide" style="display: inline-block; background: #10B981; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
                      Recevoir mes devis gratuits
                    </a>
                  </div>
                  <p style="color:#9CA3AF; font-size:12px; text-align:center;">Vous ne souhaitez plus recevoir ces emails ? Répondez simplement "STOP" à ce message.</p>
                </div>
              </body></html>
            `,
          }),
        });
        emailsSent++;
      } catch (e) {
        console.warn("Email réengagement échoué (non bloquant):", e);
      }
    }

    await supabaseAdmin.from("client_reengagement_email_log").insert({ client_user_id: client.user_id });
  }

  return new Response(
    JSON.stringify({ clientsChecked: inactiveClients.length, emailsSent }),
    { headers: { "Content-Type": "application/json" } }
  );
});
