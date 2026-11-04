import { createClient } from '@supabase/supabase-js';
import { mkdir, writeFile } from 'node:fs/promises';
import { parisDate, expectedKinds, slotResult, escapeHtml } from './rules.mjs';

const day = parisDate();
const site = 'https://www.trouvetondemenageur.fr';
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('Configuration du contrôle indisponible');
const sb = createClient(url, key, { auth: { persistSession: false } });
const checks = [];
const add = (name,status,detail) => checks.push({name,status,detail});
async function check(name, work) {
  try { await work(); } catch { add(name,'unknown','Contrôle indisponible : aucune confirmation de bon fonctionnement.'); }
}
async function pageCheck(path) {
  const start = Date.now();
  const r = await fetch(site+path, {signal:AbortSignal.timeout(15000)});
  const text = await r.text();
  const valid = r.ok && (path.endsWith('.xml') ? /<(urlset|sitemapindex)[\s>]/.test(text) : text.length > 1000);
  add(`Page ${path}`, valid ? 'ok' : 'warning', `HTTP ${r.status}, ${Math.round((Date.now()-start)/100)/10} s. ${valid ? 'Réponse reçue ; fonctionnement après JavaScript contrôlé séparément.' : 'Réponse incorrecte ou vide.'}`);
}
for (const path of ['/', '/client/quote','/devis-rapide','/mover/signup','/blog','/calculateur-prix-demenagement','/sitemap.xml']) await check(`Page ${path}`,()=>pageCheck(path));
await check('Contrôle navigateur', async () => {
  const { readFile } = await import('node:fs/promises');
  const browser = JSON.parse(await readFile('morning-browser.json','utf8'));
  for (const item of browser) add(item.name,item.status,item.detail);
});
await check('Agents GitHub', async () => {
  if (!process.env.GITHUB_TOKEN || !process.env.GITHUB_REPOSITORY) throw new Error('GitHub indisponible');
  for (const workflow of ['seo-agent.yml','marketing-agent.yml','sea-agent.yml']) {
    const r = await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/actions/workflows/${workflow}/runs?per_page=10&branch=main`,{headers:{Authorization:`Bearer ${process.env.GITHUB_TOKEN}`,Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(15000)});
    if (!r.ok) { add(workflow,'unknown',`Lecture indisponible (${r.status}).`); continue; }
    const {workflow_runs:runs} = await r.json();
    const today = runs.find(r=>parisDate(new Date(r.created_at))===day);
    const last = runs[0];
    add(workflow,today?.conclusion==='success'?'ok':'warning',today ? (today.status==='completed' ? `Exécution du jour : ${today.conclusion}.` : 'Exécution du jour encore en cours.') : `Aucune exécution du jour confirmée. Dernière : ${last ? `${parisDate(new Date(last.created_at))}, ${last.conclusion || last.status}` : 'inconnue'}.`);
  }
});
await check('Studio marketing', async () => {
  const {data,error} = await sb.from('marketing_posts').select('kind,status,body,image_urls,video_url,published_at,fb_post_id,ig_media_id').eq('slot_date',day).limit(10);
  if (error) throw error;
  for (const kind of expectedKinds(day)) { const result=slotResult(data||[],kind); add(`Studio : ${kind}`,result.status,result.detail); }
  if (!expectedKinds(day).some(k=>k.startsWith('video'))) add('Vidéo du jour','info','Pas de vidéo prévue aujourd’hui : mercredi et dimanche.');
});
await check('Article quotidien SEO/GEO', async () => {
  const since = new Date(Date.now()-36*3600000).toISOString();
  const {data,error}=await sb.from('articles').select('slug,created_at').eq('statut','publie').gte('created_at',since).order('created_at',{ascending:false}).limit(20);
  if (error) throw error;
  const article=(data||[]).find(a=>parisDate(new Date(a.created_at))===day);
  if (!article) { add('Article quotidien SEO/GEO','warning','Aucun article publié aujourd’hui confirmé.'); return; }
  const response=await fetch(`${site}/blog/${encodeURIComponent(article.slug)}`,{signal:AbortSignal.timeout(15000)});
  const text=await response.text();
  add('Article quotidien SEO/GEO',response.ok && text.includes(article.slug)?'ok':'warning',`Article enregistré aujourd’hui ; page /blog/${article.slug} : HTTP ${response.status}. Qualité et citation par les IA non garanties par ce contrôle.`);
});
await check('Surveillance sécurité', async () => {
  const {data,error}=await sb.from('system_health_checks').select('status,checked_at').order('checked_at',{ascending:false}).limit(1).maybeSingle();
  if (error) throw error;
  const fresh=data && Date.now()-new Date(data.checked_at).getTime()<45*60000;
  add('Surveillance sécurité',fresh && data.status==='ok'?'ok':'warning',data ? `Dernier contrôle : ${data.checked_at}, état ${data.status}${fresh?'':' — trop ancien'}. Ce résultat ne constitue pas un audit complet de cybersécurité.` : 'Aucun contrôle enregistré.');
});
const problems=checks.filter(c=>['warning','unknown'].includes(c.status));
const report={day,checked_at:new Date().toISOString(),status:problems.length?'attention':'ok',checks};
const advice=[
  ...(problems.length ? ['Traiter d’abord les contrôles en échec ou indisponibles avant d’augmenter la publicité.'] : []),
  'Mesurer les demandes complètes et les devis réels par source, pas seulement les clics publicitaires.',
  'Enrichir les pages villes avec des conseils locaux et des liens vers les articles utiles, sans chiffres ni avis inventés.',
  'Publier des réponses concrètes aux questions de prix et de préparation ; demander des avis Trustpilot uniquement aux vrais clients.',
];
const html=`<p>Contrôle du ${escapeHtml(day)}, prévu à 9 h, heure de Paris.</p><p><b>${problems.length ? `${problems.length} point(s) à vérifier` : 'Aucun problème détecté dans les contrôles réalisés'}</b></p><ul>${checks.map(c=>`<li><b>${escapeHtml(c.name)} — ${escapeHtml(c.status)}</b> : ${escapeHtml(c.detail)}</li>`).join('')}</ul><h3>Propositions pour le site et sa visibilité</h3><ul>${advice.map(a=>`<li>${escapeHtml(a)}</li>`).join('')}</ul><p>Les contrôles de connexion authentifiée, paiements réels, délivrabilité des autres emails et visibilité Meta ne sont pas couverts. Aucun paiement ni achat publicitaire n’a été déclenché.</p><p>L’équipe Trouve Ton Déménageur<br>www.trouvetondemenageur.fr</p>`;
await mkdir('morning-report',{recursive:true});
await writeFile('morning-report/report.json',JSON.stringify(report,null,2));
await writeFile('morning-report/report.html',html);
const {data:secret,error:secretError}=await sb.from('agent_secrets').select('secret').eq('name','cron').maybeSingle();
if (secretError || !secret?.secret) throw new Error('Rapport enregistré, envoi email non disponible');
const response=await fetch(`${url}/functions/v1/agent-sea-email`,{method:'POST',headers:{'Content-Type':'application/json','x-agent-secret':secret.secret},body:JSON.stringify({title:`Agent sécurité — bilan du matin ${day} : ${report.status}`,html,morning_day:day}),signal:AbortSignal.timeout(30000)});
if (!response.ok) throw new Error(`Rapport enregistré, email non confirmé (${response.status})`);
const result=await response.json();
if (!result.email_accepted) throw new Error('Rapport enregistré, acceptation email non confirmée');
console.log(`Rapport ${day} : ${report.status}, email accepté par le service d’envoi (réception non garantie).`);
