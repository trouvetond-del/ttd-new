import { useState, useEffect } from 'react';
import { AlertTriangle, Shield, CheckCircle, XCircle, Eye, Loader } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { showToast } from '../utils/toast';

type FraudAlert = {
  id: string;
  user_id: string;
  alert_type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  details: any;
  status: 'new' | 'investigating' | 'resolved' | 'false_positive';
  created_at: string;
  resolved_at?: string;
};

const ALERT_TYPE_LABELS: Record<string, string> = {
  duplicate_document: 'Document en double',
  suspicious_activity: 'Activité suspecte',
  fake_id: 'Faux document',
  multiple_accounts: 'Comptes multiples',
  payment_fraud: 'Fraude au paiement',
  location_mismatch: 'Incohérence de localisation',
  fake_mover: 'Faux déménageur',
  fake_client: 'Faux client',
  site_attack: 'Attaque / robot',
  disposable_email: 'Email jetable',
};


const STATUS_LABELS: Record<string, string> = {
  new: 'Nouvelle', investigating: 'En vérification', resolved: 'Résolue', false_positive: 'Fausse alerte',
};
const SEVERITY_LABELS: Record<string, string> = {
  low: 'Faible', medium: 'Moyenne', high: 'Élevée', critical: 'Critique',
};

// Explication en français simple : ce qui s'est passé et quoi faire.
export function explainAlert(a: { alert_type: string; details: any }): { cause: string; action: string } {
  const d = a.details ?? {};
  const siret = String(d.siret ?? '');
  if (a.alert_type === 'fake_mover' && siret.startsWith('PENDING-')) {
    return {
      cause: "Ce n'est pas une fraude : ce déménageur a commencé son inscription mais n'a pas encore saisi son numéro SIRET (inscription non terminée).",
      action: "Aucune action urgente. Il reçoit déjà des relances automatiques pour terminer son profil. Vous pouvez classer en « Faux positif ».",
    };
  }
  switch (a.alert_type) {
    case 'fake_mover':
      return { cause: `Le numéro SIRET déclaré${siret ? ` (${siret})` : ''} n'est pas un numéro valide : il ne correspond à aucune entreprise possible.`,
        action: "Vérifiez le SIRET sur annuaire-entreprises.data.gouv.fr et comparez avec le KBIS. Si c'est une faute de frappe, demandez une correction au déménageur." };
    case 'disposable_email':
      return { cause: `Le compte a été créé avec une adresse email temporaire${d.email ? ` (${d.email})` : ''}, souvent utilisée pour les faux comptes. Le compte a été bloqué automatiquement.`,
        action: "Si la personne est réelle, débloquez le compte et demandez-lui une vraie adresse email." };
    case 'multiple_accounts':
      return { cause: `Plusieurs comptes utilisent le même numéro de téléphone${d.phone ? ` (${d.phone})` : ''}.`,
        action: "Vérifiez s'il s'agit de la même entreprise inscrite plusieurs fois ou d'un doublon volontaire." };
    case 'fake_client':
      return { cause: `Un même compte a créé un nombre anormal de demandes de devis en peu de temps${d.count ? ` (${d.count} en 1 heure)` : ''}.`,
        action: "Regardez les demandes : si ce sont des doublons ou des fausses demandes, supprimez-les." };
    case 'payment_fraud':
      return { cause: d.failed ? `${d.failed} paiements refusés en 24 h pour le même client : possible test de cartes volées.` : "Nombre anormal de remboursements pour le même client.",
        action: "Vérifiez l'historique de paiement du client avant d'accepter de nouvelles réservations." };
    case 'site_attack':
      return { cause: `Beaucoup de comptes créés depuis la même connexion internet${d.signups ? ` (${d.signups} en 1 heure)` : ''} : probablement un robot.`,
        action: "Vérifiez les comptes créés récemment et supprimez les faux." };
    default:
      return { cause: d.reason || d.message || "Activité inhabituelle détectée.", action: "Vérifiez le compte concerné." };
  }
}

