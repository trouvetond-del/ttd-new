// Agent Partenaires — recherche hebdomadaire de 10 nouveaux box de stockage en France.
// Source publique : OpenStreetMap (Overpass), seuls les box avec un email public.
// Entrée : existing.json (box déjà en base). Sortie : new-partners.sql (INSERT ... ON CONFLICT DO NOTHING).
import fs from 'node:fs';
const WEEKLY = Number(process.env.WEEKLY_NEW || 10);
const existing = JSON.parse(fs.readFileSync(process.argv[2] || 'existing.json', 'utf8') || '[]') || [];
const norm = (s) => (s || '').toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const seenEmail = new Set(existing.map((e) => norm(e.email)).filter(Boolean));
const seenKey = new Set(existing.map((e) => norm(e.name) + '|' + norm(e.city)));
const seenCode = new Set(existing.map((e) => e.code));
const domainCount = {};
for (const e of existing) { const d = (e.email || '').split('@')[1]; if (d) domainCount[d.toLowerCase()] = (domainCount[d.toLowerCase()] || 0) + 1; }

const Q = '[out:json][timeout:100];area["ISO3166-1"="FR"][admin_level=2]->.fr;nwr["shop"="storage_rental"](area.fr);out center tags;';
const MIRRORS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'];
async function fetchOsm() {
  for (let i = 0; i < 8; i++) {
    const url = MIRRORS[i % MIRRORS.length];
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'User-Agent': 'ttd-partner-agent/1.0 (trouvetond@gmail.com)', 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(Q) });
      const t = await r.text();
      if (r.ok && t.startsWith('{')) return JSON.parse(t).elements;
      console.log(`Overpass ${url} : ${r.status}, nouvel essai`);
    } catch (e) { console.log(`Overpass ${url} : ${e.message}`); }
    await new Promise((s) => setTimeout(s, 15000 * (i + 1)));
  }
  throw new Error('Source OpenStreetMap indisponible');
}

const sql = (v) => (v == null || v === '' ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);
const pick = (t, ...k) => { for (const x of k) if (t[x]) return String(t[x]).split(';')[0].trim(); return null; };
const els = await fetchOsm();
const cands = [];
for (const el of els) {
  const t = el.tags || {};
  const email = pick(t, 'email', 'contact:email');
  const name = pick(t, 'name', 'brand');
  if (!email || !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email) || !name) continue;
  const pc = pick(t, 'addr:postcode');
  const city = pick(t, 'addr:city') || (pc ? `Dép. ${pc.slice(0, 2)}` : null);
  if (!city) continue;
  if (seenEmail.has(norm(email)) || seenKey.has(norm(name) + '|' + norm(city))) continue;
  const addr = [pick(t, 'addr:housenumber'), pick(t, 'addr:street')].filter(Boolean).join(' ');
  cands.push({ name, city, email: email.toLowerCase(), pc, address: [addr, pc, pick(t, 'addr:city')].filter(Boolean).join(', ') || null,
    phone: pick(t, 'phone', 'contact:phone'), website: pick(t, 'website', 'contact:website'),
    source: `https://www.openstreetmap.org/${el.type}/${el.id}` });
}
// Mélange aléatoire, puis on évite d'écrire plusieurs fois à la même société (2 sites max par domaine email).
cands.sort(() => Math.random() - 0.5);
const chosen = [];
for (const c of cands) {
  if (chosen.length >= WEEKLY) break;
  const d = c.email.split('@')[1];
  const generic = /^(gmail|hotmail|outlook|orange|free|wanadoo|yahoo|laposte|sfr)\./.test(d);
  if (!generic && (domainCount[d] || 0) >= 2) continue;
  if (chosen.some((x) => x.email === c.email || norm(x.name) + norm(x.city) === norm(c.name) + norm(c.city))) continue;
  domainCount[d] = (domainCount[d] || 0) + 1;
  chosen.push(c);
}
const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const code = (city) => { let c; do { c = `BOX-${(norm(city).replace(/[^a-z]/g, '').toUpperCase().slice(0, 8) || 'FR')}-${Array.from({ length: 4 }, () => A[Math.floor(Math.random() * A.length)]).join('')}`; } while (seenCode.has(c)); seenCode.add(c); return c; };
const rows = chosen.map((c) => `(${sql(code(c.city))},${sql(c.name)},${sql(c.city)},${sql(c.pc ? 'Dép. ' + c.pc.slice(0, 2) : 'France')},${sql(c.address)},${sql(c.phone)},${sql(c.email)},NULL,${sql(c.website)},'box (recherche auto)',${sql(c.source)},'nouveau')`);
fs.writeFileSync('new-partners.sql', rows.length
  ? `INSERT INTO public.storage_partners(code,name,city,zone,address,phone,email,contact_form,website,partner_type,source_url,status) VALUES\n${rows.join(',\n')}\nON CONFLICT DO NOTHING;\n`
  : 'SELECT 1;\n');
console.log(`${els.length} box trouvés, ${cands.length} nouveaux avec email, ${chosen.length} ajoutés :`);
for (const c of chosen) console.log(` - ${c.name} (${c.city})`);
