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

const one = (value) => Array.isArray(value) ? value[0] : value;

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
    const response = await fetch(`${required('SUPABASE_URL')}/functions/v1/send-notification`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${required('SUPABASE_SERVICE_ROLE_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'quote_margin_updated',
        recipientEmail: request.client_email,
        data: {
          reference,
          requestId: request.id,
          clientName: request.client_name,
          fromCity: request.from_city,
          toCity: request.to_city,
          quotes: rows.map(({ audit, quote }) => ({
            companyName: one(quote.mover)?.company_name || 'Déménageur vérifié',
            oldPrice: Number(audit.old_client_price),
            newPrice: Number(audit.new_client_price),
            moverPrice: Number(quote.price),
            fee: Math.max(0, Number(audit.new_client_price) - Number(quote.price)),
          })),
        },
      }),
    });
    const result = await response.json();
    if (!response.ok || !result.success || !result.emailId) {
      throw new Error(result?.error || result?.message || `Envoi refusé (${response.status})`);
    }
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
