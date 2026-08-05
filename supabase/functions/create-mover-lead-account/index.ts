// supabase/functions/create-mover-lead-account/index.ts
// Crée le compte Supabase Auth du déménageur puis pré-remplit
// mover_signup_progress (table de brouillon déjà utilisée par
// MoverProfileCompletionPage). N'insère JAMAIS dans `movers` ici : cette
// table ne doit contenir que des inscriptions réellement complétées avec
// documents, sinon on recrée le bug des comptes fantômes déjà corrigé
// côté client.

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
      .from("mover_lead_verifications")
      .select("*")
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
      return new Response(JSON.stringify({ error: "Ce lien a expiré. Refaites une demande sur /inscription-demenageur." }), {
        status: 410,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const email = verification.email;

    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const alreadyExists = existingUsers?.users?.some((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (alreadyExists) {
      return new Response(
        JSON.stringify({ error: "Un compte existe déjà avec cet email. Connectez-vous normalement.", alreadyExists: true }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Re-vérifie qu'aucun mover réel n'a été créé entre-temps avec ce SIRET/email
    const { data: existingMover } = await supabaseAdmin
      .from("movers")
      .select("id")
      .or(`siret.eq.${verification.siret},email.eq.${email}`)
      .limit(1);
    if (existingMover && existingMover.length > 0) {
      return new Response(
        JSON.stringify({ error: "Ce SIRET ou cet email est déjà enregistré. Connectez-vous normalement.", alreadyExists: true }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        first_name: verification.manager_firstname,
        last_name: verification.manager_lastname,
        role: "mover",
      },
    });

    if (createError || !newUser?.user) {
      console.error("Erreur création utilisateur mover:", createError);
      return new Response(JSON.stringify({ error: createError?.message || "Erreur lors de la création du compte" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = newUser.user.id;

    // Pré-remplit le brouillon que MoverProfileCompletionPage charge déjà
    // automatiquement au chargement (loadSavedProgress) — aucune
    // modification nécessaire sur cette page.
    await supabaseAdmin.from("mover_signup_progress").upsert(
      {
        user_id: userId,
        email,
        company_name: verification.company_name,
        siret: verification.siret,
        phone: verification.phone,
        manager_firstname: verification.manager_firstname,
        manager_lastname: verification.manager_lastname,
        manager_phone: verification.phone,
        step: "company_pending",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

    await supabaseAdmin
      .from("mover_lead_verifications")
      .update({ used_at: new Date().toISOString() })
      .eq("id", verification.id);

    return new Response(JSON.stringify({ success: true, email }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error in create-mover-lead-account:", error);
    return new Response(JSON.stringify({ error: error.message || "Erreur serveur" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
