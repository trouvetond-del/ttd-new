// Prépare chaque lundi un lot : 2 scripts (client + déménageur), annonces Google et pitch
// pour 10 grandes villes, avec les chiffres réels du site. Rien n'est publié ni envoyé.
import { readFileSync, writeFileSync } from 'node:fs';
import cityLinks from '../../src/data/city-links.json' with { type: 'json' };
import { generateVideoScript, generateGoogleAds, generatePitch } from '../../src/lib/acquisitionToolkit.ts';

const stats = JSON.parse(readFileSync(process.argv[2], 'utf8') || '[]') || [];
const slugOf = (city) => (cityLinks.find(([, n]) => n.toLowerCase() === city.toLowerCase()) || [city.toLowerCase()])[0];
const now = new Date();
const monday = new Date(now); monday.setUTCDate(now.getUTCDate() - ((now.getUTCDay() + 6) % 7));
const week = monday.toISOString().slice(0, 10);
const seed = Number(week.replace(/-/g, ''));
const items = stats.map((s, i) => {
  const slug = slugOf(s.city);
  return {
    city: s.city, slug,
    stats: { quotes90d: s.quotes90d, openQuotes: s.openQuotes, verifiedMovers: s.verifiedMovers },
    scriptClient: generateVideoScript('b2c', s.city, seed + i),
    scriptMover: generateVideoScript('b2b', s.city, seed + i),
    ads: generateGoogleAds(s.city, slug),
    pitch: generatePitch(s.city, s),
  };
});
const json = JSON.stringify(items).replace(/'/g, "''");
writeFileSync('acquisition-weekly.sql', `insert into acquisition_weekly(week_start, items) values ('${week}', '${json}'::jsonb) on conflict (week_start) do update set items = excluded.items, created_at = now();\n`);
console.log(`Lot du ${week} : ${items.length} villes`);
