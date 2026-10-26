import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const rows = JSON.parse(fs.readFileSync(new URL('./lovable-prospects.json', import.meta.url)));
const { data: existing } = await sb.from('mover_prospects').select('email,company_name').limit(10000);
const emails = new Set((existing||[]).map(e => (e.email||'').toLowerCase()));
const names = new Set((existing||[]).map(e => (e.company_name||'').toLowerCase().trim()));
let ok = 0, skip = 0;
for (const r of rows) {
  const slug = r.company_name.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  const email = (r.email || `sans-email+${slug}@trouvetondemenageur.fr`).toLowerCase();
  if (emails.has(email) || names.has(r.company_name.toLowerCase().trim())) { skip++; continue; }
  const { error } = await sb.from('mover_prospects').insert({
    company_name: r.company_name, email, phone: r.phone || '', city: r.city || '',
    postal_code: r.postal_code || '', siret: r.siret || '', has_phone: !!r.phone,
    raw_data: { source: 'lovable', website: r.website || '', source_url: r.source_url || '', email_found: !!r.email, added_at: new Date().toISOString() },
  });
  if (error) { console.error(r.company_name, error.message); skip++; } else { ok++; emails.add(email); }
}
console.log(`Ajoutés: ${ok}, ignorés: ${skip}`);
