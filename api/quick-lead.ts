// api/quick-lead.ts - Vercel Serverless Function
// Reçoit les soumissions du mini-formulaire publicitaire (/devis-rapide) et
// crée une ligne quote_requests complète (nom, adresses complètes) avec un
// score automatique chaud/tiède/froid basé sur la proximité de la date.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function computeLeadScore(movingDateStr: string | null | undefined): 'chaud' | 'tiede' | 'froid' | 'inconnu' {
  if (!movingDateStr) return 'inconnu';
  const movingDate = new Date(movingDateStr);
  if (isNaN(movingDate.getTime())) return 'inconnu';
  const daysUntil = Math.ceil((movingDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (daysUntil < 0) return 'inconnu';
  if (daysUntil <= 30) return 'chaud';
  if (daysUntil <= 90) return 'tiede';
  return 'froid';
}

function isValidPhone(phone: string): boolean {
  const digits = phone.replace(/[\s.\-()]/g, '');
  // Uniquement mobiles français 06/07 (ou +336/+337) pour le devis rapide :
  // c'est ce numéro que les déménageurs vont appeler directement.
  return /^(\+33[67]|0[67])\d{8}$/.test(digits);
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

function generateCode(): string {
  return String(Math.floor(10000000 + Math.random() * 90000000));
}

async function sendClientVerificationEmail(email: string, firstName: string, code: string, actionUrl: string): Promise<void> {
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    console.warn('RESEND_API_KEY manquante : email de vérification client non envoyé.');
    return;
  }
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'TrouveTonDemenageur <noreply@trouvetondemenageur.fr>',
      to: [email],
      subject: `Finalisez votre demande TrouveTonDemenageur`,
      html: `
        <!DOCTYPE html>
        <html>
        <head><meta charset="UTF-8"></head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #3B82F6 0%, #10B981 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="margin:0; font-size: 24px;">🏠 TrouveTonDemenageur</h1>
            <p style="margin:8px 0 0; opacity:0.9;">Encore une étape avant vos devis</p>
          </div>
          <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-radius: 0 0 10px 10px;">
            <p>Bonjour ${firstName || ''},</p>
            <p>Merci pour votre demande sur <strong>TrouveTonDemenageur</strong>. Cliquez ci-dessous pour créer votre mot de passe et finaliser votre demande (étage, ascenseur, inventaire...) :</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${actionUrl}" style="display: inline-block; background: #3B82F6; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
                Créer mon mot de passe
              </a>
            </div>
            <p style="text-align: center; color: #6B7280; font-size: 14px;">Ce lien expire dans 24 heures.</p>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
            <p style="color: #6B7280; font-size: 13px;">Si vous n'êtes pas à l'origine de cette demande, ignorez simplement cet email.</p>
          </div>
        </body>
        </html>
      `,
    }),
  });
}

async function createAndSendVerification(
  supabase: ReturnType<typeof createClient>,
  quoteRequestId: string,
  email: string,
  firstName: string
): Promise<void> {
  const token = generateToken();
  const code = generateCode();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const { error } = await supabase.from('quick_lead_verifications').insert({
    quote_request_id: quoteRequestId,
    email,
    token,
    code,
    expires_at: expiresAt,
  });

  if (error) {
    console.error('Erreur création vérification:', error);
    return;
  }

  const baseUrl = process.env.PUBLIC_SITE_URL || 'https://www.trouvetondemenageur.fr';
  const actionUrl = `${baseUrl}/devis-rapide/mot-de-passe?token=${token}`;

  try {
    await sendClientVerificationEmail(email, firstName, code, actionUrl);
  } catch (emailError) {
    console.warn('Email de vérification client échoué (non bloquant):', emailError);
  }
}

