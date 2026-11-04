import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Loader2, Truck } from 'lucide-react';
import { supabase } from '../lib/supabase';

// /driver/login : connexion chauffeur. /driver/set-password : création du mot de passe depuis l'email d'invitation.
export default function DriverLoginPage() {
  const navigate = useNavigate();
  const setPassword = useLocation().pathname.endsWith('set-password');
  const [email, setEmail] = useState('');
  const [password, setPwd] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(!setPassword);

  useEffect(() => {
    if (!setPassword) return;
    // Le lien de l'email ouvre une session ; on attend qu'elle soit disponible.
    const check = async () => { const { data } = await supabase.auth.getSession(); if (data.session) setReady(true); };
    check();
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => { if (s) setReady(true); });
    return () => sub.subscription.unsubscribe();
  }, [setPassword]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError('');
    const { error } = setPassword
      ? await supabase.auth.updateUser({ password })
      : await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) { setError(setPassword ? 'Le mot de passe doit faire au moins 8 caractères.' : 'Email ou mot de passe incorrect.'); return; }
    navigate('/driver', { replace: true });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-blue-50 to-white px-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-50"><Truck className="h-6 w-6 text-blue-600" /></span>
          <h1 className="mt-3 text-xl font-bold text-gray-900">{setPassword ? 'Créez votre mot de passe' : 'Espace chauffeur'}</h1>
          <p className="text-sm text-gray-500">{setPassword ? 'Vous pourrez ensuite ouvrir et clôturer vos missions.' : 'Connectez-vous pour voir vos missions.'}</p>
        </div>
        {!setPassword && (
          <input required type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email"
            className="w-full rounded-xl border border-gray-300 px-3 py-3 text-base" />
        )}
        <input required type="password" minLength={setPassword ? 8 : undefined} autoComplete={setPassword ? 'new-password' : 'current-password'} value={password}
          onChange={(e) => setPwd(e.target.value)} placeholder={setPassword ? 'Nouveau mot de passe (8 caractères min.)' : 'Mot de passe'}
          className="w-full rounded-xl border border-gray-300 px-3 py-3 text-base" />
        {error && <p className="text-sm text-red-600">{error}</p>}
        {setPassword && !ready && <p className="text-sm text-amber-700">Ouvrez cette page depuis le lien reçu par email.</p>}
        <button disabled={busy || !ready} className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3.5 text-base font-semibold text-white disabled:opacity-60">
          {busy && <Loader2 className="h-5 w-5 animate-spin" />}{setPassword ? 'Enregistrer' : 'Se connecter'}
        </button>
        {!setPassword && <a href="/forgot-password" className="block text-center text-sm text-blue-600">Mot de passe oublié ?</a>}
      </form>
    </div>
  );
}
