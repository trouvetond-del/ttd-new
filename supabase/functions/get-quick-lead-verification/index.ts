// supabase/functions/get-quick-lead-verification/index.ts
// Fonction publique (pas d'auth requise) : valide un token de vérification
// devis-rapide et retourne l'email/prénom associés, pour affichage sur la
// page de création de mot de passe. Ne modifie rien.

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
      return new Response(JSON.stringify({ error: "Token requis" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: verification, error } = await supabaseAdmin
      .from("quick_lead_verifications")
      .select("id, quote_request_id, email, expires_at, used_at")
      .eq("token", token)
      .maybeSingle();

    if (error || !verification) {
      return new Response(JSON.stringify({ error: "Lien invalide ou introuvable" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (verification.used_at) {
      return new Response(JSON.stringify({ error: "already_used", email: verification.email }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (new Date(verification.expires_at).getTime() < Date.now()) {
      return new Response(JSON.stringify({ error: "expired" }), {
        status: 410,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: quoteRequest } = await supabaseAdmin
      .from("quote_requests")
      .select("client_name")
      .eq("id", verification.quote_request_id)
      .maybeSingle();

    return new Response(
      JSON.stringify({
        email: verification.email,
        firstName: quoteRequest?.client_name?.split(" ")[0] || "",
        quoteRequestId: verification.quote_request_id,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in get-quick-lead-verification:", error);
    return new Response(JSON.stringify({ error: error.message || "Erreur serveur" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
