// api/save-partial-lead.ts - Vercel Serverless Function
// Enregistre une capture PARTIELLE dès que le minimum exploitable est
// rempli sur /devis-rapide ou /inscription-demenageur -- avant même
// que la personne ait terminé et soumis le formulaire complet.
// Appelé en best-effort (debounce côté front, voir QuickLeadPage.tsx et
// MoverQuickLeadPage.tsx) : un échec ici ne doit jamais bloquer la
// personne ni afficher d'erreur visible, elle continue de remplir son
// formulaire normalement.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function isValidSiret(siret: string): boolean {
  const clean = siret.replace(/[\s-]/g, '');
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { leadType, email, phone, firstName, lastName, companyName, siret, source } = req.body || {};

    if (leadType !== 'client' && leadType !== 'mover') {
      return res.status(400).json({ error: 'leadType invalide' });
    }

    const cleanEmail = typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email.trim().toLowerCase() : null;
    const cleanPhone = typeof phone === 'string' && phone.replace(/\D/g, '').length >= 10 ? phone.trim() : null;
    const cleanSiret = typeof siret === 'string' && isValidSiret(siret) ? siret.replace(/\s/g, '') : null;
    const cleanCompany = typeof companyName === 'string' && companyName.trim().length >= 2 ? companyName.trim() : null;
    const cleanFirst = typeof firstName === 'string' && firstName.trim().length >= 1 ? firstName.trim() : null;
    const cleanLast = typeof lastName === 'string' && lastName.trim().length >= 1 ? lastName.trim() : null;

    // Silencieux si le minimum n'est pas encore atteint -- ce n'est pas
    // une erreur, la personne n'a juste pas fini de taper.
    if (leadType === 'client' && !(cleanEmail && cleanPhone)) {
      return res.status(200).json({ saved: false, reason: 'minimum non atteint' });
    }
    if (leadType === 'mover' && !(cleanCompany && cleanFirst && cleanLast && cleanSiret)) {
      return res.status(200).json({ saved: false, reason: 'minimum non atteint' });
    }

    const record: Record<string, any> = {
      lead_type: leadType,
      email: cleanEmail,
      phone: cleanPhone,
      first_name: cleanFirst,
      last_name: cleanLast,
      company_name: cleanCompany,
      siret: cleanSiret,
      source: typeof source === 'string' ? source.substring(0, 100) : null,
      updated_at: new Date().toISOString(),
    };

    // Upsert par email (client) ou par siret (déménageur) pour éviter les
    // doublons si la personne recharge la page plusieurs fois.
    const conflictTarget = leadType === 'client' ? 'lead_type,email' : 'lead_type,siret';
    const { error } = await supabase
      .from('partial_leads')
      .upsert(record, { onConflict: conflictTarget, ignoreDuplicates: false });

    if (error) {
      // Non bloquant : on log côté serveur mais on ne fait jamais
      // échouer visiblement l'expérience de la personne pour ça.
      console.error('[save-partial-lead] Erreur upsert (non bloquant):', error.message);
      return res.status(200).json({ saved: false, error: error.message });
    }

    return res.status(200).json({ saved: true });
  } catch (err: any) {
    console.error('[save-partial-lead] Erreur interne (non bloquant):', err.message);
    return res.status(200).json({ saved: false });
  }
}
