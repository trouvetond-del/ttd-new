import { useEffect, useState } from 'react';
import { Activity, ShieldAlert, Unlock, Loader } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { showToast } from '../../utils/toast';
import { FraudAlertsPanel } from '../FraudAlertsPanel';

type HealthCheck = { id: string; checked_at: string; status: 'ok' | 'warning' | 'critical'; issues: { level: string; message: string }[]; ai_summary: string | null };
type BlockedAlert = { id: string; created_at: string; severity: string; details: { reason?: string } };

const STATUS_STYLE = {
  ok: 'bg-green-100 text-green-800',
  warning: 'bg-orange-100 text-orange-800',
  critical: 'bg-red-100 text-red-800',
};
const STATUS_LABEL = { ok: 'Tout fonctionne', warning: 'Attention', critical: 'Critique' };

export default function AdminSecurityAgents() {
  const [checks, setChecks] = useState<HealthCheck[]>([]);
  const [blocked, setBlocked] = useState<BlockedAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [unblocking, setUnblocking] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const [h, b] = await Promise.all([
      supabase.from('system_health_checks').select('*').order('checked_at', { ascending: false }).limit(20),
      supabase.from('fraud_alerts').select('id, created_at, severity, details').eq('auto_blocked', true).order('created_at', { ascending: false }).limit(50),
    ]);
    setChecks((h.data as HealthCheck[]) ?? []);
    setBlocked((b.data as BlockedAlert[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const unblock = async (alertId: string) => {
    if (!confirm('Débloquer ce compte ? Faites-le seulement si vous êtes sûr que ce n\'est pas une fraude.')) return;
    setUnblocking(alertId);
    const { error } = await supabase.functions.invoke('admin-unblock-user', { body: { alertId } });
    setUnblocking(null);
    if (error) showToast('Déblocage impossible : ' + error.message, 'error');
    else { showToast('Compte débloqué', 'success'); load(); }
  };

  const last = checks[0];

  return (
    <div className="space-y-8">
      <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center gap-3 mb-4">
          <Activity className="w-6 h-6 text-blue-600" />
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Agent de surveillance (toutes les 15 min)</h2>
        </div>
        {loading ? <Loader className="w-6 h-6 animate-spin text-blue-600" /> : !last ? (
          <p className="text-gray-600 dark:text-gray-400">Aucune vérification pour l'instant. La première arrive dans les 15 minutes après la mise en service.</p>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-3">
              <span className={`px-3 py-1 rounded-full text-sm font-semibold ${STATUS_STYLE[last.status]}`}>{STATUS_LABEL[last.status]}</span>
              <span className="text-sm text-gray-500">Dernière vérification : {new Date(last.checked_at).toLocaleString('fr-FR')}</span>
            </div>
            {last.ai_summary && <p className="text-gray-700 dark:text-gray-300 mb-3">{last.ai_summary}</p>}
            {last.issues?.length > 0 && (
              <ul className="list-disc pl-5 text-sm text-gray-700 dark:text-gray-300 space-y-1">
                {last.issues.map((i, k) => <li key={k}>{i.message}</li>)}
              </ul>
            )}
            <div className="mt-4 flex flex-wrap gap-1">
              {checks.slice().reverse().map((c) => (
                <span key={c.id} title={new Date(c.checked_at).toLocaleString('fr-FR')}
                  className={`w-3 h-6 rounded ${c.status === 'ok' ? 'bg-green-500' : c.status === 'warning' ? 'bg-orange-400' : 'bg-red-500'}`} />
              ))}
            </div>
          </>
        )}
      </section>

      <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center gap-3 mb-4">
          <ShieldAlert className="w-6 h-6 text-red-600" />
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Comptes bloqués automatiquement</h2>
        </div>
        {blocked.length === 0 ? (
          <p className="text-gray-600 dark:text-gray-400">Aucun compte bloqué.</p>
        ) : (
          <ul className="divide-y divide-gray-200 dark:divide-gray-700">
            {blocked.map((b) => (
              <li key={b.id} className="py-3 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm text-gray-900 dark:text-white">{b.details?.reason}</p>
                  <p className="text-xs text-gray-500">{new Date(b.created_at).toLocaleString('fr-FR')}</p>
                </div>
                <button onClick={() => unblock(b.id)} disabled={unblocking === b.id}
                  className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50">
                  <Unlock className="w-4 h-4" /> Débloquer
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <FraudAlertsPanel />
    </div>
  );
}
