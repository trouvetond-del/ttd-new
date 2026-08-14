// supabase/functions/admin-send-draft-reminder/index.ts
// Appelée par l'admin depuis "Demandes de Devis Récentes" (bouton
// "Relancer (brouillon non terminé)") pour un client qui a un compte
// (client_user_id renseigné) mais dont la demande est toujours
// is_draft=true -- c'est-à-dire qu'il n'a JAMAIS cliqué sur "envoyer".
// Différent de admin-send-client-quote-reminder : le message n'est pas
// "il manque le cubage" mais "vous n'avez pas terminé votre demande",
// et le lien pointe vers /client/quote/reprendre (pas /edit directement),
// pour couvrir le cas où le client n'est plus connecté.

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
      .select("id, client_name, client_email, client_user_id, is_draft, resume_token, from_city, to_city")
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
        JSON.stringify({ error: "Ce client n'a pas encore de compte -- utilisez plutôt le bouton \"Inviter\"." }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!request.is_draft) {
      return new Response(
        JSON.stringify({ error: "Cette demande a déjà été soumise, ce n'est plus un brouillon." }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!request.client_email) {
      return new Response(
        JSON.stringify({ error: "Cette demande n'a pas d'email client renseigné." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const firstName = (request.client_name || "").split(" ")[0] || "";
    const resumeUrl = `https://www.trouvetondemenageur.fr/client/quote/reprendre?token=${request.resume_token}`;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    let emailSent = false;

    if (resendApiKey) {
      const res = await fetch("https://api.resend.com/emails", {
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
      emailSent = res.ok;
      if (!res.ok) {
        console.error("Erreur envoi email (relance brouillon manuelle admin):", await res.text());
      }
    } else {
      console.warn("RESEND_API_KEY manquante : relance non envoyée.");
    }

    await supabaseAdmin.from("client_quote_reminder_log").insert({
      quote_request_id: request.id,
      triggered_by: "admin",
      reminder_type: "draft_incomplete",
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
    console.error("Error in admin-send-draft-reminder:", error);
    return new Response(JSON.stringify({ error: error.message || "Erreur serveur" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
