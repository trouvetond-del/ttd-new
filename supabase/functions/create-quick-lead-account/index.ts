// supabase/functions/create-quick-lead-account/index.ts
// Fonction publique (pas d'auth requise, c'est justement elle qui crée le
// compte) : valide le token, crée l'utilisateur Supabase Auth avec le mot
// de passe choisi, crée sa fiche client (déjà complète: nom/tel connus dès
// le devis-rapide), relie la demande, et marque le token comme utilisé.

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
    const { token, password } = await req.json();
    if (!token || !password) {
      return new Response(JSON.stringify({ error: "Token et mot de passe requis" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (password.length < 8) {
      return new Response(JSON.stringify({ error: "Le mot de passe doit contenir au moins 8 caractères" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: verification, error: vError } = await supabaseAdmin
      .from("quick_lead_verifications")
      .select("id, quote_request_id, email, expires_at, used_at")
      .eq("token", token)
      .maybeSingle();

    if (vError || !verification) {
      return new Response(JSON.stringify({ error: "Lien invalide" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (verification.used_at) {
      return new Response(JSON.stringify({ error: "Ce lien a déjà été utilisé. Connectez-vous normalement." }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (new Date(verification.expires_at).getTime() < Date.now()) {
      return new Response(JSON.stringify({ error: "Ce lien a expiré. Refaites une demande sur /devis-rapide." }), {
        status: 410,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const email = verification.email;

    // Vérifie si un compte existe déjà pour cet email (ex: lien réutilisé après coup)
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const alreadyExists = existingUsers?.users?.some((u) => u.email?.toLowerCase() === email.toLowerCase());

    if (alreadyExists) {
      return new Response(
        JSON.stringify({ error: "Un compte existe déjà avec cet email. Connectez-vous normalement.", alreadyExists: true }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: quoteRequest } = await supabaseAdmin
      .from("quote_requests")
      .select("client_name, client_phone")
      .eq("id", verification.quote_request_id)
      .maybeSingle();

    const fullName = quoteRequest?.client_name || "";
    const [firstName, ...rest] = fullName.split(" ");
    const lastName = rest.join(" ");

    // Crée le compte, email déjà confirmé (l'ouverture du lien EST la preuve de possession de l'email)
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { first_name: firstName, last_name: lastName },
    });

    if (createError || !newUser?.user) {
      console.error("Erreur création utilisateur:", createError);
      return new Response(JSON.stringify({ error: createError?.message || "Erreur lors de la création du compte" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = newUser.user.id;

    await supabaseAdmin.from("clients").insert({
      user_id: userId,
      email,
      first_name: firstName || "",
      last_name: lastName || "",
      phone: quoteRequest?.client_phone || "",
      profile_completed: true,
      created_at: new Date().toISOString(),
    });

    await supabaseAdmin
      .from("quote_requests")
      .update({ client_user_id: userId })
      .eq("id", verification.quote_request_id);

    await supabaseAdmin
      .from("quick_lead_verifications")
      .update({ used_at: new Date().toISOString() })
      .eq("id", verification.id);

    return new Response(
      JSON.stringify({ success: true, email, quoteRequestId: verification.quote_request_id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in create-quick-lead-account:", error);
    return new Response(JSON.stringify({ error: error.message || "Erreur serveur" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
