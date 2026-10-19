import { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Users,
  Truck,
  DollarSign,
  BarChart3,
  Shield,
  AlertTriangle,
  Settings,
  LogOut,
  Menu,
  X,
  Search,
  User,
  HelpCircle,
  Download,
  Activity,
  UserPlus,
  Clock,
  FileText,
  Tag,
  Clapperboard,
} from 'lucide-react';
import AdminOverview from '../components/admin/AdminOverview';
import AdminUserManagement from '../components/admin/AdminUserManagement';
import AdminFinancialManagement from '../components/admin/AdminFinancialManagement';
import AdminAnalyticsDashboard from '../components/admin/AdminAnalyticsDashboard';
import AdminSystemSettings from '../components/admin/AdminSystemSettings';
import AdminDamageReports from '../components/AdminDamageReports';
import AdminHelpSupport from '../components/admin/AdminHelpSupport';
import AdminSecurityAgents from '../components/admin/AdminSecurityAgents';
import AdminSocialStudio from '../components/admin/AdminSocialStudio';
import AdminExports from '../components/admin/AdminExports';
import AdminActivityLogs from '../components/admin/AdminActivityLogs';
import AdminMissions from '../components/admin/AdminMissions';
import AdminMoverSearch from '../components/admin/AdminMoverSearch';
import AdminMoverProspects from '../components/admin/AdminMoverProspects';
import AdminClientProspects from '../components/admin/AdminClientProspects';
import AdminPendingMovers from '../components/admin/AdminPendingMovers';
import AdminRecentQuoteRequests from '../components/admin/AdminRecentQuoteRequests';
import AdminDropboxSignContracts from '../components/admin/AdminDropboxSignContracts';
import AdminPromoCodesManagement from '../components/admin/AdminPromoCodesManagement';
import { NotificationBell } from '../components/NotificationBell';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate, useParams } from 'react-router-dom';

type ActiveTab =
  | 'overview'
  | 'users'
  | 'prospects'
  | 'pending_movers'
  | 'contracts'
  | 'missions'
  | 'financial'
  | 'analytics'
  | 'disputes'
  | 'settings'
  | 'help'
  | 'exports'
  | 'activity_logs'
  | 'mover_search'
  | 'client_prospects'
  | 'recent_quotes'
  | 'promo_codes'
  | 'security'
  | 'social_studio';

interface NavItem {
  id: ActiveTab;
  label: string;
  icon: any;
  color: string;
}

