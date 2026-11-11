export type Point = { lat: number; lng: number };
export type GroupageMove = { id: string; moving_date: string; distance_km?: number | null };
export type MoveCentres = Record<string, { from: Point | null; to: Point | null }>;
export type GroupagePair<T> = { id: string; a: T; b: T; kind: 'same_route' | 'return_trip'; days: number; distance1: number; distance2: number };
function km(a: Point, b: Point) {
  const rad = (v: number) => v * Math.PI / 180;
  const h = Math.sin(rad(b.lat-a.lat)/2)**2 + Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(rad(b.lng-a.lng)/2)**2;
  return 12742 * Math.asin(Math.min(1, Math.sqrt(h)));
}
export function findGroupages<T extends GroupageMove>(moves: T[], centres: MoveCentres): GroupagePair<T>[] {
  const pairs: GroupagePair<T>[] = [];
  const sorted = [...moves].sort((a,b) => a.moving_date.localeCompare(b.moving_date) || a.id.localeCompare(b.id));
  for (let i=0; i<sorted.length; i++) for (let j=i+1; j<sorted.length; j++) {
    const a=sorted[i], b=sorted[j];
    if (a.id===b.id) continue;
    const days=(Date.parse(b.moving_date+'T00:00:00Z')-Date.parse(a.moving_date+'T00:00:00Z'))/86400000;
    if (!Number.isFinite(days) || days<0 || days>3) continue;
    const ca=centres[a.id], cb=centres[b.id];
    if (!ca?.from || !ca.to || !cb?.from || !cb.to) continue;
    const start=km(ca.from,cb.from), end=km(ca.to,cb.to), link=km(ca.to,cb.from);
    if (start<200 && end<200) pairs.push({id:`${a.id}:${b.id}:same_route`,a,b,kind:'same_route',days,distance1:start,distance2:end});
    else if (link<200) pairs.push({id:`${a.id}:${b.id}:return_trip`,a,b,kind:'return_trip',days,distance1:link,distance2:km(ca.from,cb.to)});
  }
  return pairs;
}
