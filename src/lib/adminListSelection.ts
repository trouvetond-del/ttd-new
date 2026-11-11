export function selectedVisibleIds(selected: Set<string>, visible: string[]): string[] {
  return visible.filter(id => selected.has(id));
}
export function toggleVisibleSelection(selected: Set<string>, visible: string[]): Set<string> {
  const next = new Set(selected);
  const all = visible.length > 0 && visible.every(id => next.has(id));
  for (const id of visible) { if (all) next.delete(id); else next.add(id); }
  return next;
}
