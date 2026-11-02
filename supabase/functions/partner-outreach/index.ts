// Agent Partenaires box de stockage.
// - Admin (bouton « Relancer ») : { partnerId } avec la session admin.
// - Agent quotidien (GitHub) : en-tête x-agent-secret, envoie les premiers mails (max 20/jour),
//   une relance automatique à J+4 sans réponse, puis passe la fiche en « À appeler ».
// Envoi depuis trouvetond@gmail.com via le connecteur Gmail.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";
import QRCode from "npm:qrcode@1.5.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, x-agent-secret",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const GMAIL = "https://connector-gateway.lovable.dev/google_mail/gmail/v1/users/me";
const SITE = "https://www.trouvetondemenageur.fr";
const DAILY_FIRST = 20;
const FOLLOWUP_DAYS = 4;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const b64 = (bytes: Uint8Array) => { let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };
const b64s = (s: string) => b64(new TextEncoder().encode(s));
const hdr = (v: string) => (/^[\x00-\x7F]*$/.test(v) ? v : `=?UTF-8?B?${b64s(v)}?=`);
const wrap = (s: string) => s.replace(/.{1,76}/g, "$&\r\n");

function gmailHeaders() {
  const k = Deno.env.get("LOVABLE_API_KEY"), g = Deno.env.get("GOOGLE_MAIL_API_KEY");
  if (!k || !g) throw new Error("Connexion Gmail non configurée");
  return { Authorization: `Bearer ${k}`, "X-Connection-Api-Key": g, "Content-Type": "application/json" };
}

type Partner = { id: string; code: string; name: string; city: string; email: string | null; status: string; emails_sent: number; last_email_at: string | null; gmail_thread_id: string | null };

export function buildEmail(p: Partner, kind: "premier" | "relance") {
  const link = `${SITE}/?box=${encodeURIComponent(p.code)}`;
  const subject = kind === "premier"
    ? `Partenariat ${p.name.split("–")[0].trim()} × TrouveTonDéménageur : de la visibilité gratuite`
    : `Relance – partenariat gratuit avec TrouveTonDéménageur`;
  const intro = kind === "premier"
    ? `Beaucoup de vos clients déménagent juste avant ou juste après leur stockage. Nous aimerions vous proposer un partenariat <b>100 % gratuit</b>, qui vous fait de la publicité sans rien vous coûter.`
    : `Je me permets de revenir vers vous au sujet de notre proposition de partenariat gratuit. Elle ne vous demande aucun engagement ni aucun frais.`;
  const html = `<!doctype html><html lang="fr"><body style="margin:0;background:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#1f2937">
<div style="max-width:600px;margin:0 auto;padding:24px">
 <p style="font-size:15px;line-height:1.6">Bonjour,</p>
 <p style="font-size:15px;line-height:1.6">Je suis Heikel Nachi, président de <a href="${SITE}" style="color:#1d4ed8">TrouveTonDéménageur</a>, la plateforme gratuite qui met les particuliers en relation avec des déménageurs vérifiés partout en France : jusqu'à 3 devis sous 24 h.</p>
 <p style="font-size:15px;line-height:1.6">${intro}</p>
 <table role="presentation" width="100%" style="border-collapse:collapse;margin:8px 0 18px"><tr><td style="background:#eff6ff;border-radius:10px;padding:16px;font-size:15px;line-height:1.7">
  <b>Ce que vous y gagnez :</b><br>
  ✅ <b>De la publicité gratuite</b> : nous recommandons votre centre à nos clients qui cherchent un garde-meubles à ${esc(p.city)}.<br>
  ✅ <b>Un service en plus pour vos clients</b> : 25 € remboursés sur leur déménagement, sans que cela vous coûte rien.<br>
  ✅ <b>Zéro travail</b> : nous vous fournissons les flyers et votre QR code personnel, prêts à poser à l'accueil.
 </td></tr></table>
 <p style="font-size:15px;line-height:1.6;margin:0 0 6px"><b>Votre flyer personnalisé</b> (à imprimer ou afficher à l'accueil) :</p>
 <table role="presentation" width="100%" style="border-collapse:collapse;border:3px solid #1d4ed8;border-radius:14px"><tr>
  <td style="padding:20px;vertical-align:middle">
   <div style="font-size:13px;color:#1d4ed8;font-weight:bold;letter-spacing:1px">TROUVETONDEMENAGEUR.FR</div>
   <div style="font-size:24px;font-weight:bold;line-height:1.25;margin:6px 0 10px;color:#111827">Vous déménagez ?<br><span style="color:#16a34a">25 € remboursés</span></div>
   <div style="font-size:14px;line-height:1.6">Jusqu'à 3 devis gratuits de déménageurs vérifiés sous 24 h.<br>Scannez le QR code et faites votre demande.</div>
   <div style="font-size:12px;color:#6b7280;margin-top:10px">Offre réservée aux clients de ${esc(p.name)}. Code : <b>${esc(p.code)}</b>. 25 € remboursés une seule fois par client, après un déménagement réalisé et payé via le site.</div>
  </td>
  <td style="padding:16px;width:170px;text-align:center;vertical-align:middle"><img src="cid:qrcode" width="160" height="160" alt="QR code ${esc(p.code)}" style="display:block;margin:0 auto"></td>
 </tr></table>
 <p style="font-size:15px;line-height:1.6;margin-top:18px">Seriez-vous disponible pour <b>un appel de 10 minutes</b> cette semaine ? Répondez simplement à ce mail avec un créneau, ou appelez-moi au <b>01 89 70 78 81</b>.</p>
 <p style="text-align:center;margin:22px 0"><a href="mailto:trouvetond@gmail.com?subject=${encodeURIComponent("Partenariat " + p.code + " - rappel")}" style="background:#16a34a;color:#ffffff;text-decoration:none;padding:13px 22px;border-radius:8px;font-weight:bold;font-size:15px;display:inline-block">Je veux être rappelé</a></p>
 <p style="font-size:15px;line-height:1.6">Bien cordialement,<br><b>Heikel Nachi</b><br>Président – TROUVE TON DEMENAGEUR SAS<br>01 89 70 78 81 · trouvetond@gmail.com · <a href="${SITE}" style="color:#1d4ed8">www.trouvetondemenageur.fr</a></p>
 <p style="font-size:11px;color:#9ca3af;line-height:1.5">TROUVE TON DEMENAGEUR SAS – SIRET 101 378 248 00013 – 60 rue François Ier, 75008 Paris. Vous recevez ce message car votre centre de stockage est référencé publiquement. Répondez « STOP » pour ne plus être contacté. Lien de votre QR code : ${link}</p>
</div></body></html>`;
  return { subject, html, link };
}

