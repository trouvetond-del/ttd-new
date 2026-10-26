// Toutes les 15 min : emails aux déménageurs vérifiés pour chaque groupage détecté,
// et au déménageur pour chaque devis déposé par l'admin. Un email par destinataire.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { adminClient, escapeHtml, isAuthorizedCaller } from "../_shared/agent-utils.ts";

const SITE = "https://www.trouvetondemenageur.fr";
const fmt = (d: string) => new Date(d).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" });

function layout(title: string, body: string, cta: string) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;padding:20px;color:#111">
<div style="background:#1E40AF;color:#fff;padding:18px;border-radius:10px 10px 0 0"><h2 style="margin:0;font-size:18px">${escapeHtml(title)}</h2></div>
<div style="border:1px solid #e5e7eb;border-top:0;padding:20px;border-radius:0 0 10px 10px">${body}
<p style="margin-top:24px"><a href="${SITE}/mover/dashboard" style="background:#10B981;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:bold">${cta}</a></p>
<p style="color:#6b7280;font-size:12px;margin-top:24px">TrouveTonDéménageur — www.trouvetondemenageur.fr</p></div></body></html>`;
}

async function sendBatch(emails: { to: string[]; subject: string; html: string }[]) {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) throw new Error("RESEND_API_KEY manquante");
  for (let i = 0; i < emails.length; i += 100) {
    const res = await fetch("https://api.resend.com/emails/batch", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(emails.slice(i, i + 100).map((e) => ({ from: "TrouveTonDéménageur <noreply@trouvetondemenageur.fr>", ...e }))),
    });
    if (!res.ok) throw new Error(`Resend ${res.status} ${await res.text()}`);
  }
}

Deno.serve(async (req) => {
  const sb = adminClient();
  if (!(await isAuthorizedCaller(req, sb))) return new Response("Unauthorized", { status: 401 });
  let groupages = 0, assigned = 0;

  // 1) Groupages
  const { data: alerts } = await sb.from("groupage_alerts").select("*")
    .not("movers_alerted_at", "is", null).is("emails_sent_at", null).is("dismissed_at", null).limit(10);
  if (alerts?.length) {
    const { data: movers } = await sb.from("movers").select("email, company_name")
      .eq("verification_status", "verified").not("email", "is", null);
    for (const g of alerts) {
      const { data: reqs } = await sb.from("quote_requests").select("id, from_city, to_city, moving_date, volume_m3").in("id", [g.request_a, g.request_b]);
      const a = reqs?.find((r) => r.id === g.request_a), b = reqs?.find((r) => r.id === g.request_b);
      if (!a || !b) { await sb.from("groupage_alerts").update({ emails_sent_at: new Date().toISOString() }).eq("id", g.id); continue; }
      const leg = (r: typeof a) => `<li><b>${escapeHtml(r.from_city)} → ${escapeHtml(r.to_city)}</b> le ${fmt(r.moving_date)}${r.volume_m3 ? ` · ${r.volume_m3} m³` : ""}</li>`;
      const same = g.kind === "same_route";
      const title = same ? "🚚 Groupage : 2 déménagements sur le même trajet" : "🚚 Évitez le retour à vide";
      const intro = same
        ? `<p>Deux clients déménagent sur un trajet proche (moins de 200 km d'écart au départ et à l'arrivée), à ${g.days_apart} jour(s) d'intervalle. Un seul camion peut faire les deux missions.</p>`
        : `<p>Après ce premier déménagement, un autre client part à moins de 200 km de votre point d'arrivée. Remplissez votre camion au retour.</p>`;
      const body = `${intro}<ul>${leg(a)}${leg(b)}</ul><p>Connectez-vous à votre espace pour voir les demandes et envoyer vos devis.</p>`;
      const list = (movers ?? []).map((m) => ({ to: [m.email as string], subject: title, html: layout(title, `<p>Bonjour ${escapeHtml(m.company_name ?? "")},</p>${body}`, "Voir les demandes") }));
      try { await sendBatch(list); } catch (e) { console.error(e); break; }
      await sb.from("groupage_alerts").update({ emails_sent_at: new Date().toISOString() }).eq("id", g.id);
      groupages++;
    }
  }

  // 2) Devis déposés par l'admin
  const { data: quotes } = await sb.from("quotes").select("id, price, quote_request_id, mover_id")
    .eq("added_by_admin", true).is("mover_email_sent_at", null).limit(20);
  for (const q of quotes ?? []) {
    const [{ data: m }, { data: r }] = await Promise.all([
      sb.from("movers").select("email, company_name").eq("id", q.mover_id).maybeSingle(),
      sb.from("quote_requests").select("from_city, to_city, moving_date").eq("id", q.quote_request_id).maybeSingle(),
    ]);
    if (m?.email && r) {
      const title = "Mission attribuée par TrouveTonDéménageur";
      try {
        await sendBatch([{ to: [m.email], subject: title, html: layout(title,
          `<p>Bonjour ${escapeHtml(m.company_name ?? "")},</p><p>Notre équipe a déposé pour vous un devis de <b>${q.price} €</b> pour le déménagement <b>${escapeHtml(r.from_city)} → ${escapeHtml(r.to_city)}</b> le ${fmt(r.moving_date)}.</p><p>Le client doit encore l'accepter et payer l'acompte. Vous serez prévenu dès qu'il l'accepte.</p>`,
          "Voir ma mission") }]);
      } catch (e) { console.error(e); continue; }
    }
    await sb.from("quotes").update({ mover_email_sent_at: new Date().toISOString() }).eq("id", q.id);
    assigned++;
  }

  return new Response(JSON.stringify({ groupages, assigned }), { headers: { "Content-Type": "application/json" } });
});
