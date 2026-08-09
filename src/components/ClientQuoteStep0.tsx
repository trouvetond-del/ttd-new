import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, ArrowRight } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { validateEmail, validatePhone } from '../utils/validation';
import { showToast } from '../utils/toast';

// Étape 0 de /client/quote : email d'abord, avant tout détail
// logistique. Crée un compte léger (mot de passe temporaire généré
// côté serveur) + un brouillon de demande, puis redirige vers
// /client/quote/:id/edit -- le flux existant, non modifié par ce
// composant. Isolé volontairement : ce fichier ne touche à aucune
// ligne de la logique du formulaire complet (2 incidents en
// production sur ce fichier le même jour que ce chantier).
//
// Texte de consentement NON validé juridiquement -- implémenté à la
// demande explicite du client, en l'absence de retour de son juriste.
// Case "conservation du brouillon" : information, pas une case à
// cocher (base légale = mesures précontractuelles, pas consentement
// marketing). Cases email/SMS : consentement, non cochées par défaut,
// distinctes l'une de l'autre.
export function ClientQuoteStep0() {
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [smsConsent, setSmsConsent] = useState(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [loading, setLoading] = useState(false);

  // Exit intent : proposé une seule fois par session, uniquement tant
  // que l'email n'est pas encore saisi (sinon le brouillon existe déjà).
  const [showExitIntent, setShowExitIntent] = useState(false);
  const exitIntentShown = useRef(false);

  useEffect(() => {
    if (sessionStorage.getItem('ttd_exit_intent_shown')) {
      exitIntentShown.current = true;
    }
    const handleMouseLeave = (e: MouseEvent) => {
      if (exitIntentShown.current || email.trim()) return;
      if (e.clientY <= 0) {
        exitIntentShown.current = true;
        sessionStorage.setItem('ttd_exit_intent_shown', '1');
        setShowExitIntent(true);
      }
    };
    document.addEventListener('mouseleave', handleMouseLeave);
    return () => document.removeEventListener('mouseleave', handleMouseLeave);
  }, [email]);

  const validate = () => {
    const newErrors: { [key: string]: string } = {};
    if (!firstName.trim()) newErrors.firstName = 'Prénom requis';
    if (!lastName.trim()) newErrors.lastName = 'Nom requis';
    if (!validateEmail(email)) newErrors.email = 'Email invalide';
    if (!validatePhone(phone)) newErrors.phone = 'Téléphone invalide';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-draft-quote-account`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: email.trim(),
            phone: phone.trim(),
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            marketingConsent,
            smsConsent,
          }),
        }
      );
      const json = await res.json();

      if (!res.ok) {
        if (json.alreadyExists) {
          showToast('Un compte existe déjà avec cet email. Connectez-vous pour continuer.', 'error');
          navigate('/client/auth-choice');
          return;
        }
        showToast(json.error || 'Erreur lors de la création de votre demande', 'error');
        return;
      }

      // Établit la session cliente avec le mot de passe temporaire,
      // puis redirige vers le flux d'édition existant (déjà stable).
      await signIn(json.email, json.tempPassword);
      navigate(`/client/quote/${json.quoteRequestId}/edit`);
    } catch (err) {
      console.error('Erreur step 0:', err);
      showToast('Une erreur est survenue. Réessayez.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 py-12 px-4">
      <div className="max-w-lg mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-extrabold text-gray-900 mb-3">Votre demande de déménagement</h1>
          <p className="text-gray-600">2 minutes pour commencer. Les détails viennent ensuite.</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-xl p-8 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Prénom</label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className={`w-full px-3 py-2.5 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.firstName ? 'border-red-300' : 'border-gray-200'}`}
              />
              {errors.firstName && <p className="text-xs text-red-600 mt-1">{errors.firstName}</p>}
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Nom</label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className={`w-full px-3 py-2.5 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.lastName ? 'border-red-300' : 'border-gray-200'}`}
              />
              {errors.lastName && <p className="text-xs text-red-600 mt-1">{errors.lastName}</p>}
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="vous@exemple.fr"
              className={`w-full px-3 py-2.5 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.email ? 'border-red-300' : 'border-gray-200'}`}
            />
            {errors.email && <p className="text-xs text-red-600 mt-1">{errors.email}</p>}
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Téléphone</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="06 12 34 56 78"
              className={`w-full px-3 py-2.5 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.phone ? 'border-red-300' : 'border-gray-200'}`}
            />
            {errors.phone && <p className="text-xs text-red-600 mt-1">{errors.phone}</p>}
          </div>

          <div className="bg-gray-50 rounded-xl p-4 space-y-3 text-sm">
            <p className="text-gray-600">
              En continuant, vous acceptez que TrouveTonDéménageur conserve les informations de votre demande pour vous permettre de la reprendre si vous ne la terminez pas aujourd'hui.
            </p>
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={marketingConsent}
                onChange={(e) => setMarketingConsent(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-gray-700">J'accepte d'être recontacté(e) par email pour finaliser ma demande si je ne la termine pas.</span>
            </label>
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={smsConsent}
                onChange={(e) => setSmsConsent(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-gray-700">J'accepte également d'être recontacté(e) par SMS pour ce même motif.</span>
            </label>
            <p className="text-xs text-gray-500">
              Vous pouvez retirer votre consentement à tout moment via le lien de désabonnement présent dans chaque email, ou en écrivant à support@trouvetondemenageur.fr.
            </p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white py-3.5 rounded-xl font-bold hover:from-blue-700 hover:to-blue-800 transition-all disabled:opacity-60"
          >
            {loading ? 'Un instant…' : 'Continuer'}
            {!loading && <ArrowRight className="w-5 h-5" />}
          </button>

          <div className="flex items-center justify-center gap-1.5 text-xs text-gray-500">
            <Shield className="w-3.5 h-3.5 text-blue-600" />
            Gratuit, sans engagement
          </div>
        </form>
      </div>

      {showExitIntent && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full text-center">
            <h2 className="text-xl font-bold text-gray-900 mb-2">Vous partez déjà ?</h2>
            <p className="text-gray-600 mb-6">
              Laissez votre email, on garde votre place — vous pourrez reprendre où vous en étiez.
            </p>
            <button
              onClick={() => setShowExitIntent(false)}
              className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 transition-colors mb-2"
            >
              Continuer ma demande
            </button>
            <button
              onClick={() => setShowExitIntent(false)}
              className="text-sm text-gray-500 hover:underline"
            >
              Non merci
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
