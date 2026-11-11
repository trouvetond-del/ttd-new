import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { AlertTriangle, CheckCircle, Clock, FileText, Calendar, TrendingUp } from 'lucide-react';
import { showToast } from '../../utils/toast';
import { useNavigate } from 'react-router-dom';

interface VerificationStats {
  pendingMovers: number;
  verifiedMovers: number;
  rejectedMovers: number;
  expiringDocuments: number;
  needsReview: number;
}

const AdminVerificationAlerts: React.FC = () => {
  const [stats, setStats] = useState<VerificationStats>({
    pendingMovers: 0,
    verifiedMovers: 0,
    rejectedMovers: 0,
    expiringDocuments: 0,
    needsReview: 0,
  });
  const [expiringDocs, setExpiringDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    loadVerificationStats();

    const interval = setInterval(loadVerificationStats, 60000);
    return () => clearInterval(interval);
  }, []);

  const loadVerificationStats = async () => {
    try {
      setLoading(true);

      const [
        { data: movers },
        { data: reports },
        { data: expiring }
      ] = await Promise.all([
        supabase.from('movers').select('verification_status, siret'),
        supabase.from('verification_reports').select('status').order('created_at', { ascending: false }).limit(100),
        supabase.rpc('get_expiring_documents', { days_threshold: 30 }),
      ]);

      const newStats: VerificationStats = {
        pendingMovers: movers?.filter(m => m.verification_status === 'pending' && !m.siret?.startsWith('PENDING-')).length || 0,
        verifiedMovers: movers?.filter(m => m.verification_status === 'verified').length || 0,
        rejectedMovers: movers?.filter(m => m.verification_status === 'rejected').length || 0,
        expiringDocuments: expiring?.length || 0,
        needsReview: reports?.filter(r => r.status === 'needs_review').length || 0,
      };

      setStats(newStats);
      setExpiringDocs(expiring || []);
    } catch (error: any) {
      console.error('Error loading verification stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const runExpirationCheck = async () => {
    setChecking(true);
    try {
      const { data: result, error } = await supabase.functions.invoke('check-document-expiration', { body: {} });
      if (error || !result?.success) {
        throw new Error(result?.error || error?.message || 'Erreur');
      }
      const count = result.expiringDocumentsCount ?? 0;
      showToast(
        count === 0
          ? 'Contrôle terminé : aucun document n\'expire dans les 30 prochains jours'
          : `${count} document(s) expirent bientôt — ${result.alertsSent?.movers ?? 0} déménageur(s) prévenu(s)`,
        'success'
      );
      await loadVerificationStats();
    } catch (error: any) {
      console.error('Expiration check failed:', error);
      showToast(`Erreur lors de la vérification : ${error?.message ?? 'inconnue'}`, 'error');
    } finally {
      setChecking(false);
    }
  };

  const statCards = [
    {
      title: 'En attente',
      target: 'pending_movers',
      value: stats.pendingMovers,
      icon: Clock,
      color: 'yellow',
      bgColor: 'bg-yellow-100',
      textColor: 'text-yellow-800',
      iconColor: 'text-yellow-600',
    },
    {
      title: 'À réviser',
      target: 'pending_movers',
      value: stats.needsReview,
      icon: AlertTriangle,
      color: 'orange',
      bgColor: 'bg-orange-100',
      textColor: 'text-orange-800',
      iconColor: 'text-orange-600',
    },
    {
      title: 'Documents expirants',
      target: 'expiring',
      value: stats.expiringDocuments,
      icon: Calendar,
      color: 'red',
      bgColor: 'bg-red-100',
      textColor: 'text-red-800',
      iconColor: 'text-red-600',
    },
    {
      title: 'Vérifiés',
      target: 'users',
      value: stats.verifiedMovers,
      icon: CheckCircle,
      color: 'green',
      bgColor: 'bg-green-100',
      textColor: 'text-green-800',
      iconColor: 'text-green-600',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Alertes de vérification
        </h3>
        <button
          onClick={runExpirationCheck}
          disabled={checking}
          className="disabled:opacity-60 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm flex items-center gap-2"
        >
          <TrendingUp className="w-4 h-4" />
          {checking ? 'Vérification…' : 'Vérifier expirations'}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <button
              type="button"
              key={card.title}
              onClick={() => {
                if (card.target === 'expiring') {
                  document.getElementById('expiring-docs-list')?.scrollIntoView({ behavior: 'smooth' });
                  if (expiringDocs.length === 0) showToast('Aucun document n\'expire dans les 30 prochains jours', 'success');
                } else {
                  navigate(`/admin/dashboard/${card.target}`);
                }
              }}
              className={`${card.bgColor} text-left w-full rounded-lg p-4 border border-${card.color}-200 cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition`}
            >
              <div className="flex items-center justify-between mb-2">
                <h4 className={`text-sm font-medium ${card.textColor}`}>{card.title}</h4>
                <Icon className={`w-5 h-5 ${card.iconColor}`} />
              </div>
              <p className={`text-3xl font-bold ${card.textColor}`}>
                {loading ? '...' : card.value}
              </p>
            </button>
          );
        })}
      </div>

      {expiringDocs.length > 0 && (
        <div id="expiring-docs-list" className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h4 className="font-semibold text-red-900 mb-3 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" />
            Documents expirant prochainement
          </h4>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {expiringDocs.slice(0, 10).map((doc: any, idx: number) => (
              <div
                key={idx}
                className="flex items-center justify-between text-sm bg-white rounded p-2"
              >
                <div>
                  <p className="font-medium text-gray-900">{doc.company_name}</p>
                  <p className="text-gray-600">
                    {doc.document_type} - expire le {new Date(doc.expiration_date).toLocaleDateString('fr-FR')}
                  </p>
                </div>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                  doc.days_remaining <= 7
                    ? 'bg-red-100 text-red-800'
                    : doc.days_remaining <= 15
                    ? 'bg-orange-100 text-orange-800'
                    : 'bg-yellow-100 text-yellow-800'
                }`}>
                  {doc.days_remaining}j restants
                </span>
              </div>
            ))}
          </div>
          {expiringDocs.length > 10 && (
            <p className="text-sm text-gray-600 mt-2">
              ... et {expiringDocs.length - 10} autre(s) document(s)
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default AdminVerificationAlerts;
