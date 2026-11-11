// Relance des demandes non terminées : 3 emails sur 5 jours, puis arrêt.
// Logique pure, partagée par la fonction et les tests.
export const CLIENT_STEPS_HOURS = [1, 48, 120]; // J0 (+1 h), J+2, J+5
export const MAX_AGE_HOURS = 7 * 24; // jamais de relance pour une capture plus ancienne

export type LeadState = { created_at: string; reminder_count: number | null; converted_at: string | null };

/** Index (0, 1 ou 2) de l'email à envoyer maintenant, ou null. */
export function nextClientStep(lead: LeadState, now = Date.now()): number | null {
  if (lead.converted_at) return null;
  const count = lead.reminder_count || 0;
  if (count >= CLIENT_STEPS_HOURS.length) return null;
  const ageHours = (now - new Date(lead.created_at).getTime()) / 3_600_000;
  if (ageHours > MAX_AGE_HOURS) return null;
  return ageHours >= CLIENT_STEPS_HOURS[count] ? count : null;
}
