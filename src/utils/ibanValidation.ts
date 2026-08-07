// Validation IBAN complète (format + checksum mod-97, norme ISO 13616).
// Avant ce fichier, aucun endroit du site ne vérifiait réellement le
// format d'un IBAN saisi -- un mover pouvait taper n'importe quoi
// ("asdf1234"), ça passait la validation, et l'admin le découvrait
// seulement au moment d'essayer de le payer.

const IBAN_LENGTHS: Record<string, number> = {
  FR: 27, BE: 16, DE: 22, ES: 24, IT: 27, NL: 18, LU: 20, PT: 25,
  GB: 22, CH: 21, AT: 20, IE: 22, MC: 27,
};

export function validateIban(rawIban: string): { isValid: boolean; error?: string } {
  const iban = (rawIban || '').replace(/\s/g, '').toUpperCase();

  if (!iban) return { isValid: false, error: "L'IBAN est requis" };
  if (!/^[A-Z0-9]+$/.test(iban)) {
    return { isValid: false, error: 'IBAN invalide (caractères non autorisés)' };
  }

  const countryCode = iban.slice(0, 2);
  const expectedLength = IBAN_LENGTHS[countryCode];
  if (expectedLength && iban.length !== expectedLength) {
    return { isValid: false, error: `IBAN ${countryCode} invalide (longueur attendue: ${expectedLength} caractères)` };
  }
  if (iban.length < 15 || iban.length > 34) {
    return { isValid: false, error: 'IBAN invalide (longueur incorrecte)' };
  }

  // Checksum mod-97 (norme ISO 7064) : déplace les 4 premiers caractères
  // à la fin, convertit chaque lettre en 2 chiffres (A=10...Z=35), puis
  // vérifie que le nombre résultant mod 97 = 1.
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  const numeric = rearranged
    .split('')
    .map((ch) => (/[A-Z]/.test(ch) ? (ch.charCodeAt(0) - 55).toString() : ch))
    .join('');

  let remainder = 0;
  for (let i = 0; i < numeric.length; i += 7) {
    remainder = parseInt(remainder.toString() + numeric.substring(i, i + 7), 10) % 97;
  }

  if (remainder !== 1) {
    return { isValid: false, error: 'IBAN invalide (échec de la clé de contrôle)' };
  }

  return { isValid: true };
}
