import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';

// Refresh active readers on local writes, other tabs, reconnect and focus.
export function useActionRefresh(refresh: () => unknown) {
  const current = useRef(refresh);
  current.current = refresh;
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const run = () => { clearTimeout(timer); timer = setTimeout(() => { void current.current(); }, 150); };
    const visible = () => { if (document.visibilityState === 'visible') run(); };
    window.addEventListener('ttd:action-completed', run);
    window.addEventListener('focus', run);
    document.addEventListener('visibilitychange', visible);
    const broadcast = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('ttd:actions');
    if (broadcast) broadcast.onmessage = run;
    const channel = supabase.channel(`actions-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'quote_requests' }, run)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'groupage_alerts' }, run)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'quotes' }, run)
      .subscribe(status => { if (status === 'SUBSCRIBED') run(); });
    const fallback = setInterval(visible, 30000);
    return () => {
      clearTimeout(timer); clearInterval(fallback); broadcast?.close();
      window.removeEventListener('ttd:action-completed', run); window.removeEventListener('focus', run);
      document.removeEventListener('visibilitychange', visible); void supabase.removeChannel(channel);
    };
  }, []);
}