// Email quotidien de l'agent SEA aux admins (+ cloche admin). Copié dans supabase/functions/agent-sea-email/ et déployé par sea-agent.yml.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { adminClient, alertAdmins, isAuthorizedCaller, ALERT_EMAIL, escapeHtml } from "../_shared/agent-utils.ts";
Deno.serve(async (req) => {
  const sb = adminClient();
  if (!(await isAuthorizedCaller(req, sb))) return new Response("Unauthorized", { status: 401 });
  const { title, html, morning_day } = await req.json();
  if (typeof title !== "string" || typeof html !== "string" || title.length > 200 || html.length > 50000) return new Response("Bad request", { status: 400 });
  if (morning_day !== undefined) {
    if (typeof morning_day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(morning_day)) return new Response('Bad request', {status:400});
    const key = Deno.env.get('RESEND_API_KEY');
    if (!key) return Response.json({email_accepted:false}, {status:503});
    const response = await fetch('https://api.resend.com/emails', {
      method:'POST', headers:{Authorization:`Bearer ${key}`, 'Content-Type':'application/json', 'Idempotency-Key':`morning-report-${morning_day}`},
      body:JSON.stringify({from:'Trouve Ton Déménageur <noreply@trouvetondemenageur.fr>',to:[ALERT_EMAIL],subject:title,html:`<!DOCTYPE html><html lang="fr"><body><h2>${escapeHtml(title)}</h2>${html}</body></html>`}),
    });
    if (!response.ok) return Response.json({email_accepted:false,provider_status:response.status},{status:502});
    await response.body?.cancel();
    return Response.json({email_accepted:true});
  }
  await alertAdmins(sb, title, html, "https://www.trouvetondemenageur.fr/admin");
  return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
});
