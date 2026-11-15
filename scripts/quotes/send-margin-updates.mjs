import { createClient } from '@supabase/supabase-js';

const required = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} manquant`);
  return value;
};
const sendEmails = process.env.SEND_EMAILS === 'true';
const sb = createClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false },
});

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));
const money = (value) => Number(value).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const one = (value) => Array.isArray(value) ? value[0] : value;

function emailHtml(request, rows) {
  const reference = request.reference || 'votre demande';
  const cards = rows.map(({ audit, quote }) => {
    const mover = one(quote.mover);
    const oldPrice = Number(audit.old_client_price);
    const newPrice = Number(audit.new_client_price);
    const moverPrice = Number(quote.price);
    const fee = Math.max(0, newPrice - moverPrice);
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #dbe4ee;border-radius:12px;margin:0 0 14px;background:#ffffff;"><tr><td style="padding:20px;">
      <p style="margin:0 0 10px;font-size:16px;font-weight:700;color:#172554;">${esc(mover?.company_name || 'Déménageur vérifié')}</p>
      <p style="margin:0;color:#64748b;font-size:14px;">Ancien prix : <span style="text-decoration:line-through;">${money(oldPrice)} €</span></p>
      <p style="margin:5px 0;color:#047857;font-size:28px;font-weight:700;">${money(newPrice)} € <span style="font-size:13px;font-weight:400;">TTC</span></p>
      <p style="margin:0 0 10px;color:#047857;font-size:14px;font-weight:700;">Vous économisez ${money(oldPrice - newPrice)} €</p>
      <p style="margin:0;color:#475569;font-size:13px;line-height:1.6;">Frais de réservation TTD : ${money(fee)} €<br>À régler directement au déménageur : ${money(moverPrice)} €</p>
    </td></tr></table>`;
  }).join('');
  const href = `https://www.trouvetondemenageur.fr/client/quotes?requestId=${encodeURIComponent(request.id)}`;
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#1e293b;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;background:#fff;border-radius:16px;overflow:hidden;">
    <tr><td style="height:6px;background:#2563eb;font-size:0;">&nbsp;</td></tr><tr><td style="padding:30px 26px;">
      <p style="margin:0 0 8px;color:#2563eb;font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">${esc(reference)} · Prix mis à jour</p>
      <h1 style="margin:0 0 16px;font-size:25px;line-height:1.25;color:#0f172a;">Bonne nouvelle : vos devis baissent</h1>
      <p style="font-size:15px;line-height:1.65;color:#475569;">Bonjour${request.client_name ? ` ${esc(request.client_name)}` : ''},</p>
      <p style="font-size:15px;line-height:1.65;color:#475569;">Nous avons réduit nos frais de mise en relation. Les propositions pour votre déménagement <strong>${esc(request.from_city)} → ${esc(request.to_city)}</strong> ont donc été revues à la baisse. Le prix demandé par chaque déménageur reste inchangé.</p>
      <div style="margin:24px 0;">${cards}</div>
      <p style="font-size:14px;line-height:1.6;color:#475569;">Ces nouveaux prix remplacent les précédents pour les devis encore en attente. Vous pouvez les comparer et choisir sereinement dans votre espace client.</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;"><tr><td align="center"><a href="${href}" style="display:block;background:#2563eb;color:#fff;text-decoration:none;font-weight:700;font-size:16px;padding:15px 22px;border-radius:10px;">Voir mes nouveaux devis</a></td></tr></table>
      <p style="margin:28px 0 0;font-size:14px;line-height:1.65;color:#475569;">Une question ? Notre équipe vous répond au <a href="tel:+33189707881" style="color:#2563eb;text-decoration:none;">01 89 70 78 81</a>.<br><br><strong>L’équipe Trouve Ton Déménageur</strong></p>
    </td></tr><tr><td align="center" style="padding:16px;background:#f8fafc;color:#94a3b8;font-size:12px;">www.trouvetondemenageur.fr</td></tr>
  </table></td></tr></table></body></html>`;
}

const { data: pending, error } = await sb.from('quote_margin_updates')
  .select(`id, quote_id, old_client_price, new_client_price,
    quotes!inner(id, price, status, quote_request_id,
      mover:movers!quotes_mover_id_fkey(company_name),
      request:quote_requests!quotes_quote_request_id_fkey(id, reference, client_name, client_email, client_user_id, from_city, to_city, moving_date, status, payment_status, accepted_quote_id, deleted_at))`)
  .is('email_sent_at', null)
  .order('id');
if (error) throw error;

const groups = new Map();
for (const audit of pending || []) {
  const quote = one(audit.quotes);
  const request = one(quote?.request);
  if (!quote || !request) continue;
  const paidRequest = ['deposit_paid', 'fully_paid', 'completed', 'paid'].includes(request.payment_status || '');
  const closedRequest = ['accepted', 'ongoing', 'completed', 'cancelled'].includes(request.status || '');
  if (quote.status !== 'pending' || request.deleted_at || request.accepted_quote_id || paidRequest || closedRequest) continue;
  if (!groups.has(request.id)) groups.set(request.id, { request, rows: [] });
  groups.get(request.id).rows.push({ audit, quote });
}

console.log(`${groups.size} demande(s), ${[...groups.values()].reduce((n, g) => n + g.rows.length, 0)} devis à ${sendEmails ? 'envoyer' : 'vérifier'}.`);
let sent = 0;
let failed = 0;
for (const { request, rows } of groups.values()) {
  const reference = request.reference || request.id;
  if (!request.client_email) {
    console.error(`Email manquant pour ${reference}.`);
    failed += 1;
    continue;
  }
  if (!sendEmails) {
    console.log(`Prêt : ${reference}, ${rows.length} devis.`);
    continue;
  }
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${required('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'TrouveTonDéménageur <noreply@trouvetondemenageur.fr>',
        to: [request.client_email],
        reply_to: 'support@trouvetondemenageur.fr',
        subject: `Bonne nouvelle : vos devis ${reference} ont été revus à la baisse`,
        html: emailHtml(request, rows),
      }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result?.message || `Envoi refusé (${response.status})`);
    const now = new Date().toISOString();
    const ids = rows.map(({ audit }) => audit.id);
    const { error: markError } = await sb.from('quote_margin_updates')
      .update({ email_sent_at: now, email_provider_id: result.id, email_error: null })
      .in('id', ids);
    if (markError) throw markError;
    if (request.client_user_id) {
      await sb.from('notifications').insert({
        user_id: request.client_user_id,
        type: 'quote_update',
        title: 'Vos devis ont été revus à la baisse',
        message: `${rows.length} devis ont été mis à jour pour votre déménagement ${request.from_city} → ${request.to_city}.`,
        related_id: request.id,
        read: false,
      });
    }
    sent += 1;
    console.log(`Envoyé : ${reference}, ${rows.length} devis.`);
  } catch (err) {
    failed += 1;
    const message = err instanceof Error ? err.message : String(err);
    await sb.from('quote_margin_updates').update({ email_error: message }).in('id', rows.map(({ audit }) => audit.id));
    console.error(`Échec pour ${reference}: ${message}`);
  }
}
console.log(`${sent} email(s) envoyé(s), ${failed} échec(s).`);
if (failed) process.exitCode = 1;
