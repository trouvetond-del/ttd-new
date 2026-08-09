// api/getautoseo-webhook.ts - Vercel Serverless Function
// Reçoit les événements article.published / article.updated / test de GetAutoSEO
// (https://getautoseo.com) et fait un upsert dans la table Supabase `articles`
// (clé : slug). Schéma du payload confirmé via getautoseo.com/integrations.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// Clé service_role : bypass les RLS, à utiliser uniquement côté serveur
const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const WEBHOOK_SECRET = process.env.GETAUTOSEO_WEBHOOK_SECRET!;
const SITE_URL = 'https://www.trouvetondemenageur.fr';

function cleanMarkdownFences(text: string | null | undefined): string {
  if (!text) return '';
  return text
    .replace(/^```html?\n?/gim, '')
    .replace(/^```\s*$/gim, '')
    .trim();
}

// Détecte les 3 signatures exactes des 8 articles corrompus trouvés en base
// le 09/08 : titre vide, slug anormalement long (le contenu HTML entier
// s'était retrouvé collé dans le champ slug), ou balises ```html/```
// résiduelles non nettoyées dans le contenu final. Un article qui matche
// l'un de ces critères est mis en 'brouillon' au lieu de 'publie' -- il
// reste dans la table (rien n'est perdu, relecture manuelle possible)
// mais n'est plus jamais visible publiquement ni soumis au sitemap
// (cf. filtres statut='publie' ajoutés dans Blog.tsx / BlogArticle.tsx /
// api/sitemap.ts). Une seule contrainte à la fois signalée dans la
// réponse pour faciliter le diagnostic si GetAutoSEO doit être notifié.
function detectCorruption(titre: string, slug: string, contenuHtml: string): string | null {
  if (!titre || titre.trim().length === 0) {
    return 'titre vide';
  }
  if (!slug || slug.length > 100) {
    return `slug invalide (longueur ${slug?.length ?? 0}, max 100)`;
  }
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return 'slug contient des caractères hors [a-z0-9-] (probable contenu HTML collé dans le slug)';
  }
  if (/```/.test(contenuHtml) || /<\/?(html|body|article)>/i.test(contenuHtml)) {
    return 'balises markdown (```) ou HTML de structure (<html>/<body>/<article>) résiduelles dans le contenu';
  }
  return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Vérification du Bearer token (obligatoire selon la doc GetAutoSEO)
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!WEBHOOK_SECRET || token !== WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const body = req.body || {};
    console.log('GetAutoSEO webhook reçu:', JSON.stringify(body).substring(0, 2000));

    // Champs exacts documentés par GetAutoSEO (Payload Fields)
    const event: string = body.event || ''; // 'article.published' | 'article.updated' | 'test'
    const titre: string | null = body.title || null;
    const slug: string | null = body.slug || null;
    const contenuHtml: string = cleanMarkdownFences(body.content_html || body.content_markdown || null);

    // GetAutoSEO ne fournit pas de champ "ville" (ciblage local) : on laisse
    // NULL, il faudra le renseigner manuellement si besoin plus tard.
    const keywordsArr: string[] = Array.isArray(body.keywords) ? body.keywords : [];
    const motCle = keywordsArr.length > 0 ? keywordsArr.join(', ') : (body.metaKeywords || null);

    // "test" (Send Test) ou payload incomplet : on répond 200 sans écrire en base
    if (event === 'test' || !titre || !slug || !contenuHtml) {
      console.log('GetAutoSEO webhook: event de test ou payload incomplet, aucun article créé');
      return res.status(200).json({
        success: true,
        note: 'Requête reçue et authentifiée. Aucun article créé (test ou champs incomplets).',
      });
    }

    const record = {
      titre: titre.substring(0, 200),
      contenu: contenuHtml,
      mot_cle: motCle,
      ville: null,
      type_article: 'Guide',
      slug,
      statut: 'publie',
    };

    const corruptionReason = detectCorruption(record.titre, record.slug, record.contenu);
    if (corruptionReason) {
      console.warn(`GetAutoSEO webhook: article mis en brouillon (${corruptionReason})`, { slug, titre });
      record.statut = 'brouillon';
    }

    const { data, error } = await supabase
      .from('articles')
      .upsert(record, { onConflict: 'slug' })
      .select();

    if (error) {
      console.error('Supabase upsert error:', error);
      return res.status(500).json({ error: 'Database error', details: error.message });
    }

    // Format de réponse recommandé par GetAutoSEO : renvoyer l'URL publiée
    // pour qu'ils affichent un lien "View Live" dans leur dashboard.
    const publishedUrl = body.published_url || `${SITE_URL}/blog/${slug}`;

    return res.status(200).json({
      success: true,
      url: publishedUrl,
      event,
      article: data?.[0] ?? null,
      ...(corruptionReason ? {
        warning: `Article reçu mais mis en brouillon (non publié) : ${corruptionReason}. Relecture manuelle nécessaire avant publication.`,
      } : {}),
    });
  } catch (err: any) {
    console.error('Webhook processing error:', err);
    return res.status(500).json({ error: 'Internal error', details: err.message });
  }
}
