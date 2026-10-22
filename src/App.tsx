import { AuthProvider } from './contexts/AuthContext';
import { AppRouter } from './Router';
import { Analytics } from '@vercel/analytics/react';
import ConsentBanner from './components/ConsentBanner';

function App() {
  return (
    <AuthProvider>
      <AppRouter />
      <Analytics />
      <ConsentBanner />
    </AuthProvider>
  );
}

export default App;
