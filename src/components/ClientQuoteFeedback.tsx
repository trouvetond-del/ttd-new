import { useRef, useState } from 'react';
import { hesitationReasons } from '../lib/clientPendingQuotes';
import { supabase } from '../lib/supabase';
import { showToast } from '../utils/toast';
export function ClientQuoteFeedback({ requestId, onClose }: { requestId: string; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const [detail, setDetail] = useState('');
  const [sending, setSending] = useState(false);
  const busy = useRef(false);
  const submit = async () => {
    if (busy.current) return;
    busy.current = true; setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-client-actions', { body: { action: 'quote_feedback', quoteRequestId: requestId, reason, detail } });
      if (error || data?.error) throw new Error(data?.error || error?.message || 'Envoi impossible');
      showToast('Votre réponse a été transmise à notre équipe', 'success'); onClose();
    } catch (error) { showToast(error instanceof Error ? error.message : 'Envoi impossible', 'error'); }
    finally { busy.current = false; setSending(false); }
  };
  return <div className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center p-4"><section role="dialog" aria-modal="true" aria-labelledby="feedback-title" className="bg-white rounded-lg p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
    <h2 id="feedback-title" className="text-xl font-semibold mb-4">Qu’est-ce qui vous fait hésiter ?</h2>
    <fieldset disabled={sending} className="space-y-3">{hesitationReasons.map(value => <label key={value} className="flex gap-3 items-start"><input type="radio" name="hesitation" value={value} checked={reason === value} onChange={() => setReason(value)} className="mt-1" />{value}</label>)}</fieldset>
    <label className="block mt-4">{reason === 'Autre raison' ? 'Précisez votre raison' : 'Votre message (facultatif)'}<textarea value={detail} onChange={e => setDetail(e.target.value)} maxLength={2000} disabled={sending} className="block border rounded-lg w-full p-3 mt-2" /></label>
    <div className="flex justify-end gap-3 mt-5"><button type="button" onClick={onClose} disabled={sending} className="border rounded-lg px-3 py-2">Annuler</button><button type="button" onClick={submit} disabled={sending || !reason || (reason === 'Autre raison' && !detail.trim())} className="bg-blue-600 text-white rounded-lg px-3 py-2 disabled:opacity-50">{sending ? 'Envoi…' : 'Valider ma réponse'}</button></div>
  </section></div>;
}