// Suivi hebdomadaire : positions Google (Search Console) + présence dans les réponses de ChatGPT.
const SITE = "https://www.trouvetondemenageur.fr/";
const GSC = "https://connector-gateway.lovable.dev/google_search_console";
const KEYWORDS = ["trouver un déménageur", "déménageur pas cher", "devis déménagement", "devis gratuit déménagement", "comparateur déménageur", "déménagement paris", "déménageur lille", "déménageur lyon", "déménageur marseille", "prix déménagement"];
const QUESTIONS = [
  "Quel site utiliser pour trouver un déménageur fiable en France ?",
  "Comment comparer plusieurs devis de déménagement gratuitement ?",
  "Quel est le meilleur comparateur de déménageurs en France ?",
  "Je cherche un déménageur pas cher à Paris, quel site me conseilles-tu ?",
  "Je déménage de Lille à Lyon, où trouver des déménageurs vérifiés ?",
  "Quelle plateforme met en relation clients et déménageurs professionnels ?",
];
const day = (d) => new Date(Date.now() - d * 864e5).toISOString().slice(0, 10);

function gscHeaders() {
  const a = process.env.LOVABLE_API_KEY, b = process.env.GOOGLE_SEARCH_CONSOLE_API_KEY;
  if (!a || !b) return null;
  return { Authorization: `Bearer ${a}`, "X-Connection-Api-Key": b, "Content-Type": "application/json" };
}

async function resolveProperty(headers) {
  const r = await fetch(`${GSC}/webmasters/v3/sites`, { headers });
  if (!r.ok) throw new Error(`Search Console [${r.status}] ${await r.text()}`);
  const target = new URL(SITE);
  const ok = ((await r.json()).siteEntry || []).filter((e) => e.permissionLevel !== "siteUnverifiedUser").filter((e) =>
    e.siteUrl.startsWith("sc-domain:") ? target.hostname.endsWith(e.siteUrl.slice(10)) : target.href.startsWith(e.siteUrl));
  return (ok.find((e) => e.siteUrl === SITE) || ok[0])?.siteUrl || null;
}

async function queryGsc(headers, site, start, end) {
  const r = await fetch(`${GSC}/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`, {
    method: "POST", headers, body: JSON.stringify({ startDate: start, endDate: end, dimensions: ["query"], rowLimit: 500 }),
  });
  if (!r.ok) throw new Error(`Search Console [${r.status}] ${await r.text()}`);
  return (await r.json()).rows || [];
}

export async function googleRankings() {
  const headers = gscHeaders();
  if (!headers) return { error: "Accès Search Console non configuré" };
  try {
    const site = await resolveProperty(headers);
    if (!site) return { error: "Aucune propriété Search Console vérifiée pour le site" };
    // Google publie les données avec ~3 jours de retard
    const [now, before] = await Promise.all([queryGsc(headers, site, day(9), day(3)), queryGsc(headers, site, day(16), day(10))]);
    const prev = new Map(before.map((r) => [r.keys[0], r.position]));
    const row = (r) => ({ query: r.keys[0], position: +r.position.toFixed(1), previous: prev.has(r.keys[0]) ? +prev.get(r.keys[0]).toFixed(1) : null, clicks: r.clicks, impressions: r.impressions });
    const top = [...now].sort((a, b) => b.impressions - a.impressions).slice(0, 25).map(row);
    const tracked = KEYWORDS.map((k) => { const r = now.find((x) => x.keys[0].toLowerCase() === k); return r ? row(r) : { query: k, position: null, previous: prev.has(k) ? +prev.get(k).toFixed(1) : null, clicks: 0, impressions: 0 }; });
    const tot = (rows, f) => rows.reduce((s, r) => s + r[f], 0);
    return { period: `${day(9)} → ${day(3)}`, clicks: tot(now, "clicks"), impressions: tot(now, "impressions"), clicks_prev: tot(before, "clicks"), impressions_prev: tot(before, "impressions"), first_page: now.filter((r) => r.position <= 10).length, top, tracked };
  } catch (e) { return { error: e.message }; }
}

export async function chatgptVisibility() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { error: "Clé OpenAI absente" };
  const results = [];
  for (const q of QUESTIONS) {
    try {
      const r = await fetch("https://api.openai.com/v1/responses", {
        method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "gpt-4o-mini", tools: [{ type: "web_search_preview", user_location: { type: "approximate", country: "FR" } }], input: q }),
      });
      if (!r.ok) throw new Error(`OpenAI [${r.status}] ${(await r.text()).slice(0, 200)}`);
      const d = await r.json();
      const msg = (d.output || []).find((o) => o.type === "message")?.content?.[0] || {};
      const text = msg.text || "";
      const urls = (msg.annotations || []).filter((a) => a.url).map((a) => a.url);
      const domains = [...new Set(urls.map((u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return null; } }).filter(Boolean))];
      const cited = /trouve\s*ton\s*d[ée]m[ée]nageur/i.test(text) || domains.some((d) => d.includes("trouvetondemenageur"));
      results.push({ question: q, cited, competitors: domains.filter((d) => !d.includes("trouvetondemenageur")).slice(0, 6) });
    } catch (e) { results.push({ question: q, cited: false, competitors: [], error: e.message }); }
  }
  return { cited_count: results.filter((r) => r.cited).length, total: results.length, results };
}
