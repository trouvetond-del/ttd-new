import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { announceActionCompleted } from '../lib/actionConsistency';
import { useActionRefresh } from './useActionRefresh';
import { selectedVisibleIds, toggleVisibleSelection } from '../lib/adminListSelection';
import { showToast } from '../utils/toast';
export type AdminListEntity = 'accounts' | 'movers' | 'mover_prospects' | 'client_prospects' | 'storage_partners' | 'mover_contracts' | 'contracts';
export function useAdminListRemoval(entity: AdminListEntity) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [trash, setTrash] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const load = async () => {
    const { data, error } = await supabase.from('admin_list_removals').select('record_id').eq('entity', entity);
    setReady(!error);
    if (!error) setHidden(new Set((data || []).map(r => r.record_id)));
  };
  useEffect(() => { void load(); }, [entity]);
  useActionRefresh(load);
  const includes = useCallback((id: string) => ready && hidden.has(id) === trash, [ready, hidden, trash]);
  /** True when the record is NOT in the trash: use it for every total and status counter. */
  const isActive = useCallback((id: string) => !hidden.has(id), [hidden]);
  const toggle = (id: string) => setSelected(prev => { const next=new Set(prev);next.has(id)?next.delete(id):next.add(id);return next; });
  const change = async (ids: string[], restore = trash) => {
    if (!ids.length || busy || !ready) return;
    if (!confirm(restore ? `Restaurer ${ids.length} élément(s) ?` : `Supprimer ${ids.length} élément(s) de cette liste ? Vous pourrez les restaurer dans la corbeille. Les comptes, contrats signés et paiements seront conservés.`)) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc('admin_remove_list_records', { p_entity: entity, p_ids: ids, p_restore: restore });
      if (error || data !== ids.length) throw new Error(error?.message || 'Tous les éléments n’ont pas été modifiés.');
      await load(); announceActionCompleted(); setSelected(new Set());
      showToast(restore ? `${ids.length} élément(s) restauré(s)` : `${ids.length} élément(s) dans la corbeille`, 'success');
    } catch (error) { showToast(error instanceof Error ? error.message : 'Suppression impossible', 'error'); }
    finally { setBusy(false); }
  };
  return { includes, isActive, hidden, ready, trash, busy, selected, toggle, change, selectedVisible: (ids: string[]) => selectedVisibleIds(selected,ids),
    toggleAll: (ids: string[]) => setSelected(prev=>toggleVisibleSelection(prev,ids)),
    setTrash: (value: boolean) => { setTrash(value);setSelected(new Set()); } };
}
