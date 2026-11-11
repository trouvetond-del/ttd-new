export function selectedVisibleIds(selected: Set<string>, visible: string[]): string[] {
  return visible.filter(id => selected.has(id));
}
export function toggleVisibleSelection(selected: Set<string>, visible: string[]): Set<string> {
  const next = new Set(selected);
  const all = visible.length > 0 && visible.every(id => next.has(id));
  for (const id of visible) { if (all) next.delete(id); else next.add(id); }
  return next;
}
/** Records in the trash never count in totals or status counters (e.g. "Expirés"). */
export function countActive<T extends { id: string }>(items: T[], hidden: Set<string>, match: (item: T) => boolean = () => true): number {
  return items.filter(item => !hidden.has(item.id) && match(item)).length;
}
