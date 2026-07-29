// api/quick-lead.ts - Vercel Serverless Function
// Reçoit les soumissions du mini-formulaire publicitaire (/devis-rapide) et
// crée une ligne quote_requests minimale, avec un score automatique
// chaud/tiède/froid basé sur la proximité de la date de déménagement.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// Clé service_role : permet l'insertion sans authentification utilisateur
// (le mini-formulaire est volontairement accessible sans compte, pour
// réduire la friction publicitaire).
const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function computeLeadScore(movingDateStr: string | null | undefined): 'chaud' | 'tiede' | 'froid' | 'inconnu' {
  if (!movingDateStr) return 'inconnu';
  const movingDate = new Date(movingDateStr);
  if (isNaN(movingDate.getTime())) return 'inconnu';

  const daysUntil = Math.ceil((movingDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

  if (daysUntil < 0) return 'inconnu'; // date passée, probablement une erreur de saisie
  if (daysUntil <= 30) return 'chaud';
  if (daysUntil <= 90) return 'tiede';
  return 'froid';
}

function isValidPhone(phone: string): boolean {
  const digits = phone.replace(/[\s.\-()]/g, '');
  return /^(\+33|0)[1-9]\d{8}$/.test(digits);
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Envoi d'email direct via l'API Resend, sans passer par une Supabase Edge
// Function. Choix volontaire : Vercel redéploie automatiquement à chaque
// push, alors qu'une Edge Function Supabase doit être redéployée
// manuellement — ça a déjà causé des emails silencieusement non envoyés.
// Nécessite RESEND_API_KEY dans les variables d'environnement Vercel.
async function sendEmail(to: string[], subject: string, html: string): Promise<void> {
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    console.warn('RESEND_API_KEY manquante côté Vercel : email non envoyé (mode dev).');
    return;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'TrouveTonDéménageur <noreply@trouvetondemenageur.fr>',
      to,
      subject,
      html,
    }),
  });
  if (!res.ok) {
    throw new Error(`Resend a répondu ${res.status}: ${await res.text()}`);
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = req.body || {};
    const fromCity = (body.from_city || '').trim();
    const toCity = (body.to_city || '').trim();
    const movingDate = (body.moving_date || '').trim();
    const phone = (body.phone || '').trim();
    const email = (body.email || '').trim().toLowerCase();
    const source = (body.source || 'mini_formulaire').trim();

    if (!fromCity || !toCity || !phone || !email) {
      return res.status(400).json({ error: 'Ville de départ, ville d\'arrivée, téléphone et email sont obligatoires.' });
    }
    if (!isValidPhone(phone)) {
      return res.status(400).json({ error: 'Numéro de téléphone invalide.' });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Adresse email invalide.' });
    }

    // Garde-fou anti-doublon : si le même email ou téléphone a déjà soumis
    // une demande dans les dernières 24h, on ne recrée pas de ligne (évite
    // de spammer l'admin de doublons en cas de double-clic ou de nouvelle
    // visite sur la pub) et on renvoie simplement un succès au client.
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: existing } = await supabase
      .from('quote_requests')
      .select('id')
      .or(`client_email.eq.${email},client_phone.eq.${phone}`)
      .gte('created_at', since)
      .limit(1);

    if (existing && existing.length > 0) {
      return res.status(200).json({ success: true, duplicate: true, id: existing[0].id });
    }

    const leadScore = computeLeadScore(movingDate);

    const record = {
      client_name: 'Prospect publicité',
      client_email: email,
      client_phone: phone,
      from_address: '',
      from_city: fromCity,
      from_postal_code: '',
      from_home_size: '',
      from_home_type: '',
      to_address: '',
      to_city: toCity,
      to_postal_code: '',
      to_home_size: '',
      to_home_type: '',
      moving_date: movingDate || null,
      date_flexibility_days: 0,
      floor_from: 0,
      floor_to: 0,
      elevator_from: false,
      elevator_to: false,
      services_needed: [],
      additional_info: `Lead rapide via formulaire publicitaire (source: ${source})`,
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

    // Email au client : lien direct vers la création de compte + demande de
    // déménagement, avec son email déjà pré-rempli. Best-effort : ne bloque
    // jamais la réponse au client si l'envoi échoue.
    const signupUrl = `https://www.trouvetondemenageur.fr/client/signup?email=${encodeURIComponent(email)}`;
    try {
      await sendEmail(
        [email],
        'Finalisez votre demande de devis déménagement',
        `
          <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 560px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #3B82F6 0%, #10B981 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
              <h1 style="margin:0; font-size: 24px;">🏠 TrouveTonDéménageur</h1>
            </div>
            <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none;">
              <p>Bonjour,</p>
              <p>Merci pour votre demande de devis <strong>${fromCity} → ${toCity}</strong>.</p>
              <p>Pour recevoir vos devis de déménageurs vérifiés, finalisez votre demande en une minute :</p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${signupUrl}" style="display: inline-block; background: #3B82F6; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
                  Finaliser ma demande
                </a>
              </div>
              <p style="color:#6b7280; font-size: 14px;">Ce lien vous amène directement à la création de votre compte gratuit (email déjà rempli), pour suivre l'avancement de votre demande et échanger avec les déménageurs.</p>
              <p style="margin-top: 30px;">Cordialement,<br><strong>L'équipe TrouveTonDéménageur</strong></p>
            </div>
            <div style="text-align: center; padding: 20px; color: #6b7280; font-size: 13px;">
              <p>© 2026 TrouveTonDéménageur · support@trouvetondemenageur.fr</p>
            </div>
          </div>
        `
      );
    } catch (clientEmailError) {
      console.warn('Email client échoué (non bloquant):', clientEmailError);
    }

    // Alerte l'équipe admin : liste des emails admin récupérée directement
    // depuis la table `admins`, puis envoi via Resend (même raison que
    // ci-dessus : indépendance vis-à-vis des Edge Functions Supabase).
    try {
      const { data: admins } = await supabase.from('admins').select('email');
      const adminEmails = (admins || []).map((a: { email: string }) => a.email).filter(Boolean);
      if (adminEmails.length > 0) {
        const isHot = leadScore === 'chaud';
        await sendEmail(
          adminEmails,
          isHot
            ? `🔥 NOUVEAU LEAD CHAUD — ${fromCity} → ${toCity}`
            : `Nouveau lead publicitaire — ${fromCity} → ${toCity}`,
          `
            <div style="font-family: Arial, sans-serif; color:#333;">
              <div style="background:${isHot ? '#fff1f0' : '#f0f9ff'}; border-left:4px solid ${isHot ? '#ef4444' : '#667eea'}; padding:20px; border-radius:6px;">
                <p style="margin:0 0 10px;"><strong>Score:</strong> ${leadScore}</p>
                <p style="margin:0 0 10px;"><strong>📞 Téléphone:</strong> <a href="tel:${phone}">${phone}</a></p>
                <p style="margin:0 0 10px;"><strong>✉️ Email:</strong> <a href="mailto:${email}">${email}</a></p>
                <p style="margin:0 0 10px;"><strong>📍 Trajet:</strong> ${fromCity} → ${toCity}</p>
                <p style="margin:0;"><strong>📅 Date souhaitée:</strong> ${movingDate || 'Non renseignée'}</p>
              </div>
              <div style="text-align:center; margin:24px 0;">
                <a href="https://www.trouvetondemenageur.fr/admin/quote-requests" style="display:inline-block; padding:12px 28px; background:#667eea; color:#fff; border-radius:8px; text-decoration:none; font-weight:bold;">Voir dans l'admin</a>
              </div>
            </div>
          `
        );
      } else {
        console.warn('Aucun email admin trouvé dans la table admins.');
      }
    } catch (adminEmailError) {
      console.warn('Email admin échoué (non bloquant):', adminEmailError);
    }

    return res.status(200).json({ success: true, leadScore, id: data?.[0]?.id });
  } catch (err: any) {
    console.error('Erreur quick-lead:', err);
    return res.status(500).json({ error: 'Erreur interne.', details: err.message });
  }
}
