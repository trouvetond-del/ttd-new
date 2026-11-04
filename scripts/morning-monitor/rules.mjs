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
// Ranks the owner's real priorities from measured data; unknown metrics are reported, never guessed.
export function priorities(m, problems = []) {
  const out = [];
  if (problems.length) out.push({ score: 100, text: `Réparer d’abord ${problems.length} contrôle(s) en alerte ci-dessus : ${problems.slice(0,3).map(p=>p.name).join(', ')}.` });
  if (m.unquoted > 0) out.push({ score: 90 + m.unquoted, text: `${m.unquoted} demande(s) complète(s) sans aucun devis depuis plus de 48 h : relancer ou appeler des déménageurs de la zone.` });
  if (m.drafts > 0) out.push({ score: 80 + m.drafts, text: `${m.drafts} demande(s) inachevée(s) sur 7 jours : appeler ces personnes pour finir leur demande.` });
  if (m.requests === 0) out.push({ score: 75, text: 'Aucune demande complète sur 7 jours : vérifier le parcours de devis et la publicité avant tout nouveau contenu.' });
  if (m.calcRequests > 0 && m.calcQuoted === 0) out.push({ score: 60, text: `${m.calcRequests} demande(s) venues du calculateur, aucune n’a reçu de devis : les suivre en priorité.` });
  if (m.articles != null && m.articles < 7) out.push({ score: 50, text: `Seulement ${m.articles} article(s) SEO/GEO publiés sur 7 jours (objectif 7) : relancer l’agent SEO.` });
  if (m.studioPublished != null && m.studioExpected && m.studioPublished < m.studioExpected) out.push({ score: 45, text: `${m.studioPublished}/${m.studioExpected} articles et vidéos du Studio publiés sur 7 jours : compléter les manquants.` });
  if (!out.length) out.push({ score: 10, text: 'Aucune urgence mesurée : enrichir une page ville avec des conseils locaux et demander un avis Trustpilot aux clients réellement déménagés.' });
  const unknown = Object.entries(m).filter(([, v]) => v == null).map(([k]) => k);
  return { list: out.sort((a,b)=>b.score-a.score).slice(0,3).map(p=>p.text), unknown };
}
