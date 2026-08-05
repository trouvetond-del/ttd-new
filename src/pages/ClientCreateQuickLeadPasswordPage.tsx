import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Shield, CheckCircle, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { Logo } from '../components/Logo';
import { supabase } from '../lib/supabase';
import { validatePassword, buildPasswordErrorMessage } from '../utils/validation';

type LoadState = 'loading' | 'valid' | 'invalid' | 'expired' | 'already_used';

// IMPORTANT: ce composant est défini EN DEHORS de la page, au niveau du
// module. Le définir à l'intérieur du composant (comme avant) le recréait
// à chaque frappe clavier -> React remontait tout le formulaire à chaque
// caractère tapé -> autoFocus se redéclenchait -> le curseur revenait sur
// le premier champ. C'était la cause du bug signalé.
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-800 flex flex-col">
      <div className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="max-w-md w-full">
          <div className="flex items-center gap-2 justify-center mb-6">
            <Logo showText={false} />
            <span className="font-bold text-lg bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">
              trouvetondemenageur.fr
            </span>
          </div>
          <div className="bg-white rounded-2xl shadow-2xl p-6 sm:p-8">{children}</div>
        </div>
      </div>
    </div>
  );
}

function PasswordInput({
  value,
  onChange,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoFocus={autoFocus}
        className="w-full px-4 py-3 pr-11 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        tabIndex={-1}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
        aria-label={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
      >
        {visible ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  );
}

export function ClientCreateQuickLeadPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') || '';

  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [quoteRequestId, setQuoteRequestId] = useState('');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setLoadState('invalid');
      return;
    }
    (async () => {
      try {
        const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-quick-lead-verification`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ token }),
        });
        const json = await res.json();
        if (res.status === 410) { setLoadState('expired'); return; }
        if (res.status === 409) { setLoadState('already_used'); setEmail(json.email || ''); return; }
        if (!res.ok) { setLoadState('invalid'); return; }
        setEmail(json.email);
        setFirstName(json.firstName || '');
        setQuoteRequestId(json.quoteRequestId);
        setLoadState('valid');
      } catch {
        setLoadState('invalid');
      }
    })();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const validation = validatePassword(password);
    if (!validation.isValid) {
      setError(validation.errors.join('. '));
      return;
    }
    if (password !== confirmPassword) {
      setError('Les mots de passe ne correspondent pas');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-quick-lead-account`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ token, password }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Une erreur est survenue');

      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) throw signInError;

      navigate(`/client/quote/${quoteRequestId}/edit`);
    } catch (err: any) {
      setError(err.message || 'Une erreur est survenue');
    } finally {
      setSubmitting(false);
    }
  };

  if (loadState === 'loading') {
    return <Shell><p className="text-center text-gray-500">Vérification du lien...</p></Shell>;
  }

  if (loadState === 'invalid' || loadState === 'expired') {
    return (
      <Shell>
        <div className="text-center">
          <AlertCircle className="mx-auto text-red-500 mb-3" size={40} />
          <h1 className="text-lg font-bold text-gray-900 mb-2">
            {loadState === 'expired' ? 'Ce lien a expiré' : 'Lien invalide'}
          </h1>
          <p className="text-gray-600 text-sm mb-4">
            {loadState === 'expired'
              ? 'Ce lien de vérification a expiré (24h). Refaites une demande pour en recevoir un nouveau.'
              : "Ce lien n'est pas valide. Vérifiez que vous avez copié l'URL complète depuis l'email."}
          </p>
          <a href="/devis-rapide" className="text-blue-600 font-medium text-sm">Refaire une demande →</a>
        </div>
      </Shell>
    );
  }

  if (loadState === 'already_used') {
    return (
      <Shell>
        <div className="text-center">
          <CheckCircle className="mx-auto text-emerald-500 mb-3" size={40} />
          <h1 className="text-lg font-bold text-gray-900 mb-2">Compte déjà créé</h1>
          <p className="text-gray-600 text-sm mb-4">
            Ce lien a déjà été utilisé. Connectez-vous avec {email ? <strong>{email}</strong> : 'votre email'} et votre mot de passe.
          </p>
          <a href="/client/login" className="inline-block bg-blue-600 text-white font-semibold px-6 py-2.5 rounded-lg text-sm">
            Se connecter
          </a>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
        <Shield className="text-blue-600" size={26} />
      </div>
      <h1 className="text-xl font-bold text-gray-900 mb-1 text-center">
        {firstName ? `Bonjour ${firstName}` : 'Créez votre mot de passe'}
      </h1>
      <p className="text-gray-500 text-sm text-center mb-6">
        Sécurisez votre compte ({email}) pour suivre votre demande.
      </p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">Mot de passe</label>
          <PasswordInput value={password} onChange={setPassword} autoFocus />
          {password && buildPasswordErrorMessage(password) && (
            <p className="text-red-500 text-xs mt-1">{buildPasswordErrorMessage(password)}</p>
          )}
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">Confirmer le mot de passe</label>
          <PasswordInput value={confirmPassword} onChange={setConfirmPassword} />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-gradient-to-r from-emerald-500 via-cyan-500 to-blue-500 text-white font-bold py-3.5 rounded-xl disabled:opacity-60"
        >
          {submitting ? 'Création...' : 'Créer mon mot de passe'}
        </button>
      </form>
    </Shell>
  );
}
