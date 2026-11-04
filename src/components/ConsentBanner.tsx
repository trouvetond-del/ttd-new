import { useEffect, useState } from 'react';
import { CONSENT_KEY } from '../lib/ads';

const SIX_MONTHS_MS = 1000 * 60 * 60 * 24 * 180;

function readChoice(): 'granted' | 'refused' | null {
  try {
    const raw = localStorage.getItem(CONSENT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.choice !== 'granted' && parsed?.choice !== 'refused') return null;
    if (Date.now() - Number(parsed.ts) > SIX_MONTHS_MS) return null;
    return parsed.choice;
  } catch {
    return null;
  }
}

export default function ConsentBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (readChoice() === null) setVisible(true);
  }, []);

  const record = (choice: 'granted' | 'refused') => {
    try {
      localStorage.setItem(
        CONSENT_KEY,
        JSON.stringify({
          choice,
          ts: Date.now(),
          region: 'EU',
          noticeVersion: 'v1',
        })
      );
    } catch {
      // stockage indisponible : le bandeau réapparaîtra à la prochaine visite
    }
    if (choice === 'granted') {
      // Recharge pour initialiser la mesure publicitaire avec le consentement enregistré
      window.location.reload();
      return;
    }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      className="fixed bottom-4 left-4 right-4 z-[100] sm:right-auto sm:max-w-sm animate-[cookieIn_.5s_ease-out]"
      role="dialog"
      aria-live="polite"
      aria-label="Consentement cookies publicitaires"
    >
      <style>{`@keyframes cookieIn{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}`}</style>
      <div className="rounded-2xl bg-white/95 backdrop-blur border border-slate-200/80 shadow-[0_12px_40px_-12px_rgba(15,23,42,.35)] p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-50 text-lg" aria-hidden>🍪</span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900">Un petit cookie ?</p>
            <p className="mt-0.5 text-xs leading-relaxed text-slate-600">
              Il nous aide à mesurer nos annonces (dont Meta). Votre choix est libre, valable 6 mois.{' '}
              <a href="/cookies" className="font-medium text-blue-600 hover:underline">En savoir plus</a>
            </p>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <button
            onClick={() => record('refused')}
            className="flex-1 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition"
          >
            Refuser
          </button>
          <button
            onClick={() => record('granted')}
            className="flex-1 rounded-full bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition"
          >
            Accepter
          </button>
        </div>
      </div>
    </div>
  );
}
