import { useEffect, useState } from 'react';
import { Search, CheckCircle, AlertTriangle, FileText, MapPin, Lightbulb, TrendingUp, Bot } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface Rank { query: string; position: number | null; previous: number | null; clicks: number; impressions: number }

function Trend({ r }: { r: Rank }) {
  if (r.position == null) return <span className="text-gray-400">pas encore classé</span>;
  if (r.previous == null) return <span className="text-blue-600">nouveau</span>;
  const d = +(r.previous - r.position).toFixed(1);
  if (d > 0) return <span className="text-green-600">▲ {d}</span>;
  if (d < 0) return <span className="text-red-600">▼ {-d}</span>;
  return <span className="text-gray-500">=</span>;
}

function RankTable({ rows }: { rows: Rank[] }) {
  return (
    <div className="overflow-x-auto"><table className="w-full text-sm">
      <thead><tr className="text-left text-gray-500"><th className="py-2">Recherche Google</th><th>Position</th><th>Évolution</th><th>Affichages</th><th>Clics</th></tr></thead>
      <tbody className="divide-y divide-gray-100">{rows.map((r) => (
        <tr key={r.query}><td className="py-2 text-gray-900">{r.query}</td><td className={r.position != null && r.position <= 10 ? 'font-bold text-green-700' : ''}>{r.position ?? '—'}</td><td><Trend r={r} /></td><td>{r.impressions}</td><td>{r.clicks}</td></tr>
      ))}</tbody>
    </table></div>
  );
}

interface Report {
  id: string;
  created_at: string;
  summary: {
    total_pages?: number;
    city_pages?: number;
    blog_articles?: number;
    pages_ok?: number;
    pages_with_problems?: number;
    new_articles?: { titre: string; url: string }[];
    rankings?: { error?: string; period?: string; clicks?: number; impressions?: number; clicks_prev?: number; impressions_prev?: number; first_page?: number; top?: Rank[]; tracked?: Rank[] };
    chatgpt?: { error?: string; cited_count?: number; total?: number; results?: { question: string; cited: boolean; competitors: string[]; error?: string }[] };
  };
  pages: { url: string; problems: string[] }[];
  recommendations: string[];
}

