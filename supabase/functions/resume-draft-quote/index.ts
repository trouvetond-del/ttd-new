// supabase/functions/resume-draft-quote/index.ts
// Reçoit un resume_token (depuis /client/quote/reprendre?token=... ou
// un lien de relance email/SMS), retrouve le brouillon correspondant,
// et génère un lien magique Supabase standard (auth.admin.generateLink,
// pas de mécanisme custom) pour reconnecter le client. Le frontend
// redirige immédiatement vers ce lien, qui renvoie sur le site déjà
// authentifié.

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
    const { token } = await req.json();
    if (!token) {
      return new Response(JSON.stringify({ error: "Token manquant." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: quoteRequest, error: qrError } = await supabaseAdmin
      .from("quote_requests")
      .select("id, client_email, is_draft")
      .eq("resume_token", token)
      .maybeSingle();

    if (qrError || !quoteRequest) {
      return new Response(JSON.stringify({ error: "Lien de reprise invalide." }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!quoteRequest.is_draft) {
      // Déjà soumise : rien à reprendre, on renvoie l'id pour que le
      // frontend puisse rediriger vers le suivi de la demande plutôt
      // que vers le formulaire.
      return new Response(
        JSON.stringify({ success: true, alreadySubmitted: true, quoteRequestId: quoteRequest.id }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const baseUrl = Deno.env.get("PUBLIC_SITE_URL") || "https://www.trouvetondemenageur.fr";

    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: quoteRequest.client_email,
      options: {
        redirectTo: `${baseUrl}/client/quote/${quoteRequest.id}/edit`,
      },
    });

    if (linkError || !linkData) {
      console.error("Erreur generateLink (resume-draft-quote):", linkError);
      return new Response(JSON.stringify({ error: "Impossible de générer le lien de reprise." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ success: true, magicLink: linkData.properties?.action_link, quoteRequestId: quoteRequest.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("Error in resume-draft-quote:", err);
    return new Response(JSON.stringify({ error: err.message || "Erreur serveur" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
