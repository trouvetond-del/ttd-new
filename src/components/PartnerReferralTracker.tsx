import { useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

// Garde le code du box partenaire (QR code ?box=...) pendant 30 jours,
// puis l'attache au compte client après connexion. La base refuse les comptes anciens,
// les codes invalides et les doubles parrainages : le remboursement n'est jamais décidé ici.
const KEY = 'ttd_partner_box';
const CODE = /^BOX-[A-Z]{1,8}-[A-Z0-9]{4}$/;

export default function PartnerReferralTracker() {
  const { user } = useAuth();
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('box')?.trim().toUpperCase();
    if (code && CODE.test(code)) localStorage.setItem(KEY, JSON.stringify({ code, at: Date.now() }));
  }, []);
  useEffect(() => {
    if (!user) return;
    let saved: { code?: string; at?: number } = {};
    try { saved = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { /* ignore */ }
    if (!saved.code || !saved.at || Date.now() - saved.at > 30 * 86400_000) { localStorage.removeItem(KEY); return; }
    supabase.rpc('attach_partner_referral', { p_code: saved.code }).then(({ data, error }) => {
      if (!error && data !== 'non_connecte') localStorage.removeItem(KEY);
    });
  }, [user]);
  return null;
}
