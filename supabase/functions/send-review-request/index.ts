// supabase/functions/send-review-request/index.ts
// Cron 1x/jour. Quand un déménagement est validé (mission_completion_status
// = 'approved') depuis au moins 1 jour, on demande au client un VRAI avis
// Trustpilot. Une seule fois par déménagement (review_request_log).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const TRUSTPILOT_URL = "https://fr.trustpilot.com/evaluate/trouvetondemenageur.fr";

Deno.serve(async () => {
  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const oneDayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();

  const { data: payments, error } = await supabaseAdmin
    .from("payments")
    .select("id, quote_request_id, mission_completion_date")
    .eq("mission_completion_status", "approved")
    .lte("mission_completion_date", oneDayAgo)
    .gte("mission_completion_date", thirtyDaysAgo);

  if (error || !payments) {
    return new Response(JSON.stringify({ error: error?.message || "Erreur chargement" }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }

  let emailsSent = 0;
  for (const p of payments) {
    const { data: already } = await supabaseAdmin
      .from("review_request_log").select("id").eq("payment_id", p.id).maybeSingle();
    if (already) continue;

    const { data: req } = await supabaseAdmin
      .from("quote_requests")
      .select("client_name, client_email, from_city, to_city")
      .eq("id", p.quote_request_id).maybeSingle();
    if (!req?.client_email || !resendApiKey) continue;

    const firstName = (req.client_name || "").split(" ")[0] || "";
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "TrouveTonDemenageur <noreply@trouvetondemenageur.fr>",
          to: [req.client_email],
          subject: "Comment s'est passé votre déménagement ?",
          html: `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="font-family: Arial, sans-serif; line-height:1.6; color:#333; max-width:600px; margin:0 auto; padding:20px;">
  <div style="background:#2563EB; color:white; padding:28px; text-align:center; border-radius:10px 10px 0 0;">
    <h1 style="margin:0; font-size:22px;">Merci de nous avoir fait confiance</h1>
  </div>
  <div style="background:#ffffff; padding:30px; border:1px solid #e5e7eb; border-radius:0 0 10px 10px;">
    <p>Bonjour ${firstName},</p>
    <p>Votre déménagement ${req.from_city ? `${req.from_city} → ${req.to_city} ` : ""}est terminé. Nous espérons que tout s'est bien passé.</p>
    <p>Votre avis, qu'il soit positif ou non, aide d'autres familles à choisir un déménageur en confiance. Cela prend moins d'une minute.</p>
    <div style="text-align:center; margin:30px 0;">
      <a href="${TRUSTPILOT_URL}" style="display:inline-block; background:#00B67A; color:white; padding:14px 32px; text-decoration:none; border-radius:8px; font-weight:bold; font-size:16px;">Donner mon avis sur Trustpilot</a>
    </div>
    <p style="font-size:13px; color:#6b7280;">Un souci ? Appelez-nous au 01 89 70 78 81, nous vous aidons.</p>
  </div>
</body></html>`,
        }),
      });
      if (!res.ok) { console.warn("Resend:", res.status, await res.text()); continue; }
      emailsSent++;
      await supabaseAdmin.from("review_request_log").insert({ payment_id: p.id });
    } catch (e) {
      console.warn("Email avis échoué:", e);
    }
  }
  return new Response(JSON.stringify({ checked: payments.length, emailsSent }), {
    headers: { "Content-Type": "application/json" },
  });
});
