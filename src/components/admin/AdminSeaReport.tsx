import { useEffect, useState, type ButtonHTMLAttributes } from 'react';
import { Check, X, RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import './sea-report.css';
interface Campaign { id: string; name: string; spend: number; impressions: number; clicks: number; conversions: number }
interface Provider { ok: boolean; error?: string; currency?: string; monthSpend?: number; campaigns?: Campaign[]; period?: { start: string; end: string } }
interface Report { id: string; report_day: string; summary: { meta: Provider; google: Provider; budget: { limit: number; knownSpend: number; complete: boolean; remaining: number | null; exceeded: boolean }; measurement: string; pending?: string[] } }
interface Proposal { id: string; title: string; detail: string; status: 'pending' | 'accepted' | 'rejected' }
function SeaButton(props: ButtonHTMLAttributes<HTMLButtonElement>) { return <button {...props} className="sea-button" />; }
const money = (value: number, currency='EUR') => new Intl.NumberFormat('fr-FR', { style:'currency', currency }).format(value);
function ProviderTable({ name, data }: { name: string; data: Provider }) {
 return <section><h3>{name}</h3>{!data.ok ? <p className="sea-warning">{data.error}</p> : <>
  <p className="sea-muted">Du {data.period?.start} au {data.period?.end} · mois en cours : {money(data.monthSpend ?? 0, data.currency)}</p>
  <div className="sea-table"><table><thead><tr><th>Campagne</th><th>Dépenses</th><th>Affichages</th><th>Clics</th><th>Conversions déclarées</th></tr></thead>
  <tbody>{data.campaigns?.map(c=><tr key={c.id}><td>{c.name}</td><td>{money(c.spend,data.currency)}</td><td>{c.impressions}</td><td>{c.clicks}</td><td>{c.conversions}</td></tr>)}</tbody></table></div>
  {!data.campaigns?.length && <p>Aucune dépense enregistrée sur cette période.</p>}
 </>}</section>;
}
export default function AdminSeaReport() {
 const [reports,setReports]=useState<Report[]>([]);
 const [selected,setSelected]=useState('');
 const [proposals,setProposals]=useState<Proposal[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const [busy,setBusy]=useState('');
 async function load() {
  setLoading(true); setError('');
  try {
   const result=await supabase.from('sea_reports').select('*').order('report_day',{ascending:false}).limit(31);
   if(result.error) throw result.error;
   const rows=(result.data || []) as Report[]; setReports(rows); setSelected(rows[0]?.id || '');
  } catch {setError('Le rapport SEA ne peut pas être chargé. Vérifier le dernier passage de l’agent.');} finally {setLoading(false);}
 }
 useEffect(()=>{ void load(); },[]);
 useEffect(()=>{
  setProposals([]); if(!selected) return;
  let current=true;
  supabase.from('sea_proposals').select('id,title,detail,status').eq('report_id',selected).then(({data,error:queryError})=>{
   if(!current) return;
   if(queryError) setError('Les propositions ne peuvent pas être chargées.'); else setProposals((data || []) as Proposal[]);
  }); return ()=>{current=false;};
 },[selected]);
 async function decide(id:string,status:'accepted'|'rejected') {
  setBusy(id); setError('');
  try {
   const {data:auth,error:authError}=await supabase.auth.getUser();
   if(authError || !auth.user) throw new Error('Session requise');
   const result=await supabase.from('sea_proposals').update({status,decided_by:auth.user.id,decided_at:new Date().toISOString()}).eq('id',id).eq('status','pending').select('id,title,detail,status').single();
   if(result.error || !result.data) throw new Error('Décision refusée');
   setProposals(prev=>prev.map(p=>p.id===id?result.data as Proposal:p));
  } catch {setError('Décision non enregistrée : vérifier votre session administrateur ou actualiser.');} finally {setBusy('');}
 }
 const report=reports.find(r=>r.id===selected);
 return <div className="sea-report">
  <header><h2>Agent SEA</h2><SeaButton onClick={()=>void load()} disabled={loading}><RefreshCw size={16}/>Actualiser</SeaButton></header>
  {error && <p role="alert" className="sea-warning">{error}</p>}
  {loading?<p>Chargement…</p>:!report?<p>Aucun rapport SEA disponible pour le moment.</p>:<>
   <section><label htmlFor="sea-date">Rapport du </label><select id="sea-date" value={selected} onChange={e=>setSelected(e.target.value)}>{reports.map(r=><option key={r.id} value={r.id}>{r.report_day}</option>)}</select>
    <h3 className={report.summary.budget.exceeded?'sea-warning':''}>Plafond souhaité : 300 € / mois, Google + Meta</h3>
    <p>Dépenses {report.summary.budget.complete?'totales':'connues (total incomplet)'} : {money(report.summary.budget.knownSpend)}</p>
    <p className="sea-muted">Aucune coupure automatique : ce plafond déclenche une alerte, pas une limite imposée aux plateformes.</p>
    <p>{report.summary.measurement}</p>
   </section>
   <ProviderTable name="Facebook / Instagram" data={report.summary.meta}/><ProviderTable name="Google Ads" data={report.summary.google}/>
   <section><h3>Propositions à décider</h3><p className="sea-muted">Accepter enregistre votre décision ; aucune campagne ni aucun budget n’est modifié automatiquement.</p>
    {proposals.map(p=><article key={p.id}><h3>{p.title}</h3><p>{p.detail}</p>{p.status==='pending'?<div className="sea-actions"><SeaButton disabled={!!busy} onClick={()=>void decide(p.id,'accepted')}><Check size={16}/>Accepter la proposition</SeaButton><SeaButton disabled={!!busy} onClick={()=>void decide(p.id,'rejected')}><X size={16}/>Refuser</SeaButton></div>:<p>{p.status==='accepted'?'Acceptée — à réaliser manuellement':'Refusée'}</p>}</article>)}
   </section>
   <section><h3>Contrôles restant à réaliser</h3><ul>{report.summary.pending?.map(item=><li key={item}>{item}</li>)}</ul></section>
  </>}
 </div>;
}
