// Mail « Carte trajet » envoyé aux déménageurs pour déposer un devis.
// Utilisé par la relance automatique et par l'invitation manuelle de l'admin.

function esc(v: unknown): string {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

export interface MoverQuoteEmailInput {
  companyName?: string | null;
  reference: string;
  fromCity?: string | null;
  toCity?: string | null;
  movingDate: string;
  days: number;
  volumeM3?: number | null;
  urgent?: boolean;
  personalInvite?: boolean;
  newRequest?: boolean;
  quote?: Record<string, any> | null;
}

const TEAM_PHONE = '01 89 70 78 81';
const TEAM_PHONE_TEL = '+33189707881';

function floorLabel(v: unknown): string {
  if (v === null || v === undefined || v === '') return 'Non renseigné';
  const n = Number(v);
  if (!Number.isNaN(n)) return n === 0 ? 'RDC' : `${n}e étage`;
  return String(v);
}
function yesNo(v: unknown): string {
  if (v === null || v === undefined || v === '') return 'Non renseigné';
  return v === true || v === 'true' || v === 'oui' ? 'Oui' : 'Non';
}
function elevatorLabel(has: unknown, cap: unknown): string {
  const base = yesNo(has);
  return base === 'Oui' && cap ? `Oui (${cap})` : base;
}
function row(label: string, from: string, to: string): string {
  return `<tr><td style="padding:7px 0;font-size:13px;color:#6b7280;border-top:1px solid #eef0f3;">${label}</td><td style="padding:7px 0;font-size:14px;color:#111827;font-weight:bold;border-top:1px solid #eef0f3;">${esc(from)}</td><td align="right" style="padding:7px 0;font-size:14px;color:#111827;font-weight:bold;border-top:1px solid #eef0f3;">${esc(to)}</td></tr>`;
}

export function buildMoverQuoteEmail(i: MoverQuoteEmailInput): string {
  const date = new Date(i.movingDate).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const q = i.quote || null;
  const ref = encodeURIComponent(i.reference);
  const title = i.newRequest ? 'Nouvelle demande de déménagement' : i.personalInvite
    ? 'Une demande choisie pour vous'
    : i.urgent ? 'Déménagement imminent' : 'Une demande vous attend';
  const intro = i.newRequest
    ? 'Un client vient de déposer une demande. Les premiers devis ont plus de chances d’être acceptés.'
    : i.personalInvite
    ? "Suite à notre échange, voici la demande de déménagement dont nous avons parlé. Notre équipe a pensé à vous : le client attend encore des devis."
    : i.urgent
      ? 'La date approche : soyez parmi les premiers à proposer votre devis.'
      : 'Un client attend encore des devis pour ce déménagement.';
  const accent = i.urgent && !i.personalInvite ? '#F97316' : '#10B981';
  const volume = i.volumeM3 ? `${esc(i.volumeM3)} m³` : '—';
  const fromLabel = q?.from_postal_code ? `${i.fromCity || '—'} (${q.from_postal_code})` : (i.fromCity || '—');
  const toLabel = q?.to_postal_code ? `${i.toCity || '—'} (${q.to_postal_code})` : (i.toCity || '—');
  const flex = q ? (Number(q.date_flexibility_days) > 0 ? `Oui, ± ${q.date_flexibility_days} jour${Number(q.date_flexibility_days) > 1 ? 's' : ''}` : 'Non') : '';
  const services: string[] = Array.isArray(q?.services_needed) ? q!.services_needed : [];
  const details = q ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:18px;">
      <tr><td></td><td style="padding:0 0 6px;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#2563EB;">Départ</td><td align="right" style="padding:0 0 6px;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#10B981;">Arrivée</td></tr>
      ${row('Logement', [q.from_home_type, q.from_home_size].filter(Boolean).join(' ') || 'Non renseigné', [q.to_home_type, q.to_home_size].filter(Boolean).join(' ') || 'Non renseigné')}
      ${row('Étage', floorLabel(q.floor_from), floorLabel(q.floor_to))}
      ${row('Ascenseur', elevatorLabel(q.elevator_from, q.elevator_capacity_from), elevatorLabel(q.elevator_to, q.elevator_capacity_to))}
      ${row('Monte-meuble', yesNo(q.furniture_lift_needed_departure), yesNo(q.furniture_lift_needed_arrival))}
    </table>
    <p style="margin:16px 0 0;font-size:14px;color:#374151;">Date flexible : <strong>${esc(flex)}</strong></p>
    <p style="margin:8px 0 0;font-size:14px;color:#374151;">Services demandés : <strong>${services.length ? services.map(esc).join(', ') : 'Aucun'}</strong></p>` : '';

  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
  <tr><td style="background:linear-gradient(90deg,#2563EB,#10B981);background-color:#2563EB;height:6px;border-radius:12px 12px 0 0;font-size:0;line-height:0;">&nbsp;</td></tr>
  <tr><td style="border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;padding:28px 28px 32px;">
    <p style="margin:0 0 4px;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:#6b7280;">TrouveTonDéménageur · ${esc(i.reference)}</p>
    <h1 style="margin:0 0 18px;font-size:22px;color:#111827;">${title}</h1>
    <p style="margin:0 0 6px;font-size:15px;">Bonjour ${esc(i.companyName || '')},</p>
    <p style="margin:0 0 22px;font-size:15px;line-height:1.6;color:#374151;">${intro}</p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:12px;background:#f9fafb;">
      <tr><td style="padding:20px 20px 8px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td width="45%" valign="top">
            <p style="margin:0;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#2563EB;">● Départ</p>
            <p style="margin:4px 0 0;font-size:18px;font-weight:bold;color:#111827;">${esc(fromLabel)}</p>
          </td>
          <td width="10%" align="center" valign="middle" style="font-size:20px;color:#9ca3af;">→</td>
          <td width="45%" valign="top" align="right">
            <p style="margin:0;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#10B981;">Arrivée ●</p>
            <p style="margin:4px 0 0;font-size:18px;font-weight:bold;color:#111827;">${esc(toLabel)}</p>
          </td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:8px 20px 20px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px dashed #d1d5db;"><tr>
          <td style="padding-top:14px;font-size:14px;color:#374151;">📅 <strong>${esc(date)}</strong><br><span style="color:#6b7280;font-size:13px;">dans ${i.days} jour${i.days > 1 ? 's' : ''}</span></td>
          <td align="right" style="padding-top:14px;font-size:14px;color:#374151;">📦 <strong>${volume}</strong><br><span style="color:#6b7280;font-size:13px;">volume estimé</span></td>
        </tr></table>${details}
      </td></tr>
    </table>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:28px 0 0;"><tr><td align="center">
      <a href="https://www.trouvetondemenageur.fr/mover/quote-requests?ref=${ref}&inventaire=1" style="display:block;background:#ffffff;color:#2563EB;border:2px solid #2563EB;text-decoration:none;font-weight:bold;font-size:15px;padding:12px 24px;border-radius:999px;text-align:center;">Voir inventaire</a>
    </td></tr></table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:12px 0 8px;"><tr><td align="center">
      <a href="https://www.trouvetondemenageur.fr/mover/quote-requests?ref=${ref}" style="display:block;background:${accent};color:#ffffff;text-decoration:none;font-weight:bold;font-size:17px;padding:16px 24px;border-radius:999px;text-align:center;">Déposer mon devis &nbsp;→</a>
    </td></tr></table>
    <p style="margin:10px 0 0;text-align:center;font-size:12px;color:#9ca3af;">Gratuit · Quelques minutes suffisent</p>

    <p style="margin:28px 0 0;font-size:14px;color:#374151;">À très vite,<br><strong>L'équipe Trouve Ton Déménageur</strong><br><a href="tel:${TEAM_PHONE_TEL}" style="color:#2563EB;text-decoration:none;">📞 ${TEAM_PHONE}</a></p>
  </td></tr>
  <tr><td align="center" style="padding:16px;font-size:12px;color:#9ca3af;">www.trouvetondemenageur.fr</td></tr>
</table>
</td></tr></table>
</body></html>`;
}
