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
    const source = (body.source || 'mini_formulaire').trim();

    if (!fromCity || !toCity || !phone) {
      return res.status(400).json({ error: 'Ville de départ, ville d\'arrivée et téléphone sont obligatoires.' });
    }
    if (!isValidPhone(phone)) {
      return res.status(400).json({ error: 'Numéro de téléphone invalide.' });
    }

    const leadScore = computeLeadScore(movingDate);

    const record = {
      client_name: 'Prospect publicité',
      client_email: '',
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

    // Alerte l'équipe admin (email à tous les comptes de la table `admins`).
    // best-effort : ne bloque pas la réponse au client si ça échoue.
    try {
      const notifyResponse = await fetch(`${process.env.VITE_SUPABASE_URL}/functions/v1/send-notification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({
          type: 'quick_lead_alert',
          data: {
            quoteRequestId: data?.[0]?.id,
            phone,
            fromCity,
            toCity,
            movingDate,
            leadScore,
            source,
          },
        }),
      });
      if (!notifyResponse.ok) {
        console.warn('send-notification a répondu avec une erreur:', await notifyResponse.text());
      }
    } catch (notifyError) {
      console.warn('Notification quick-lead échouée (non bloquant):', notifyError);
    }

    return res.status(200).json({ success: true, leadScore, id: data?.[0]?.id });
  } catch (err: any) {
    console.error('Erreur quick-lead:', err);
    return res.status(500).json({ error: 'Erreur interne.', details: err.message });
  }
}
