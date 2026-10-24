// Mise en forme et envoi des emails de relance admin (déménageur ou client).
import { escapeHtml } from "./agent-utils.ts";

const SITE = "https://www.trouvetondemenageur.fr";

export function followupLink(targetType: string): { url: string; label: string } {
  return targetType === "mover"
    ? { url: `${SITE}/mover/dashboard`, label: "Mettre à jour mon dossier" }
    : { url: `${SITE}/client/dashboard`, label: "Compléter ma demande" };
}

export function followupHtml(body: string, targetType: string, reminderNumber = 0): string {
  const { url, label } = followupLink(targetType);
  const paras = escapeHtml(body).split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`).join("");
  const banner = reminderNumber > 0
    ? `<p style="background:#FEF3C7;padding:10px;border-radius:8px;font-size:14px">Rappel n°${reminderNumber} : nous n'avons pas encore reçu la mise à jour demandée.</p>`
    : "";
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;background:#ffffff">
<div style="background:linear-gradient(135deg,#3B82F6 0%,#10B981 100%);color:#fff;padding:24px;text-align:center;border-radius:10px 10px 0 0">
<h1 style="margin:0;font-size:20px">TrouveTonDéménageur</h1></div>
<div style="padding:26px;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 10px 10px">${banner}${paras}
<div style="text-align:center;margin:28px 0"><a href="${url}" style="display:inline-block;background:#3B82F6;color:#fff;padding:13px 28px;text-decoration:none;border-radius:8px;font-weight:bold">${label}</a></div>
<p style="font-size:13px;color:#6b7280">Une question ? Répondez simplement à cet email.</p></div></body></html>`;
}

export async function sendFollowupEmail(to: string, subject: string, html: string): Promise<{ ok: boolean; error?: string }> {
  const resend = Deno.env.get("RESEND_API_KEY");
  if (!resend) return { ok: false, error: "RESEND_API_KEY manquante" };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resend}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "TrouveTonDemenageur <noreply@trouvetondemenageur.fr>",
      reply_to: "trouvetond@gmail.com",
      to: [to], subject, html,
    }),
  });
  if (!res.ok) return { ok: false, error: `Resend ${res.status}: ${await res.text()}` };
  return { ok: true };
}
