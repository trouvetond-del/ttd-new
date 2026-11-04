// Invitation manuelle par l'admin : envoie à UN déménageur précis l'invitation
// à déposer un devis sur UNE demande (ex. pendant ou après un appel).
// Indépendante de la relance automatique.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { buildMoverQuoteEmail } from "../_shared/mover-quote-email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Non authentifié" }, 401);

    const supabaseAdmin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(authHeader.replace("Bearer ", ""));
    if (userError || !userData.user) return json({ error: "Session invalide" }, 401);

    const { data: adminRow } = await supabaseAdmin.from("admins").select("id").eq("email", userData.user.email).maybeSingle();
    if (!adminRow) return json({ error: "Accès réservé aux administrateurs" }, 403);

    const { quoteRequestId, moverId } = await req.json();
    if (!quoteRequestId || !moverId) return json({ error: "quoteRequestId et moverId requis" }, 400);

    const { data: request } = await supabaseAdmin
      .from("quote_requests")
      .select("id, reference, from_city, to_city, moving_date, volume_m3, status, is_draft")
      .eq("id", quoteRequestId)
      .maybeSingle();
    if (!request) return json({ error: "Demande introuvable" }, 404);
    if (request.is_draft || !["new", "assigned", "quoted"].includes(request.status)) {
      return json({ error: "Cette demande n'accepte plus de devis" }, 400);
    }

    const { data: mover } = await supabaseAdmin
      .from("movers")
      .select("id, user_id, email, company_name")
      .eq("id", moverId)
      .maybeSingle();
    if (!mover || !mover.email) return json({ error: "Déménageur introuvable ou sans email" }, 404);

    const { count } = await supabaseAdmin
      .from("quotes")
      .select("id", { count: "exact", head: true })
      .eq("quote_request_id", request.id)
      .eq("mover_id", mover.id);
    if ((count || 0) > 0) return json({ error: "Ce déménageur a déjà déposé un devis sur cette demande" }, 400);

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) return json({ error: "Service d'envoi non configuré" }, 500);

    const shortRef = request.reference || `#${request.id.slice(0, 8).toUpperCase()}`;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const target = new Date(request.moving_date); target.setHours(0, 0, 0, 0);
    const days = Math.max(0, Math.ceil((target.getTime() - today.getTime()) / 86400000));

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "TrouveTonDemenageur <noreply@trouvetondemenageur.fr>",
        to: [mover.email],
        subject: `Suite à notre échange : ${request.from_city} → ${request.to_city} (${shortRef})`,
        html: buildMoverQuoteEmail({
          companyName: mover.company_name,
          reference: shortRef,
          fromCity: request.from_city,
          toCity: request.to_city,
          movingDate: request.moving_date,
          days,
          volumeM3: request.volume_m3,
          personalInvite: true,
        }),
      }),
    });
    if (!res.ok) {
      console.error("Resend error", res.status, await res.text());
      return json({ error: "L'email n'a pas pu être envoyé" }, 502);
    }

    await supabaseAdmin.from("notifications").insert({
      user_id: mover.user_id,
      user_type: "mover",
      title: `Invitation : ${shortRef}`,
      message: `${request.from_city} → ${request.to_city}, le ${new Date(request.moving_date).toLocaleDateString("fr-FR")}. Notre équipe vous invite à déposer un devis.`,
      type: "quote_reminder",
      related_id: request.id,
      read: false,
      data: { quote_request_id: request.id, reference: shortRef, manual_invite: true },
    });
    await supabaseAdmin.from("quote_reminder_log").insert({
      quote_request_id: request.id,
      mover_id: mover.id,
      urgency: "admin_invite",
    });

    return json({ ok: true, email: mover.email });
  } catch (e) {
    console.error(e);
    return json({ error: "Erreur inattendue" }, 500);
  }
});
