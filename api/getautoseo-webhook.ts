// api/getautoseo-webhook.ts - Vercel Serverless Function
// Reçoit les événements article.published / article.updated de GetAutoSEO
// et fait un upsert dans la table Supabase `articles` (clé : slug)

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// Clé service_role : bypass les RLS, à utiliser uniquement côté serveur
const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const WEBHOOK_SECRET = process.env.GETAUTOSEO_WEBHOOK_SECRET!;

function cleanMarkdownFences(text: string | null | undefined): string {
  if (!text) return '';
  return text
    .replace(/^```html?\n?/gim, '')
    .replace(/^```\s*$/gim, '')
    .trim();
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // enlève les accents
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Vérification du Bearer token
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!WEBHOOK_SECRET || token !== WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const body = req.body || {};
    console.log('GetAutoSEO webhook reçu:', JSON.stringify(body).substring(0, 2000));

    // GetAutoSEO envoie un événement article.published ou article.updated
    const event = req.headers['x-autoseo-event'] || body.event || '';
    const article = body.article || body.data || body;

    const titre = article.title || article.titre || null;
    const contenu = cleanMarkdownFences(article.content || article.contenu || null);
    const slugRaw = article.slug || (titre ? slugify(titre) : null);

    if (!titre || !contenu || !slugRaw) {
      // Payload incomplet : probablement un "Send Test" de connectivité,
      // pas un vrai article. On log pour debug, mais on répond 200
      // (un test de connectivité ne doit jamais être bloquant).
      console.log('GetAutoSEO webhook: payload incomplet reçu (probablement un test)', JSON.stringify(body));
      return res.status(200).json({
        success: true,
        note: 'Requête reçue et authentifiée, mais champs article incomplets — aucun article créé.',
        received_keys: Object.keys(body),
      });
    }

    const record = {
      titre: String(titre).substring(0, 200),
      contenu,
      mot_cle: article.keyword || article.mot_cle || null,
      ville: article.city || article.ville || null,
      type_article: article.type || article.type_article || 'Guide',
      slug: slugRaw,
      statut: 'publie',
    };

    const { data, error } = await supabase
      .from('articles')
      .upsert(record, { onConflict: 'slug' })
      .select();

    if (error) {
      console.error('Supabase upsert error:', error);
      return res.status(500).json({ error: 'Database error', details: error.message });
    }

    return res.status(200).json({ success: true, event, article: data?.[0] ?? null });
  } catch (err: any) {
    console.error('Webhook processing error:', err);
    return res.status(500).json({ error: 'Internal error', details: err.message });
  }
}
