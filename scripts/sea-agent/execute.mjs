// Exécution automatique des actions décidées par autopilot.mjs (Google Ads + Meta). Tout est journalisé dans sea_actions.
import { validAdText } from './autopilot.mjs';
const env = (k) => { if (!process.env[k]) throw new Error(`Configuration manquante : ${k}`); return process.env[k]; };
const G = () => `https://connector-gateway.lovable.dev/google_ads/v25/customers/${env('GOOGLE_ADS_CUSTOMER_ID')}`;
const gHeaders = () => ({ Authorization: `Bearer ${env('LOVABLE_API_KEY')}`, 'X-Connection-Api-Key': env('GOOGLE_ADS_API_KEY'), 'Content-Type': 'application/json' });
const CID = () => env('GOOGLE_ADS_CUSTOMER_ID');
const ACT = () => `act_${env('META_ADS_ACCOUNT_ID')}`;

async function call(url, opts) {
  const r = await fetch(url, { ...opts, signal: AbortSignal.timeout(45000) });
  const text = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status} ${text.slice(0, 300)}`);
  const d = text ? JSON.parse(text) : {};
  if (d.error) throw new Error(JSON.stringify(d.error).slice(0, 300));
  return d;
}
export const gSearch = async (query) => (await call(`${G()}/googleAds:search`, { method: 'POST', headers: gHeaders(), body: JSON.stringify({ query }) })).results || [];
const gMutate = (ops) => call(`${G()}/googleAds:mutate`, { method: 'POST', headers: gHeaders(), body: JSON.stringify({ mutateOperations: ops }) });
const mGet = (path, params = {}) => call(`https://graph.facebook.com/v26.0/${path}?${new URLSearchParams(params)}`, { headers: { Authorization: `Bearer ${env('META_ADS_TOKEN')}` } });
const mPost = (path, body) => call(`https://graph.facebook.com/v26.0/${path}`, { method: 'POST', headers: { Authorization: `Bearer ${env('META_ADS_TOKEN')}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

// Budgets jour actuels (EUR) des campagnes des deux plateformes. Budgets partagés Google : non modifiés (null).
export async function readBudgets() {
  const google = {};
  for (const r of await gSearch("SELECT campaign.id, campaign.status, campaign_budget.resource_name, campaign_budget.amount_micros, campaign_budget.explicitly_shared FROM campaign WHERE campaign.status != 'REMOVED'")) {
    const shared = !!r.campaignBudget?.explicitlyShared;
    google[r.campaign.id] = { status: r.campaign.status, budgetRn: shared ? null : r.campaignBudget?.resourceName, daily: shared ? null : Number(r.campaignBudget?.amountMicros || 0) / 1e6 };
  }
  const meta = {};
  const list = await mGet(`${ACT()}/campaigns`, { fields: 'id,status,daily_budget', limit: '100' });
  for (const c of list.data || []) meta[c.id] = { status: c.status, daily: c.daily_budget ? Number(c.daily_budget) / 100 : null };
  return { google, meta };
}

async function gpt(prompt) {
  const r = await call('https://api.openai.com/v1/chat/completions', {
    method: 'POST', headers: { Authorization: `Bearer ${env('OPENAI_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: process.env.OPENAI_MODEL || 'gpt-4.1', temperature: 0.8, response_format: { type: 'json_object' }, messages: [
      { role: 'system', content: "Tu rédiges des annonces pour TrouveTonDéménageur (www.trouvetondemenageur.fr) : plateforme française gratuite qui met en relation clients et déménageurs vérifiés (KBIS, RC Pro, URSSAF), jusqu'à 3 devis sous 24 h. Interdits : pourcentages, nombre d'avis, étoiles, « meilleur », « n°1 », « garanti », tout chiffre non prouvé, toute promesse de prix." },
      { role: 'user', content: prompt }] }),
  });
  return JSON.parse(r.choices[0].message.content);
}