export default function AdminSeoReport() {
  const [reports, setReports] = useState<Report[]>([]);
  const [selected, setSelected] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from('seo_reports').select('*').order('created_at', { ascending: false }).limit(12)
      .then(({ data }) => {
        setReports((data as Report[]) || []);
        setSelected(((data as Report[]) || [])[0] || null);
        setLoading(false);
      });
  }, []);

  if (loading) return <div className="p-8 text-gray-500">Chargement du rapport SEO…</div>;

  if (!selected) {
    return (
      <div className="bg-white rounded-2xl shadow p-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-2 flex items-center gap-2"><Search className="w-6 h-6 text-blue-600" /> Rapport SEO</h2>
        <p className="text-gray-600">Le premier rapport arrive lundi à 8 h. L'agent SEO publie 2 articles par semaine et vérifie chaque page vue par Google.</p>
      </div>
    );
  }

  const s = selected.summary || {};
  const cards = [
    { label: 'Pages connues de Google', value: s.total_pages ?? 0, icon: FileText, color: 'text-blue-600' },
    { label: 'Pages ville', value: s.city_pages ?? 0, icon: MapPin, color: 'text-emerald-600' },
    { label: 'Articles de blog', value: s.blog_articles ?? 0, icon: FileText, color: 'text-violet-600' },
    { label: 'Pages sans problème', value: s.pages_ok ?? 0, icon: CheckCircle, color: 'text-green-600' },
    { label: 'Pages à corriger', value: s.pages_with_problems ?? 0, icon: AlertTriangle, color: 'text-amber-600' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Search className="w-6 h-6 text-blue-600" /> Rapport SEO hebdomadaire</h2>
        <select
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm"
          value={selected.id}
          onChange={(e) => setSelected(reports.find((r) => r.id === e.target.value) || null)}
        >
          {reports.map((r) => (
            <option key={r.id} value={r.id}>Semaine du {new Date(r.created_at).toLocaleDateString('fr-FR')}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {cards.map((c) => (
          <div key={c.label} className="bg-white rounded-2xl shadow p-5">
            <c.icon className={`w-5 h-5 ${c.color} mb-2`} />
            <div className="text-3xl font-extrabold text-gray-900">{c.value}</div>
            <div className="text-sm text-gray-500">{c.label}</div>
          </div>
        ))}
      </div>

      {(s.new_articles || []).length > 0 && (
        <div className="bg-white rounded-2xl shadow p-6">
          <h3 className="font-bold text-gray-900 mb-3">Nouveaux articles cette semaine</h3>
          <ul className="space-y-2">
            {s.new_articles!.map((a) => (
              <li key={a.url}><a href={a.url} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline">{a.titre}</a></li>
            ))}
          </ul>
        </div>
      )}

      {s.rankings && (
        <div className="bg-white rounded-2xl shadow p-6 space-y-4">
          <h3 className="font-bold text-gray-900 flex items-center gap-2"><TrendingUp className="w-5 h-5 text-blue-600" /> Positions Google {s.rankings.period && <span className="text-sm font-normal text-gray-500">({s.rankings.period})</span>}</h3>
          {s.rankings.error ? <p className="text-amber-700">Suivi indisponible : {s.rankings.error}</p> : (<>
            <div className="flex flex-wrap gap-6 text-sm text-gray-700">
              <div><b className="text-xl text-gray-900">{s.rankings.impressions}</b> affichages <span className="text-gray-400">(sem. préc. {s.rankings.impressions_prev})</span></div>
              <div><b className="text-xl text-gray-900">{s.rankings.clicks}</b> clics <span className="text-gray-400">(sem. préc. {s.rankings.clicks_prev})</span></div>
              <div><b className="text-xl text-gray-900">{s.rankings.first_page}</b> recherches en 1re page</div>
            </div>
            <div><h4 className="font-semibold text-gray-800 mb-1">Vos mots-clés principaux</h4><RankTable rows={s.rankings.tracked || []} /></div>
            <div><h4 className="font-semibold text-gray-800 mb-1">Recherches qui vous affichent le plus</h4><RankTable rows={s.rankings.top || []} /></div>
          </>)}
        </div>
      )}

      {s.chatgpt && (
        <div className="bg-white rounded-2xl shadow p-6">
          <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2"><Bot className="w-5 h-5 text-emerald-600" /> Présence dans ChatGPT {!s.chatgpt.error && <span className="text-sm font-normal text-gray-500">— cité {s.chatgpt.cited_count}/{s.chatgpt.total} fois</span>}</h3>
          {s.chatgpt.error ? <p className="text-amber-700">Suivi indisponible : {s.chatgpt.error}</p> : (
            <ul className="divide-y divide-gray-100">{(s.chatgpt.results || []).map((q) => (
              <li key={q.question} className="py-3 text-sm">
                <div className="flex items-start gap-2"><span>{q.cited ? '✅' : '❌'}</span><span className="text-gray-900">{q.question}</span></div>
                {q.competitors.length > 0 && <div className="text-gray-500 pl-6">Sites cités à la place : {q.competitors.join(', ')}</div>}
                {q.error && <div className="text-amber-700 pl-6">Question non testée cette semaine</div>}
              </li>
            ))}</ul>
          )}
        </div>
      )}

      <div className="bg-white rounded-2xl shadow p-6">
        <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2"><Lightbulb className="w-5 h-5 text-amber-500" /> Conseils de l'agent</h3>
        <ul className="list-disc pl-6 space-y-1 text-gray-700">
          {(selected.recommendations || []).map((r) => <li key={r}>{r}</li>)}
        </ul>
      </div>

      <div className="bg-white rounded-2xl shadow p-6">
        <h3 className="font-bold text-gray-900 mb-3">Pages à corriger</h3>
        {(selected.pages || []).length === 0 ? (
          <p className="text-green-700">Aucun problème détecté.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {selected.pages.map((p) => (
              <li key={p.url} className="py-3">
                <a href={p.url} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline text-sm break-all">{p.url}</a>
                <div className="text-sm text-amber-700">{p.problems.join(' · ')}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

