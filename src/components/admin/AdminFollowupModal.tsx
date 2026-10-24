import { useEffect, useState } from 'react';
import { X, Wand2, Send, Loader, Mail, CheckCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { showToast } from '../../utils/toast';

type Props = {
  targetType: 'mover' | 'client';
  moverId?: string;
  userId?: string;
  onClose: () => void;
};

type Followup = {
  id: string; admin_note: string; status: string; reminder_count: number;
  created_at: string; last_sent_at: string | null;
};

const STATUS: Record<string, string> = {
  open: 'Relance en cours', resolved: 'Mis à jour ✅', escalated: 'À appeler 📞', cancelled: 'Arrêtée',
};

// L'admin écrit ce qui manque, l'IA rédige l'email, l'admin relit puis envoie.
// Ensuite : 1 relance/jour, et alerte "à appeler" après 3 relances sans réponse.
export function AdminFollowupModal({ targetType, moverId, userId, onClose }: Props) {
  const [note, setNote] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState<'draft' | 'send' | null>(null);
  const [history, setHistory] = useState<Followup[]>([]);
  const ids = { targetType, moverId, userId };

  const call = async (payload: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke('admin-followup', { body: { ...ids, ...payload } });
    if (error) {
      let msg = error.message;
      try { msg = (await (error as any).context?.json())?.error || msg; } catch { /* ignore */ }
      throw new Error(msg);
    }
    if (data?.error) throw new Error(data.error);
    return data;
  };

  const loadHistory = () => call({ action: 'list' }).then((d) => setHistory(d.followups ?? [])).catch(() => {});
  useEffect(() => { loadHistory(); }, []);

  const draft = async () => {
    setBusy('draft');
    try {
      const d = await call({ action: 'draft', note });
      setSubject(d.subject); setBody(d.body); setEmail(d.email);
    } catch (e: any) { showToast(e.message, 'error'); }
    setBusy(null);
  };

  const send = async () => {
    setBusy('send');
    try {
      await call({ action: 'send', note, subject, body });
      showToast('Email envoyé. Relance automatique 1 fois par jour jusqu\'à la mise à jour.', 'success');
      setNote(''); setSubject(''); setBody('');
      loadHistory();
    } catch (e: any) { showToast(e.message, 'error'); }
    setBusy(null);
  };

  const stop = async (id: string, action: 'resolve' | 'cancel') => {
    try { await call({ action, id }); loadHistory(); } catch (e: any) { showToast(e.message, 'error'); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70] p-4">
      <div className="bg-white rounded-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-xl font-bold">Demander une mise à jour</h3>
            <p className="text-sm text-gray-600">
              Écrivez simplement ce qui manque. L'agent IA en fait un email professionnel, puis relance
              {targetType === 'mover' ? ' le déménageur' : ' le client'} une fois par jour. Après 3 relances sans réponse, vous recevez une alerte pour l'appeler.
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-6 h-6" /></button>
        </div>

        <label className="block text-sm font-semibold mb-1">Ce qui manque (note rapide)</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="w-full border rounded-lg p-3 min-h-[90px] mb-3"
          placeholder="ex : licence de transport expirée le 16/03/2026, attestation URSSAF pas conforme"
        />
        <button
          onClick={draft}
          disabled={busy !== null || note.trim().length < 3}
          className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2 mb-5"
        >
          {busy === 'draft' ? <Loader className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
          Rédiger l'email avec l'IA
        </button>

        {body && (
          <div className="border rounded-xl p-4 bg-gray-50 mb-5">
            <p className="text-xs text-gray-500 mb-2 flex items-center gap-1"><Mail className="w-3 h-3" /> À : {email} — vous pouvez modifier avant d'envoyer</p>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} className="w-full border rounded-lg p-2 mb-2 font-semibold" />
            <textarea value={body} onChange={(e) => setBody(e.target.value)} className="w-full border rounded-lg p-3 min-h-[220px] text-sm" />
            <div className="flex justify-end mt-3">
              <button
                onClick={send}
                disabled={busy !== null || !subject.trim() || !body.trim()}
                className="px-5 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
              >
                {busy === 'send' ? <Loader className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Envoyer et relancer chaque jour
              </button>
            </div>
          </div>
        )}

        {history.length > 0 && (
          <div>
            <h4 className="font-semibold mb-2">Demandes déjà envoyées</h4>
            <ul className="space-y-2">
              {history.map((f) => (
                <li key={f.id} className="border rounded-lg p-3 text-sm flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{f.admin_note}</p>
                    <p className="text-xs text-gray-500">
                      Envoyé le {new Date(f.created_at).toLocaleDateString('fr-FR')} · {f.reminder_count}/3 relance(s) · {STATUS[f.status] || f.status}
                    </p>
                  </div>
                  {f.status === 'open' && (
                    <div className="flex gap-2 shrink-0">
                      <button onClick={() => stop(f.id, 'resolve')} className="text-xs px-2 py-1 bg-green-100 text-green-800 rounded flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" /> Reçu
                      </button>
                      <button onClick={() => stop(f.id, 'cancel')} className="text-xs px-2 py-1 bg-gray-100 rounded">Arrêter</button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
