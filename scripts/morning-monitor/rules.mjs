export function parisDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
export function expectedKinds(day) {
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
  return [ ...([1, 3, 5].includes(weekday) ? ['article_client'] : [2, 4, 6].includes(weekday) ? ['article_mover'] : []), ...(weekday === 3 ? ['video_client'] : weekday === 0 ? ['video_mover'] : []) ];
}
export function slotResult(rows, kind) {
  const row = rows.find(r => r.kind === kind);
  if (!row) return { status: 'warning', detail: 'Absent du Studio pour ce jour.' };
  if (row.status === 'failed') return { status: 'warning', detail: 'Génération ou publication en échec.' };
  const media = kind.startsWith('video_') ? row.video_url : row.image_urls?.length && row.body;
  if (!media) return { status: 'warning', detail: 'Contenu incomplet dans le Studio.' };
  if (row.status !== 'published' || !row.published_at) return { status: 'warning', detail: 'Présent dans le Studio, pas encore publié.' };
  if (!row.fb_post_id || !row.ig_media_id) return { status: 'warning', detail: 'Publication Facebook/Instagram partiellement confirmée.' };
  return { status: 'ok', detail: 'Contenu complet et publications Facebook/Instagram enregistrées (visibilité externe non auditée).' };
}
export const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