async function sendAdminAlert(admins: string[], leadScore: string, record: any): Promise<void> {
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey || admins.length === 0) {
    if (!resendApiKey) console.warn('RESEND_API_KEY manquante côté Vercel : alerte admin non envoyée.');
    return;
  }
  const isHot = leadScore === 'chaud';
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'TrouveTonDéménageur <noreply@trouvetondemenageur.fr>',
      to: admins,
      subject: isHot
        ? `🔥 NOUVEAU LEAD CHAUD — ${record.client_name} — ${record.from_city} → ${record.to_city}`
        : `Nouveau lead publicitaire — ${record.client_name} — ${record.from_city} → ${record.to_city}`,
      html: `
        <div style="font-family: Arial, sans-serif; color:#333;">
          <div style="background:${isHot ? '#fff1f0' : '#f0f9ff'}; border-left:4px solid ${isHot ? '#ef4444' : '#667eea'}; padding:20px; border-radius:6px;">
            <p style="margin:0 0 10px;"><strong>Score:</strong> ${leadScore}</p>
            <p style="margin:0 0 10px;"><strong>👤 Nom:</strong> ${record.client_name}</p>
            <p style="margin:0 0 10px;"><strong>📞 Téléphone:</strong> <a href="tel:${record.client_phone}">${record.client_phone}</a></p>
            <p style="margin:0 0 10px;"><strong>✉️ Email:</strong> <a href="mailto:${record.client_email}">${record.client_email}</a></p>
            <p style="margin:0 0 10px;"><strong>📍 Départ:</strong> ${record.from_address}</p>
            <p style="margin:0 0 10px;"><strong>📍 Arrivée:</strong> ${record.to_address}</p>
            <p style="margin:0;"><strong>📅 Date souhaitée:</strong> ${record.moving_date || 'Non renseignée'}</p>
          </div>
          <div style="text-align:center; margin:24px 0;">
            <a href="https://www.trouvetondemenageur.fr/admin/dashboard/recent_quotes" style="display:inline-block; padding:12px 28px; background:#667eea; color:#fff; border-radius:8px; text-decoration:none; font-weight:bold;">Voir dans l'admin</a>
          </div>
        </div>
      `,
    }),
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = req.body || {};
    const firstName = (body.first_name || '').trim();
    const lastName = (body.last_name || '').trim();
    const fromAddress = (body.from_address || '').trim();
    const fromCity = (body.from_city || '').trim();
    const fromPostalCode = (body.from_postal_code || '').trim();
    const toAddress = (body.to_address || '').trim();
    const toCity = (body.to_city || '').trim();
    const toPostalCode = (body.to_postal_code || '').trim();
    const movingDate = (body.moving_date || '').trim();
    const phone = (body.phone || '').trim();
    const email = (body.email || '').trim().toLowerCase();
    const source = (body.source || 'mini_formulaire').trim();
    const allowedHomeSizes = ['Studio', 'T1', 'T2', 'T3', 'T4', 'T5+'];
    const homeSize = allowedHomeSizes.includes(body.home_size) ? body.home_size : '';
    const homeType = body.home_type === 'Maison' ? 'Maison' : 'Appartement';
    // Volume de secours si le front n'en a pas envoyé (défense en profondeur,
    // même barème que QuickLeadPage.tsx) : sans ça une demande "sans devis
    // rapide" resterait invisible pour le matching déménageurs (qui exige
    // volume_m3 > 0) même en ayant renseigné la taille du logement.
    const volumeBySize: Record<string, number> = { Studio: 15, T1: 20, T2: 30, T3: 45, T4: 60, 'T5+': 80 };
    const volumeM3 = typeof body.volume_m3 === 'number' && body.volume_m3 > 0
      ? body.volume_m3
      : (volumeBySize[homeSize] || null);

    if (!firstName || !lastName || !fromAddress || !toAddress || !phone || !email) {
      return res.status(400).json({ error: 'Nom, prénom, adresses, téléphone et email sont obligatoires.' });
    }
    // Défense en profondeur : le front (QuickLeadPage) empêche déjà la
    // soumission sans ville, mais cet endpoint est public et peut être
    // appelé directement. Une demande sans ville est inexploitable pour le
    // matching déménageurs et invisible dans les recherches par zone.
    if (!fromCity || !toCity) {
      return res.status(400).json({ error: 'La ville de départ et la ville d\'arrivée sont obligatoires.' });
    }
    if (!homeSize) {
      return res.status(400).json({ error: 'La taille du logement est obligatoire.' });
    }
    if (!isValidPhone(phone)) {
      return res.status(400).json({ error: 'Numéro de téléphone invalide.' });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Adresse email invalide.' });
    }

    // Anti-doublon 24h
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: existing } = await supabase
      .from('quote_requests')
      .select('id')
      .or(`client_email.eq.${email},client_phone.eq.${phone}`)
      .gte('created_at', since)
      .limit(1);

    if (existing && existing.length > 0) {
      const quoteRequestId = existing[0].id;
      await createAndSendVerification(supabase, quoteRequestId, email, firstName);
      return res.status(200).json({ success: true, duplicate: true, id: quoteRequestId });
    }

    const leadScore = computeLeadScore(movingDate);

    const record = {
      client_name: `${firstName} ${lastName}`.trim(),
      client_email: email,
      client_phone: phone,
      from_address: fromAddress,
      from_city: fromCity,
      from_postal_code: fromPostalCode,
      from_latitude: body.from_latitude ?? null,
      from_longitude: body.from_longitude ?? null,
      from_home_size: homeSize,
      from_home_type: homeType,
      to_home_size: homeSize,
      to_home_type: homeType,
      volume_m3: volumeM3,
      to_address: toAddress,
      to_city: toCity,
      to_postal_code: toPostalCode,
      to_latitude: body.to_latitude ?? null,
      to_longitude: body.to_longitude ?? null,
      moving_date: movingDate || null,
      date_flexibility_days: 0,
      floor_from: 0,
      floor_to: 0,
      elevator_from: false,
      elevator_to: false,
      services_needed: [],
      additional_info: '',
      client_user_id: null,
      lead_score: leadScore,
      lead_source: source,
      status: 'new',
    };

    const { data, error } = await supabase.from('quote_requests').insert([record]).select();

    if (error) {
      console.error('Erreur insertion quick-lead:', error);
      return res.status(500).json({ error: 'Erreur lors de l\'enregistrement.', details: error.message });
    }

    const newQuoteRequestId = data?.[0]?.id;
    if (newQuoteRequestId) {
      await createAndSendVerification(supabase, newQuoteRequestId, email, firstName);
    }

    // Alerte équipe admin (best-effort)
    try {
      const { data: admins } = await supabase.from('admins').select('email');
      const adminEmails = (admins || []).map((a: { email: string }) => a.email).filter(Boolean);
      await sendAdminAlert(adminEmails, leadScore, record);
    } catch (adminEmailError) {
      console.warn('Email admin échoué (non bloquant):', adminEmailError);
    }

    return res.status(200).json({ success: true, leadScore, id: data?.[0]?.id });
  } catch (err: any) {
    console.error('Erreur quick-lead:', err);
    return res.status(500).json({ error: 'Erreur interne.', details: err.message });
  }
}
