import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import NotFoundPage from './pages/NotFoundPage';
import { useAuth } from './contexts/AuthContext';
import { LandingPage } from './pages/LandingPage';
import { supabase } from './lib/supabase';
import { lazy, Suspense, useEffect, useState } from 'react';
import { ToastContainer } from './components/ToastContainer';
import { SeoNormalizer } from './components/SeoNormalizer';

// Chaque page (sauf l'accueil) est chargée à la demande : le téléphone ne
// télécharge plus tout le site (admin, espace déménageur...) avant d'afficher l'accueil.
const QuickLeadPage = lazy(() => import('./pages/QuickLeadPage').then((m) => ({ default: m.QuickLeadPage })));
const ClientCreateQuickLeadPasswordPage = lazy(() => import('./pages/ClientCreateQuickLeadPasswordPage').then((m) => ({ default: m.ClientCreateQuickLeadPasswordPage })));
const MoverQuickLeadPage = lazy(() => import('./pages/MoverQuickLeadPage').then((m) => ({ default: m.MoverQuickLeadPage })));
const MoverCreateQuickLeadPasswordPage = lazy(() => import('./pages/MoverCreateQuickLeadPasswordPage').then((m) => ({ default: m.MoverCreateQuickLeadPasswordPage })));
const ClientQuotePage = lazy(() => import('./pages/ClientQuotePage').then((m) => ({ default: m.ClientQuotePage })));
const ClientQuoteResumePage = lazy(() => import('./pages/ClientQuoteResumePage'));
const ClientAuthPage = lazy(() => import('./pages/ClientAuthPage').then((m) => ({ default: m.ClientAuthPage })));
const ClientAuthChoice = lazy(() => import('./pages/ClientAuthChoice').then((m) => ({ default: m.ClientAuthChoice })));
const ClientDashboard = lazy(() => import('./pages/ClientDashboard').then((m) => ({ default: m.ClientDashboard })));
const ClientQuotesPage = lazy(() => import('./pages/ClientQuotesPage'));
const ClientPaymentPage = lazy(() => import('./pages/ClientPaymentPageNew'));
const ClientPaymentSuccessPage = lazy(() => import('./pages/ClientPaymentSuccessPage'));
const ClientContractsPage = lazy(() => import('./pages/ClientContractsPage'));
const ClientNotificationsPage = lazy(() => import('./pages/ClientNotificationsPage'));
const ClientPhotosPage = lazy(() => import('./pages/ClientPhotosPage'));
const ClientChecklistPage = lazy(() => import('./pages/ClientChecklistPage'));
const ClientFavoritesPage = lazy(() => import('./pages/ClientFavoritesPage'));
const MoverAuthPage = lazy(() => import('./pages/MoverAuthPage').then((m) => ({ default: m.MoverAuthPage })));
const MoverSignupPage = lazy(() => import('./pages/MoverSignupPage').then((m) => ({ default: m.MoverSignupPage })));
const MoverProfileCompletionPage = lazy(() => import('./pages/MoverProfileCompletionPage'));
const MoverEmailSignup = lazy(() => import('./components/MoverEmailSignup'));
const MoverVerifyEmailPage = lazy(() => import('./pages/MoverVerifyEmailPage'));
const MoverSignupSuccess = lazy(() => import('./pages/MoverSignupSuccess').then((m) => ({ default: m.MoverSignupSuccess })));
const MoverGoogleCallbackPage = lazy(() => import('./pages/MoverGoogleCallbackPage').then((m) => ({ default: m.MoverGoogleCallbackPage })));
const ClientGoogleCallbackPage = lazy(() => import('./pages/ClientGoogleCallbackPage').then((m) => ({ default: m.ClientGoogleCallbackPage })));
const MoverInviteSignupPage = lazy(() => import('./pages/MoverInviteSignupPage'));
const ClientInviteSignupPage = lazy(() => import('./pages/ClientInviteSignupPage'));
const MoverDashboard = lazy(() => import('./pages/MoverDashboard').then((m) => ({ default: m.MoverDashboard })));
const MoverQuoteRequestsPage = lazy(() => import('./pages/MoverQuoteRequestsPage'));
const MoverFindMovesPage = lazy(() => import('./pages/MoverFindMovesPage'));
const MoverDriversPage = lazy(() => import('./pages/MoverDriversPage'));
const DriverPage = lazy(() => import('./pages/DriverPage'));
const DriverLoginPage = lazy(() => import('./pages/DriverLoginPage'));
const MoverMyQuotesPage = lazy(() => import('./pages/MoverMyQuotesPage'));
const MoverMovingsList = lazy(() => import('./pages/MoverMovingsList'));
const MoverDamagePhotos = lazy(() => import('./pages/MoverDamagePhotos'));
const MoverFinancesPage = lazy(() => import('./pages/MoverFinancesPage'));
const MoverContractsPage = lazy(() => import('./pages/MoverContractsPage'));
const MoverDocumentsPage = lazy(() => import('./pages/MoverDocumentsPage'));
const MoverPortfolioPage = lazy(() => import('./pages/MoverPortfolioPage'));
const MoverCompanyInfoPage = lazy(() => import('./pages/MoverCompanyInfoPage'));
const MoverNotificationsPage = lazy(() => import('./pages/MoverNotificationsPage'));
const MovingTracking = lazy(() => import('./pages/MovingTracking'));
const DamageReport = lazy(() => import('./pages/DamageReport'));
const AdminAuthPage = lazy(() => import('./pages/AdminAuthPage').then((m) => ({ default: m.AdminAuthPage })));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const AboutUsPage = lazy(() => import('./pages/AboutUsPage').then((m) => ({ default: m.AboutUsPage })));
const MissionPage = lazy(() => import('./pages/MissionPage').then((m) => ({ default: m.MissionPage })));
const FAQPage = lazy(() => import('./pages/FAQPage').then((m) => ({ default: m.FAQPage })));
const PublicMovesPage = lazy(() => import('./pages/PublicMovesPage'));
const ContactPage = lazy(() => import('./pages/ContactPage').then((m) => ({ default: m.ContactPage })));
const TechnologyPage = lazy(() => import('./pages/TechnologyPage').then((m) => ({ default: m.TechnologyPage })));
const PricingPage = lazy(() => import('./pages/PricingPage').then((m) => ({ default: m.PricingPage })));
const PressPage = lazy(() => import('./pages/PressPage').then((m) => ({ default: m.PressPage })));
const HelpCenterPage = lazy(() => import('./pages/HelpCenterPage').then((m) => ({ default: m.HelpCenterPage })));
const MovingGuidePage = lazy(() => import('./pages/MovingGuidePage').then((m) => ({ default: m.MovingGuidePage })));
const Blog = lazy(() => import('./pages/Blog'));
const CityPage = lazy(() => import('./pages/CityPage'));
const TarifsPage = lazy(() => import('./pages/TarifsPage'));
const CalculateurPage = lazy(() => import('./pages/CalculateurPage'));
const VolumeCalculatorPage = lazy(() => import('./pages/VolumeCalculatorPage'));
const AdLandingPage = lazy(() => import('./pages/AdLandingPage'));
const BlogArticle = lazy(() => import('./pages/BlogArticle'));
const EmailVerificationPage = lazy(() => import('./pages/EmailVerificationPage').then((m) => ({ default: m.EmailVerificationPage })));
const CheckEmailPage = lazy(() => import('./pages/CheckEmailPage').then((m) => ({ default: m.CheckEmailPage })));
const ResendVerificationPage = lazy(() => import('./pages/ResendVerificationPage').then((m) => ({ default: m.ResendVerificationPage })));
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage').then((m) => ({ default: m.ForgotPasswordPage })));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage').then((m) => ({ default: m.ResetPasswordPage })));
const ResetPasswordWithCodePage = lazy(() => import('./pages/ResetPasswordWithCodePage').then((m) => ({ default: m.ResetPasswordWithCodePage })));
const EmailVerificationCodePage = lazy(() => import('./pages/EmailVerificationCodePage').then((m) => ({ default: m.EmailVerificationCodePage })));
const ClientProfileCompletionPage = lazy(() => import('./pages/ClientProfileCompletionPage').then((m) => ({ default: m.ClientProfileCompletionPage })));
const LegalMentionsPage = lazy(() => import('./pages/LegalMentionsPage'));
const PrivacyPolicyPage = lazy(() => import('./pages/PrivacyPolicyPage'));
const TermsOfServicePage = lazy(() => import('./pages/TermsOfServicePage'));
const SalesTermsPage = lazy(() => import('./pages/SalesTermsPage'));
const CookiesPage = lazy(() => import('./pages/CookiesPage'));
const MoverInfoPage = lazy(() => import('./pages/MoverInfoPage').then((m) => ({ default: m.MoverInfoPage })));
const ForClientPage = lazy(() => import('./pages/ForClientPage').then((m) => ({ default: m.ForClientPage })));
const ForMoverPage = lazy(() => import('./pages/ForMoverPage').then((m) => ({ default: m.ForMoverPage })));
const PartnersPage = lazy(() => import('./pages/PartnersPage').then((m) => ({ default: m.PartnersPage })));
const UnauthorizedPage = lazy(() => import('./pages/UnauthorizedPage').then((m) => ({ default: m.UnauthorizedPage })));
const ChangePasswordPage = lazy(() => import('./pages/ChangePasswordPage'));
const ClientSettingsPage = lazy(() => import('./pages/ClientSettingsPage'));
const MoverSettingsPage = lazy(() => import('./pages/MoverSettingsPage'));

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

