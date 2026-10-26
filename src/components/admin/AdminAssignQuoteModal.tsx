import { useEffect, useState } from 'react';
import { X, UserCheck } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { showToast } from '../../utils/toast';

interface Props { quoteRequestId: string; route: string; onClose: () => void; onDone: () => void }

export default function AdminAssignQuoteModal({ quoteRequestId, route, onClose, onDone }: Props) {
  const [movers, setMovers] = useState<{ id: string; company_name: string; city?: string | null }[]>([]);
  const [moverId, setMoverId] = useState('');
  const [moverSearch, setMoverSearch] = useState('');
  const [price, setPrice] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.from('movers').select('id, company_name, city').eq('verification_status', 'verified').order('company_name')
      .then(({ data }) => setMovers((data as any) || []));
  }, []);

  const submit = async () => {
    const p = Number(price.replace(',', '.'));
    if (!moverId) { showToast('Choisis un déménageur', 'error'); return; }
    if (!p || p <= 0) { showToast('Indique le prix du déménageur', 'error'); return; }
    setSaving(true);
    const { error } = await supabase.rpc('admin_add_quote_for_mover', { p_request: quoteRequestId, p_mover: moverId, p_price: p, p_notes: notes });
    setSaving(false);
    if (error) { showToast(error.message, 'error'); return; }
    showToast('Devis déposé : le client le voit dans son espace et peut l’accepter.', 'success');
    onDone(); onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold flex items-center gap-2"><UserCheck className="w-5 h-5" /> Attribuer à un déménageur</h3>
          <button onClick={onClose}><X className="w-5 h-5" /></button>
        </div>
        <p className="text-sm text-gray-600 mb-4">{route}</p>
        <label className="block text-sm font-medium mb-1">Déménageur (vérifiés uniquement)</label>
        <input value={moverSearch} onChange={(e) => setMoverSearch(e.target.value)} placeholder="Rechercher un nom d'entreprise ou une ville..." className="w-full border rounded-lg px-3 py-2 mb-2" autoFocus />
        <select value={moverId} onChange={(e) => setMoverId(e.target.value)} className="w-full border rounded-lg px-3 py-2 mb-3">
          <option value="">— Choisir —</option>
          {movers.filter((m) => { const t = moverSearch.trim().toLowerCase(); return !t || m.id === moverId || `${m.company_name} ${m.city || ''}`.toLowerCase().includes(t); }).map((m) => <option key={m.id} value={m.id}>{m.company_name}{m.city ? ` (${m.city})` : ''}</option>)}
        </select>
        <label className="block text-sm font-medium mb-1">Prix du déménageur (€, sans la commission)</label>
        <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" className="w-full border rounded-lg px-3 py-2 mb-1" placeholder="ex. 650" />
        {Number(price) > 0 && <p className="text-xs text-gray-500 mb-3">Le client verra environ {Math.round(Number(price) * 1.3).toLocaleString('fr-FR')} € (commission incluse).</p>}
        <label className="block text-sm font-medium mb-1 mt-2">Message pour le client (facultatif)</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="w-full border rounded-lg px-3 py-2 mb-4" />
        <p className="text-xs text-gray-500 mb-4">Le client devra accepter ce devis et payer l'acompte en ligne, comme pour un devis normal. Le déménageur est prévenu.</p>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border">Annuler</button>
          <button disabled={saving} onClick={submit} className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">{saving ? '…' : 'Déposer le devis'}</button>
        </div>
      </div>
    </div>
  );
}
