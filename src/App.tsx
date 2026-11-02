import { AuthProvider } from './contexts/AuthContext';
import { AppRouter } from './Router';
import { Analytics } from '@vercel/analytics/react';
import ConsentBanner from './components/ConsentBanner';
import PartnerReferralTracker from './components/PartnerReferralTracker';

function App() {
  return (
    <AuthProvider>
      <PartnerReferralTracker />
      <AppRouter />
      <Analytics />
      <ConsentBanner />
    </AuthProvider>
  );
}

export default App;
