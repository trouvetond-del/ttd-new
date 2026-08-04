// supabase/functions/link-quick-lead-account/index.ts
// Appelée depuis ClientQuotePage quand un utilisateur arrive via le lien
// magique de /devis-rapide. Relie son compte (créé par Supabase Auth au clic
// sur le lien) à la ligne quote_requests déjà créée, et crée sa fiche client
// avec le nom/téléphone déjà collectés (donc plus jamais de fiche "Non renseigné"
// pour ce parcours).

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

    const { quoteRequestId } = await req.json();
    if (!quoteRequestId) {
      return new Response(JSON.stringify({ error: "quoteRequestId requis" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Identifie l'utilisateur à partir de son token (lien magique déjà validé par Supabase Auth)
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: "Session invalide" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const user = userData.user;

    // Récupère la demande de devis rapide
    const { data: quoteRequest, error: qrError } = await supabaseAdmin
      .from("quote_requests")
      .select("id, client_name, client_email, client_phone, client_user_id")
      .eq("id", quoteRequestId)
      .maybeSingle();

    if (qrError || !quoteRequest) {
      return new Response(JSON.stringify({ error: "Demande introuvable" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Sécurité : l'email du compte connecté doit correspondre à celui du lead
    if (quoteRequest.client_email?.toLowerCase() !== user.email?.toLowerCase()) {
      return new Response(JSON.stringify({ error: "Cette demande n'appartient pas à ce compte" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Relie la demande à l'utilisateur (si pas déjà fait)
    if (!quoteRequest.client_user_id) {
      await supabaseAdmin
        .from("quote_requests")
        .update({ client_user_id: user.id })
        .eq("id", quoteRequestId);
    }

    // Crée la fiche client si elle n'existe pas, avec le nom/téléphone déjà connus
    const { data: existingClient } = await supabaseAdmin
      .from("clients")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!existingClient) {
      const [firstName, ...rest] = (quoteRequest.client_name || "").split(" ");
      await supabaseAdmin.from("clients").insert({
        user_id: user.id,
        email: user.email || quoteRequest.client_email,
        first_name: firstName || "",
        last_name: rest.join(" ") || "",
        phone: quoteRequest.client_phone || "",
        profile_completed: true,
        created_at: new Date().toISOString(),
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error in link-quick-lead-account:", error);
    return new Response(JSON.stringify({ error: error.message || "Erreur serveur" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
