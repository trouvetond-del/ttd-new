// supabase/functions/send-mover-quote-reminders/index.ts
// Déclenchée par cron toutes les 3h. Pour chaque demande encore ouverte
// (pas encore acceptée/annulée), relance les déménageurs qui n'ont pas
// encore déposé de devis dessus — plus fréquemment à mesure que la date
// de déménagement approche, pour qu'ils soient parmi les premiers à
// répondre.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

// Urgence + fréquence minimale entre deux relances pour la même paire
// (déménageur, demande).
function getUrgency(days: number): { level: string; minHoursBetweenReminders: number } | null {
  if (days < 0) return null; // date passée, on arrête de relancer
  if (days <= 3) return { level: 'urgent', minHoursBetweenReminders: 4 };
  if (days <= 7) return { level: 'proche', minHoursBetweenReminders: 24 };
  if (days <= 21) return { level: 'normal', minHoursBetweenReminders: 48 };
  return { level: 'lointain', minHoursBetweenReminders: 96 };
}

function coverageMatches(coverageArea: string[] | null, fromCity: string, toCity: string): boolean {
  if (!coverageArea || coverageArea.length === 0) return true; // pas de zone renseignée = couvre tout
  const normalized = coverageArea.map((c) => (c || '').toLowerCase().trim());
  const from = (fromCity || '').toLowerCase();
  const to = (toCity || '').toLowerCase();
  return normalized.some((c) => c && (from.includes(c) || to.includes(c) || c.includes(from) || c.includes(to)));
}

Deno.serve(async () => {
  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  let emailsSent = 0;
  let notificationsCreated = 0;

  // Demandes encore ouvertes à la mise en relation
  const { data: openRequests, error: qrError } = await supabaseAdmin
    .from("quote_requests")
    .select("id, reference, from_city, to_city, moving_date, client_name")
    .in("status", ["new", "assigned", "quoted"])
    .gte("moving_date", new Date().toISOString().split("T")[0]);

  if (qrError || !openRequests) {
    return new Response(JSON.stringify({ error: qrError?.message || "Erreur chargement demandes" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Déménageurs actifs et vérifiés, notifications email activées
  const { data: movers } = await supabaseAdmin
    .from("movers")
    .select("id, user_id, email, company_name, coverage_area")
    .eq("verification_status", "verified")
    .eq("is_active", true)
    .eq("email_notifications_enabled", true);

  if (!movers || movers.length === 0) {
    return new Response(JSON.stringify({ processed: 0, emailsSent: 0 }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  for (const request of openRequests) {
    const days = daysUntil(request.moving_date);
    const urgency = getUrgency(days);
    if (!urgency) continue;
    const shortRef = request.reference || `#${request.id.slice(0, 8).toUpperCase()}`;

    // Déménageurs ayant déjà déposé un devis sur cette demande : à exclure
    const { data: existingQuotes } = await supabaseAdmin
      .from("quotes")
      .select("mover_id")
      .eq("quote_request_id", request.id);
    const quotedMoverIds = new Set((existingQuotes || []).map((q) => q.mover_id));

    for (const mover of movers) {
      if (quotedMoverIds.has(mover.id)) continue;
      if (!coverageMatches(mover.coverage_area, request.from_city, request.to_city)) continue;

      // Dernière relance envoyée à ce déménageur pour cette demande
      const { data: lastReminder } = await supabaseAdmin
        .from("quote_reminder_log")
        .select("sent_at")
        .eq("quote_request_id", request.id)
        .eq("mover_id", mover.id)
        .order("sent_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (lastReminder) {
        const hoursSince = (Date.now() - new Date(lastReminder.sent_at).getTime()) / (1000 * 60 * 60);
        if (hoursSince < urgency.minHoursBetweenReminders) continue;
      }

      // Notification in-app (même mécanisme que le reste de l'app)
      try {
        await supabaseAdmin.from("notifications").insert({
          user_id: mover.user_id,
          user_type: "mover",
          title: urgency.level === "urgent"
            ? `⏰ Urgent : ${shortRef} approche, déposez votre devis`
            : `Demande ouverte : ${shortRef}`,
          message: `${request.from_city} → ${request.to_city}, déménagement le ${new Date(request.moving_date).toLocaleDateString('fr-FR')}. Soyez parmi les premiers à répondre.`,
          type: "quote_reminder",
          related_id: request.id,
          read: false,
          data: { quote_request_id: request.id, reference: shortRef, urgency: urgency.level },
        });
        notificationsCreated++;
      } catch (e) {
        console.warn("Notification in-app échouée (non bloquant):", e);
      }

      // Email
      if (resendApiKey && mover.email) {
        try {
          const isUrgent = urgency.level === "urgent";
          await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              from: "TrouveTonDemenageur <noreply@trouvetondemenageur.fr>",
              to: [mover.email],
              subject: isUrgent
                ? `⏰ ${shortRef} — Déménagement dans ${days} jour(s), soyez le premier à répondre !`
                : `Demande ouverte ${shortRef} — ${request.from_city} → ${request.to_city}`,
              html: `
                <!DOCTYPE html>
                <html><head><meta charset="UTF-8"></head>
                <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
                  <div style="background: ${isUrgent ? 'linear-gradient(135deg, #EF4444 0%, #F97316 100%)' : 'linear-gradient(135deg, #3B82F6 0%, #10B981 100%)'}; color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
                    <h1 style="margin:0; font-size: 22px;">${isUrgent ? '⏰ Réponse rapide recommandée' : '📋 Demande toujours ouverte'}</h1>
                  </div>
                  <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-radius: 0 0 10px 10px;">
                    <p>Bonjour ${mover.company_name || ''},</p>
                    <p>Une demande de déménagement correspondant à votre zone est toujours ouverte :</p>
                    <div style="background:#f3f4f6; padding:16px; border-radius:8px; margin: 16px 0;">
                      <p style="margin:0 0 6px;"><strong>Référence :</strong> ${shortRef}</p>
                      <p style="margin:0 0 6px;"><strong>Trajet :</strong> ${request.from_city} → ${request.to_city}</p>
                      <p style="margin:0;"><strong>Date :</strong> ${new Date(request.moving_date).toLocaleDateString('fr-FR')} (dans ${days} jour${days > 1 ? 's' : ''})</p>
                    </div>
                    <p>${isUrgent ? 'La date approche : soyez parmi les premiers à déposer votre devis pour maximiser vos chances.' : 'Cette demande accepte encore des devis.'}</p>
                    <div style="text-align: center; margin: 30px 0;">
                      <a href="https://www.trouvetondemenageur.fr/mover/quote-requests" style="display: inline-block; background: ${isUrgent ? '#EF4444' : '#3B82F6'}; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
                        Voir la demande et déposer un devis
                      </a>
                    </div>
                  </div>
                </body></html>
              `,
            }),
          });
          emailsSent++;
        } catch (e) {
          console.warn("Email de relance échoué (non bloquant):", e);
        }
      }

      await supabaseAdmin.from("quote_reminder_log").insert({
        quote_request_id: request.id,
        mover_id: mover.id,
        urgency: urgency.level,
      });
    }
  }

  return new Response(
    JSON.stringify({ requestsChecked: openRequests.length, moversChecked: movers.length, emailsSent, notificationsCreated }),
    { headers: { "Content-Type": "application/json" } }
  );
});
