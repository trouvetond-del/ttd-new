// supabase/functions/create-draft-quote-account/index.ts
// Point d'entrée du "step 0" de /client/quote : email d'abord, compte
// léger créé immédiatement (mot de passe temporaire généré côté
// serveur, PAS d'aller-retour email requis pour continuer -- c'est
// justement le point : ne plus bloquer l'estimation derrière une
// inscription complète). Le client se reconnecte ensuite côté
// frontend avec ce mot de passe temporaire pour établir sa session,
// puis est redirigé vers /client/quote/:id/edit (flux déjà stable,
// non modifié par ce chantier).
//
// Un vrai mot de passe pourra être défini plus tard par le client
// (ex: via "mot de passe oublié" ou une page de complétion), comme
// pour les comptes créés via /devis-rapide.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function generateTempPassword(): string {
  // Mot de passe temporaire aléatoire, jamais affiché ni stocké en
  // clair après cet appel -- uniquement utilisé pour établir la
  // session immédiatement côté client.
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return "Tp-" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { email: rawEmail, phone, firstName, lastName, marketingConsent, smsConsent } = await req.json();
    const email = typeof rawEmail === "string" ? rawEmail.trim().toLowerCase() : rawEmail;

    if (!email || !isValidEmail(email)) {
      return new Response(JSON.stringify({ error: "Adresse email invalide." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!phone || !firstName || !lastName) {
      return new Response(JSON.stringify({ error: "Nom, prénom et téléphone sont obligatoires." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Un compte existe déjà avec cet email : on ne crée pas de doublon
    // ni ne prend le contrôle d'un compte existant. Le client doit se
    // connecter normalement puis créer sa demande depuis son espace.
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const alreadyExists = existingUsers?.users?.some(
      (u) => u.email?.toLowerCase() === email.toLowerCase()
    );
    if (alreadyExists) {
      return new Response(
        JSON.stringify({
          error: "Un compte existe déjà avec cet email. Connectez-vous pour créer votre demande.",
          alreadyExists: true,
        }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const tempPassword = generateTempPassword();

    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { first_name: firstName, last_name: lastName },
    });

    if (createError || !newUser?.user) {
      console.error("Erreur création utilisateur (draft quote):", createError);
      return new Response(JSON.stringify({ error: createError?.message || "Erreur lors de la création du compte" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = newUser.user.id;

    const { error: clientError } = await supabaseAdmin.from("clients").insert({
      user_id: userId,
      email,
      first_name: firstName,
      last_name: lastName,
      phone,
      profile_completed: true,
      created_at: new Date().toISOString(),
    });

    if (clientError) {
      console.error("Erreur creation fiche client (draft quote):", clientError);
      // On ne bloque pas : le compte auth existe déjà, la fiche client
      // pourra être recréée plus tard si besoin. Mieux vaut continuer
      // que de laisser un compte orphelin sans demande associée.
    }

    // Brouillon : is_draft=true par défaut (colonne déjà en place),
    // aucun champ logistique requis à ce stade -- uniquement ce que le
    // step 0 a collecté.
    const { data: draft, error: draftError } = await supabaseAdmin
      .from("quote_requests")
      .insert({
        client_user_id: userId,
        client_name: `${firstName} ${lastName}`.trim(),
        client_email: email,
        client_phone: phone,
        from_address: "",
        from_city: "",
        from_postal_code: "",
        to_address: "",
        to_city: "",
        to_postal_code: "",
        status: "new",
        marketing_consent: !!marketingConsent,
        sms_consent: !!smsConsent,
        entry_channel: "full_form",
      })
      .select("id, resume_token")
      .single();

    if (draftError || !draft) {
      console.error("Erreur creation brouillon (draft quote):", draftError);
      return new Response(JSON.stringify({ error: "Compte créé mais erreur lors de la création de la demande." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        email,
        tempPassword,
        quoteRequestId: draft.id,
        resumeToken: draft.resume_token,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("Error in create-draft-quote-account:", err);
    return new Response(JSON.stringify({ error: err.message || "Erreur serveur" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
