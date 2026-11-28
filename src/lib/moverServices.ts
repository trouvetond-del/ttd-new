// Keep stored legacy values stable; equipment ownership is never inferred from a service.
export const CLIENT_SERVICES = [
  'Emballage/Déballage', 'Fourniture de cartons', 'Démontage/Remontage meubles',
  'Garde-meubles', "Transport d'objets fragiles", 'Nettoyage après déménagement', 'Débarras'
];
export const MOVER_SERVICE_LABELS = [
  'Déménagement local', 'Déménagement national', 'Déménagement longue distance',
  'Déménagement international', 'Emballage/Déballage', 'Fourniture de cartons',
  'Démontage/Remontage meubles', 'Monte-meuble', 'Garde-meubles',
  "Transport d'objets fragiles", 'Nettoyage', 'Piano et objets volumineux',
  'Objets lourds/volumineux', 'Débarras'
];
export const MOVER_SERVICES = [
  { id: 'demenagement_complet', label: 'Déménagement complet', description: 'Emballage, transport et déballage' },
  { id: 'transport_seul', label: 'Transport seul', description: 'Uniquement le transport des biens' },
  { id: 'emballage', label: "Service d’emballage", description: 'Emballage professionnel de vos affaires' },
  { id: 'montage_meubles', label: 'Montage/Démontage meubles', description: 'Assemblage et désassemblage de meubles' },
  { id: 'garde_meuble', label: 'Garde-meuble', description: 'Stockage temporaire de vos biens' },
  { id: 'piano', label: 'Transport de piano', description: 'Transport spécialisé pour pianos' },
  { id: 'objets_lourds', label: 'Objets lourds/volumineux', description: 'Coffres-forts, billards, etc.' },
  { id: 'international', label: 'Déménagement international', description: 'Déménagements à l’étranger' },
  { id: 'entreprise', label: 'Déménagement d’entreprise', description: 'Bureaux et locaux professionnels' },
  { id: 'monte_meuble', label: 'Monte-meuble', description: 'Élévation par l’extérieur' },
  { id: 'nettoyage', label: 'Nettoyage', description: 'Nettoyage après déménagement' },
  { id: 'debarras', label: 'Débarras', description: 'Enlèvement des meubles et objets à évacuer' },
];
export function serviceLabel(value: string): string {
  return MOVER_SERVICES.find(service => service.id === value)?.label ?? value;
}
export function ownsFurnitureLift(mover: { has_furniture_lift?: boolean | null }): boolean {
  return mover.has_furniture_lift === true;
}
export function moverServiceFields(services: string[], ownsLift: boolean) {
  return { services: [...services], specialties: [...services], has_furniture_lift: ownsLift };
}
