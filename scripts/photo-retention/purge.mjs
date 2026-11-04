// Purge RGPD : supprime les photos de mission 1 an après la fin de la mission, sauf réclamation ouverte.
const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const h = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

let total = 0;
for (let round = 0; round < 20; round++) {
  const r = await fetch(`${URL_}/rest/v1/rpc/expired_mission_photos`, { method: 'POST', headers: h, body: '{}' });
  if (!r.ok) throw new Error(`Lecture impossible : ${r.status} ${await r.text()}`);
  const rows = await r.json();
  if (!rows.length) break;
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100);
    const del = await fetch(`${URL_}/storage/v1/object/moving-photos`, { method: 'DELETE', headers: h, body: JSON.stringify({ prefixes: batch.map((p) => p.storage_path) }) });
    if (!del.ok) throw new Error(`Suppression fichiers impossible : ${del.status}`);
    const ids = batch.map((p) => p.id).join(',');
    const d2 = await fetch(`${URL_}/rest/v1/moving_photos?id=in.(${ids})`, { method: 'DELETE', headers: h });
    if (!d2.ok) throw new Error(`Suppression lignes impossible : ${d2.status}`);
    total += batch.length;
  }
}
console.log(`Photos supprimées (plus d'1 an, sans réclamation ouverte) : ${total}`);
