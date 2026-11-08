// Annonce de l'onglet « Trouver des déménagements » aux déménageurs.
// Appelée uniquement par GitHub Actions avec la clé de service.
// mode "test" : un seul déménageur (par nom d'entreprise). mode "all" : tous les vérifiés, une seule fois chacun.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const fmt = (d: string) => new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

function buildHtml(company: string, moves: any[]) {
  const cards = moves.map((m) => `<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:14px;margin-bottom:10px"><tr><td style="padding:16px 18px">
<div style="font-size:12px;color:#2563eb;font-weight:700">${esc(m.reference)}</div>
<div style="font-size:18px;font-weight:700;color:#0f172a;margin:4px 0">${esc(m.from_city)} → ${esc(m.to_city)}</div>
<div style="font-size:13px;color:#64748b">${fmt(m.moving_date)}${m.volume_m3 ? ` · ${esc(m.volume_m3)} m³` : ""}${m.distance_km ? ` · trajet ${Math.round(m.distance_km)} km` : ""}</div></td></tr></table>`).join("");
  const li = (t: string) => `<tr><td style="padding:12px 16px;background:#f8fafc;border-radius:12px;font-size:14px">${t}</td></tr><tr><td height="8"></td></tr>`;
  return `<html><body style="margin:0;background:#f1f5f9;font-family:Helvetica,Arial,sans-serif;padding:32px 0">
<table width="600" align="center" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:18px;overflow:hidden">
<tr><td style="background:#2563eb;background:linear-gradient(135deg,#10b981,#2563eb);padding:28px 36px;color:#fff">
<div style="font-size:13px;letter-spacing:2px;text-transform:uppercase;opacity:.85">Nouveau dans votre espace</div>
<div style="font-size:26px;font-weight:700;margin-top:6px">Trouvez vos prochains déménagements</div></td></tr>
<tr><td style="padding:32px 36px;color:#334155;font-size:15px;line-height:1.6">
<p style="margin:0 0 14px">Bonjour ${esc(company)},</p>
<p style="margin:0 0 20px">Votre espace déménageur a un nouvel onglet : <b>« Trouver des déménagements »</b>. Vous voyez toutes les demandes ouvertes et vous choisissez celles qui vous conviennent.</p>
<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px">
${li("🔎 <b>Par numéro de demande</b> : retrouvez une demande en un instant")}${li("🗺️ <b>Par région</b> : seulement les déménagements de votre secteur")}${li("📍 <b>Par périmètre jusqu'à 250 km</b> : depuis votre entreprise ou une ville de votre choix")}</table>
${moves.length ? `<p style="margin:0 0 8px;font-weight:700;color:#0f172a">Des déménagements vous attendent en ce moment</p>${cards}` : ""}
<div style="text-align:center;margin-top:20px"><a href="https://www.trouvetondemenageur.fr/mover/find-moves" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;font-weight:700;padding:15px 34px;border-radius:999px;font-size:16px">Voir les déménagements disponibles →</a></div>
<p style="margin:28px 0 0;color:#64748b;font-size:14px">À très vite,<br><b style="color:#0f172a">L'équipe Trouve Ton Déménageur</b><br><a href="https://www.trouvetondemenageur.fr" style="color:#2563eb">www.trouvetondemenageur.fr</a></p>
</td></tr></table></body></html>`;
}

Deno.serve(async (req) => {
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
  // Accepte uniquement une clé de service (ancien ou nouveau format) : seule une telle clé peut lister les comptes.
  const probe = await createClient(Deno.env.get("SUPABASE_URL")!, token, { auth: { persistSession: false } }).auth.admin.listUsers({ perPage: 1 });
  if (!token || probe.error) return new Response("Forbidden", { status: 403 });
  const { mode, company } = await req.json().catch(() => ({}));
  const db = createClient(Deno.env.get("SUPABASE_URL")!, key);
  const resend = Deno.env.get("RESEND_API_KEY");
  if (!resend) return Response.json({ error: "RESEND_API_KEY manquant" }, { status: 500 });

  let q = db.from("movers").select("id, company_name, email, postal_code").not("email", "is", null);
  if (mode === "test") q = q.ilike("company_name", String(company || "DROP IT"));
  else if (mode === "all") q = q.eq("verification_status", "verified");
  else return Response.json({ error: "mode invalide" }, { status: 400 });
  const { data: movers, error } = await q;
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const today = new Date().toISOString().slice(0, 10);
  const { data: moves } = await db.from("quote_requests")
    .select("reference, from_city, from_postal_code, to_city, moving_date, volume_m3, distance_km").is("deleted_at", null)
    .in("status", ["new", "quoted"]).eq("is_draft", false).gte("moving_date", today).gt("volume_m3", 0)
    .order("moving_date", { ascending: true }).limit(200);

  const results: any[] = [];
  for (const m of movers || []) {
    const dept = String(m.postal_code || "").slice(0, 2);
    const pick = [...(moves || [])].sort((a, b) =>
      Number(String(b.from_postal_code || "").slice(0, 2) === dept) - Number(String(a.from_postal_code || "").slice(0, 2) === dept)).slice(0, 3);
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resend}`, "Content-Type": "application/json", ...(mode === "all" ? { "Idempotency-Key": `find-moves-2026-12-${m.id}` } : {}) },
      body: JSON.stringify({
        from: "Trouve Ton Déménageur <noreply@trouvetondemenageur.fr>",
        to: [m.email],
        subject: "Nouveau : trouvez vos prochains déménagements",
        html: buildHtml(m.company_name, pick),
      }),
    });
    results.push({ company: m.company_name, ok: res.ok, status: res.status });
    await new Promise((r) => setTimeout(r, 600));
  }
  return Response.json({ sent: results.filter((r) => r.ok).length, total: results.length, results });
});