export default function AdminDashboard() {
  const { tab: urlTab } = useParams<{ tab?: string }>();
  const navigate = useNavigate();
  const validTabs: ActiveTab[] = ['overview','users','prospects','client_prospects','pending_movers','contracts','missions','financial','analytics','disputes','settings','help','exports','activity_logs','mover_search','recent_quotes','promo_codes','security','social_studio'];
  const initialTab = (urlTab && validTabs.includes(urlTab as ActiveTab)) ? urlTab as ActiveTab : 'overview';
  const [activeTab, setActiveTabState] = useState<ActiveTab>(initialTab);
  const setActiveTab = (tab: ActiveTab) => { setActiveTabState(tab); navigate(`/admin/dashboard/${tab}`, { replace: true }); };
  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth >= 1024);
  const [adminRole, setAdminRole] = useState<string>('');
  const [adminEmail, setAdminEmail] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [userTypeFilter, setUserTypeFilter] = useState<'all' | 'movers' | 'clients'>('all');
  const [userStatusFilter, setUserStatusFilter] = useState<'all' | 'active' | 'inactive' | 'suspended' | 'banned'>('all');
  const [notificationQuoteRequestId, setNotificationQuoteRequestId] = useState<string | null>(null);
  const [highlightPaymentId, setHighlightPaymentId] = useState<string | null>(null);
  const [disputeQuoteRequestId, setDisputeQuoteRequestId] = useState<string | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    const fetchAdminRole = async () => {
      if (!user) return;

      try {
        const { data, error } = await supabase
          .from('admins')
          .select('role, email')
          .eq('user_id', user.id)
          .maybeSingle();

        if (error) {
          console.error('Erreur lors de la récupération du rôle admin:', error);
        } else if (data) {
          setAdminRole(data.role);
          setAdminEmail(data.email);
        }
      } catch (error) {
        console.error('Erreur:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchAdminRole();
  }, [user]);

  // Clignotement de « Sécurité & Agents IA » quand le dernier passage de l'agent a des alertes
  const [securityAlert, setSecurityAlert] = useState(false);
  useEffect(() => {
    if (!user) return;
    const check = async () => {
      const { data } = await supabase.from('system_health_checks').select('status')
        .order('checked_at', { ascending: false }).limit(1).maybeSingle();
      setSecurityAlert(!!data && data.status !== 'ok');
    };
    check();
    const id = setInterval(check, 60_000);
    return () => clearInterval(id);
  }, [user]);

  const isSuperAdmin = adminRole === 'super_admin';
  const isAdminAgent = adminRole === 'admin_agent';

  const allNavItems: NavItem[] = [
    { id: 'overview', label: 'Vue d\'ensemble', icon: LayoutDashboard, color: 'text-blue-600' },
    // { id: 'mover_search', label: 'Recherche déménageur', icon: Search, color: 'text-indigo-600' },
    { id: 'users', label: 'Utilisateurs', icon: Users, color: 'text-purple-600' },
    { id: 'prospects', label: 'Prospects Déménageurs', icon: UserPlus, color: 'text-teal-600' },
    { id: 'client_prospects', label: 'Prospects Clients', icon: UserPlus, color: 'text-pink-600' },
    { id: 'pending_movers', label: 'Déménageurs en Attente', icon: Clock, color: 'text-amber-600' },
    { id: 'recent_quotes', label: 'Demandes de Devis Récentes', icon: FileText, color: 'text-sky-600' },
    { id: 'contracts', label: 'Contrats Dropbox Sign', icon: FileText, color: 'text-cyan-600' },
    { id: 'missions', label: 'Missions', icon: Truck, color: 'text-indigo-600' },
    { id: 'financial', label: 'Finances', icon: DollarSign, color: 'text-green-600' },
    { id: 'promo_codes', label: 'Codes Promo', icon: Tag, color: 'text-purple-600' },
    { id: 'analytics', label: 'Analytiques', icon: BarChart3, color: 'text-orange-600' },
    { id: 'disputes', label: 'Litiges', icon: AlertTriangle, color: 'text-yellow-600' },
    { id: 'social_studio', label: 'Studio Social Media', icon: Clapperboard, color: 'text-pink-600' },
    { id: 'security', label: 'Sécurité & Agents IA', icon: Shield, color: 'text-red-600' },
    { id: 'settings', label: 'Paramètres', icon: Settings, color: 'text-gray-600' },
  ];

  const navItems = isAdminAgent
    ? allNavItems.filter(item => item.id !== 'financial' && item.id !== 'promo_codes')
    : allNavItems;

  const getRoleLabel = () => {
    switch (adminRole) {
      case 'super_admin':
        return 'Super Administrateur';
      case 'admin_agent':
        return 'Agent Administratif';
      case 'admin':
        return 'Administrateur';
      case 'support':
        return 'Support';
      default:
        return 'Administrateur';
    }
  };

  const handleLogout = async () => {
    if (confirm('Êtes-vous sûr de vouloir vous déconnecter ?')) {
      try {
        await supabase.auth.signOut();
      } catch (error) {
        console.error('Error signing out:', error);
      }
      // Clear all localStorage/sessionStorage data
      localStorage.clear();
      sessionStorage.clear();
      window.location.href = '/admin/login';
    }
  };

  const handleNavigateToUsers = (userType: 'all' | 'movers' | 'clients' = 'all', userStatus: 'all' | 'active' | 'inactive' | 'suspended' | 'banned' = 'all') => {
    setUserTypeFilter(userType);
    setUserStatusFilter(userStatus);
    setActiveTab('users');
  };

  const handleNavigateToFinances = (paymentId?: string) => {
    setHighlightPaymentId(paymentId || null);
    setActiveTab('financial');
  };

  const handleNavigateToAnalytics = () => {
    setActiveTab('analytics');
  };

  const handleNavigateToDisputesFromFinances = (quoteRequestId?: string) => {
    setDisputeQuoteRequestId(quoteRequestId || null);
    setActiveTab('disputes');
  };

  const handleNavigateToPendingApprovals = () => {
    setUserTypeFilter('movers');
    setUserStatusFilter('all');
    setActiveTab('users');
  };

  const handleNavigateToDisputes = (quoteRequestId?: string) => {
    setDisputeQuoteRequestId(quoteRequestId || null);
    setActiveTab('disputes');
  };

  const handleNavigateToExports = () => {
    setActiveTab('exports');
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'overview':
        return <AdminOverview
          adminRole={adminRole}
          onNavigateToUsers={handleNavigateToUsers}
          onNavigateToFinances={handleNavigateToFinances}
          onNavigateToAnalytics={handleNavigateToAnalytics}
          onNavigateToPendingApprovals={handleNavigateToPendingApprovals}
          notificationQuoteRequestId={notificationQuoteRequestId}
          onQuoteRequestModalClose={() => setNotificationQuoteRequestId(null)}
        />;
      case 'mover_search':
        return <AdminMoverSearch />;
      case 'prospects':
        return <AdminMoverProspects adminRole={adminRole} />;
      case 'client_prospects':
        return <AdminClientProspects adminRole={adminRole} />;
      case 'pending_movers':
        return <AdminPendingMovers />;
      case 'recent_quotes':
        return <AdminRecentQuoteRequests />;
      case 'contracts':
        return <AdminDropboxSignContracts />;
      case 'users':
        return <AdminUserManagement
          adminRole={adminRole}
          initialUserType={userTypeFilter}
          initialUserStatus={userStatusFilter}
        />;
      case 'missions':
        return <AdminMissions adminRole={adminRole} />;
      case 'financial':
        if (!isSuperAdmin) {
          return (
            <div className="flex items-center justify-center min-h-[60vh]">
              <div className="text-center">
                <Shield className="w-16 h-16 text-red-500 mx-auto mb-4" />
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Accès Restreint</h2>
                <p className="text-gray-600 dark:text-gray-400">Vous n'avez pas accès à cette section.</p>
              </div>
            </div>
          );
        }
        return <AdminFinancialManagement onNavigateToDisputes={handleNavigateToDisputesFromFinances} highlightPaymentId={highlightPaymentId} />;
      case 'analytics':
        return <AdminAnalyticsDashboard adminRole={adminRole} />;
      case 'disputes':
        return <AdminDamageReports
          onNavigateToFinances={handleNavigateToFinances}
          filterQuoteRequestId={disputeQuoteRequestId}
          onClearFilter={() => setDisputeQuoteRequestId(null)}
        />;
      case 'social_studio':
        return <AdminSocialStudio />;
      case 'security':
        return <AdminSecurityAgents />;
      case 'settings':
        return <AdminSystemSettings adminRole={adminRole} />;
      case 'help':
        return <AdminHelpSupport
          onNavigateToUsers={() => handleNavigateToUsers('all', 'all')}
          onNavigateToFinances={handleNavigateToFinances}
          onNavigateToAnalytics={handleNavigateToAnalytics}
          onNavigateToDisputes={handleNavigateToDisputes}
          onNavigateToExports={handleNavigateToExports}
          onNavigateToPendingApprovals={handleNavigateToPendingApprovals}
        />;
      case 'exports':
        return <AdminExports adminRole={adminRole} />;
      case 'activity_logs':
        return <AdminActivityLogs />;
      case 'promo_codes':
        return <AdminPromoCodesManagement adminRole={adminRole} />;
      default:
        return <AdminOverview
          adminRole={adminRole}
          onNavigateToUsers={handleNavigateToUsers}
          onNavigateToFinances={handleNavigateToFinances}
          onNavigateToAnalytics={handleNavigateToAnalytics}
          onNavigateToPendingApprovals={handleNavigateToPendingApprovals}
          notificationQuoteRequestId={notificationQuoteRequestId}
          onQuoteRequestModalClose={() => setNotificationQuoteRequestId(null)}
        />;
    }
  };

  return (
    <div className="admin-premium min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/60 to-emerald-50/40 dark:from-gray-950 dark:via-slate-900 dark:to-gray-950">
      <div className="fixed top-0 left-0 right-0 h-16 bg-white/75 dark:bg-gray-900/75 backdrop-blur-xl border-b border-white/60 dark:border-white/10 shadow-[0_4px_30px_-12px_rgba(30,64,175,0.25)] z-30">
        <div className="h-full px-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              title={sidebarOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
            >
              {sidebarOpen ? <X className="w-5 h-5 text-gray-600 dark:text-gray-400" /> : <Menu className="w-5 h-5 text-gray-600 dark:text-gray-400" />}
            </button>
            <div className="flex items-center gap-2.5">
              <img src="/logo.png" alt="TrouveTonDemenageur" className="w-9 h-9 rounded-xl shadow-md ring-2 ring-white object-contain bg-white" />
              <div className="leading-tight">
                <h1 className="text-lg font-extrabold bg-gradient-to-r from-[#1E40AF] via-[#3B82F6] to-[#059669] bg-clip-text text-transparent">TrouveTonDemenageur</h1>
                <span className={`inline-block text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full ${isSuperAdmin ? 'bg-gradient-to-r from-amber-400 to-yellow-300 text-amber-900 shadow-sm shadow-amber-400/40' : 'bg-gradient-to-r from-blue-600 to-emerald-500 text-white shadow-sm shadow-blue-500/40'}`}>{isSuperAdmin ? 'Super Admin' : 'Admin'}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden md:block relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Recherche..."
                className="pl-10 pr-4 py-2 w-64 border border-blue-100 dark:border-gray-700 rounded-full bg-white/70 shadow-inner dark:bg-gray-800 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <NotificationBell
              userRole="admin"
              onNotificationClick={async (notification) => {
                // For 'new_quote' type from DB trigger, related_id is a quote ID, not quote_request_id
                // We need to resolve it to a quote_request_id
                if (notification.type === 'new_quote' && notification.related_id) {
                  try {
                    // First try as quote_request_id directly
                    const { data: qrDirect } = await supabase
                      .from('quote_requests')
                      .select('id')
                      .eq('id', notification.related_id)
                      .maybeSingle();

                    if (qrDirect) {
                      setActiveTab('overview');
                      setNotificationQuoteRequestId(qrDirect.id);
                    } else {
                      // It's a quote ID - resolve to quote_request_id
                      const { data: quoteData } = await supabase
                        .from('quotes')
                        .select('quote_request_id')
                        .eq('id', notification.related_id)
                        .maybeSingle();

                      if (quoteData?.quote_request_id) {
                        setActiveTab('overview');
                        setNotificationQuoteRequestId(quoteData.quote_request_id);
                      } else {
                        setActiveTab('overview');
                      }
                    }
                  } catch (err) {
                    console.error('Error resolving notification:', err);
                    setActiveTab('overview');
                  }
                } else if (notification.type === 'new_quote_request' && notification.related_id) {
                  setActiveTab('overview');
                  setNotificationQuoteRequestId(notification.related_id);
                } else if ((notification.type === 'quote_update' || notification.type === 'admin_modified_request') && notification.related_id) {
                  setActiveTab('overview');
                  setNotificationQuoteRequestId(notification.related_id);
                } else if (notification.type === 'payment' || notification.type === 'payment_received') {
                  setActiveTab('financial');
                  if (notification.related_id) {
                    setHighlightPaymentId(notification.related_id);
                  }
                } else if (notification.type === 'damage_report' || notification.type === 'damage_alert' || notification.type === 'dispute') {
                  setActiveTab('disputes');
                  if (notification.related_id) {
                    setDisputeQuoteRequestId(notification.related_id);
                  }
                } else if (notification.type === 'new_invited_client') {
                  navigate('/admin/dashboard/users');
                } else if (notification.type === 'system' && notification.title?.startsWith('Agent IA')) {
                  setActiveTab('security');
                } else if (notification.type === 'mover_registration' || notification.type === 'new_mover' || notification.type === 'system') {
                  setActiveTab('pending_movers');
                } else if (notification.type === 'mission_started' || notification.type === 'mission_completed') {
                  setActiveTab('missions');
                } else if (notification.type === 'contract_sent' || notification.type === 'contract_signed') {
                  setActiveTab('contracts');
                } else if (notification.related_id) {
                  // Fallback: try to open as quote request
                  setActiveTab('overview');
                  setNotificationQuoteRequestId(notification.related_id);
                }
              }}
            />

            <div className="hidden md:flex items-center gap-3 pl-3 border-l border-blue-100 dark:border-gray-700">
              <div className="text-right">
                <p className="text-sm font-medium text-gray-900 dark:text-white">{getRoleLabel()}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{adminEmail || 'admin@trouveton.fr'}</p>
              </div>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-lg ${isSuperAdmin ? 'bg-gradient-to-br from-amber-400 to-orange-500 shadow-amber-500/40' : 'bg-gradient-to-br from-blue-600 to-emerald-500 shadow-blue-500/40'}`}>
                <User className="w-5 h-5 text-white" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div
        className={`fixed top-16 left-0 bottom-0 w-64 bg-gradient-to-b from-[#0B1B3F] via-[#112A63] to-[#0A1633] border-r border-white/5 shadow-2xl shadow-blue-900/30 transition-transform duration-300 z-20 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="h-full overflow-y-auto p-4">
          <p className="px-3 mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-blue-300/60">Navigation</p>
          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;

              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id);
                    if (item.id !== 'financial') setHighlightPaymentId(null);
                    if (window.innerWidth < 1024) {
                      setSidebarOpen(false);
                    }
                  }}
                  className={`group w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 ${
                    isActive
                      ? 'bg-gradient-to-r from-[#3B82F6] to-[#10B981] text-white shadow-lg shadow-blue-500/30 translate-x-1'
                      : 'text-slate-300 hover:bg-white/10 hover:text-white hover:translate-x-1'
                  }`}
                >
                  <Icon className={`w-5 h-5 shrink-0 ${item.id === 'security' && securityAlert ? 'text-red-400 animate-pulse' : isActive ? 'text-white' : 'text-blue-300 group-hover:text-emerald-300'}`} />
                  <span className={`font-medium ${item.id === 'pending_movers' ? 'text-xs' : ''} ${item.id === 'security' && securityAlert ? 'text-red-400 animate-pulse' : ''}`}>{item.label}</span>
                  {item.id === 'security' && securityAlert && (
                    <span className="ml-auto relative flex h-3 w-3" aria-label="Alerte">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-red-600" />
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          <div className="mt-6 pt-6 border-t border-white/10 space-y-1">
            <button
              onClick={() => {
                setActiveTab('help');
                if (window.innerWidth < 1024) {
                  setSidebarOpen(false);
                }
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${
                activeTab === 'help'
                  ? 'bg-gradient-to-r from-[#3B82F6] to-[#10B981] text-white shadow-lg shadow-blue-500/30'
                  : 'text-slate-300 hover:bg-white/10 hover:text-white'
              }`}
            >
              <HelpCircle className="w-5 h-5" />
              <span className="font-medium">Aide & Support</span>
            </button>

            <button
              onClick={() => {
                setActiveTab('exports');
                if (window.innerWidth < 1024) {
                  setSidebarOpen(false);
                }
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${
                activeTab === 'exports'
                  ? 'bg-gradient-to-r from-[#3B82F6] to-[#10B981] text-white shadow-lg shadow-blue-500/30'
                  : 'text-slate-300 hover:bg-white/10 hover:text-white'
              }`}
            >
              <Download className="w-5 h-5" />
              <span className="font-medium">Exports</span>
            </button>

            <button
              onClick={() => {
                setActiveTab('activity_logs');
                if (window.innerWidth < 1024) {
                  setSidebarOpen(false);
                }
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${
                activeTab === 'activity_logs'
                  ? 'bg-gradient-to-r from-[#3B82F6] to-[#10B981] text-white shadow-lg shadow-blue-500/30'
                  : 'text-slate-300 hover:bg-white/10 hover:text-white'
              }`}
            >
              <Activity className="w-5 h-5" />
              <span className="font-medium">Logs d'Activité</span>
            </button>

            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-red-300 hover:bg-red-500/15 hover:text-red-200 transition-colors"
            >
              <LogOut className="w-5 h-5" />
              <span className="font-medium">Déconnexion</span>
            </button>
          </div>
        </div>
      </div>

      <div
        className={`pt-16 transition-all duration-300 ${
          sidebarOpen ? 'lg:pl-64' : 'pl-0'
        }`}
      >
        <div className="admin-content p-3 sm:p-6 lg:p-8 animate-[fadeInUp_0.4s_ease-out]">
          {renderContent()}
        </div>
      </div>

      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-10 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  );
}