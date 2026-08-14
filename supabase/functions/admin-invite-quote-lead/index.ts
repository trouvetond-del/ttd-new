// supabase/functions/admin-invite-quote-lead/index.ts
// Appelée par l'admin depuis "Demandes de Devis Récentes" pour (ré)envoyer
// l'email "Créer mon mot de passe" à un client qui a soumis une demande
// (ancienne ou via devis-rapide) mais n'a jamais de compte lié. Réutilise
// exactement le même mécanisme que api/quick-lead.ts (table
// quick_lead_verifications + même email), pour que le client atterrisse
// sur /devis-rapide/mot-de-passe puis /client/quote/{id}/edit pré-rempli.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function generateCode(): string {
  return String(Math.floor(10000000 + Math.random() * 90000000));
}

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

    const { data: quoteRequest, error: qrError } = await supabaseAdmin
      .from("quote_requests")
      .select("id, client_name, client_email, client_user_id, from_city, to_city")
      .eq("id", quoteRequestId)
      .maybeSingle();

    if (qrError || !quoteRequest) {
      return new Response(JSON.stringify({ error: "Demande introuvable" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (quoteRequest.client_user_id) {
      return new Response(
        JSON.stringify({ error: "Ce client a déjà un compte lié à cette demande." }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!quoteRequest.client_email) {
      return new Response(
        JSON.stringify({ error: "Cette demande n'a pas d'email client renseigné." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Un déménageur a-t-il déjà répondu ? Si oui, le message doit être
    // urgent : le client a une offre qui l'attend et ne peut pas la voir
    // tant qu'il n'a pas de compte. Note : ceci suppose que la demande est
    // déjà is_draft=false (seul cas où un devis a pu être déposé, puisque
    // les brouillons sont invisibles des déménageurs).
    const { count: quotesCount } = await supabaseAdmin
      .from("quotes")
      .select("id", { count: "exact", head: true })
      .eq("quote_request_id", quoteRequestId);

    const hasQuotes = (quotesCount || 0) > 0;

    const leadToken = generateToken();
    const code = generateCode();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const email = quoteRequest.client_email.toLowerCase();
    const firstName = (quoteRequest.client_name || "").split(" ")[0] || "";

    const { error: insertError } = await supabaseAdmin.from("quick_lead_verifications").insert({
      quote_request_id: quoteRequest.id,
      email,
      token: leadToken,
      code,
      expires_at: expiresAt,
    });

    if (insertError) {
      console.error("Erreur création vérification (invite admin):", insertError);
      return new Response(JSON.stringify({ error: insertError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const actionUrl = `https://www.trouvetondemenageur.fr/devis-rapide/mot-de-passe?token=${leadToken}`;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    if (resendApiKey) {
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
                  ? `<p><strong>Bonne nouvelle : un déménageur a déjà répondu à votre demande${quoteRequest.from_city ? ` (${quoteRequest.from_city} → ${quoteRequest.to_city})` : ''} !</strong></p>
                     <p>Il ne vous reste plus qu'à créer votre mot de passe pour voir son offre et pouvoir l'accepter :</p>`
                  : `<p>Merci pour votre demande sur <strong>TrouveTonDemenageur</strong>. Cliquez ci-dessous pour créer votre mot de passe et finaliser votre demande (étage, ascenseur, inventaire...) :</p>`
                }
                <div style="text-align: center; margin: 30px 0;">
                  <a href="${actionUrl}" style="display: inline-block; background: #3B82F6; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
                    ${hasQuotes ? 'Voir mon offre' : 'Créer mon mot de passe'}
                  </a>
                </div>
                <p style="text-align: center; color: #6B7280; font-size: 14px;">Ce lien expire dans 24 heures.</p>
                <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
                <p style="color: #6B7280; font-size: 13px;">Si vous n'êtes pas à l'origine de cette demande, ignorez simplement cet email.</p>
              </div>
            </body></html>
          `,
        }),
      });
    } else {
      console.warn("RESEND_API_KEY manquante : invitation non envoyée.");
    }

    return new Response(JSON.stringify({ success: true, hasQuotes }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error in admin-invite-quote-lead:", error);
    return new Response(JSON.stringify({ error: error.message || "Erreur serveur" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
