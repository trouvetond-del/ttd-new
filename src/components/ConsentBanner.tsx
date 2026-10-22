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
      className="fixed inset-x-0 bottom-0 z-[100] p-3 sm:p-4"
      role="dialog"
      aria-live="polite"
      aria-label="Consentement cookies publicitaires"
    >
      <div className="mx-auto max-w-3xl rounded-2xl bg-white shadow-xl border border-slate-200 p-4 sm:p-5">
        <p className="text-sm text-slate-700 leading-relaxed">
          Nous utilisons des cookies de mesure et de publicité (dont Meta / Facebook) pour savoir si
          nos annonces apportent des clients. Vous pouvez accepter ou refuser librement — votre
          choix reste valable 6 mois et peut être modifié à tout moment sur notre{' '}
          <a href="/cookies" className="font-medium text-blue-700 underline">
            page Cookies
          </a>
          .
        </p>
        <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            onClick={() => record('refused')}
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Continuer sans accepter
          </button>
          <button
            onClick={() => record('granted')}
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Accepter
          </button>
        </div>
      </div>
    </div>
  );
}
