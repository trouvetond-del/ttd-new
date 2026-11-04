import { useEffect, useState } from 'react';
import { UserPlus, Loader2, Phone, Mail, Users, Send } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { MoverLayout } from '../components/MoverLayout';
import { showToast } from '../utils/toast';

interface Driver { id: string; full_name: string; email: string; phone: string | null; active: boolean; user_id: string | null }

export default function MoverDriversPage() {
  const { user } = useAuth();
  const [moverId, setMoverId] = useState<string | null>(null);
  const [teamSize, setTeamSize] = useState(1);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [form, setForm] = useState({ full_name: '', email: '', phone: '' });
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!user) return;
    const { data: m } = await supabase.from('movers').select('id, team_size').eq('user_id', user.id).maybeSingle();
    if (m) { setMoverId(m.id); setTeamSize(m.team_size || 1); }
    const { data } = await supabase.from('mover_drivers').select('id, full_name, email, phone, active, user_id').order('created_at');
    setDrivers(data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, [user]);

  const saveTeam = async (n: number) => {
    setTeamSize(n);
    if (moverId) await supabase.from('movers').update({ team_size: n }).eq('id', moverId);
  };

  const invite = async (payload: { full_name: string; email: string; phone: string }) => {
    setSending(true);
    const { data, error } = await supabase.functions.invoke('mover-driver-invite', { body: payload });
    setSending(false);
    if (error || data?.error) { showToast(data?.error || "L'invitation n'a pas pu être envoyée", 'error'); return false; }
    showToast(`Invitation envoyée à ${payload.email}`, 'success');
    load();
    return true;
  };

  const toggle = async (d: Driver) => {
    await supabase.from('mover_drivers').update({ active: !d.active }).eq('id', d.id);
    load();
  };

  const needDrivers = teamSize >= 2;

  return (
    <MoverLayout title="Mes chauffeurs">
      <div className="mx-auto max-w-3xl space-y-5">
        <div className="rounded-2xl border border-gray-200 bg-white p-5">
          <label className="flex items-center gap-2 text-sm font-semibold text-gray-800"><Users className="h-4 w-4" />Combien de personnes dans votre entreprise ?</label>
          <select value={teamSize} onChange={(e) => saveTeam(Number(e.target.value))} className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-3 py-3 text-base">
            <option value={1}>Je travaille seul</option>
            {[2, 3, 4, 5, 6, 8, 10, 15, 20].map((n) => <option key={n} value={n}>{n} personnes{n === 20 ? ' ou plus' : ''}</option>)}
          </select>
          <p className={`mt-2 text-sm ${needDrivers && drivers.filter((d) => d.active).length === 0 ? 'text-amber-700' : 'text-gray-500'}`}>
            {needDrivers
              ? 'Avec 2 personnes ou plus, chaque mission doit être confiée à un chauffeur. Il ouvre et clôture la mission avec les photos depuis son téléphone.'
              : 'Vous pouvez faire les missions vous-même, ou ajouter un chauffeur si vous le souhaitez.'}
          </p>
        </div>

        <form className="rounded-2xl border border-gray-200 bg-white p-5 space-y-3"
          onSubmit={async (e) => { e.preventDefault(); if (await invite(form)) setForm({ full_name: '', email: '', phone: '' }); }}>
          <h2 className="flex items-center gap-2 font-semibold text-gray-900"><UserPlus className="h-5 w-5 text-blue-600" />Ajouter un chauffeur</h2>
          <input required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="Nom et prénom"
            className="w-full rounded-xl border border-gray-300 px-3 py-3 text-base" />
          <input required type="email" inputMode="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email du chauffeur"
            className="w-full rounded-xl border border-gray-300 px-3 py-3 text-base" />
          <input type="tel" inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Téléphone (facultatif)"
            className="w-full rounded-xl border border-gray-300 px-3 py-3 text-base" />
          <button disabled={sending} className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3.5 text-base font-semibold text-white disabled:opacity-60">
            {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}Envoyer l'invitation
          </button>
          <p className="text-xs text-gray-500">Le chauffeur reçoit un email pour créer son mot de passe. Il ne voit que les missions que vous lui confiez : ni prix, ni devis, ni finances.</p>
        </form>

        <div className="space-y-2">
          {loading ? <Loader2 className="mx-auto h-6 w-6 animate-spin text-blue-600" /> : drivers.length === 0 ? (
            <p className="text-center text-sm text-gray-500">Aucun chauffeur pour l'instant.</p>
          ) : drivers.map((d) => (
            <div key={d.id} className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-4 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-gray-900">{d.full_name} {!d.active && <span className="ml-1 text-xs font-normal text-gray-400">(désactivé)</span>}</p>
                <p className="flex items-center gap-1.5 truncate text-sm text-gray-500"><Mail className="h-3.5 w-3.5" />{d.email}</p>
                {d.phone && <a href={`tel:${d.phone}`} className="flex items-center gap-1.5 text-sm text-blue-600"><Phone className="h-3.5 w-3.5" />{d.phone}</a>}
                <p className="text-xs text-gray-400">{d.user_id ? 'Compte créé' : 'Invitation envoyée'}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => invite({ full_name: d.full_name, email: d.email, phone: d.phone || '' })} className="flex-1 rounded-xl border border-gray-300 px-3 py-2 text-sm">Renvoyer</button>
                <button onClick={() => toggle(d)} className="flex-1 rounded-xl border border-gray-300 px-3 py-2 text-sm">{d.active ? 'Désactiver' : 'Réactiver'}</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </MoverLayout>
  );
}
