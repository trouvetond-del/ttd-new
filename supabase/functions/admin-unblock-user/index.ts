// Débloque un compte bloqué par l'agent anti-fraude (réservé aux admins).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { adminClient } from "../_shared/agent-utils.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

  const sb = adminClient();
  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  const { data: { user } } = await sb.auth.getUser(token);
  if (!user) return json({ error: "Non connecté" }, 401);
  const { data: admin } = await sb.from("admins").select("id").eq("user_id", user.id).maybeSingle();
  if (!admin) return json({ error: "Réservé aux admins" }, 403);

  const { alertId } = await req.json().catch(() => ({}));
  if (typeof alertId !== "string") return json({ error: "alertId manquant" }, 400);
  const { data: alert } = await sb.from("fraud_alerts").select("id, user_id, details").eq("id", alertId).maybeSingle();
  if (!alert?.user_id) return json({ error: "Alerte introuvable" }, 404);

  const { error } = await sb.auth.admin.updateUserById(alert.user_id, { ban_duration: "none" });
  if (error) return json({ error: error.message }, 500);
  const moverId = (alert.details as { mover_id?: string } | null)?.mover_id;
  if (moverId) await sb.from("movers").update({ is_active: true }).eq("id", moverId);
  await sb.from("fraud_alerts").update({
    status: "false_positive", auto_blocked: false, resolved_at: new Date().toISOString(), resolved_by: user.id,
  }).eq("id", alertId);
  return json({ ok: true });
});
