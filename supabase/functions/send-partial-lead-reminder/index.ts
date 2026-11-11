// supabase/functions/send-partial-lead-reminder/index.ts
// Cron toutes les 3 h. Clients : 3 emails sur 5 jours (J0 +1 h, J+2, J+5)
// à ceux qui ont laissé leur email sans terminer leur demande, puis arrêt.
// Déménageurs : relance d'inscription inchangée (espacement croissant, 5 max).
// Une demande terminée avec le même email marque le contact comme converti
// et arrête immédiatement les relances.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { nextClientStep } from "./sequence.ts";

const SITE = "https://www.trouvetondemenageur.fr";
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

function layout(title: string, body: string, cta: { url: string; label: string }) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;background:#f4f6fb;font-family:Arial,sans-serif;color:#1f2937;">
<div style="max-width:560px;margin:0 auto;padding:24px 16px;">
 <div style="background:#ffffff;border-radius:14px;padding:28px;border:1px solid #e5e7eb;">
  <p style="margin:0 0 6px;font-size:13px;color:#2563eb;font-weight:bold;">Trouve Ton Déménageur</p>
  <h1 style="margin:0 0 16px;font-size:21px;line-height:1.3;color:#111827;">${title}</h1>
  ${body}
  <div style="text-align:center;margin:26px 0 8px;"><a href="${cta.url}" style="display:inline-block;background:#2563eb;color:#ffffff;padding:13px 28px;border-radius:10px;text-decoration:none;font-weight:bold;">${cta.label}</a></div>
 </div>
 <p style="font-size:13px;color:#4b5563;margin:18px 4px 4px;">L'équipe Trouve Ton Déménageur<br>01 89 70 78 81 · <a href="${SITE}" style="color:#2563eb;">www.trouvetondemenageur.fr</a></p>
 <p style="font-size:11px;color:#9ca3af;margin:4px;">Vous recevez ce message car vous avez commencé une demande sur notre site. C'est l'un de nos 3 rappels au maximum ; ignorez-le si votre projet a changé.</p>
</div></body></html>`;
}

export function clientEmail(step: number, firstName: string | null) {
  const hi = firstName ? `Bonjour ${esc(firstName)},` : "Bonjour,";
  const p = (t: string) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;">${t}</p>`;
  if (step === 0) return {
    subject: "Votre demande de devis n'est pas terminée",
    html: layout("Il ne manque que quelques informations", p(hi) + p("Vous avez commencé une demande de devis déménagement. Pour que des déménageurs vérifiés puissent vous répondre, il reste à indiquer vos adresses, les étages et le volume.") + p("Cela prend environ 3 minutes, et vous pouvez comparer jusqu'à 3 devis gratuits."), { url: `${SITE}/client/quote`, label: "Terminer ma demande" }),
  };
  if (step === 1) return {
    subject: "Pas sûr de votre volume ? On vous aide",
    html: layout("Estimez votre volume pièce par pièce", p(hi) + p("Le volume est souvent ce qui bloque. Notre calculateur l'estime en indiquant simplement vos meubles, pièce par pièce, puis le reprend dans votre demande.") + p("Un volume juste, ce sont des devis plus précis et moins de mauvaises surprises le jour J."), { url: `${SITE}/calculateur-volume`, label: "Calculer mon volume" }),
  };
  return {
    subject: "Dernier rappel : on vous appelle ?",
    html: layout("Vous préférez en parler de vive voix ?", p(hi) + p("C'est notre dernier message au sujet de votre demande. Si remplir le formulaire n'est pas pratique, laissez-nous votre numéro : un membre de l'équipe vous rappelle pour préparer votre demande avec vous.") + p("Vous pouvez aussi nous joindre directement au 01 89 70 78 81."), { url: `${SITE}/devis-rapide`, label: "Être rappelé" }),
  };
}

Deno.serve(async () => {
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  let emailsSent = 0, converted = 0;
  const sinceMover = new Date(Date.now() - 30 * 864e5).toISOString();
  const sinceClient = new Date(Date.now() - 8 * 864e5).toISOString();

  const { data: leads, error } = await sb
    .from("partial_leads")
    .select("id, lead_type, email, phone, first_name, last_name, company_name, created_at, reminder_sent_at, reminder_count, converted_at")
    .is("converted_at", null)
    .gte("created_at", sinceMover);
  if (error || !leads) {
    return new Response(JSON.stringify({ error: error?.message || "Erreur chargement partial_leads" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }

  const send = async (to: string, subject: string, html: string) => {
    if (!resendApiKey) return false;
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: "Trouve Ton Déménageur <noreply@trouvetondemenageur.fr>", to: [to], subject, html }),
    });
    if (!r.ok) console.warn("Relance non envoyée", r.status, await r.text());
    return r.ok;
  };

  for (const lead of leads) {
    if (!lead.email) continue;
    if (lead.lead_type === "client") {
      if (lead.created_at < sinceClient) continue;
      // Demande terminée avec ce même email depuis la capture : on arrête tout.
      const { count } = await sb.from("quote_requests").select("id", { count: "exact", head: true })
        .ilike("client_email", lead.email).eq("is_draft", false).gte("created_at", lead.created_at);
      if ((count || 0) > 0) {
        await sb.from("partial_leads").update({ converted_at: new Date().toISOString() }).eq("id", lead.id);
        converted++;
        continue;
      }
      const step = nextClientStep(lead);
      if (step === null) continue;
      const { subject, html } = clientEmail(step, lead.first_name);
      if (await send(lead.email, subject, html)) {
        emailsSent++;
        await sb.from("partial_leads").update({ reminder_sent_at: new Date().toISOString(), reminder_count: step + 1 }).eq("id", lead.id);
      }
      continue;
    }

    // Déménageurs : comportement précédent.
    if (lead.created_at > new Date(Date.now() - 36e5).toISOString()) continue;
    if ((lead.reminder_count || 0) >= 5) continue;
    if (lead.reminder_sent_at) {
      const hoursSince = (Date.now() - new Date(lead.reminder_sent_at).getTime()) / 36e5;
      const minGap = lead.reminder_count === 0 ? 0 : Math.min(24 * lead.reminder_count, 96);
      if (hoursSince < minGap) continue;
    }
    const html = layout(`${lead.company_name ? `Bonjour ${esc(lead.company_name)}, v` : "V"}otre inscription n'est pas terminée`,
      `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;">Vous avez commencé votre inscription en tant que déménageur. Tant qu'elle n'est pas terminée, vous ne recevez aucune demande de devis.</p>`,
      { url: `${SITE}/inscription-demenageur`, label: "Terminer mon inscription" });
    if (await send(lead.email, "Votre inscription déménageur n'est pas terminée", html)) emailsSent++;
    await sb.from("partial_leads").update({ reminder_sent_at: new Date().toISOString(), reminder_count: (lead.reminder_count || 0) + 1 }).eq("id", lead.id);
  }

  return new Response(JSON.stringify({ leadsChecked: leads.length, emailsSent, converted }), { headers: { "Content-Type": "application/json" } });
});
