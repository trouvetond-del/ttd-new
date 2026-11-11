import { useRef, useState } from 'react';
import { Send } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { showToast } from '../../utils/toast';
export default function ClientQuoteReminderButton({ quoteRequestId }: { quoteRequestId: string }) {
  const [sending, setSending] = useState(false);
  const inFlight = useRef(false);
  const send = async () => {
    if (inFlight.current || !window.confirm('Envoyer le rappel des devis avec la question « Pourquoi hésitez-vous ? » à ce client ?')) return;
    inFlight.current = true; setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-client-actions', { body: { action: 'quote_reminder', quoteRequestId } });
      if (error) {
        let message = error.message;
        try { message = (await error.context?.json())?.error || message; } catch { /* Keep original error. */ }
        throw new Error(message);
      }
      if (data?.error) throw new Error(data.error);
      showToast('Rappel des devis envoyé au client', 'success');
    } catch (error) { showToast(error instanceof Error ? error.message : 'Envoi impossible', 'error'); }
    finally { inFlight.current = false; setSending(false); }
  };
  return <button type="button" onClick={send} disabled={sending} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-sm disabled:opacity-60"><Send className="w-4 h-4" />{sending ? 'Envoi…' : 'Relancer le client'}</button>;
}