async function sendOne(sb: SupabaseClient, p: Partner, kind: "premier" | "relance", by: string) {
  if (!p.email) throw new Error("Pas d'email pour ce box : à appeler");
  const { subject, html, link } = buildEmail(p, kind);
  const png: Uint8Array = await QRCode.toBuffer(link, { width: 480, margin: 1, errorCorrectionLevel: "M" });
  const B = "ttd" + crypto.randomUUID().replace(/-/g, "");
  const raw = [
    `From: ${hdr("Heikel – TrouveTonDéménageur")} <trouvetond@gmail.com>`,
    `To: ${p.email}`,
    `Subject: ${hdr(subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/related; boundary="${B}"`, "",
    `--${B}`, 'Content-Type: text/html; charset="UTF-8"', "Content-Transfer-Encoding: base64", "", wrap(b64s(html)),
    `--${B}`, "Content-Type: image/png", "Content-Transfer-Encoding: base64", "Content-ID: <qrcode>",
    `Content-Disposition: inline; filename="qr-${p.code}.png"`, "", wrap(b64(png)),
    `--${B}--`, "",
  ].join("\r\n");
  const body: Record<string, string> = { raw: b64s(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") };
  if (kind === "relance" && p.gmail_thread_id) body.threadId = p.gmail_thread_id;
  const res = await fetch(`${GMAIL}/messages/send`, { method: "POST", headers: gmailHeaders(), body: JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) {
    await sb.from("storage_partner_emails").insert({ partner_id: p.id, kind, sent_by: by, ok: false, error: `${res.status} ${text.slice(0, 300)}` });
    throw new Error(`Gmail a refusé l'envoi (${res.status})`);
  }
  const sent = JSON.parse(text);
  await sb.from("storage_partner_emails").insert({ partner_id: p.id, kind, sent_by: by, ok: true });
  await sb.from("storage_partners").update({
    emails_sent: p.emails_sent + 1, last_email_at: new Date().toISOString(), last_email_kind: kind,
    gmail_thread_id: p.gmail_thread_id ?? sent.threadId ?? null,
    status: ["interesse", "partenaire", "a_repondu"].includes(p.status) ? p.status : kind === "premier" ? "contacte" : "relance",
  }).eq("id", p.id);
}

// Le box a-t-il répondu depuis notre dernier mail ? (lecture de la boîte Gmail)
async function hasReplied(p: Partner): Promise<boolean> {
  if (!p.email || !p.last_email_at) return false;
  const after = Math.floor(new Date(p.last_email_at).getTime() / 1000);
  const q = encodeURIComponent(`from:${p.email} after:${after}`);
  const res = await fetch(`${GMAIL}/messages?maxResults=1&q=${q}`, { headers: gmailHeaders() });
  if (!res.ok) return false;
  const d = await res.json();
  return (d.resultSizeEstimate ?? 0) > 0 || (d.messages?.length ?? 0) > 0;
}

const COLS = "id,code,name,city,email,status,emails_sent,last_email_at,gmail_thread_id";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: cors });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  try {
    const agentSecret = Deno.env.get("PARTNER_AGENT_SECRET");
    const given = req.headers.get("x-agent-secret");
    if (given) {
      if (!agentSecret || given !== agentSecret) return json({ error: "Non autorisé" }, 401);
      const report = { replies: 0, first: 0, followups: 0, toCall: 0, rewards: 0, errors: [] as string[] };
      const { data: rw } = await sb.rpc("refresh_partner_rewards"); report.rewards = Number(rw ?? 0);
      // 1. Réponses reçues -> on arrête les relances.
      const { data: contacted } = await sb.from("storage_partners").select(COLS).eq("active", true).in("status", ["contacte", "relance"]);
      const waiting: Partner[] = [];
      for (const p of (contacted ?? []) as Partner[]) {
        if (await hasReplied(p)) { await sb.from("storage_partners").update({ status: "a_repondu" }).eq("id", p.id); report.replies++; }
        else waiting.push(p);
      }
      // 2. Relance automatique à J+4, puis « À appeler » après 2 mails sans réponse.
      const due = Date.now() - FOLLOWUP_DAYS * 86400_000;
      for (const p of waiting) {
        if (!p.last_email_at || new Date(p.last_email_at).getTime() > due) continue;
        if (p.emails_sent >= 2) { await sb.from("storage_partners").update({ status: "a_appeler" }).eq("id", p.id); report.toCall++; continue; }
        try { await sendOne(sb, p, "relance", "agent"); report.followups++; } catch (e) { report.errors.push(`${p.name}: ${(e as Error).message}`); }
      }
      // 3. Premiers mails, 20 maximum par jour.
      const { data: fresh } = await sb.from("storage_partners").select(COLS).eq("active", true).eq("status", "nouveau").not("email", "is", null).order("created_at").limit(DAILY_FIRST);
      for (const p of (fresh ?? []) as Partner[]) {
        try { await sendOne(sb, p, "premier", "agent"); report.first++; } catch (e) { report.errors.push(`${p.name}: ${(e as Error).message}`); }
      }
      return json({ ok: true, report });
    }

    // Bouton admin « Relancer »
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "Non authentifié" }, 401);
    const { data: u } = await sb.auth.getUser(auth.replace("Bearer ", ""));
    if (!u?.user) return json({ error: "Session invalide" }, 401);
    const { data: adm } = await sb.from("admins").select("id").eq("user_id", u.user.id).maybeSingle();
    if (!adm) return json({ error: "Accès réservé aux administrateurs" }, 403);
    const { partnerId } = await req.json();
    if (typeof partnerId !== "string") return json({ error: "Paramètres invalides" }, 400);
    const { data: p } = await sb.from("storage_partners").select(COLS).eq("id", partnerId).maybeSingle();
    if (!p) return json({ error: "Box introuvable" }, 404);
    if (!p.email) return json({ error: "Ce box n'a pas d'email : appelez-le ou utilisez son formulaire." }, 409);
    if (["refuse"].includes(p.status)) return json({ error: "Ce box a refusé : aucun mail envoyé." }, 409);
    if (p.last_email_at && Date.now() - new Date(p.last_email_at).getTime() < 24 * 3600_000) return json({ error: "Un mail est déjà parti il y a moins de 24 h." }, 429);
    await sendOne(sb, p as Partner, p.emails_sent > 0 ? "relance" : "premier", u.user.email ?? "admin");
    return json({ ok: true });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