const SEVERITY_COLORS = {
  low: 'bg-yellow-100 border-yellow-300 text-yellow-800',
  medium: 'bg-orange-100 border-orange-300 text-orange-800',
  high: 'bg-red-100 border-red-300 text-red-800',
  critical: 'bg-purple-100 border-purple-300 text-purple-800',
};

const STATUS_COLORS = {
  new: 'bg-blue-100 text-blue-800',
  investigating: 'bg-yellow-100 text-yellow-800',
  resolved: 'bg-green-100 text-green-800',
  false_positive: 'bg-gray-100 text-gray-800',
};

export function FraudAlertsPanel() {
  const [alerts, setAlerts] = useState<FraudAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAlert, setSelectedAlert] = useState<FraudAlert | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterSeverity, setFilterSeverity] = useState<string>('all');

  useEffect(() => {
    loadAlerts();

    const subscription = supabase
      .channel('fraud-alerts')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'fraud_alerts',
      }, () => {
        loadAlerts();
      })
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const loadAlerts = async () => {
    try {
      setLoading(true);

      let query = supabase
        .from('fraud_alerts')
        .select('*')
        .order('created_at', { ascending: false });

      if (filterStatus !== 'all') {
        query = query.eq('status', filterStatus);
      }

      if (filterSeverity !== 'all') {
        query = query.eq('severity', filterSeverity);
      }

      const { data, error } = await query;

      if (error) throw error;
      setAlerts(data || []);
    } catch (error) {
      console.error('Error loading fraud alerts:', error);
      showToast('Erreur lors du chargement des alertes', 'error');
    } finally {
      setLoading(false);
    }
  };

  const updateAlertStatus = async (alertId: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from('fraud_alerts')
        .update({
          status: newStatus,
          resolved_at: newStatus === 'resolved' || newStatus === 'false_positive' ? new Date().toISOString() : null,
        })
        .eq('id', alertId);

      if (error) throw error;

      showToast('Statut mis à jour', 'success');
      await loadAlerts();
      setSelectedAlert(null);
    } catch (error) {
      console.error('Error updating alert status:', error);
      showToast('Erreur lors de la mise à jour', 'error');
    }
  };

  const filteredAlerts = alerts;

  const stats = {
    total: alerts.length,
    new: alerts.filter(a => a.status === 'new').length,
    investigating: alerts.filter(a => a.status === 'investigating').length,
    critical: alerts.filter(a => a.severity === 'critical').length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-4">
          <Shield className="w-8 h-8 text-red-600" />
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Alertes de Fraude</h2>
            <p className="text-sm text-gray-600">Surveillance et gestion des activités suspectes</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white p-4 rounded-lg shadow border-l-4 border-blue-500">
            <p className="text-sm text-gray-600">Total</p>
            <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
          </div>
          <div className="bg-white p-4 rounded-lg shadow border-l-4 border-red-500">
            <p className="text-sm text-gray-600">Nouvelles</p>
            <p className="text-2xl font-bold text-red-600">{stats.new}</p>
          </div>
          <div className="bg-white p-4 rounded-lg shadow border-l-4 border-yellow-500">
            <p className="text-sm text-gray-600">En investigation</p>
            <p className="text-2xl font-bold text-yellow-600">{stats.investigating}</p>
          </div>
          <div className="bg-white p-4 rounded-lg shadow border-l-4 border-purple-500">
            <p className="text-sm text-gray-600">Critiques</p>
            <p className="text-2xl font-bold text-purple-600">{stats.critical}</p>
          </div>
        </div>

        <div className="flex gap-4 mb-4">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">Tous les statuts</option>
            <option value="new">Nouveau</option>
            <option value="investigating">En investigation</option>
            <option value="resolved">Résolu</option>
            <option value="false_positive">Faux positif</option>
          </select>

          <select
            value={filterSeverity}
            onChange={(e) => setFilterSeverity(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">Toutes les sévérités</option>
            <option value="low">Faible</option>
            <option value="medium">Moyenne</option>
            <option value="high">Élevée</option>
            <option value="critical">Critique</option>
          </select>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-lg overflow-hidden">
        {filteredAlerts.length === 0 ? (
          <div className="p-12 text-center">
            <Shield className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-600">Aucune alerte de fraude</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {filteredAlerts.map((alert) => (
              <div
                key={alert.id}
                className={`p-4 hover:bg-gray-50 transition cursor-pointer ${
                  SEVERITY_COLORS[alert.severity]
                } border-l-4`}
                onClick={() => setSelectedAlert(alert)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <AlertTriangle className="w-5 h-5" />
                      <h3 className="font-semibold text-gray-900">
                        {ALERT_TYPE_LABELS[alert.alert_type] || alert.alert_type}
                      </h3>
                      <span
                        className={`text-xs px-2 py-1 rounded-full ${
                          STATUS_COLORS[alert.status]
                        }`}
                      >
                        {STATUS_LABELS[alert.status] || alert.status}
                      </span>
                      <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-700">
                        {SEVERITY_LABELS[alert.severity] || alert.severity}
                      </span>
                    </div>
                    <p className="text-sm text-gray-700 mb-2">
                      {explainAlert(alert).cause}
                    </p>
                    <p className="text-xs text-gray-500">
                      {new Date(alert.created_at).toLocaleString('fr-FR')}
                    </p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedAlert(alert);
                    }}
                    className="text-blue-600 hover:text-blue-800"
                  >
                    <Eye className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedAlert && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">
                  Détails de l'Alerte
                </h3>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs px-2 py-1 rounded-full ${
                      STATUS_COLORS[selectedAlert.status]
                    }`}
                  >
                    {STATUS_LABELS[selectedAlert.status] || selectedAlert.status}
                  </span>
                  <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-700">
                    Gravité : {SEVERITY_LABELS[selectedAlert.severity] || selectedAlert.severity}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setSelectedAlert(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            <div className="mb-6">
              <h4 className="font-semibold text-gray-900 mb-2">Type</h4>
              <p className="text-gray-700">
                {ALERT_TYPE_LABELS[selectedAlert.alert_type] || selectedAlert.alert_type}
              </p>
            </div>

            <div className="mb-6">
              <h4 className="font-semibold text-gray-900 mb-2">Que se passe-t-il ?</h4>
              <p className="text-gray-800 mb-4">{explainAlert(selectedAlert).cause}</p>
              <h4 className="font-semibold text-gray-900 mb-2">Que faire ?</h4>
              <p className="text-gray-800 mb-4">{explainAlert(selectedAlert).action}</p>
              <details className="bg-gray-50 p-3 rounded-lg">
                <summary className="text-xs text-gray-500 cursor-pointer">Détails techniques</summary>
                <pre className="text-xs text-gray-600 whitespace-pre-wrap mt-2">
                  {JSON.stringify(selectedAlert.details, null, 2)}
                </pre>
              </details>
            </div>

            <div className="mb-6">
              <h4 className="font-semibold text-gray-900 mb-2">Dates</h4>
              <p className="text-sm text-gray-600">
                Créée le: {new Date(selectedAlert.created_at).toLocaleString('fr-FR')}
              </p>
              {selectedAlert.resolved_at && (
                <p className="text-sm text-gray-600">
                  Résolue le: {new Date(selectedAlert.resolved_at).toLocaleString('fr-FR')}
                </p>
              )}
            </div>

            <div className="flex gap-3">
              {selectedAlert.status === 'new' && (
                <button
                  onClick={() => updateAlertStatus(selectedAlert.id, 'investigating')}
                  className="flex items-center gap-2 px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700"
                >
                  <Eye className="w-4 h-4" />
                  Enquêter
                </button>
              )}
              {(selectedAlert.status === 'new' || selectedAlert.status === 'investigating') && (
                <>
                  <button
                    onClick={() => updateAlertStatus(selectedAlert.id, 'resolved')}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                  >
                    <CheckCircle className="w-4 h-4" />
                    Résoudre
                  </button>
                  <button
                    onClick={() => updateAlertStatus(selectedAlert.id, 'false_positive')}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
                  >
                    <XCircle className="w-4 h-4" />
                    Faux positif
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default FraudAlertsPanel;
