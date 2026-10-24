// Toutes les 10 min (8h-21h Paris) : chaque nouveau contact /devis-rapide non converti
// déclenche UNE alerte admin "à rappeler dans l'heure" (email + cloche admin).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { adminClient, alertAdmins, escapeHtml, isAuthorizedCaller } from "../_shared/agent-utils.ts";

Deno.serve(async (req) => {
  const sb = adminClient();
  if (!(await isAuthorizedCaller(req, sb))) return new Response("Unauthorized", { status: 401 });

  const since = new Date(Date.now() - 48 * 3600_000).toISOString();
  const { data: leads, error } = await sb.from("partial_leads")
    .select("id, email, phone, first_name, last_name, created_at")
    .eq("lead_type", "client").is("converted_at", null).is("callback_alerted_at", null)
    .gte("created_at", since).order("created_at").limit(20);
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  for (const l of leads ?? []) {
    const name = [l.first_name, l.last_name].filter(Boolean).join(" ") || "Contact sans nom";
    const tel = l.phone ? `<a href="tel:${escapeHtml(l.phone)}">${escapeHtml(l.phone)}</a>` : "—";
    await alertAdmins(sb, `📞 À rappeler dans l'heure : ${name}`,
      `<p>Une personne a laissé ses coordonnées sur le devis rapide sans finir sa demande complète.</p>
       <p><b>Nom :</b> ${escapeHtml(name)}<br><b>Téléphone :</b> ${tel}<br><b>Email :</b> ${escapeHtml(l.email ?? "—")}<br>
       <b>Arrivé le :</b> ${new Date(l.created_at).toLocaleString("fr-FR", { timeZone: "Europe/Paris" })}</p>
       <p><b>Conseil :</b> appelez maintenant et aidez-la à finir sa demande (adresses, étages, volume) pour qu'elle reçoive les devis.</p>`,
      "https://www.trouvetondemenageur.fr/admin");
    await sb.from("partial_leads").update({ callback_alerted_at: new Date().toISOString() }).eq("id", l.id);
  }
  return new Response(JSON.stringify({ alerted: leads?.length ?? 0 }), { headers: { "Content-Type": "application/json" } });
});
