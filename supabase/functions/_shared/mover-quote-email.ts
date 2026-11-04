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
}

export function buildMoverQuoteEmail(i: MoverQuoteEmailInput): string {
  const date = new Date(i.movingDate).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const title = i.personalInvite
    ? 'Une demande choisie pour vous'
    : i.urgent ? 'Déménagement imminent' : 'Une demande vous attend';
  const intro = i.personalInvite
    ? "Suite à notre échange, voici la demande de déménagement dont nous avons parlé. Notre équipe a pensé à vous : le client attend encore des devis."
    : i.urgent
      ? 'La date approche : soyez parmi les premiers à proposer votre devis.'
      : 'Un client attend encore des devis pour ce déménagement.';
  const accent = i.urgent && !i.personalInvite ? '#F97316' : '#10B981';
  const volume = i.volumeM3 ? `${esc(i.volumeM3)} m³` : '—';

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
            <p style="margin:4px 0 0;font-size:18px;font-weight:bold;color:#111827;">${esc(i.fromCity || '—')}</p>
          </td>
          <td width="10%" align="center" valign="middle" style="font-size:20px;color:#9ca3af;">→</td>
          <td width="45%" valign="top" align="right">
            <p style="margin:0;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#10B981;">Arrivée ●</p>
            <p style="margin:4px 0 0;font-size:18px;font-weight:bold;color:#111827;">${esc(i.toCity || '—')}</p>
          </td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:8px 20px 20px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px dashed #d1d5db;"><tr>
          <td style="padding-top:14px;font-size:14px;color:#374151;">📅 <strong>${esc(date)}</strong><br><span style="color:#6b7280;font-size:13px;">dans ${i.days} jour${i.days > 1 ? 's' : ''}</span></td>
          <td align="right" style="padding-top:14px;font-size:14px;color:#374151;">📦 <strong>${volume}</strong><br><span style="color:#6b7280;font-size:13px;">volume estimé</span></td>
        </tr></table>
      </td></tr>
    </table>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:28px 0 8px;"><tr><td align="center">
      <a href="https://www.trouvetondemenageur.fr/mover/quote-requests" style="display:block;background:${accent};color:#ffffff;text-decoration:none;font-weight:bold;font-size:17px;padding:16px 24px;border-radius:999px;text-align:center;">Déposer mon devis &nbsp;→</a>
    </td></tr></table>
    <p style="margin:10px 0 0;text-align:center;font-size:12px;color:#9ca3af;">Gratuit · Quelques minutes suffisent</p>

    <p style="margin:28px 0 0;font-size:14px;color:#374151;">À très vite,<br><strong>L'équipe Trouve Ton Déménageur</strong></p>
  </td></tr>
  <tr><td align="center" style="padding:16px;font-size:12px;color:#9ca3af;">www.trouvetondemenageur.fr</td></tr>
</table>
</td></tr></table>
</body></html>`;
}