async function newGoogleAd(c) {
  const rows = await gSearch(`SELECT ad_group.resource_name, ad_group_ad.ad.final_urls FROM ad_group_ad WHERE campaign.id = ${c.id} AND ad_group.status = 'ENABLED' AND ad_group_ad.status != 'REMOVED' AND ad_group_ad.ad.type = 'RESPONSIVE_SEARCH_AD' LIMIT 1`);
  if (!rows[0]) throw new Error('Aucun groupe d’annonces actif avec une annonce existante');
  const out = await gpt(`Campagne Google « ${c.name} ». Donne 12 titres (30 caractères max chacun) et 4 descriptions (90 caractères max). JSON {"headlines":[],"descriptions":[]}`);
  const h = [...new Set(out.headlines || [])].filter((t) => validAdText(t, 30)).slice(0, 15);
  const d = [...new Set(out.descriptions || [])].filter((t) => validAdText(t, 90)).slice(0, 4);
  if (h.length < 3 || d.length < 2) throw new Error('Textes IA refusés par les contrôles');
  await gMutate([{ adGroupAdOperation: { create: { adGroup: rows[0].adGroup.resourceName, status: 'ENABLED', ad: { finalUrls: rows[0].adGroupAd.ad.finalUrls, responsiveSearchAd: { headlines: h.map((text) => ({ text })), descriptions: d.map((text) => ({ text })) } } } } }]);
  return `nouvelle annonce : « ${h.slice(0, 3).join(' | ')} »`;
}

async function newMetaAd(c) {
  const ads = await mGet(`${c.id}/ads`, { fields: 'id,adset_id,effective_status,creative{object_story_spec,instagram_user_id}', limit: '50' });
  const src = (ads.data || []).find((a) => a.effective_status === 'ACTIVE' && a.creative?.object_story_spec?.video_data);
  if (!src) throw new Error('Aucune pub vidéo active à prendre comme modèle');
  const spec = src.creative.object_story_spec;
  const out = await gpt(`Pub Facebook/Instagram vidéo, campagne « ${c.name} ». JSON {"message":"texte principal 125 caractères max, finit par www.trouvetondemenageur.fr","title":"titre 40 caractères max"}`);
  if (!validAdText(out.message, 125) || !validAdText(out.title, 40)) throw new Error('Textes IA refusés par les contrôles');
  const creative = await mPost(`${ACT()}/adcreatives`, {
    name: `Auto ${new Date().toISOString().slice(0, 10)}`,
    object_story_spec: { page_id: spec.page_id, video_data: { ...spec.video_data, message: out.message, title: out.title } },
    ...(src.creative.instagram_user_id ? { instagram_user_id: src.creative.instagram_user_id } : {}),
  });
  await mPost(`${ACT()}/ads`, { name: `Auto ${new Date().toISOString().slice(0, 10)} – ${out.title}`, adset_id: src.adset_id, creative: { creative_id: creative.id }, status: 'ACTIVE' });
  return `nouvelle pub : « ${out.title} »`;
}

export async function execute(action) {
  const { type, c } = action;
  if (c.provider === 'google') {
    const rn = `customers/${CID()}/campaigns/${c.id}`;
    if (type === 'pause' || type === 'resume') { await gMutate([{ campaignOperation: { update: { resourceName: rn, status: type === 'pause' ? 'PAUSED' : 'ENABLED' }, updateMask: 'status' } }]); return type === 'pause' ? 'mise en pause' : 'relancée'; }
    if (type === 'budget') { await gMutate([{ campaignBudgetOperation: { update: { resourceName: c.budgetRn, amountMicros: String(Math.round(action.to * 1e6)) }, updateMask: 'amount_micros' } }]); return `budget ${action.from.toFixed(2)} € → ${action.to.toFixed(2)} € / jour`; }
    if (type === 'new_ad') return newGoogleAd(c);
  } else {
    if (type === 'pause' || type === 'resume') { await mPost(c.id, { status: type === 'pause' ? 'PAUSED' : 'ACTIVE' }); return type === 'pause' ? 'mise en pause' : 'relancée'; }
    if (type === 'budget') { await mPost(c.id, { daily_budget: Math.round(action.to * 100) }); return `budget ${action.from.toFixed(2)} € → ${action.to.toFixed(2)} € / jour`; }
    if (type === 'new_ad') return newMetaAd(c);
  }
  throw new Error('Action inconnue');
}
