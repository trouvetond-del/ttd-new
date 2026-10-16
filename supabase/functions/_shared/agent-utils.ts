// Outils communs aux agents IA (surveillance + anti-fraude)
import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";

export const ALERT_EMAIL = "trouvetond@gmail.com";

export function adminClient(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

// Seul pg_cron (qui lit le secret en base) peut déclencher les agents.
export async function isAuthorizedCaller(req: Request, sb: SupabaseClient): Promise<boolean> {
  const given = req.headers.get("x-agent-secret");
  if (!given) return false;
  const { data } = await sb.from("agent_secrets").select("secret").eq("name", "cron").maybeSingle();
  return !!data?.secret && data.secret === given;
}

// Une même alerte n'est envoyée qu'une fois toutes les 3 heures.
export async function shouldSend(sb: SupabaseClient, key: string, hours = 3): Promise<boolean> {
  const { data } = await sb.from("agent_alert_log").select("last_sent_at").eq("alert_key", key).maybeSingle();
  if (data && Date.now() - new Date(data.last_sent_at).getTime() < hours * 3600_000) return false;
  await sb.from("agent_alert_log").upsert({ alert_key: key, last_sent_at: new Date().toISOString() });
  return true;
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

// Résumé IA en français (facultatif : si la clé manque, on garde le texte brut).
export async function aiSummary(system: string, content: string): Promise<string | null> {
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) return null;
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "system", content: system }, { role: "user", content: content.slice(0, 12000) }],
        max_tokens: 400,
      }),
    });
    if (!res.ok) { console.warn("IA:", res.status, await res.text()); return null; }
    const j = await res.json();
    return j.choices?.[0]?.message?.content?.trim() ?? null;
  } catch (e) { console.warn("IA échouée:", e); return null; }
}

// Alerte : email à l'adresse admin + notification dans l'espace admin.
export async function alertAdmins(sb: SupabaseClient, title: string, bodyHtml: string, link: string) {
  const { data: admins } = await sb.from("admins").select("user_id, email");
  if (admins?.length) {
    await sb.from("notifications").insert(admins.map((a) => ({
      user_id: a.user_id, user_type: "admin", title, message: title, type: "system", read: false,
    })));
  }
  const resend = Deno.env.get("RESEND_API_KEY");
  if (!resend) { console.warn("RESEND_API_KEY manquante"); return; }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resend}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "TrouveTonDemenageur Alertes <noreply@trouvetondemenageur.fr>",
      to: [ALERT_EMAIL],
      subject: title,
      html: `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;padding:20px;color:#111">
<div style="background:#1E40AF;color:#fff;padding:18px;border-radius:10px 10px 0 0"><h2 style="margin:0;font-size:18px">${escapeHtml(title)}</h2></div>
<div style="border:1px solid #e5e7eb;border-top:0;padding:20px;border-radius:0 0 10px 10px">${bodyHtml}
<p style="margin-top:24px"><a href="${link}" style="background:#10B981;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none">Ouvrir l'admin</a></p></div></body></html>`,
    }),
  });
  if (!res.ok) console.warn("Resend:", res.status, await res.text());
}

// Notification dans l'espace admin uniquement (pas d'email).
export async function notifyAdminsOnly(sb: SupabaseClient, title: string, message: string) {
  const { data: admins } = await sb.from("admins").select("user_id");
  if (!admins?.length) return;
  const { error } = await sb.from("notifications").insert(admins.map((a) => ({
    user_id: a.user_id, user_type: "admin", title, message, type: "system", read: false,
  })));
  if (error) console.warn("Notification admin:", error.message);
}
