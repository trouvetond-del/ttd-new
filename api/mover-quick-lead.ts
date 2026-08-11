// api/mover-quick-lead.ts - Vercel Serverless Function
// Reçoit les soumissions du mini-formulaire publicitaire déménageur
// (/inscription-demenageur). Ne crée PAS de fiche dans `movers` (ça
// recréerait exactement le problème de comptes fantômes déjà corrigé côté
// client) : uniquement un token de vérification + email. La vraie fiche
// `movers` n'est créée qu'à la toute fin, sur /mover/profile-completion,
// via le mécanisme existant (mover_signup_progress -> upsert movers).

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

function generateCode(): string {
  return String(Math.floor(10000000 + Math.random() * 90000000));
}

function isValidPhone(phone: string): boolean {
  const digits = phone.replace(/[\s.\-()]/g, '');
  return /^(\+33[67]|0[67])\d{8}$/.test(digits);
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidSiret(siret: string): boolean {
  const clean = siret.replace(/[\s\-]/g, '');
  if (!/^\d{14}$/.test(clean)) return false;
  if (/^(\d)\1{13}$/.test(clean)) return false;

  let sum = 0;
  for (let i = 0; i < 14; i++) {
    let digit = parseInt(clean[i], 10);
    if (i % 2 === 0) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
}

async function sendMoverVerificationEmail(email: string, firstName: string, actionUrl: string): Promise<void> {
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    console.warn('RESEND_API_KEY manquante : email de vérification déménageur non envoyé.');
    return;
  }
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'TrouveTonDemenageur <noreply@trouvetondemenageur.fr>',
      to: [email],
      subject: 'Finalisez votre inscription déménageur TrouveTonDemenageur',
      html: `
        <!DOCTYPE html>
        <html>
        <head><meta charset="UTF-8"></head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #3B82F6 0%, #10B981 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="margin:0; font-size: 24px;">🚚 TrouveTonDemenageur Pro</h1>
            <p style="margin:8px 0 0; opacity:0.9;">Rejoignez notre réseau de déménageurs vérifiés</p>
          </div>
          <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-radius: 0 0 10px 10px;">
            <p>Bonjour ${firstName || ''},</p>
            <p>Merci pour votre inscription sur <strong>TrouveTonDemenageur</strong>. Cliquez ci-dessous pour créer votre mot de passe et finaliser votre inscription (informations entreprise, KBIS, assurance...) :</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${actionUrl}" style="display: inline-block; background: #3B82F6; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
                Finir mon inscription
              </a>
            </div>
            <p style="text-align: center; color: #6B7280; font-size: 14px;">Ce lien expire dans 24 heures.</p>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
            <p style="color: #6B7280; font-size: 13px;">Une fois vos documents envoyés, notre équipe les vérifie sous 24-48h avant activation de votre compte.</p>
            <p style="color: #6B7280; font-size: 13px;">Si vous n'êtes pas à l'origine de cette demande, ignorez simplement cet email.</p>
          </div>
        </body>
        </html>
      `,
    }),
  });
}

