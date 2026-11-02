export function getMoveReference(request: { reference?: string | null }): string {
  return request.reference || '—';
}