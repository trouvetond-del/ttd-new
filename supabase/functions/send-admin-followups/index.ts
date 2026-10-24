// Cron quotidien : relance 1 fois par jour les déménageurs/clients à qui l'admin a demandé
// une information ou un document. Si la personne a mis à jour son dossier → relance close.
// Après 3 relances sans action → alerte admin "à appeler".
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { adminClient, alertAdmins, escapeHtml, isAuthorizedCaller } from "../_shared/agent-utils.ts";
import { followupHtml, sendFollowupEmail } from "../_shared/followup-email.ts";

export const MAX_REMINDERS = 3;

Deno.serve(async (req) => {
  const sb = adminClient();
  if (!(await isAuthorizedCaller(req, sb))) return new Response("Unauthorized", { status: 401 });

  const cutoff = new Date(Date.now() - 23 * 3600_000).toISOString(); // 1 envoi par jour max
  const { data: rows, error } = await sb.from("admin_followups").select("*")
    .eq("status", "open").lte("last_sent_at", cutoff).limit(200);
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  const stats = { checked: rows?.length ?? 0, sent: 0, resolved: 0, escalated: 0 };
  const resolvedList: string[] = [];

  for (const f of rows ?? []) {
    // A-t-il mis à jour quelque chose depuis la demande ?
    let updated = false;
    if (f.target_type === "mover" && f.mover_id) {
      const [{ count: d1 }, { count: d2 }] = await Promise.all([
        sb.from("mover_documents").select("id", { count: "exact", head: true }).eq("mover_id", f.mover_id).gt("uploaded_at", f.created_at),
        sb.from("verification_documents").select("id", { count: "exact", head: true }).eq("mover_id", f.mover_id).gt("uploaded_at", f.created_at),
      ]);
      updated = (d1 ?? 0) + (d2 ?? 0) > 0;
    } else if (f.target_user_id) {
      const [{ data: c }, { count: q }] = await Promise.all([
        sb.from("clients").select("updated_at").eq("user_id", f.target_user_id).maybeSingle(),
        sb.from("quote_requests").select("id", { count: "exact", head: true }).eq("client_user_id", f.target_user_id).gt("updated_at", f.created_at),
      ]);
      updated = (!!c?.updated_at && c.updated_at > f.created_at) || (q ?? 0) > 0;
    }
    if (updated) {
      await sb.from("admin_followups").update({ status: "resolved", resolved_at: new Date().toISOString() }).eq("id", f.id);
      resolvedList.push(`${f.display_name || f.email} a mis à jour son dossier (demande : ${f.admin_note})`);
      stats.resolved++;
      continue;
    }

    if (f.reminder_count >= MAX_REMINDERS) {
      await sb.from("admin_followups").update({ status: "escalated" }).eq("id", f.id);
      await alertAdmins(sb,
        `📞 À appeler : ${f.display_name || f.email} n'a pas répondu à 3 relances`,
        `<p><b>${escapeHtml(f.target_type === "mover" ? "Déménageur" : "Client")} :</b> ${escapeHtml(f.display_name || "—")}</p>
<p><b>Téléphone :</b> ${escapeHtml(f.phone || "non renseigné")}<br><b>Email :</b> ${escapeHtml(f.email)}</p>
<p><b>Ce qui manque :</b> ${escapeHtml(f.admin_note)}</p>
<p>1 email + ${MAX_REMINDERS} relances envoyés, aucune mise à jour reçue. Merci de l'appeler.</p>`,
        "https://www.trouvetondemenageur.fr/admin/dashboard");
      stats.escalated++;
      continue;
    }

    const n = f.reminder_count + 1;
    const res = await sendFollowupEmail(f.email, `Rappel : ${f.subject}`, followupHtml(f.body, f.target_type, n));
    if (!res.ok) { console.warn("Relance échouée", f.id, res.error); continue; }
    await sb.from("admin_followups").update({ reminder_count: n, last_sent_at: new Date().toISOString() }).eq("id", f.id);
    stats.sent++;
  }

  if (resolvedList.length) {
    await alertAdmins(sb, `✅ ${resolvedList.length} dossier(s) mis à jour après relance`,
      `<ul>${resolvedList.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ul><p>Pensez à vérifier les nouveaux documents.</p>`,
      "https://www.trouvetondemenageur.fr/admin/dashboard");
  }
  return new Response(JSON.stringify(stats), { headers: { "Content-Type": "application/json" } });
});