async function sendAdminAlert(admins: string[], record: any): Promise<void> {
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey || admins.length === 0) return;
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'TrouveTonDéménageur <noreply@trouvetondemenageur.fr>',
      to: admins,
      subject: `🚚 Nouveau lead déménageur — ${record.company_name}`,
      html: `
        <div style="font-family: Arial, sans-serif; color:#333;">
          <div style="background:#f0f9ff; border-left:4px solid #667eea; padding:20px; border-radius:6px;">
            <p style="margin:0 0 10px;"><strong>🏢 Entreprise:</strong> ${record.company_name}</p>
            <p style="margin:0 0 10px;"><strong>SIRET:</strong> ${record.siret}</p>
            <p style="margin:0 0 10px;"><strong>👤 Gérant:</strong> ${record.manager_firstname} ${record.manager_lastname}</p>
            <p style="margin:0 0 10px;"><strong>📞 Téléphone:</strong> <a href="tel:${record.phone}">${record.phone}</a></p>
            <p style="margin:0;"><strong>✉️ Email:</strong> <a href="mailto:${record.email}">${record.email}</a></p>
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
    const managerFirstname = (body.manager_firstname || '').trim();
    const managerLastname = (body.manager_lastname || '').trim();
    const companyName = (body.company_name || '').trim();
    const siret = (body.siret || '').replace(/[\s\-]/g, '');
    const phone = (body.phone || '').trim();
    const email = (body.email || '').trim().toLowerCase();

    // Ces 3 champs (email actif, téléphone, SIRET réel) sont la condition
    // minimale, partout sur le site, pour qu'une inscription déménageur
    // devienne visible par nos équipes -- voir src/lib/moverQualification.ts
    // (règle appliquée en miroir ici côté serveur, ce flux ne passe pas par
    // React).
    const INCOMPLETE_MSG = 'Votre demande ne sera pas visible par nos équipes tant que votre email actif, votre numéro de téléphone et votre SIRET (format français réel) ne sont pas correctement renseignés.';

    if (!managerFirstname || !managerLastname || !companyName || !siret || !phone || !email) {
      return res.status(400).json({ error: `Tous les champs sont obligatoires. ${INCOMPLETE_MSG}` });
    }
    if (!isValidSiret(siret)) {
      return res.status(400).json({ error: `Numéro SIRET invalide. ${INCOMPLETE_MSG}` });
    }
    if (!isValidPhone(phone)) {
      return res.status(400).json({ error: `Numéro de mobile invalide (06 ou 07). ${INCOMPLETE_MSG}` });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Adresse email invalide.' });
    }

    // Bloque si ce SIRET ou cet email correspond à un déménageur déjà inscrit
    // Deux requêtes séparées plutôt qu'un .or() interpolé en chaîne :
    // la syntaxe mini-DSL de PostgREST peut mal interpréter certains
    // caractères (points, etc.) présents dans un email, ce qui provoque
    // une erreur 500 au lieu d'un vrai contrôle de doublon.
    const { data: moverBySiret, error: siretCheckError } = await supabase
      .from('movers')
      .select('id')
      .eq('siret', siret)
      .limit(1);

    const { data: moverByEmail, error: emailCheckError } = await supabase
      .from('movers')
      .select('id')
      .eq('email', email)
      .limit(1);

    if (siretCheckError || emailCheckError) {
      console.error('Erreur vérification doublon:', siretCheckError || emailCheckError);
      return res.status(500).json({
        error: 'Erreur lors de la vérification.',
        details: (siretCheckError || emailCheckError)?.message,
      });
    }

    const existingMover = [...(moverBySiret || []), ...(moverByEmail || [])];

    if (existingMover.length > 0) {
      return res.status(409).json({
        error: 'Ce SIRET ou cet email est déjà enregistré. Connectez-vous à votre espace déménageur existant.',
      });
    }

    const token = generateToken();
    const code = generateCode();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const record = {
      token,
      code,
      email,
      manager_firstname: managerFirstname,
      manager_lastname: managerLastname,
      company_name: companyName,
      siret,
      phone,
      expires_at: expiresAt,
    };

    const { error } = await supabase.from('mover_lead_verifications').insert(record).select();

    if (error) {
      console.error('Erreur insertion mover-lead:', error);
      return res.status(500).json({ error: "Erreur lors de l'enregistrement.", details: error.message });
    }

    const baseUrl = process.env.PUBLIC_SITE_URL || 'https://www.trouvetondemenageur.fr';
    const actionUrl = `${baseUrl}/inscription-demenageur/mot-de-passe?token=${token}`;

    try {
      await sendMoverVerificationEmail(email, managerFirstname, actionUrl);
    } catch (emailError) {
      console.warn('Email de vérification déménageur échoué (non bloquant):', emailError);
    }

    try {
      const { data: admins } = await supabase.from('admins').select('email');
      const adminEmails = (admins || []).map((a: { email: string }) => a.email).filter(Boolean);
      await sendAdminAlert(adminEmails, record);
    } catch (adminEmailError) {
      console.warn('Email admin échoué (non bloquant):', adminEmailError);
    }

    return res.status(200).json({ success: true });
  } catch (err: any) {
    console.error('Erreur mover-quick-lead:', err);
    return res.status(500).json({ error: 'Erreur interne.', details: err.message });
  }
}
