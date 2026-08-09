import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';

export default function ClientQuoteResumePage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) {
      setError('Lien de reprise invalide.');
      return;
    }

    (async () => {
      try {
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/resume-draft-quote`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token }),
          }
        );
        const json = await res.json();
        if (!res.ok) {
          setError(json.error || 'Ce lien de reprise n\'est plus valide.');
          return;
        }

        if (json.alreadySubmitted) {
          navigate('/client/dashboard', { replace: true });
          return;
        }

        if (json.magicLink) {
          window.location.href = json.magicLink;
          return;
        }

        setError('Impossible de reprendre cette demande.');
      } catch {
        setError('Une erreur est survenue. Réessayez dans quelques instants.');
      }
    })();
  }, [searchParams, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50 px-4">
      <div className="text-center max-w-md">
        {error ? (
          <>
            <p className="text-gray-900 font-semibold mb-2">{error}</p>
            <button
              onClick={() => navigate('/client/quote')}
              className="text-blue-600 hover:underline font-medium"
            >
              Recommencer une demande
            </button>
          </>
        ) : (
          <>
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-4" />
            <p className="text-gray-600">Reprise de votre demande en cours…</p>
          </>
        )}
      </div>
    </div>
  );
}