// Route protégée pour les clients uniquement
function ClientProtectedRoute({ children, allowGuest = false }: { children: React.ReactNode; allowGuest?: boolean }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  const [checking, setChecking] = useState(true);
  const [userType, setUserType] = useState<'client' | 'mover' | 'admin' | 'unknown'>('unknown');
  const [isAuthorized, setIsAuthorized] = useState(false);

  useEffect(() => {
    // Reset state when user changes
    setChecking(true);
    setIsAuthorized(false);
    setUserType('unknown');

    const checkClientAccess = async () => {
      if (!user) {
        setChecking(false);
        return;
      }

      try {
        // Vérifier si admin en premier (priorité haute) - ADMINS CANNOT ACCESS CLIENT PAGES
        const { data: adminData } = await supabase
          .from('admins')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle();

        if (adminData) {
          setUserType('admin');
          setIsAuthorized(false); // Admins cannot access client pages
          setChecking(false);
          return;
        }

        // Vérifier si déménageur
        const { data: moverData } = await supabase
          .from('movers')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle();

        if (moverData) {
          setUserType('mover');
          setIsAuthorized(false); // Movers cannot access client pages
          setChecking(false);
          return;
        }

        // C'est un client ou un utilisateur standard
        setUserType('client');
        setIsAuthorized(true);
      } catch (error) {
        console.error('Error checking client access:', error);
        setIsAuthorized(false);
      } finally {
        setChecking(false);
      }
    };

    checkClientAccess();
  }, [user?.id]); // Depend on user.id instead of user object

  if (loading || checking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) {
    // Visiteur non connecté : autorisé seulement sur le formulaire public de devis
    if (allowGuest) return <>{children}</>;
    if (location.pathname === '/client/quotes' && new URLSearchParams(location.search).has('requestId')) {
      return <Navigate to={`/client/login?returnTo=${encodeURIComponent(location.pathname + location.search)}`} replace />;
    }
    return <Navigate to="/client/login" replace />;
  }

  if (!isAuthorized) {
    return <UnauthorizedPage userType={userType} attemptedRoute={location.pathname} />;
  }

  return <>{children}</>;
}

function MoverProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  const [checking, setChecking] = useState(true);
  const [userType, setUserType] = useState<'client' | 'mover' | 'admin' | 'unknown'>('unknown');
  const [isMover, setIsMover] = useState(false);

  useEffect(() => {
    // Reset state when user changes
    setChecking(true);
    setIsMover(false);
    setUserType('unknown');

    const checkMoverAccess = async () => {
      if (!user) {
        setChecking(false);
        return;
      }

      try {
        // Vérifier si admin en premier
        const { data: adminData } = await supabase
          .from('admins')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle();

        if (adminData) {
          setUserType('admin');
          setIsMover(false);
          setChecking(false);
          return;
        }

        // Vérifier si déménageur
        const { data: moverData } = await supabase
          .from('movers')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle();

        if (moverData) {
          setUserType('mover');
          setIsMover(true);
        } else {
          setUserType('client');
          setIsMover(false);
        }
      } catch (error) {
        console.error('Error checking mover access:', error);
        setIsMover(false);
      } finally {
        setChecking(false);
      }
    };

    checkMoverAccess();
  }, [user?.id]); // Depend on user.id

  if (loading || checking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/mover/login" replace />;
  }

  if (!isMover) {
    return <UnauthorizedPage userType={userType} attemptedRoute={location.pathname} />;
  }

  return <>{children}</>;
}

function AdminProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  const [checking, setChecking] = useState(true);
  const [userType, setUserType] = useState<'client' | 'mover' | 'admin' | 'unknown'>('unknown');
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    // Reset state when user changes
    setChecking(true);
    setIsAdmin(false);
    setUserType('unknown');

    const checkAdminAccess = async () => {
      if (!user) {
        setChecking(false);
        return;
      }

      try {
        const { data: adminData } = await supabase
          .from('admins')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle();

        if (adminData) {
          setUserType('admin');
          setIsAdmin(true);
        } else {
          // Vérifier si déménageur
          const { data: moverData } = await supabase
            .from('movers')
            .select('id')
            .eq('user_id', user.id)
            .maybeSingle();

          if (moverData) {
            setUserType('mover');
          } else {
            setUserType('client');
          }
          setIsAdmin(false);
        }
      } catch (error) {
        console.error('Error checking admin access:', error);
        setIsAdmin(false);
      } finally {
        setChecking(false);
      }
    };

    checkAdminAccess();
  }, [user?.id]); // Depend on user.id

  if (loading || checking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/admin/login" replace />;
  }

  if (!isAdmin) {
    return <UnauthorizedPage userType={userType} attemptedRoute={location.pathname} />;
  }

  return <>{children}</>;
}

