// supabase/functions/admin-send-client-quote-reminder/index.ts
// Appelée par l'admin depuis "Demandes de Devis Récentes" (bouton "Relancer")
// pour envoyer IMMÉDIATEMENT l'email "finalisez votre demande" à un client
// qui a déjà un compte mais dont la demande est incomplète (étage/taille/
// type/cubage manquants) -- sans attendre le prochain passage du cron
// send-client-quote-reminder (toutes les 12h) et sans le throttle de 24h
// entre deux relances automatiques, puisque c'est une action volontaire
// de l'admin sur UNE demande précise.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Non authentifié" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: "Session invalide" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Vérifie que l'appelant est bien un admin
    const { data: adminRow } = await supabaseAdmin
      .from("admins")
      .select("id")
      .eq("email", userData.user.email)
      .maybeSingle();

    if (!adminRow) {
      return new Response(JSON.stringify({ error: "Accès réservé aux administrateurs" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { quoteRequestId } = await req.json();
    if (!quoteRequestId) {
      return new Response(JSON.stringify({ error: "quoteRequestId requis" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: request, error: qrError } = await supabaseAdmin
      .from("quote_requests")
      .select(
        "id, client_name, client_email, client_user_id, from_city, to_city, from_home_size, from_home_type, to_home_size, to_home_type, volume_m3"
      )
      .eq("id", quoteRequestId)
      .maybeSingle();

    if (qrError || !request) {
      return new Response(JSON.stringify({ error: "Demande introuvable" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!request.client_user_id) {
      return new Response(
        JSON.stringify({
          error: "Ce client n'a pas encore de compte -- utilisez plutôt le bouton \"Inviter\".",
        }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!request.client_email) {
      return new Response(
        JSON.stringify({ error: "Cette demande n'a pas d'email client renseigné." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const isIncomplete =
      !request.from_home_size ||
      !request.from_home_type ||
      !request.to_home_size ||
      !request.to_home_type ||
      !request.volume_m3;

    if (!isIncomplete) {
      return new Response(
        JSON.stringify({ error: "Cette demande est déjà complète, rien à relancer." }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const firstName = (request.client_name || "").split(" ")[0] || "";
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    let emailSent = false;

    if (resendApiKey) {
      const res = await fetch("https://api.resend.com/emails", {
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
                <p>Votre demande de déménagement ${request.from_city ? `(${request.from_city} → ${request.to_city})` : ''} n'est pas encore terminée : il manque encore l'étage, la taille du logement ou le cubage.</p>
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
      emailSent = res.ok;
      if (!res.ok) {
        console.error("Erreur envoi email (relance manuelle admin):", await res.text());
      }
    } else {
      console.warn("RESEND_API_KEY manquante : relance non envoyée.");
    }

    // Log dans la même table que le cron, pour garder un historique unique et
    // éviter que le cron ne renvoie un doublon dans l'heure qui suit.
    await supabaseAdmin.from("client_quote_reminder_log").insert({
      quote_request_id: request.id,
      triggered_by: "admin",
    });

    if (!emailSent) {
      return new Response(
        JSON.stringify({ error: "Configuration email manquante ou envoi échoué côté serveur." }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error in admin-send-client-quote-reminder:", error);
    return new Response(JSON.stringify({ error: error.message || "Erreur serveur" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
