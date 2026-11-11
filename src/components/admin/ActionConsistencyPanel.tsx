import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useActionRefresh } from '../../hooks/useActionRefresh';
type Check = { id: string; action: string; ok: boolean; created_at: string };
export default function ActionConsistencyPanel() {
  const [checks, setChecks] = useState<Check[]>([]);
  const [error, setError] = useState(false);
  const load = async () => {
    const result = await supabase.from('action_consistency_checks').select('id,action,ok,created_at').order('created_at', { ascending: false }).limit(20);
    setError(!!result.error); setChecks(result.data || []);
  };
  useEffect(() => { void load(); }, []);
  useActionRefresh(load);
  const labels: Record<string, string> = { INSERT: 'Création de demande', UPDATE: 'Modification de demande', DELETE: 'Suppression de demande', verify_trashed: 'Mise à la corbeille', verify_restored: 'Restauration', verify_completed: 'Archivage', watchdog: 'Contrôle périodique', initial_reconciliation: 'Correction des groupages existants' };
  return <section className="space-y-3">
    <h2 className="text-xl font-bold">Contrôle des demandes · Groupage · Mission</h2>
    {error ? <p role="alert">Historique des contrôles indisponible.</p> : checks.length === 0 ? <p>Aucun contrôle enregistré.</p> :
      <ul className="divide-y divide-gray-200">{checks.map(check => <li key={check.id} className="py-3 flex flex-wrap justify-between gap-2">
        <span>{labels[check.action] || 'Contrôle de demande'} · {new Date(check.created_at).toLocaleString('fr-FR')}</span>
        <strong>{check.ok ? 'Vérifié' : 'À vérifier'}</strong>
      </li>)}</ul>}
  </section>;
}