// Composant pour rediriger les utilisateurs authentifiés vers leur dashboard
function RedirectIfAuthenticated({ children, fallbackType }: { children: React.ReactNode; fallbackType: 'client' | 'mover' | 'admin' }) {
  const { user, loading } = useAuth();
  const [checking, setChecking] = useState(true);
  const [redirectTo, setRedirectTo] = useState<string | null>(null);

  useEffect(() => {
    // Reset state when user changes
    setChecking(true);
    setRedirectTo(null);

    const checkUserType = async () => {
      if (!user) {
        setChecking(false);
        return;
      }

      try {
        // Vérifier si admin
        const { data: adminData } = await supabase
          .from('admins')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle();

        if (adminData) {
          setRedirectTo('/admin/dashboard');
          setChecking(false);
          return;
        }

        // Vérifier si déménageur
        const { data: moverData } = await supabase
          .from('movers')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle();

        if (moverData) {
          setRedirectTo('/mover/dashboard');
          setChecking(false);
          return;
        }

        // User is not admin and not mover
        if (fallbackType === 'mover') {
          // On a mover route: new Google signup user — let them through
          setRedirectTo(null);
        } else {
          // For client routes: redirect to client dashboard
          setRedirectTo('/client/dashboard');
        }
      } catch (error) {
        console.error('Error checking user type:', error);
        setRedirectTo(null);
      } finally {
        setChecking(false);
      }
    };

    checkUserType();
  }, [user?.id]); // Depend on user.id

  if (loading || checking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (user && redirectTo) {
    return <Navigate to={redirectTo} replace />;
  }

  return <>{children}</>;
}

// Le script gtag.js chargé dans index.html envoie un page_view automatique
// au tout premier chargement du site, mais PAS lors des navigations
// internes (React Router change l'URL sans recharger la page). Sans ce
// composant, Google Analytics et le suivi des conversions Google Ads ne
// verraient jamais que la toute première page visitée par chaque personne,
// jamais les pages suivantes -- montre-le une seule fois, en haut de
// l'arbre, à l'intérieur de <BrowserRouter> pour avoir accès à useLocation.
function AnalyticsRouteTracker() {
  const location = useLocation();
  useEffect(() => {
    if (typeof (window as any).gtag === 'function') {
      (window as any).gtag('event', 'page_view', {
        page_path: location.pathname + location.search,
        page_location: window.location.href,
        page_title: document.title,
      });
    }
  }, [location.pathname, location.search]);
  return null;
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <AnalyticsRouteTracker />
      <SeoNormalizer />
      <div className="min-h-screen smooth-scroll">
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>}>
        <Routes>
          {/* Public Routes */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/devis-rapide" element={<QuickLeadPage />} />
          <Route path="/devis-rapide/mot-de-passe" element={<ClientCreateQuickLeadPasswordPage />} />
          <Route path="/inscription-demenageur" element={<MoverQuickLeadPage />} />
          <Route path="/inscription-demenageur/mot-de-passe" element={<MoverCreateQuickLeadPasswordPage />} />
          <Route path="/about" element={<AboutUsPage />} />
          <Route path="/mission" element={<MissionPage />} />
          <Route path="/faq" element={<FAQPage />} />
          <Route path="/demenagements-disponibles" element={<PublicMovesPage />} />
          <Route path="/for-clients" element={<ForClientPage />} />
          <Route path="/for-movers" element={<ForMoverPage />} />
          <Route path="/partners" element={<PartnersPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/technology" element={<TechnologyPage />} />
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/press" element={<PressPage />} />
          <Route path="/help" element={<HelpCenterPage />} />
          <Route path="/guide" element={<MovingGuidePage />} />
          <Route path="/blog" element={<Blog />} />
          <Route path="/demenagement/:slug" element={<CityPage />} />
          <Route path="/tarifs-demenagement-2026" element={<TarifsPage />} />
          <Route path="/calculateur-prix-demenagement" element={<CalculateurPage />} />
          <Route path="/calculateur-volume" element={<VolumeCalculatorPage />} />
          <Route path="/devis-demenagement" element={<AdLandingPage />} />
          <Route path="/guide-demenagement" element={<MovingGuidePage />} />
          <Route path="/blog/:slug" element={<BlogArticle />} />
          {/* Legal Routes */}
          <Route path="/legal/mentions" element={<LegalMentionsPage />} />
          <Route path="/legal/privacy-policy" element={<PrivacyPolicyPage />} />
          <Route path="/legal/terms-of-service" element={<TermsOfServicePage />} />
          <Route path="/legal/sales-terms" element={<SalesTermsPage />} />
          <Route path="/legal/cookies" element={<CookiesPage />} />
          <Route path="/mover-info" element={<MoverInfoPage />} />

          {/* Client Auth Routes - Redirect if already authenticated */}
          <Route path="/client/auth-choice" element={
            <RedirectIfAuthenticated fallbackType="client">
              <ClientAuthChoice />
            </RedirectIfAuthenticated>
          } />
          <Route path="/client/login" element={
            <RedirectIfAuthenticated fallbackType="client">
              <ClientAuthPage initialMode="login" />
            </RedirectIfAuthenticated>
          } />
          <Route path="/client/signup" element={
            <RedirectIfAuthenticated fallbackType="client">
              <ClientAuthPage initialMode="signup" />
            </RedirectIfAuthenticated>
          } />
          <Route path="/check-email" element={<CheckEmailPage />} />
          <Route path="/verify-email" element={<EmailVerificationPage />} />
          <Route path="/verify-email-code" element={<EmailVerificationCodePage />} />
          <Route path="/resend-verification" element={<ResendVerificationPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/reset-password-code" element={<ResetPasswordWithCodePage />} />

          {/* Google Auth Callback Routes — no wrapper, accessible to all */}
          <Route path="/client/google-callback" element={<ClientGoogleCallbackPage />} />
          <Route path="/mover/google-callback" element={<MoverGoogleCallbackPage />} />

          {/* Client Protected Routes */}
          <Route
            path="/client/profile-completion"
            element={
              <ProtectedRoute>
                <ClientProfileCompletionPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/client/dashboard"
            element={
              <ClientProtectedRoute>
                <ClientDashboard />
              </ClientProtectedRoute>
            }
          />
          <Route
            path="/client/quote"
            element={
              <ClientProtectedRoute allowGuest>
                <ClientQuotePage />
              </ClientProtectedRoute>
            }
          />
          <Route
            path="/client/quote/reprendre"
            element={
              <ClientProtectedRoute allowGuest>
                <ClientQuoteResumePage />
              </ClientProtectedRoute>
            }
          />
          <Route
            path="/client/quote/:quoteRequestId/edit"
            element={
              <ClientProtectedRoute>
                <ClientQuotePage />
              </ClientProtectedRoute>
            }
          />
          <Route
            path="/client/quotes"
            element={
              <ClientProtectedRoute>
                <ClientQuotesPage />
              </ClientProtectedRoute>
            }
          />
          <Route
            path="/client/payment/:quoteId"
            element={
              <ClientProtectedRoute>
                <ClientPaymentPage />
              </ClientProtectedRoute>
            }
          />
          <Route
            path="/client/payment-success"
            element={
              <ClientProtectedRoute>
                <ClientPaymentSuccessPage />
              </ClientProtectedRoute>
            }
          />
          <Route
            path="/client/moving/:quoteRequestId/tracking"
            element={
              <ClientProtectedRoute>
                <MovingTracking />
              </ClientProtectedRoute>
            }
          />
          <Route
            path="/client/moving/:quoteRequestId/damage-report"
            element={
              <ClientProtectedRoute>
                <DamageReport />
              </ClientProtectedRoute>
            }
          />
          <Route
            path="/client/contracts"
            element={
              <ClientProtectedRoute>
                <ClientContractsPage />
              </ClientProtectedRoute>
            }
          />
          <Route
            path="/client/notifications"
            element={
              <ClientProtectedRoute>
                <ClientNotificationsPage />
              </ClientProtectedRoute>
            }
          />
          <Route
            path="/client/moving/:quoteRequestId/photos"
            element={
              <ClientProtectedRoute>
                <ClientPhotosPage />
              </ClientProtectedRoute>
            }
          />
          <Route
            path="/client/checklist"
            element={
              <ClientProtectedRoute>
                <ClientChecklistPage />
              </ClientProtectedRoute>
            }
          />
          <Route
            path="/client/favorites"
            element={
              <ClientProtectedRoute>
                <ClientFavoritesPage />
              </ClientProtectedRoute>
            }
          />
          <Route
            path="/client/settings"
            element={
              <ClientProtectedRoute>
                <ClientSettingsPage />
              </ClientProtectedRoute>
            }
          />

          {/* Shared authenticated route: Change Password */}
          <Route
            path="/change-password"
            element={
              <ProtectedRoute>
                <ChangePasswordPage />
              </ProtectedRoute>
            }
          />

          {/* Mover Auth Routes */}
          <Route path="/mover/login" element={
            <RedirectIfAuthenticated fallbackType="mover">
              <MoverAuthPage />
            </RedirectIfAuthenticated>
          } />
          
          {/* PHASE 1: Email & Password Signup */}
          <Route path="/mover/signup" element={
            <RedirectIfAuthenticated fallbackType="mover">
              <MoverEmailSignup />
            </RedirectIfAuthenticated>
          } />
          
          {/* PHASE 2: Email Verification with 8-digit Code */}
          <Route path="/mover/verify-email" element={<MoverVerifyEmailPage />} />
          
          {/* PHASE 3: Profile Completion (Company Info + Documents) */}
          <Route path="/mover/profile-completion" element={
            <ProtectedRoute requireAuth>
              <MoverProfileCompletionPage />
            </ProtectedRoute>
          } />
          
          <Route path="/mover/signup-success" element={<MoverSignupSuccess />} />
          <Route path="/mover/invite/:token" element={<MoverInviteSignupPage />} />
          <Route path="/client/invite/:token" element={<ClientInviteSignupPage />} />

          {/* Mover Protected Routes */}
          <Route
            path="/mover/dashboard"
            element={
              <MoverProtectedRoute>
                <MoverDashboard />
              </MoverProtectedRoute>
            }
          />
          <Route path="/driver" element={<DriverPage />} />
          <Route path="/driver/login" element={<DriverLoginPage />} />
          <Route path="/driver/set-password" element={<DriverLoginPage />} />
          <Route
            path="/mover/drivers"
            element={
              <MoverProtectedRoute>
                <MoverDriversPage />
              </MoverProtectedRoute>
            }
          />
          <Route path="/mover/groupage" element={<MoverProtectedRoute><MoverFindMovesPage groupageOnly /></MoverProtectedRoute>} />
          <Route
            path="/mover/find-moves"
            element={
              <MoverProtectedRoute>
                <MoverFindMovesPage />
              </MoverProtectedRoute>
            }
          />
          <Route
            path="/mover/quote-requests"
            element={
              <MoverProtectedRoute>
                <MoverQuoteRequestsPage />
              </MoverProtectedRoute>
            }
          />
          <Route
            path="/mover/my-quotes"
            element={
              <MoverProtectedRoute>
                <MoverMyQuotesPage />
              </MoverProtectedRoute>
            }
          />
          <Route
            path="/mover/my-quotes/:quoteRequestId"
            element={
              <MoverProtectedRoute>
                <MoverMyQuotesPage />
              </MoverProtectedRoute>
            }
          />
          <Route
            path="/mover/movings"
            element={
              <MoverProtectedRoute>
                <MoverMovingsList />
              </MoverProtectedRoute>
            }
          />
          <Route
            path="/mover/damage-photos"
            element={
              <MoverProtectedRoute>
                <MoverDamagePhotos />
              </MoverProtectedRoute>
            }
          />
          <Route
            path="/mover/finances"
            element={
              <MoverProtectedRoute>
                <MoverFinancesPage />
              </MoverProtectedRoute>
            }
          />
          <Route
            path="/mover/contracts"
            element={
              <MoverProtectedRoute>
                <MoverContractsPage />
              </MoverProtectedRoute>
            }
          />
          <Route
            path="/mover/documents"
            element={
              <MoverProtectedRoute>
                <MoverDocumentsPage />
              </MoverProtectedRoute>
            }
          />
          <Route
            path="/mover/portfolio"
            element={
              <MoverProtectedRoute>
                <MoverPortfolioPage />
              </MoverProtectedRoute>
            }
          />
          <Route
            path="/mover/company-info"
            element={
              <MoverProtectedRoute>
                <MoverCompanyInfoPage />
              </MoverProtectedRoute>
            }
          />
          <Route
            path="/mover/notifications"
            element={
              <MoverProtectedRoute>
                <MoverNotificationsPage />
              </MoverProtectedRoute>
            }
          />
          <Route
            path="/mover/settings"
            element={
              <MoverProtectedRoute>
                <MoverSettingsPage />
              </MoverProtectedRoute>
            }
          />

          {/* Admin Routes - Redirect if already authenticated */}
          <Route path="/admin/login" element={
            <RedirectIfAuthenticated fallbackType="admin">
              <AdminAuthPage />
            </RedirectIfAuthenticated>
          } />
          <Route
            path="/admin/dashboard"
            element={
              <AdminProtectedRoute>
                <AdminDashboard />
              </AdminProtectedRoute>
            }
          />
          <Route path="/admin/dashboard/:tab" element={<AdminProtectedRoute><AdminDashboard /></AdminProtectedRoute>} />

          {/* Fallback */}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
        </Suspense>
        <ToastContainer />
      </div>
    </BrowserRouter>
  );
}