import { useAdminListRemoval } from '../../hooks/useAdminListRemoval';
import { AdminListRemovalBar, AdminListCheckbox } from './AdminListRemovalBar';
import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Send, Search, Copy, Phone } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface Partner {
  id: string; code: string; name: string; city: string; zone: string | null; address: string | null; phone: string | null;
  email: string | null; contact_form: string | null; status: string; emails_sent: number; last_email_at: string | null; notes: string | null;
}
interface Reward { id: string; client_email: string; partner_id: string; amount_eur: number; status: string; created_at: string }

const STATUS: Record<string, { label: string; cls: string }> = {
  nouveau: { label: 'Pas encore contacté', cls: 'bg-gray-100 text-gray-700' },
  contacte: { label: 'Mail envoyé', cls: 'bg-blue-100 text-blue-700' },
  relance: { label: 'Relancé', cls: 'bg-indigo-100 text-indigo-700' },
  a_repondu: { label: 'A répondu', cls: 'bg-amber-100 text-amber-800' },
  a_appeler: { label: 'À appeler', cls: 'bg-orange-100 text-orange-800' },
  interesse: { label: 'Intéressé', cls: 'bg-emerald-100 text-emerald-700' },
  partenaire: { label: 'Partenaire', cls: 'bg-green-600 text-white' },
  refuse: { label: 'Refusé', cls: 'bg-red-100 text-red-700' },
};
const SITE = 'https://www.trouvetondemenageur.fr';
const date = (d: string | null) => (d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');

export default function AdminPartners() {
  const removal = useAdminListRemoval('storage_partners');
  const [partners, setPartners] = useState<Partner[]>([]);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function load() {
    setLoading(true);
    const [p, r] = await Promise.all([
      supabase.from('storage_partners').select('id,code,name,city,zone,address,phone,email,contact_form,status,emails_sent,last_email_at,notes').order('zone').order('city'),
      supabase.from('partner_rewards').select('id,client_email,partner_id,amount_eur,status,created_at').order('created_at', { ascending: false }),
    ]);
    if (p.error) setMsg({ ok: false, text: 'La liste des box ne peut pas être chargée.' });
    setPartners((p.data || []) as Partner[]);
    setRewards((r.data || []) as Reward[]);
    setLoading(false);
  }
  useEffect(() => { void load(); }, []);

  const shown = useMemo(() => partners.filter(p => removal.includes(p.id)).filter(p =>
    (!filter || p.status === filter) &&
    (!q || `${p.name} ${p.city} ${p.code} ${p.email ?? ''}`.toLowerCase().includes(q.toLowerCase()))), [partners, q, filter, removal.trash, removal.ready, removal.includes]);
  const activePartners = partners.filter(p => removal.isActive(p.id));
  const count = (s: string) => activePartners.filter(p => p.status === s).length;
  const nameOf = (id: string) => partners.find(p => p.id === id)?.name ?? '—';

  async function relancer(p: Partner) {
    setBusy(p.id); setMsg(null);
    const { data, error } = await supabase.functions.invoke('partner-outreach', { body: { partnerId: p.id } });
    let text = data?.error as string | undefined;
    if (error) { try { text = (await (error as { context?: Response }).context?.json())?.error; } catch { /* ignore */ } }
    if (error || data?.error) setMsg({ ok: false, text: text || "L'email n'a pas pu partir." });
    else setMsg({ ok: true, text: `Mail de partenariat envoyé à ${p.name}.` });
    setBusy(''); void load();
  }
  async function setStatus(p: Partner, status: string) {
    const { error } = await supabase.from('storage_partners').update({ status }).eq('id', p.id);
    if (error) setMsg({ ok: false, text: 'Statut non enregistré.' }); else setPartners(prev => prev.map(x => x.id === p.id ? { ...x, status } : x));
  }
  async function decide(r: Reward, status: 'paye' | 'refuse') {
    const { error } = await supabase.from('partner_rewards').update({ status }).eq('id', r.id).eq('status', 'a_verifier');
    if (error) setMsg({ ok: false, text: 'Décision non enregistrée.' }); else void load();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Partenaires box de stockage</h2>
          <p className="text-sm text-gray-600">Chaque lundi, l'agent ajoute 10 nouveaux box trouvés partout en France (hors liste). Il envoie chaque matin jusqu'à 20 premiers mails, relance une fois à J+4 sans réponse, puis passe la fiche en « À appeler ».</p>
        </div>
        <button onClick={() => void load()} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-gray-50"><RefreshCw size={16} />Actualiser</button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        {[['Total', activePartners.length], ['Mail envoyé', count('contacte') + count('relance')], ['A répondu', count('a_repondu')], ['À appeler', count('a_appeler')], ['Partenaires', count('partenaire')], ['Remboursements à vérifier', rewards.filter(r => r.status === 'a_verifier').length]].map(([l, v]) => (
          <div key={l as string} className="rounded-xl border bg-white p-3"><div className="text-xs text-gray-500">{l}</div><div className="text-xl font-bold">{v}</div></div>
        ))}
      </div>

      {msg && <p role="alert" className={`rounded-lg p-3 text-sm ${msg.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>{msg.text}</p>}

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher un box, une ville, un code…" className="w-full rounded-lg border py-2 pl-9 pr-3 text-sm" />
        </div>
        <select value={filter} onChange={e => setFilter(e.target.value)} className="rounded-lg border px-3 py-2 text-sm">
          <option value="">Tous les statuts</option>
          {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      <AdminListRemovalBar removal={removal} ids={shown.map(p=>p.id)} />
      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr><th className="p-3"></th><th className="p-3">Box</th><th className="p-3">Contact</th><th className="p-3">Code QR</th><th className="p-3">Statut</th><th className="p-3">Mails</th><th className="p-3"></th></tr>
          </thead>
          <tbody className="divide-y">
            {loading ? <tr><td className="p-4" colSpan={7}>Chargement…</td></tr> : shown.map(p => (
              <tr key={p.id} className="align-top">
                <td className="p-3"><AdminListCheckbox removal={removal} id={p.id} label={p.name}/></td>
                <td className="p-3"><div className="font-medium">{p.name}</div><div className="text-xs text-gray-500">{p.city}{p.address ? ` · ${p.address}` : ''}</div></td>
                <td className="p-3 text-xs">
                  {p.phone && <a href={`tel:${p.phone.replace(/\s/g, '')}`} className="flex items-center gap-1 text-blue-700"><Phone size={12} />{p.phone}</a>}
                  {p.email ? <div>{p.email}</div> : p.contact_form ? <a href={p.contact_form} target="_blank" rel="noreferrer" className="text-blue-700 underline">Formulaire de contact</a> : <div className="text-gray-400">Pas d'email trouvé</div>}
                </td>
                <td className="p-3 text-xs"><div className="font-mono">{p.code}</div>
                  <button onClick={() => { void navigator.clipboard.writeText(`${SITE}/?box=${p.code}`); setMsg({ ok: true, text: 'Lien du QR code copié.' }); }} className="mt-1 inline-flex items-center gap-1 text-blue-700"><Copy size={12} />Copier le lien</button>
                </td>
                <td className="p-3">
                  <select value={p.status} onChange={e => void setStatus(p, e.target.value)} className={`rounded-full px-2 py-1 text-xs font-medium ${STATUS[p.status]?.cls}`}>
                    {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </td>
                <td className="p-3 text-xs">{p.emails_sent} envoyé(s)<div className="text-gray-500">Dernier : {date(p.last_email_at)}</div></td>
                <td className="p-3">
                  <button disabled={!p.email || busy === p.id || p.status === 'refuse'} onClick={() => void relancer(p)}
                    title={p.email ? 'Envoyer le mail de demande de partenariat' : "Pas d'email : à appeler"}
                    className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-40">
                    <Send size={14} />{busy === p.id ? 'Envoi…' : (p.emails_sent > 0 || p.last_email_at || ['contacte', 'relance', 'a_repondu', 'a_appeler'].includes(p.status)) ? 'Relancer' : 'Envoyer'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-xl border bg-white p-4">
        <h3 className="text-lg font-semibold">Remboursements clients (25 €)</h3>
        <p className="mb-3 text-sm text-gray-600">Une ligne n'apparaît que si le client est arrivé par le QR code d'un box avec un compte neuf, et que son déménagement payé sur le site est validé terminé. Une seule fois par client. Vérifiez puis payez.</p>
        {rewards.length === 0 ? <p className="text-sm text-gray-500">Aucun remboursement pour le moment.</p> : (
          <table className="min-w-full text-sm"><thead className="text-left text-xs uppercase text-gray-500"><tr><th className="p-2">Client</th><th className="p-2">Box</th><th className="p-2">Montant</th><th className="p-2">Statut</th><th className="p-2"></th></tr></thead>
            <tbody className="divide-y">{rewards.map(r => (
              <tr key={r.id}><td className="p-2">{r.client_email}</td><td className="p-2">{nameOf(r.partner_id)}</td><td className="p-2">{r.amount_eur} €</td>
                <td className="p-2">{r.status === 'a_verifier' ? 'À vérifier' : r.status === 'paye' ? 'Payé' : 'Refusé'}</td>
                <td className="p-2">{r.status === 'a_verifier' && <div className="flex gap-2"><button onClick={() => void decide(r, 'paye')} className="rounded bg-green-600 px-2 py-1 text-xs text-white">Marquer payé</button><button onClick={() => void decide(r, 'refuse')} className="rounded border px-2 py-1 text-xs">Refuser</button></div>}</td></tr>
            ))}</tbody></table>
        )}
      </div>
    </div>
  );
}
