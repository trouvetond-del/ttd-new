// Agent IA anti-fraude — toutes les 15 min (pg_cron).
// Détecte : faux déménageurs, faux clients, fraude au paiement, attaques (robots).
// Les signaux CRITIQUES bloquent automatiquement le compte puis alertent l'admin.
// Les admins ne sont jamais bloqués. Déblocage possible depuis l'admin.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { adminClient, aiSummary, alertAdmins, escapeHtml, isAuthorizedCaller } from "../_shared/agent-utils.ts";

type Severity = "low" | "medium" | "high" | "critical";
type Signal = {
  key: string; user_id: string | null; alert_type: string; severity: Severity;
  reason: string; details: Record<string, unknown>; mover_id?: string;
};

const DISPOSABLE = new Set([
  "yopmail.com","yopmail.fr","mailinator.com","guerrillamail.com","10minutemail.com","tempmail.com",
  "temp-mail.org","trashmail.com","jetable.org","getnada.com","maildrop.cc","sharklasers.com",
  "dispostable.com","throwawaymail.com","fakeinbox.com","mohmal.com","emailondeck.com","mintemail.com",
]);

// Contrôle officiel du SIRET (algorithme de Luhn, 14 chiffres)
export function isValidSiret(raw: string | null | undefined): boolean {
  const s = (raw ?? "").replace(/\s/g, "");
  if (!/^\d{14}$/.test(s)) return false;
  if (s.startsWith("356000000")) return true; // La Poste : règle spécifique
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    let d = Number(s[13 - i]);
    if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return sum % 10 === 0;
}

const normPhone = (p?: string | null) => (p ?? "").replace(/\D/g, "").replace(/^33/, "0").slice(-10);
const domainOf = (e?: string | null) => (e ?? "").toLowerCase().split("@")[1] ?? "";

