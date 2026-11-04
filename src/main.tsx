import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import './motion-controls.css';
import { ThemeProvider } from './contexts/ThemeContext';

const rootElement = document.getElementById('root');
if (rootElement) createRoot(rootElement).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>
);
