import { useMemo, useState } from 'react';
import { Copy, RefreshCw, Video, Lightbulb, Megaphone, LayoutTemplate, Phone } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { showToast } from '../../utils/toast';
import cityLinks from '../../data/city-links.json';
import {
  generateVideoScript, VIRAL_CONCEPTS_2026, generateGoogleAds, generateLandingStructure,
  landingSchema, generatePitch, type Audience, type CityStats,
} from '../../lib/acquisitionToolkit';

const CITIES = cityLinks as [string, string][];
type Tool = 'scripts' | 'concepts' | 'ads' | 'landing' | 'pitch';

const copy = async (text: string) => {
  try { await navigator.clipboard.writeText(text); showToast('Copié', 'success'); }
  catch { showToast('Copie impossible', 'error'); }
};

function CopyBtn({ text }: { text: string }) {
  return (
    <button onClick={() => copy(text)} className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-gray-700 hover:bg-gray-50">
      <Copy className="h-3 w-3" /> Copier
    </button>
  );
}

export default function AdminAcquisitionMachine() {
  const [tool, setTool] = useState<Tool>('scripts');
  const [slug, setSlug] = useState('lille');
  const city = CITIES.find(([s]) => s === slug)?.[1] || 'Lille';
  const [audience, setAudience] = useState<Audience>('b2c');
  const [seed, setSeed] = useState(0);
  const [stats, setStats] = useState<CityStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);

  const script = useMemo(() => generateVideoScript(audience, city, seed), [audience, city, seed]);
  const ads = useMemo(() => generateGoogleAds(city, slug), [city, slug]);
  const landing = useMemo(() => generateLandingStructure(city), [city]);
  const pitch = useMemo(() => generatePitch(city, stats), [city, stats]);

  const loadStats = async () => {
    setLoadingStats(true);
    try {
      const since = new Date(Date.now() - 90 * 864e5).toISOString();
      const [q90, open, movers] = await Promise.all([
        supabase.from('quote_requests').select('id', { count: 'exact', head: true }).ilike('from_city', `%${city}%`).is('deleted_at', null).gte('created_at', since),
        supabase.rpc('list_open_moves'),
        supabase.from('movers').select('id', { count: 'exact', head: true }).ilike('city', `%${city}%`).eq('verification_status', 'verified'),
      ]);
      if (q90.error || open.error || movers.error) throw q90.error || open.error || movers.error;
      setStats({ quotes90d: q90.count || 0, openQuotes: ((open.data as { from_city?: string | null }[]) || []).filter((m) => (m.from_city || '').toLowerCase().includes(city.toLowerCase())).length, verifiedMovers: movers.count || 0 });
    } catch {
      setStats(null);
      showToast('Chiffres indisponibles', 'error');
    } finally { setLoadingStats(false); }
  };

  const tabs: { id: Tool; label: string; icon: any }[] = [
    { id: 'scripts', label: 'Scripts vidéo', icon: Video },
    { id: 'concepts', label: 'Idées virales 2026', icon: Lightbulb },
    { id: 'ads', label: 'Annonces Google', icon: Megaphone },
    { id: 'landing', label: 'Page de capture', icon: LayoutTemplate },
    { id: 'pitch', label: 'Pitch par ville', icon: Phone },
  ];

  const scriptText = script.rows.map((r) => `[${r.time}] DIT : ${r.audio}\n   MONTRE : ${r.visual}`).join('\n') + `\n\nLégende : ${script.caption}\n${script.hashtags.join(' ')}`;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Machine d’acquisition</h2>
        <p className="text-sm text-gray-500">Scripts, annonces, pages de capture et pitchs prêts à l’emploi. Aucun chiffre inventé : les pitchs utilisent les données réelles du site.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTool(t.id)}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm ${tool === t.id ? 'bg-blue-600 text-white' : 'bg-white border text-gray-700 hover:bg-gray-50'}`}>
            <t.icon className="h-4 w-4" /> {t.label}
          </button>
        ))}
        <select value={slug} onChange={(e) => { setSlug(e.target.value); setStats(null); }} className="ml-auto rounded-md border px-2 py-1.5 text-sm">
          {CITIES.map(([s, n]) => <option key={s} value={s}>{n}</option>)}
        </select>
      </div>

      {tool === 'scripts' && (
        <div className="rounded-xl border bg-white p-4 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => setAudience('b2c')} className={`rounded-md px-3 py-1.5 text-sm ${audience === 'b2c' ? 'bg-gray-900 text-white' : 'border'}`}>Clients (B2C)</button>
            <button onClick={() => setAudience('b2b')} className={`rounded-md px-3 py-1.5 text-sm ${audience === 'b2b' ? 'bg-gray-900 text-white' : 'border'}`}>Déménageurs (B2B)</button>
            <button onClick={() => setSeed((s) => s + 1)} className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white"><RefreshCw className="h-4 w-4" /> Générer un autre script</button>
            <span className="ml-auto"><CopyBtn text={scriptText} /></span>
          </div>
          <p className="text-sm font-medium text-gray-800">{script.title}</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-gray-500 border-b"><th className="py-2 pr-3 w-24">Temps</th><th className="py-2 pr-3">Ce qu’on dit</th><th className="py-2">Ce qu’on montre</th></tr></thead>
              <tbody>
                {script.rows.map((r) => (
                  <tr key={r.time} className="border-b align-top"><td className="py-2 pr-3 font-mono text-xs">{r.time}</td><td className="py-2 pr-3">{r.audio}</td><td className="py-2 text-gray-600">{r.visual}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-500">Voix rythmée sans longues pauses, vraies images, durée 25-30 s. {script.caption} {script.hashtags.join(' ')}</p>
        </div>
      )}

      {tool === 'concepts' && (
        <div className="grid gap-3 md:grid-cols-2">
          {VIRAL_CONCEPTS_2026.map((c) => (
            <div key={c.name} className="rounded-xl border bg-white p-4">
              <div className="flex items-center justify-between"><p className="font-medium">{c.name}</p><span className="text-xs rounded-full bg-gray-100 px-2 py-0.5">{c.audience === 'b2c' ? 'Clients' : 'Déménageurs'}</span></div>
              <p className="text-sm text-gray-600 mt-1">{c.format}</p>
              <p className="text-xs text-gray-500 mt-1">{c.why}</p>
            </div>
          ))}
        </div>
      )}

      {tool === 'ads' && (
        <div className="rounded-xl border bg-white p-4 space-y-4 text-sm">
          {([['Titres (30 car. max)', ads.headlines], ['Descriptions (90 car. max)', ads.descriptions], ['Mots-clés', ads.keywords]] as [string, string[]][]).map(([label, list]) => (
            <div key={label}>
              <div className="flex items-center justify-between mb-1"><p className="font-medium">{label}</p><CopyBtn text={list.join('\n')} /></div>
              <ul className="space-y-1">{list.map((l) => <li key={l} className="flex justify-between gap-2 rounded bg-gray-50 px-2 py-1"><span>{l}</span><span className="text-xs text-gray-400">{l.length}</span></li>)}</ul>
            </div>
          ))}
          <p>URL finale : <span className="font-mono">{ads.path}</span></p>
        </div>
      )}

      {tool === 'landing' && (
        <div className="rounded-xl border bg-white p-4 space-y-3 text-sm">
          <div className="flex justify-end"><CopyBtn text={landing.map((b) => `${b.block} : ${b.content}`).join('\n')} /></div>
          <ol className="space-y-2">{landing.map((b, i) => <li key={b.block} className="rounded bg-gray-50 px-3 py-2"><span className="font-medium">{i + 1}. {b.block}</span> — {b.content}</li>)}</ol>
          <div>
            <div className="flex items-center justify-between mb-1"><p className="font-medium">Microdonnées Schema.org</p><CopyBtn text={landingSchema(city)} /></div>
            <pre className="overflow-x-auto rounded bg-gray-900 p-3 text-xs text-gray-100">{landingSchema(city)}</pre>
          </div>
        </div>
      )}

      {tool === 'pitch' && (
        <div className="rounded-xl border bg-white p-4 space-y-4 text-sm">
          <button onClick={loadStats} disabled={loadingStats} className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-3 py-1.5 text-white disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${loadingStats ? 'animate-spin' : ''}`} /> Charger les chiffres réels de {city}
          </button>
          {[['Appel téléphonique', pitch.phone], [`Email — objet : ${pitch.emailSubject}`, pitch.email]].map(([label, text]) => (
            <div key={label}>
              <div className="flex items-center justify-between mb-1"><p className="font-medium">{label}</p><CopyBtn text={text} /></div>
              <pre className="whitespace-pre-wrap rounded bg-gray-50 p-3 font-sans">{text}</pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
