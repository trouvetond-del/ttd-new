// Règles « Démontage / Remontage » : liste obligatoire dans les commentaires,
// photos conseillées (visibles par l'admin uniquement), relance email client.
// Pas d'import : ce fichier est aussi chargé par une fonction Deno.
const escapeEmail = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c));

const DISASSEMBLY_SERVICES = ['Démontage/Remontage meubles', 'furniture_disassembly', 'furniture_assembly'];
export const MIN_DISASSEMBLY_DETAILS = 10;

export function needsDisassemblyDetails(services: unknown): boolean {
  return Array.isArray(services) && services.some(s => DISASSEMBLY_SERVICES.includes(String(s)));
}

export function disassemblyDetailsMissing(services: unknown, additionalInfo: unknown): boolean {
  return needsDisassemblyDetails(services) && String(additionalInfo ?? '').trim().length < MIN_DISASSEMBLY_DETAILS;
}

export function disassemblyReminderEmail(request: { id: string; reference?: string | null; client_name?: string | null; from_city?: string | null; to_city?: string | null }) {
  const url = `https://www.trouvetondemenageur.fr/client/quote/${encodeURIComponent(request.id)}/edit`;
  return `<!DOCTYPE html><html lang="fr"><body style="margin:0;background:#ffffff;font-family:Arial,sans-serif;color:#172b35"><div style="max-width:600px;margin:auto;padding:24px"><p style="color:#078477;font-weight:bold">Trouve Ton Déménageur</p><h1 style="font-size:24px">Quels meubles faut-il démonter ?</h1><p>Bonjour ${escapeEmail(request.client_name)},</p><p>Vous avez demandé le démontage et le remontage de meubles pour votre déménagement ${escapeEmail(request.from_city)} → ${escapeEmail(request.to_city)} (${escapeEmail(request.reference || request.id)}).</p><p>Pour que les déménageurs vous proposent des devis justes, merci de :</p><ol><li style="margin:8px 0"><strong>lister les meubles à démonter et à remonter</strong> dans les commentaires (exemple : 1 lit double, 1 armoire 3 portes, 1 bureau) ;</li><li style="margin:8px 0"><strong>ajouter des photos</strong> de ces meubles.</li></ol><p>Vos photos sont vues uniquement par notre équipe. Les déménageurs reçoivent seulement la liste des meubles.</p><p style="margin:28px 0"><a href="${url}" style="background:#078477;color:#fff;padding:14px 22px;text-decoration:none;border-radius:6px;display:inline-block">Compléter ma demande</a></p><p>Vous pouvez aussi répondre directement à cet email.</p><hr style="border:0;border-top:1px solid #dfe8e5"><p>L’équipe Trouve Ton Déménageur<br><a href="tel:0189707881">01 89 70 78 81</a><br>www.trouvetondemenageur.fr</p></div></body></html>`;
}
