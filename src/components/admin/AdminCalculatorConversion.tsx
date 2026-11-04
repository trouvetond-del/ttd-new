import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Calculator, RefreshCw } from 'lucide-react';
import { computeConversion, type ConversionStats } from '../../utils/calculatorConversion';

async function load(source: 'calculateur' | null): Promise<ConversionStats> {
  let q = supabase.from('quote_requests').select('id, accepted_quote_id').eq('is_draft', false);
  q = source ? q.eq('acquisition_source', source) : q;
  const { data: requests, error } = await q.limit(5000);
  if (error) throw error;
  const ids = (requests || []).map(r => r.id);
  let quotes: { quote_request_id: string; status: string | null }[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error: e } = await supabase.from('quotes').select('quote_request_id, status').in('quote_request_id', ids.slice(i, i + 200));
    if (e) throw e;
    quotes = quotes.concat(data || []);
  }
  return computeConversion(requests || [], quotes);
}

export default function AdminCalculatorConversion() {
  const [calc, setCalc] = useState<ConversionStats | null>(null);
  const [all, setAll] = useState<ConversionStats | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true); setError('');
    try { const [c, a] = await Promise.all([load('calculateur'), load(null)]); setCalc(c); setAll(a); }
    catch (e: any) { setError(e?.message || 'Erreur de chargement'); }
    finally { setLoading(false); }
  };
  useEffect(() => { refresh(); }, []);

  const Stat = ({ label, value, sub }: { label: string; value: string; sub?: string }) => (
    <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-4">
      <p className="text-sm text-gray-500 dark:text-gray-300">{label}</p>
      <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
      {sub && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{sub}</p>}
    </div>
  );

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2"><Calculator className="w-5 h-5 text-blue-600" /> Calculateur de prix → devis réels</h3>
        <button onClick={refresh} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700" aria-label="Actualiser"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button>
      </div>
      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
      {calc && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat label="Demandes venues du calculateur" value={String(calc.requests)} />
          <Stat label="Avec au moins un devis réel" value={String(calc.withRealQuote)} />
          <Stat label="Taux devis → devis réel" value={`${calc.quoteRate} %`} sub={all ? `Toutes demandes : ${all.quoteRate} %` : undefined} />
          <Stat label="Devis acceptés" value={`${calc.accepted} (${calc.acceptRate} %)`} sub={all ? `Toutes demandes : ${all.acceptRate} %` : undefined} />
        </div>
      )}
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">Suivi à partir du 4 novembre 2026 : seules les demandes envoyées après un clic sur le calculateur sont comptées.</p>
    </div>
  );
}
