import { useEffect } from 'react';
import { fitDescription, fitTitle } from '../utils/seoText.mjs';

// Garde chaque page dans les limites SEO (titre <= 60, description <= 160)
// et recopie titre/description dans les balises d'aperçu Open Graph et Twitter,
// quelle que soit la page qui les a définis.
function upsertMeta(attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  if (el.getAttribute('content') !== content) el.setAttribute('content', content);
}

function normalize() {
  const title = fitTitle(document.title);
  if (title && document.title !== title) document.title = title;
  const descEl = document.head.querySelector<HTMLMetaElement>('meta[name="description"]');
  const description = fitDescription(descEl?.getAttribute('content'));
  if (descEl && descEl.getAttribute('content') !== description) descEl.setAttribute('content', description);
  if (title) {
    upsertMeta('property', 'og:title', title);
    upsertMeta('name', 'twitter:title', title);
  }
  if (description) {
    upsertMeta('property', 'og:description', description);
    upsertMeta('name', 'twitter:description', description);
  }
  upsertMeta('name', 'twitter:card', 'summary_large_image');
  const image = document.head.querySelector('meta[property="og:image"]')?.getAttribute('content');
  if (image) upsertMeta('name', 'twitter:image', image);
}

export function SeoNormalizer() {
  useEffect(() => {
    let scheduled = 0;
    const run = () => {
      cancelAnimationFrame(scheduled);
      scheduled = requestAnimationFrame(normalize);
    };
    normalize();
    const observer = new MutationObserver(run);
    observer.observe(document.head, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['content'] });
    return () => { observer.disconnect(); cancelAnimationFrame(scheduled); };
  }, []);
  return null;
}
