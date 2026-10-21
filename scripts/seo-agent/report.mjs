// Agent SEO — rapport hebdomadaire (table `seo_reports`, affiché dans l'admin « Rapport SEO »).
// Vérifie chaque page du plan du site telle que Google la reçoit (HTML brut, sans JavaScript).
import { createClient } from "@supabase/supabase-js";

const env = (k) => { const v = process.env[k]; if (!v) throw new Error(`${k} manquant`); return v; };
const sb = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
const SITE = "https://www.trouvetondemenageur.fr";

async function check(url) {
  try {
    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" }, redirect: "follow" });
    const html = await r.text();
    const title = (html.match(/<title>([\s\S]*?)<\/title>/i) || [])[1]?.trim() || "";
    const h1 = (html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1]?.replace(/<[^>]+>/g, "").trim() || "";
    const words = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
    const noindex = /<meta[^>]+name="robots"[^>]+noindex/i.test(html);
    const problems = [];
    if (r.status !== 200) problems.push(`erreur ${r.status}`);
    if (!title) problems.push("titre manquant");
    if (!h1) problems.push("pas de titre principal visible sans JavaScript");
    if (words < 250) problems.push(`texte trop court (${words} mots)`);
    if (noindex) problems.push("bloquée pour Google (noindex)");
    return { url, status: r.status, title, words, problems };
  } catch (e) {
    return { url, status: 0, title: "", words: 0, problems: [`inaccessible : ${e.message}`] };
  }
}

export async function weeklyReport(newArticles = []) {
  const xml = await (await fetch(`${SITE}/sitemap.xml`)).text();
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  const pages = [];
  for (const u of urls) pages.push(await check(u));

  const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString();
  const [{ count: newCities }, { count: totalArticles }, { data: weekArticles }] = await Promise.all([
    sb.from("city_pages").select("*", { count: "exact", head: true }).eq("statut", "published").gte("created_at", weekAgo),
    sb.from("articles").select("*", { count: "exact", head: true }).eq("statut", "publie"),
    sb.from("articles").select("titre, slug").eq("statut", "publie").gte("created_at", weekAgo),
  ]);

  const withProblems = pages.filter((p) => p.problems.length);
  const summary = {
    total_pages: urls.length,
    city_pages: urls.filter((u) => u.includes("/demenagement/")).length,
    blog_articles: totalArticles || 0,
    pages_ok: pages.length - withProblems.length,
    pages_with_problems: withProblems.length,
    new_city_pages: newCities || 0,
    new_articles: (weekArticles || []).map((a) => ({ titre: a.titre, url: `/blog/${a.slug}` })),
  };
  const recommendations = [];
  if (withProblems.length) recommendations.push(`${withProblems.length} page(s) à corriger (voir la liste).`);
  if ((weekArticles || []).length < 2) recommendations.push("Moins de 2 nouveaux articles cette semaine : relancer l'agent SEO.");
  recommendations.push("Partager les nouveaux articles sur Facebook et Instagram pour accélérer leur découverte par Google.");
  recommendations.push("Demander à chaque client satisfait un avis Trustpilot : les avis renforcent la confiance de Google.");

  const { error } = await sb.from("seo_reports").insert({ summary, pages: withProblems, recommendations });
  if (error) throw new Error(`Enregistrement rapport : ${error.message}`);
  console.log("[seo-report]", JSON.stringify(summary));
  return summary;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  weeklyReport().catch((e) => { console.error(e); process.exit(1); });
}
