import { useState } from 'react';
import { Phone, Mail, Building, User, CheckCircle, ArrowRight, Shield, Star, Hash } from 'lucide-react';
import { Logo } from '../components/Logo';
import { validateSiret } from '../utils/validation';

export function MoverQuickLeadPage() {
  const [managerFirstname, setManagerFirstname] = useState('');
  const [managerLastname, setManagerLastname] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [siret, setSiret] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const params = new URLSearchParams(window.location.search);
  const source = params.get('src') || 'direct';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!managerFirstname.trim() || !managerLastname.trim() || !companyName.trim()) {
      setError('Merci de renseigner votre nom, prénom et le nom de votre entreprise.');
      return;
    }
    const siretValidation = validateSiret(siret);
    if (!siretValidation.isValid) {
      setError(siretValidation.error || 'Numéro SIRET invalide.');
      return;
    }
    const phoneDigits = phone.trim().replace(/[\s.\-()]/g, '');
    if (!/^(\+33[67]|0[67])\d{8}$/.test(phoneDigits)) {
      setError('Merci de renseigner un numéro de mobile français valide (06 ou 07).');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Merci de renseigner une adresse email valide.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/mover-quick-lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          manager_firstname: managerFirstname.trim(),
          manager_lastname: managerLastname.trim(),
          company_name: companyName.trim(),
          siret: siret.trim(),
          phone,
          email,
          source,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Une erreur est survenue.');

      if (typeof (window as any).fbq === 'function') (window as any).fbq('track', 'Lead');
      if (typeof (window as any).gtag === 'function') (window as any).gtag('event', 'generate_lead', { source, type: 'mover' });

      setSubmitted(true);
    } catch (err: any) {
      setError(err.message || 'Une erreur est survenue, réessaie.');
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-800 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="text-emerald-600" size={32} />
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Inscription bien reçue !</h1>
          <p className="text-gray-600 text-sm">
            Il ne reste qu'une étape pour rejoindre notre réseau de déménageurs vérifiés.
          </p>
          <p className="text-gray-500 text-xs mt-3 bg-blue-50 rounded-lg p-3">
            📩 Un email a été envoyé à <strong>{email}</strong> avec un bouton pour créer votre mot de
            passe et finaliser votre inscription (informations entreprise, KBIS, assurance...).
            Pensez à vérifier vos spams.
          </p>
        </div>
      </div>
    );
  }

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

          <div className="bg-white rounded-2xl shadow-2xl p-6 sm:p-8">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 text-center leading-snug">
              Rejoignez notre réseau de déménageurs vérifiés
            </h1>
            <p className="text-sm text-gray-500 text-center mt-2 mb-6">
              Recevez des demandes de devis qualifiées partout en France.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Prénom</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-600" size={18} />
                    <input
                      type="text"
                      value={managerFirstname}
                      onChange={(e) => setManagerFirstname(e.target.value)}
                      placeholder="Jean"
                      className="w-full pl-10 pr-3 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Nom</label>
                  <input
                    type="text"
                    value={managerLastname}
                    onChange={(e) => setManagerLastname(e.target.value)}
                    placeholder="Dupont"
                    className="w-full px-3 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Nom de l'entreprise</label>
                <div className="relative">
                  <Building className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-600" size={18} />
                  <input
                    type="text"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="Déménagements Dupont SARL"
                    className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Numéro SIRET</label>
                <div className="relative">
                  <Hash className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-600" size={18} />
                  <input
                    type="text"
                    value={siret}
                    onChange={(e) => setSiret(e.target.value)}
                    placeholder="123 456 789 00012"
                    className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Téléphone</label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-600" size={18} />
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="06 12 34 56 78"
                    className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-600" size={18} />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="contact@entreprise.fr"
                    className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                </div>
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-emerald-500 via-cyan-500 to-blue-500 text-white font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {loading ? 'Envoi...' : 'Rejoindre le réseau'}
                {!loading && <ArrowRight size={18} />}
              </button>
            </form>

            <div className="flex items-center justify-center gap-4 mt-5 text-[11px] text-gray-500">
              <div className="flex items-center gap-1">
                <Shield size={13} className="text-blue-600" />
                Vérification sous 24-48h
              </div>
              <div className="flex items-center gap-1">
                <Star size={13} className="text-blue-600" />
                Toute la France
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
