// Coordonnées de communes françaises via l'API publique geo.api.gouv.fr (gratuite, sans clé).
export type LatLng = { lat: number; lng: number };
const cache = new Map<string, Promise<LatLng | null>>();

async function fetchCentre(url: string): Promise<LatLng | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const list = await res.json();
    const c = list?.[0]?.centre?.coordinates;
    return c ? { lat: c[1], lng: c[0] } : null;
  } catch {
    return null;
  }
}

export function coordsFromPostalCode(postal?: string | null): Promise<LatLng | null> {
  const cp = (postal || '').trim();
  if (!/^\d{5}$/.test(cp)) return Promise.resolve(null);
  if (!cache.has(cp)) {
    cache.set(cp, fetchCentre(`https://geo.api.gouv.fr/communes?codePostal=${cp}&fields=centre&limit=1`));
  }
  return cache.get(cp)!;
}

export async function searchCities(q: string): Promise<{ name: string; postal: string; coords: LatLng }[]> {
  if (q.trim().length < 2) return [];
  try {
    const res = await fetch(`https://geo.api.gouv.fr/communes?nom=${encodeURIComponent(q.trim())}&fields=centre,codesPostaux&boost=population&limit=6`);
    const list = await res.json();
    return (list || [])
      .filter((c: any) => c.centre?.coordinates)
      .map((c: any) => ({ name: c.nom, postal: c.codesPostaux?.[0] || '', coords: { lat: c.centre.coordinates[1], lng: c.centre.coordinates[0] } }));
  } catch {
    return [];
  }
}

export function distanceKm(a: LatLng, b: LatLng): number {
  const R = 6371, toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}
