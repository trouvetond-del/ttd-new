// Agent IA de surveillance — toutes les 15 min (pg_cron).
// Vérifie les pages clés du site, la base de données, les tâches planifiées,
// les paiements et emails en échec, puis alerte l'admin si besoin.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { adminClient, aiSummary, alertAdmins, escapeHtml, isAuthorizedCaller, shouldSend } from "../_shared/agent-utils.ts";

const SITE = "https://www.trouvetondemenageur.fr";
const PAGES = ["/", "/devis-rapide", "/client/auth-choice", "/mover/signup", "/sitemap.xml"];

type Issue = { level: "warning" | "critical"; key: string; message: string };

Deno.serve(async (req) => {
  const sb = adminClient();
  if (!(await isAuthorizedCaller(req, sb))) return new Response("Unauthorized", { status: 401 });

  const issues: Issue[] = [];
  const since = new Date(Date.now() - 16 * 60_000).toISOString();

  // 1. Pages du site
  for (const path of PAGES) {
    const t0 = Date.now();
    try {
      const r = await fetch(SITE + path, { redirect: "follow", headers: { "User-Agent": "TTD-Monitor/1.0" } });
      const ms = Date.now() - t0;
      if (r.status >= 500) issues.push({ level: "critical", key: `page:${path}`, message: `La page ${path} renvoie une erreur ${r.status}.` });
      else if (r.status >= 400) issues.push({ level: "warning", key: `page:${path}`, message: `La page ${path} renvoie ${r.status}.` });
      else if (ms > 8000) issues.push({ level: "warning", key: `slow:${path}`, message: `La page ${path} est très lente (${Math.round(ms / 1000)} s).` });
      await r.body?.cancel();
    } catch (e) {
      issues.push({ level: "critical", key: `page:${path}`, message: `La page ${path} est injoignable (${String(e).slice(0, 120)}).` });
    }
  }

  // 2. Base de données
  const { error: dbErr } = await sb.from("admins").select("id", { head: true, count: "exact" });
  if (dbErr) issues.push({ level: "critical", key: "db", message: `Base de données en erreur : ${dbErr.message}` });

  // 3. Tâches planifiées en échec
  const { data: cronFails } = await sb.rpc("agent_failed_cron_runs", { since });
  for (const c of cronFails ?? []) {
    issues.push({ level: "warning", key: `cron:${c.jobname}`, message: `Tâche « ${c.jobname} » en échec : ${c.return_message ?? ""}` });
  }

  // 4. Paiements échoués récents
  const { count: failedPay } = await sb.from("payments").select("id", { head: true, count: "exact" })
    .eq("payment_status", "failed").gte("created_at", since);
  if ((failedPay ?? 0) >= 2) issues.push({ level: "warning", key: "payments:failed", message: `${failedPay} paiements ont échoué ces 15 dernières minutes.` });

  // 5. Emails/notifications en échec
  const { count: failedNotif, error: nqErr } = await sb.from("notification_queue").select("id", { head: true, count: "exact" })
    .eq("status", "failed").gte("updated_at", since);
  if (!nqErr && (failedNotif ?? 0) >= 3) issues.push({ level: "warning", key: "notif:failed", message: `${failedNotif} emails/notifications ont échoué récemment.` });

  const status = issues.some((i) => i.level === "critical") ? "critical" : issues.length ? "warning" : "ok";
  let summary: string | null = null;

  if (issues.length) {
    summary = await aiSummary(
      "Tu es l'ingénieur d'astreinte d'une plateforme française de déménagement. Résume les problèmes détectés en 3 à 5 phrases simples pour un dirigeant non technique : impact pour les clients, urgence, première action conseillée. Pas de jargon.",
      issues.map((i) => `[${i.level}] ${i.message}`).join("\n"),
    );
    const fresh: Issue[] = [];
    for (const i of issues) if (await shouldSend(sb, `monitor:${i.key}`)) fresh.push(i);
    if (fresh.length) {
      const list = fresh.map((i) => `<li><b>${i.level === "critical" ? "🔴 Critique" : "🟠 Attention"}</b> — ${escapeHtml(i.message)}</li>`).join("");
      await alertAdmins(sb,
        `${status === "critical" ? "🔴 URGENT" : "🟠"} Problème détecté sur trouvetondemenageur.fr`,
        `${summary ? `<p>${escapeHtml(summary)}</p>` : ""}<ul>${list}</ul>`,
        `${SITE}/admin/dashboard/security`);
    }
  }

  await sb.from("system_health_checks").insert({ status, issues, ai_summary: summary });
  // Garde 30 jours d'historique
  await sb.from("system_health_checks").delete().lt("checked_at", new Date(Date.now() - 30 * 86400_000).toISOString());

  return new Response(JSON.stringify({ status, issues: issues.length }), { headers: { "Content-Type": "application/json" } });
});
