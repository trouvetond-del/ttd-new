import { ArrowUpFromLine } from 'lucide-react';

export function FurnitureLiftChoice({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className={`equipment-choice ${checked ? 'equipment-choice-selected' : ''}`}>
    <input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} />
    <ArrowUpFromLine size={22} aria-hidden="true" />
    <span><strong>Je possède un monte-meuble</strong><small>Équipement appartenant à mon entreprise, utilisable aussi pour une prestation seule.</small></span>
  </label>;
}
export function FurnitureLiftBadge() {
  return <span className="equipment-badge" title="Le déménageur déclare posséder son propre monte-meuble"><ArrowUpFromLine size={16} aria-hidden="true" /> Propriétaire monte-meuble</span>;
}
