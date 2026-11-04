import { useEffect, useMemo, useState } from 'react';
import { X, Send, Search, Phone, MapPin } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { showToast } from '../../utils/toast';
import { departmentFromPostalCode, regionFromPostalCode } from '../../utils/frenchRegion';

interface Props {
  quoteRequestId: string;
  route: string;
  fromPostalCode?: string | null;
  toPostalCode?: string | null;
  onClose: () => void;
}

interface MoverRow { id: string; company_name: string; city?: string | null; postal_code?: string | null; phone?: string | null; email?: string | null }

// Proximité : 0 = même département que départ/arrivée, 1 = même région, 2 = ailleurs.
function proximity(m: MoverRow, depts: Set<string>, regions: Set<string>): number {
  const d = departmentFromPostalCode(m.postal_code);
  if (d && depts.has(d)) return 0;
  const r = regionFromPostalCode(m.postal_code);
  if (r && regions.has(r)) return 1;
  return 2;
}

export default function AdminInviteMoverModal({ quoteRequestId, route, fromPostalCode, toPostalCode, onClose }: Props) {
  const [movers, setMovers] = useState<MoverRow[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string>('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    supabase.from('movers').select('id, company_name, city, postal_code, phone, email')
      .eq('verification_status', 'verified').order('company_name')
      .then(({ data }) => setMovers((data as MoverRow[]) || []));
  }, []);

  const list = useMemo(() => {
    const depts = new Set([departmentFromPostalCode(fromPostalCode), departmentFromPostalCode(toPostalCode)].filter(Boolean) as string[]);
    const regions = new Set([regionFromPostalCode(fromPostalCode), regionFromPostalCode(toPostalCode)].filter(Boolean) as string[]);
    const term = search.trim().toLowerCase();
    return movers
      .filter((m) => !term || (m.company_name || '').toLowerCase().includes(term))
      .map((m) => ({ ...m, prox: proximity(m, depts, regions), region: regionFromPostalCode(m.postal_code) }))
      .sort((a, b) => a.prox - b.prox || (a.company_name || '').localeCompare(b.company_name || ''));
  }, [movers, search, fromPostalCode, toPostalCode]);

  const chosen = movers.find((m) => m.id === selected);

  const send = async () => {
    if (!chosen) return;
    if (!window.confirm(`Envoyer l'invitation à déposer un devis à ${chosen.company_name} (${chosen.email}) ?`)) return;
    setSending(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Session admin expirée, reconnectez-vous.');
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-invite-mover-quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ quoteRequestId, moverId: chosen.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erreur lors de l'envoi");
      showToast(`Invitation envoyée à ${chosen.company_name}`, 'success');
      onClose();
    } catch (e: any) {
      showToast(e.message || "Erreur lors de l'envoi", 'error');
    } finally {
      setSending(false);
    }
  };

  const proxLabel = ['Très proche', 'Même région', ''];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-xl rounded-xl bg-white p-6 shadow-xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-bold flex items-center gap-2"><Send className="w-5 h-5" /> Inviter un déménageur</h3>
          <button onClick={onClose} aria-label="Fermer"><X className="w-5 h-5" /></button>
        </div>
        <p className="text-sm text-gray-600 mb-4">{route}</p>

        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par nom d'entreprise..."
            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex-1 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100 min-h-[200px]">
          {list.length === 0 && <p className="p-4 text-sm text-gray-500 text-center">Aucun déménageur trouvé</p>}
          {list.map((m) => (
            <button
              key={m.id}
              onClick={() => setSelected(m.id)}
              className={`w-full text-left px-4 py-3 flex items-center justify-between gap-3 transition ${selected === m.id ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{m.company_name}</p>
                <p className="text-xs text-gray-500 flex items-center gap-1"><MapPin className="w-3 h-3" />{m.city || '—'}{m.region ? ` · ${m.region}` : ''}</p>
              </div>
              {proxLabel[m.prox] && (
                <span className={`shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full ${m.prox === 0 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-blue-50 text-blue-700 border border-blue-200'}`}>
                  {proxLabel[m.prox]}
                </span>
              )}
            </button>
          ))}
        </div>

        {chosen && (
          <div className="mt-4 p-3 rounded-lg bg-gray-50 border border-gray-200 flex items-center justify-between gap-3">
            <div className="text-sm min-w-0">
              <p className="font-medium truncate">{chosen.company_name}</p>
              <p className="text-xs text-gray-500 truncate">{chosen.email || 'Pas d’email'}</p>
            </div>
            {chosen.phone && (
              <a href={`tel:${chosen.phone.replace(/\s/g, '')}`} className="shrink-0 flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-600 hover:text-white transition">
                <Phone className="w-3 h-3" /> {chosen.phone}
              </a>
            )}
          </div>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-gray-300 hover:bg-gray-50">Annuler</button>
          <button
            onClick={send}
            disabled={!chosen || !chosen.email || sending}
            className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="w-4 h-4" /> {sending ? 'Envoi...' : "Envoyer l'invitation"}
          </button>
        </div>
      </div>
    </div>
  );
}
