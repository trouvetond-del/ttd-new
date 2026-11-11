// Volumes moyens (m³) utilisés par les déménageurs pour estimer un cubage.
export type VolumeItem = { id: string; label: string; m3: number };
export type VolumeRoom = { id: string; label: string; items: VolumeItem[] };

export const VOLUME_ROOMS: VolumeRoom[] = [
  { id: 'salon', label: 'Salon / séjour', items: [
    { id: 'canape3', label: 'Canapé 3 places', m3: 2 },
    { id: 'canape2', label: 'Canapé 2 places', m3: 1.5 },
    { id: 'fauteuil', label: 'Fauteuil', m3: 0.8 },
    { id: 'table_basse', label: 'Table basse', m3: 0.4 },
    { id: 'meuble_tv', label: 'Meuble TV', m3: 0.6 },
    { id: 'tv', label: 'Télévision', m3: 0.3 },
    { id: 'bibliotheque', label: 'Bibliothèque', m3: 1.2 },
    { id: 'buffet', label: 'Buffet / bahut', m3: 1.5 },
  ]},
  { id: 'cuisine', label: 'Cuisine', items: [
    { id: 'frigo', label: 'Réfrigérateur', m3: 1 },
    { id: 'frigo_us', label: 'Réfrigérateur américain', m3: 1.8 },
    { id: 'lave_linge', label: 'Lave-linge', m3: 0.5 },
    { id: 'lave_vaisselle', label: 'Lave-vaisselle', m3: 0.5 },
    { id: 'four', label: 'Four / micro-ondes', m3: 0.3 },
    { id: 'table', label: 'Table à manger', m3: 1 },
    { id: 'chaise', label: 'Chaise', m3: 0.2 },
  ]},
  { id: 'chambre', label: 'Chambres', items: [
    { id: 'lit2', label: 'Lit double + matelas', m3: 2 },
    { id: 'lit1', label: 'Lit simple + matelas', m3: 1.2 },
    { id: 'armoire', label: 'Armoire 2 portes', m3: 1.5 },
    { id: 'armoire3', label: 'Grande armoire 3 portes', m3: 2.5 },
    { id: 'commode', label: 'Commode', m3: 0.7 },
    { id: 'chevet', label: 'Table de chevet', m3: 0.2 },
    { id: 'bureau', label: 'Bureau', m3: 1 },
  ]},
  { id: 'autres', label: 'Cartons et autres', items: [
    { id: 'carton', label: 'Carton standard', m3: 0.1 },
    { id: 'velo', label: 'Vélo', m3: 0.5 },
    { id: 'cave', label: 'Contenu de cave / box (par m²)', m3: 1 },
    { id: 'jardin', label: 'Salon de jardin', m3: 1.5 },
  ]},
];

const ITEM_BY_ID = new Map(VOLUME_ROOMS.flatMap(r => r.items).map(i => [i.id, i]));

/** Volume total arrondi au demi-m³ supérieur, + 10 % de marge pour les petits objets. */
export function computeVolume(counts: Record<string, number>): number {
  let raw = 0;
  for (const [id, n] of Object.entries(counts)) {
    const item = ITEM_BY_ID.get(id);
    if (!item || !Number.isFinite(n) || n <= 0) continue;
    raw += item.m3 * Math.floor(n);
  }
  if (raw === 0) return 0;
  return Math.ceil(raw * 1.1 * 2) / 2;
}

export function homeSizeForVolume(m3: number): string {
  if (m3 <= 15) return 'Studio';
  if (m3 <= 25) return 'T1';
  if (m3 <= 35) return 'T2';
  if (m3 <= 50) return 'T3';
  if (m3 <= 70) return 'T4';
  return 'T5+';
}
