import { useRef, useState } from 'react';
import { Wrench } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { showToast } from '../../utils/toast';

// Relance le client : liste des meubles à démonter/remonter + photos.
export default function DisassemblyReminderButton({ quoteRequestId }: { quoteRequestId: string }) {
  const [sending, setSending] = useState(false);
  const inFlight = useRef(false);
  const send = async () => {
    if (inFlight.current || !window.confirm('Envoyer au client un email pour lister les meubles à démonter/remonter et ajouter des photos ?')) return;
    inFlight.current = true; setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-client-actions', { body: { action: 'disassembly_details', quoteRequestId } });
      if (error) {
        let message = error.message;
        try { message = (await error.context?.json())?.error || message; } catch { /* garde l'erreur d'origine */ }
        throw new Error(message);
      }
      if (data?.error) throw new Error(data.error);
      showToast('Email démontage envoyé au client', 'success');
    } catch (e) { showToast(e instanceof Error ? e.message : 'Envoi impossible', 'error'); }
    finally { inFlight.current = false; setSending(false); }
  };
  return (
    <button type="button" onClick={send} disabled={sending} className="flex items-center gap-2 px-4 py-2 border border-green-600 text-green-700 rounded-lg hover:bg-green-50 disabled:opacity-50 text-sm font-medium">
      <Wrench className="w-4 h-4" />{sending ? 'Envoi…' : 'Relance démontage'}
    </button>
  );
}
