import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

Deno.serve(async () => {
  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const since = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(); // 3h après création
  const { data: incomplete } = await supabaseAdmin
    .from("clients")
    .select("email, user_id, created_at")
    .eq("profile_completed", false)
    .lte("created_at", since)
    .is("reminder_sent_at", null);

  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  let sent = 0;
  for (const client of incomplete || []) {
    if (!client.email || !resendApiKey) continue;
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "TrouveTonDéménageur <noreply@trouvetondemenageur.fr>",
        to: [client.email],
        subject: "Il vous reste 1 minute pour recevoir vos devis déménageurs",
        html: `<p>Bonjour,</p><p>Vous avez commencé une inscription sur TrouveTonDéménageur mais elle n'est pas terminée. <a href="https://www.trouvetondemenageur.fr/client/profile-completion">Cliquez ici pour la finaliser</a> et recevoir vos devis gratuits.</p>`,
      }),
    });
    await supabaseAdmin
      .from("clients")
      .update({ reminder_sent_at: new Date().toISOString() })
      .eq("user_id", client.user_id);
    sent++;
  }

  return new Response(JSON.stringify({ processed: incomplete?.length || 0, sent }), {
    headers: { "Content-Type": "application/json" },
  });
});
