import { Trash2, RotateCcw } from 'lucide-react';
import type { useAdminListRemoval } from '../../hooks/useAdminListRemoval';
type Removal = ReturnType<typeof useAdminListRemoval>;
export function AdminListRemovalBar({ removal, ids }: { removal: Removal; ids: string[] }) {
 const selected=removal.selectedVisible(ids);
 return <div className="flex flex-wrap items-center gap-3 py-3 text-sm">
  <label className="flex items-center gap-2"><input type="checkbox" aria-label="Tout sélectionner dans la liste affichée" disabled={!removal.ready || removal.busy} checked={ids.length>0 && selected.length===ids.length} onChange={()=>removal.toggleAll(ids)}/>Tout sélectionner</label>
  <button type="button" onClick={()=>removal.setTrash(!removal.trash)} className="inline-flex items-center gap-1 rounded-lg border px-3 py-2"><Trash2 size={16}/>{removal.trash?'Revenir à la liste':'Corbeille'}</button>
  {selected.length>0 && <button type="button" disabled={removal.busy} onClick={()=>void removal.change(selected)} className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 disabled:opacity-50">{removal.trash?<RotateCcw size={16}/>:<Trash2 size={16}/>} {removal.trash?'Restaurer':'Supprimer'} ({selected.length})</button>}
  {!removal.ready && <span role="status">Vérification de la corbeille…</span>}
 </div>;
}
export function AdminListCheckbox({ removal, id, label }: { removal: Removal; id: string; label: string }) {
 return <input type="checkbox" aria-label={`Sélectionner ${label}`} checked={removal.selected.has(id)} disabled={removal.busy} onChange={()=>removal.toggle(id)}/>;
}
