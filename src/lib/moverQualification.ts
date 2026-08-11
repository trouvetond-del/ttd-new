// src/lib/moverQualification.ts
//
// Règle unique : un déménageur ne peut jamais être marqué comme "verified"
// (donc visible par les clients dans ClientQuotePage.tsx, qui filtre sur
// verification_status='verified' + is_active=true) sans un email actif,
// un vrai numéro de téléphone français et un vrai SIRET (14 chiffres,
// clé de contrôle Luhn valide).
//
// Ce fichier est la SEULE source de vérité pour cette règle côté admin
// (AdminUserManagement, AdminOverview, PendingMoverDetailModal, MoverDetailModal).
// Toute action "approuver / vérifier" doit appeler isMoverQualified() avant
// d'écrire verification_status: 'verified' en base -- peu importe l'écran
// ou le bouton utilisé pour déclencher l'action.
//
// Les fonctions Edge (Deno, hors du bundle Vite -- dropboxsign-webhook et
// dropboxsign-check-status) ne peuvent pas importer ce fichier directement :
// elles embarquent une copie compacte de la même logique, à garder en
// miroir si cette règle évolue ici.

export interface MoverQualificationInput {
  email?: string | null;
  phone?: string | null;
  siret?: string | null;
  company_name?: string | null;
}

export interface MoverQualificationResult {
  qualified: boolean;
  reasons: string[];
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function isValidFrenchPhone(phone: string): boolean {
  const clean = phone.replace(/[\s.-]/g, '');
  return /^(0|\+33)[1-9][0-9]{8}$/.test(clean);
}

// Même algorithme (Luhn) que validateSiret() dans MoverProfileCompletionPage.tsx
// et isValidSiret() dans api/mover-quick-lead.ts -- garder en miroir.
function isValidSiret(siret: string): boolean {
  const clean = siret.replace(/\s/g, '');
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

export function isMoverQualified(mover: MoverQualificationInput): MoverQualificationResult {
  const reasons: string[] = [];

  const email = (mover.email || '').trim();
  const phone = (mover.phone || '').trim();
  const siret = (mover.siret || '').trim();
  const companyName = (mover.company_name || '').trim();

  if (!email || !isValidEmail(email)) reasons.push('email actif manquant ou invalide');
  if (!phone || !isValidFrenchPhone(phone)) reasons.push('numéro de téléphone manquant ou invalide');
  if (!siret || siret.startsWith('PENDING-') || !isValidSiret(siret)) reasons.push('SIRET manquant ou invalide (14 chiffres, format français réel requis)');
  if (!companyName) reasons.push("nom d'entreprise manquant");

  return { qualified: reasons.length === 0, reasons };
}

// Message affiché au déménageur lui-même pendant son inscription (tous
// parcours confondus) quand une information obligatoire manque ou est
// invalide au moment de la soumission.
export const MOVER_INCOMPLETE_SUBMISSION_MESSAGE =
  "Votre demande ne sera pas visible par nos équipes tant que votre email actif, votre numéro de téléphone et votre SIRET (format français réel) ne sont pas correctement renseignés.";
