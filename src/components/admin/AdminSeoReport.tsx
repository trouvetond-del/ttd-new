import { useEffect, useState } from 'react';
import { Search, CheckCircle, AlertTriangle, FileText, MapPin, Lightbulb } from 'lucide-react';
import { supabase } from '../../lib/supabase';

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
