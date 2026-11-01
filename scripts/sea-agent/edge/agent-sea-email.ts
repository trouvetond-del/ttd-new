// Email quotidien de l'agent SEA aux admins (+ cloche admin). Copié dans supabase/functions/agent-sea-email/ et déployé par sea-agent.yml.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { adminClient, alertAdmins, isAuthorizedCaller } from "../_shared/agent-utils.ts";
Deno.serve(async (req) => {
  const sb = adminClient();
  if (!(await isAuthorizedCaller(req, sb))) return new Response("Unauthorized", { status: 401 });
  const { title, html } = await req.json();
  if (typeof title !== "string" || typeof html !== "string" || title.length > 200 || html.length > 50000) return new Response("Bad request", { status: 400 });
  await alertAdmins(sb, title, html, "https://www.trouvetondemenageur.fr/admin");
  return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
});
