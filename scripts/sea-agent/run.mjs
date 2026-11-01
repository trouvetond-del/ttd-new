// Read-only ads collection. Provider writes are deliberately absent.
import { createClient } from '@supabase/supabase-js';
import { budgetState, proposalsFor } from './rules.mjs';
const required = name => { if (!process.env[name]) throw new Error(`Configuration manquante : ${name}`); return process.env[name]; };
const sb=createClient(required('SUPABASE_URL'),required('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false}});
const day=new Date().toLocaleDateString('en-CA',{timeZone:'Europe/Paris'});
const yesterday=new Date(Date.now()-86400000).toLocaleDateString('en-CA',{timeZone:'Europe/Paris'});
const start=new Date(Date.now()-7*86400000).toLocaleDateString('en-CA',{timeZone:'Europe/Paris'});
const monthStart=day.slice(0,7)+'-01';
async function jsonRequest(url,options={}) {
 for(let attempt=0;attempt<2;attempt++) {
  const r=await fetch(url,{...options,signal:AbortSignal.timeout(45000)});
  if ((r.status===429||r.status>=500)&&attempt===0) { await new Promise(resolve=>setTimeout(resolve,60000)); continue; }
  if(!r.ok) { const err=new Error(`Lecture refusée (HTTP ${r.status})`); err.status=r.status; throw err; }
  const data=await r.json(); if(data.error) throw new Error('Lecture refusée par le fournisseur'); return data;
 }
 throw new Error('Lecture temporairement indisponible');
}
async function metaRead(path,params) {
 return jsonRequest(`https://graph.facebook.com/v26.0/${path}?${new URLSearchParams(params)}`,{headers:{Authorization:`Bearer ${required('META_ADS_TOKEN')}`}});
}
async function metaPages(path,params) {
 let rows=[]; let after;
 for(let page=0;page<10;page++) {
  const r=await metaRead(path,{...params,...(after?{after}:{})}); rows.push(...(r.data||[]));
  if(!r.paging?.next) return rows;
  after=r.paging?.cursors?.after; if(!after) throw new Error('Rapport Meta incomplet');
 }
 throw new Error('Rapport Meta incomplet : limite de pagination');
}
async function googleRows(query) {
 const rows=[]; let pageToken;
 for(let page=0;page<10;page++) {
  const data=await jsonRequest(`https://connector-gateway.lovable.dev/google_ads/v25/customers/${required('GOOGLE_ADS_CUSTOMER_ID')}/googleAds:search`,{
   method:'POST',headers:{Authorization:`Bearer ${required('LOVABLE_API_KEY')}`,'X-Connection-Api-Key':required('GOOGLE_ADS_API_KEY'),'Content-Type':'application/json',...(process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID?{'login-customer-id':process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID}:{})},
   body:JSON.stringify({query,...(pageToken?{pageToken}:{})})
  }); rows.push(...(data.results||[])); pageToken=data.nextPageToken; if(!pageToken) return rows;
 }
 throw new Error('Rapport Google incomplet : limite de pagination');
}
async function collectMeta() {
 try {
  const id='act_'+required('META_ADS_ACCOUNT_ID');
  const account=await metaRead(id,{fields:'id,name,currency,account_status'});
  const time_range=JSON.stringify({since:start,until:yesterday});
  const fields='campaign_id,campaign_name,spend,impressions,clicks,actions';
  const rows=await metaPages(`${id}/insights`,{time_range,level:'campaign',fields,limit:'100'});
  const config=await metaPages(`${id}/campaigns`,{fields:'id,name,status,objective',limit:'100'});
  const month=await metaPages(`${id}/insights`,{time_range:JSON.stringify({since:monthStart,until:day}),fields:'spend',limit:'100'});
  const campaigns=rows.map(row=>{
   const c=config.find(x=>x.id===row.campaign_id);
   const actions=row.actions||[];
   const leads=Number(actions.find(x=>x.action_type==='offsite_conversion.fb_pixel_lead')?.value||0);
   const registrations=Number(actions.find(x=>x.action_type==='offsite_conversion.fb_pixel_complete_registration')?.value||0);
   const purchases=Number(actions.find(x=>x.action_type==='offsite_conversion.fb_pixel_purchase')?.value||0);
   return {id:row.campaign_id,name:row.campaign_name,status:c?.status,objective:c?.objective,spend:Number(row.spend||0),impressions:Number(row.impressions||0),clicks:Number(row.clicks||0),leads,registrations,purchases,conversions:leads+registrations+purchases};
  });
  return {ok:true,currency:account.currency,accountName:account.name,monthSpend:month.reduce((s,r)=>s+Number(r.spend||0),0),campaigns,period:{start,end:yesterday}};
 } catch { return {ok:false,error:'Lecture Meta indisponible : vérifier le jeton, les droits et le compte. Aucun résultat inventé.'}; }
}
async function collectGoogle() {
 try {
  const accounts=await googleRows('SELECT customer.currency_code, customer.descriptive_name FROM customer LIMIT 1');
  if(!accounts[0]?.customer) throw new Error('Compte absent');
  const rows=await googleRows(`SELECT campaign.id, campaign.name, campaign.status, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions FROM campaign WHERE segments.date BETWEEN '${start}' AND '${yesterday}' AND campaign.status != 'REMOVED'`);
  const month=await googleRows(`SELECT metrics.cost_micros FROM customer WHERE segments.date BETWEEN '${monthStart}' AND '${day}'`);
  return {ok:true,currency:accounts[0].customer.currencyCode,accountName:accounts[0].customer.descriptiveName,monthSpend:month.reduce((s,r)=>s+Number(r.metrics?.costMicros||0)/1e6,0),period:{start,end:yesterday},campaigns:rows.map(r=>({id:r.campaign.id,name:r.campaign.name,status:r.campaign.status,spend:Number(r.metrics?.costMicros||0)/1e6,clicks:Number(r.metrics?.clicks||0),impressions:Number(r.metrics?.impressions||0),conversions:Number(r.metrics?.conversions||0)}))};
 } catch {return {ok:false,error:'Lecture Google Ads indisponible : vérifier l’accès du compte Google connecté. Dépenses et conversions inconnues.'};}
}
async function main() {
 const [meta,google]=await Promise.all([collectMeta(),collectGoogle()]);
 const budget=budgetState(meta,google); const proposals=proposalsFor(meta,google,budget);
 const {data:report,error}=await sb.from('sea_reports').upsert({report_day:day,summary:{meta,google,budget,measurement:'Conversions déclarées par les plateformes, pas des clients payants ; attribution non auditée.',coverage:['Lecture quotidienne Google et Meta','Suivi des dépenses mensuelles','Propositions de contrôle mesure et parcours'],pending:['Audit du suivi navigateur et consentement','Tests de pages et stratégie créative','Application manuelle des propositions acceptées']}},{onConflict:'report_day'}).select('id').single();
 if(error||!report) throw new Error('Enregistrement du rapport SEA impossible');
 const rows=proposals.map(p=>({report_id:report.id,proposal_key:p.key,title:p.title,detail:p.detail}));
 const result=await sb.from('sea_proposals').upsert(rows,{onConflict:'report_id,proposal_key',ignoreDuplicates:true});
 if(result.error) throw new Error('Enregistrement des propositions impossible');
 console.log('Rapport SEA enregistré. Meta : '+(meta.ok?'accessible':'indisponible')+'. Google : '+(google.ok?'accessible':'indisponible')+'. Aucune campagne modifiée.');
}
main().catch(()=>{console.error('Agent SEA : échec du rapport ; vérifier la configuration ou les tables.');process.exitCode=1;});
