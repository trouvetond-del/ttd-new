import { supabase } from './supabase';
export function announceActionCompleted() {
  window.dispatchEvent(new Event('ttd:action-completed'));
  if (typeof BroadcastChannel !== 'undefined') {
    const channel = new BroadcastChannel('ttd:actions'); channel.postMessage('refresh'); channel.close();
  }
}
export async function verifyRequestAction(id: string, expected: 'trashed' | 'restored' | 'completed') {
  // Never replay a business mutation when verification fails.
  announceActionCompleted();
  const { data, error } = await supabase.rpc('admin_verify_request_action', { p_request: id, p_expected: expected });
  if (error || data?.ok !== true) throw new Error('Action enregistrée, mais contrôle incomplet. Actualisez et consultez les alertes de contrôle.');
}