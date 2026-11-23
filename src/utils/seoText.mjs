// Limites SEO communes au site (navigateur) et aux scripts de génération des
// pages statiques : titre <= 60 caractères, description <= 160 caractères.
export const TITLE_MAX = 60;
export const DESCRIPTION_MAX = 160;
const BRAND_SUFFIX = /\s*[|—–-]\s*TrouveTonD[ée]m[ée]nageur(\.fr)?\s*$/i;
const SEPARATORS = [' : ', ' — ', ' – ', ' | ', ', '];

function cutAtWord(text, max) {
  if (text.length <= max) return text;
  const slice = text.slice(0, max + 1);
  const space = slice.lastIndexOf(' ');
  return (space > max * 0.6 ? slice.slice(0, space) : text.slice(0, max)).replace(/[\s,;:—–|-]+$/, '');
}

export function fitTitle(raw, max = TITLE_MAX) {
  const title = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (title.length <= max) return title;
  const withoutBrand = title.replace(BRAND_SUFFIX, '').trim();
  if (withoutBrand.length <= max) return withoutBrand;
  let best = '';
  for (const sep of SEPARATORS) {
    let index = withoutBrand.lastIndexOf(sep, max);
    while (index > 0 && index > max) index = withoutBrand.lastIndexOf(sep, index - 1);
    if (index >= 30 && index <= max && index > best.length) best = withoutBrand.slice(0, index);
  }
  return best || cutAtWord(withoutBrand, max);
}

export function fitDescription(raw, max = DESCRIPTION_MAX) {
  const text = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  const slice = text.slice(0, max);
  const sentenceEnd = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('! '), slice.lastIndexOf('? '));
  if (sentenceEnd >= 100) return slice.slice(0, sentenceEnd + 1);
  return `${cutAtWord(text, max - 1).replace(/[.,;:]+$/, '')}…`;
}