Deno.serve(async (req) => {
  const sb = adminClient();
  if (!(await isAuthorizedCaller(req, sb))) return new Response("Unauthorized", { status: 401 });

  const signals: Signal[] = [];
  const h1 = new Date(Date.now() - 3600_000).toISOString();
  const d1 = new Date(Date.now() - 86400_000).toISOString();
  const d30 = new Date(Date.now() - 30 * 86400_000).toISOString();

  const { data: admins } = await sb.from("admins").select("user_id");
  const adminIds = new Set((admins ?? []).map((a) => a.user_id));

  // ---------- Faux déménageurs ----------
  const { data: movers } = await sb.from("movers")
    .select("id, user_id, company_name, siret, email, phone, manager_phone, created_at").limit(5000);
  const phoneMap = new Map<string, typeof movers>();
  for (const m of movers ?? []) {
    // SIRET « PENDING-… » = inscription non terminée (déjà relancée par send-mover-profile-reminder), pas une fraude.
    if (m.created_at >= d1 && !String(m.siret ?? "").startsWith("PENDING-") && !isValidSiret(m.siret)) {
      signals.push({ key: `mover-siret:${m.id}`, user_id: m.user_id, mover_id: m.id, alert_type: "fake_mover", severity: "high",
        reason: `Le SIRET déclaré par « ${m.company_name || m.email} » (${m.siret}) n'est pas un numéro valide.`, details: { siret: m.siret } });
    }
    if (DISPOSABLE.has(domainOf(m.email))) {
      signals.push({ key: `mover-disposable:${m.id}`, user_id: m.user_id, mover_id: m.id, alert_type: "disposable_email", severity: "critical",
        reason: `Déménageur « ${m.company_name} » inscrit avec un email jetable (${m.email}).`, details: { email: m.email } });
    }
    for (const p of [normPhone(m.phone), normPhone(m.manager_phone)]) {
      if (p.length !== 10) continue;
      const arr = phoneMap.get(p) ?? []; if (!arr.find((x) => x.id === m.id)) arr.push(m); phoneMap.set(p, arr);
    }
  }
  for (const [phone, list] of phoneMap) {
    if ((list?.length ?? 0) < 2) continue;
    const newest = [...list!].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    signals.push({ key: `mover-dupphone:${phone}:${list!.length}`, user_id: newest.user_id, mover_id: newest.id, alert_type: "multiple_accounts", severity: "high",
      reason: `${list!.length} sociétés de déménagement utilisent le même téléphone (${phone}) : ${list!.map((x) => x.company_name).join(", ")}.`,
      details: { phone, movers: list!.map((x) => x.id) } });
  }

  // ---------- Faux clients ----------
  const { data: clients } = await sb.from("clients").select("user_id, email, phone, created_at").gte("created_at", d30).limit(5000);
  const cPhone = new Map<string, string[]>();
  for (const c of clients ?? []) {
    if (c.created_at >= d1 && DISPOSABLE.has(domainOf(c.email))) {
      signals.push({ key: `client-disposable:${c.user_id}`, user_id: c.user_id, alert_type: "disposable_email", severity: "critical",
        reason: `Client inscrit avec un email jetable (${c.email}).`, details: { email: c.email } });
    }
    const p = normPhone(c.phone); if (p.length === 10) cPhone.set(p, [...(cPhone.get(p) ?? []), c.user_id]);
  }
  for (const [phone, ids] of cPhone) if (ids.length >= 3) {
    signals.push({ key: `client-dupphone:${phone}:${ids.length}`, user_id: ids[ids.length - 1], alert_type: "multiple_accounts", severity: "high",
      reason: `${ids.length} comptes clients avec le même téléphone (${phone}).`, details: { phone, users: ids } });
  }
  const { data: recentReqs } = await sb.from("quote_requests").select("client_user_id").gte("created_at", h1).not("client_user_id", "is", null);
  const reqCount = new Map<string, number>();
  for (const r of recentReqs ?? []) reqCount.set(r.client_user_id, (reqCount.get(r.client_user_id) ?? 0) + 1);
  for (const [uid, n] of reqCount) if (n >= 5) {
    signals.push({ key: `client-spam:${uid}:${new Date().toISOString().slice(0, 13)}`, user_id: uid, alert_type: "fake_client", severity: n >= 10 ? "critical" : "high",
      reason: `${n} demandes de devis créées en 1 heure par le même compte.`, details: { count: n } });
  }

  // ---------- Paiements ----------
  const { data: pays } = await sb.from("payments").select("client_id, payment_status, created_at, stripe_card_country")
    .gte("created_at", d30).in("payment_status", ["failed", "refunded_full", "refunded_partial"]);
  const failed24 = new Map<string, number>(); const refunds = new Map<string, number>();
  for (const p of pays ?? []) {
    if (p.payment_status === "failed" && p.created_at >= d1) failed24.set(p.client_id, (failed24.get(p.client_id) ?? 0) + 1);
    if (p.payment_status.startsWith("refunded")) refunds.set(p.client_id, (refunds.get(p.client_id) ?? 0) + 1);
  }
  for (const [uid, n] of failed24) if (n >= 3) {
    signals.push({ key: `pay-failed:${uid}:${new Date().toISOString().slice(0, 10)}`, user_id: uid, alert_type: "payment_fraud", severity: n >= 5 ? "critical" : "high",
      reason: `${n} paiements refusés en 24 h pour le même client (test de cartes possible).`, details: { failed: n } });
  }
  for (const [uid, n] of refunds) if (n >= 3) {
    signals.push({ key: `pay-refunds:${uid}:${n}`, user_id: uid, alert_type: "payment_fraud", severity: "high",
      reason: `${n} remboursements en 30 jours pour le même client.`, details: { refunds: n } });
  }

  // ---------- Attaques (robots qui créent des comptes) ----------
  const { data: ipRows } = await sb.rpc("agent_signups_by_ip", { since: h1 });
  for (const r of ipRows ?? []) {
    const crit = r.signups >= 8;
    for (const uid of (r.user_ids ?? []).filter(Boolean)) {
      signals.push({ key: `ip:${r.ip}:${uid}`, user_id: uid, alert_type: "site_attack", severity: crit ? "critical" : "high",
        reason: `${r.signups} comptes créés en 1 h depuis la même adresse IP (${r.ip}).`, details: { ip: r.ip, signups: r.signups } });
    }
  }

  // ---------- Enregistrement, blocage, alerte ----------
  const newOnes: (Signal & { blocked: boolean })[] = [];
  for (const s of signals) {
    if (s.user_id && adminIds.has(s.user_id)) continue;
    const { data: exists } = await sb.from("fraud_alerts").select("id").eq("signal_key", s.key).maybeSingle();
    if (exists) continue;

    let blocked = false;
    if (s.severity === "critical" && s.user_id) {
      const { error } = await sb.auth.admin.updateUserById(s.user_id, { ban_duration: "876000h" });
      if (!error) blocked = true; else console.warn("Blocage échoué:", error.message);
      if (s.mover_id) await sb.from("movers").update({ is_active: false }).eq("id", s.mover_id);
    }
    const { error } = await sb.from("fraud_alerts").insert({
      user_id: s.user_id, alert_type: s.alert_type, severity: s.severity, signal_key: s.key, auto_blocked: blocked,
      details: { ...s.details, reason: s.reason, mover_id: s.mover_id ?? null, detected_by: "agent-fraud-guard" },
    });
    if (!error) newOnes.push({ ...s, blocked });
    else console.warn("Insertion alerte:", error.message);
  }

  if (newOnes.length) {
    const summary = await aiSummary(
      "Tu es analyste anti-fraude pour une plateforme française qui met en relation clients et déménageurs. Analyse ces signaux en 3 à 5 phrases : niveau de risque global, schéma probable (robot, faux professionnel, test de cartes...), et ce que l'admin doit vérifier. Rappelle que les comptes bloqués peuvent être débloqués s'il s'agit d'une erreur. Pas de jargon.",
      newOnes.map((s) => `[${s.severity}${s.blocked ? ", BLOQUÉ" : ""}] ${s.reason}`).join("\n"),
    );
    const blockedN = newOnes.filter((s) => s.blocked).length;
    const list = newOnes.map((s) => `<li><b>${s.severity.toUpperCase()}</b>${s.blocked ? " — <b style='color:#b91c1c'>compte bloqué</b>" : ""} : ${escapeHtml(s.reason)}</li>`).join("");
    await alertAdmins(sb,
      `🛡️ ${newOnes.length} alerte(s) fraude${blockedN ? ` — ${blockedN} compte(s) bloqué(s)` : ""}`,
      `${summary ? `<p>${escapeHtml(summary)}</p>` : ""}<ul>${list}</ul>`,
      "https://www.trouvetondemenageur.fr/admin/dashboard/security");
  }

  return new Response(JSON.stringify({ signals: signals.length, new: newOnes.length }), { headers: { "Content-Type": "application/json" } });
});
