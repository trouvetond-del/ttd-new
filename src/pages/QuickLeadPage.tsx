import { useState } from 'react';
import { MapPin, Phone, Mail, Calendar, CheckCircle, Shield, Star, ArrowRight } from 'lucide-react';
import { Logo } from '../components/Logo';

export function QuickLeadPage() {
  const [fromCity, setFromCity] = useState('');
  const [toCity, setToCity] = useState('');
  const [movingDate, setMovingDate] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  // Source publicitaire : ?src=meta, ?src=google, etc. (à ajouter dans l'URL des annonces)
  const params = new URLSearchParams(window.location.search);
  const source = params.get('src') || 'direct';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!fromCity.trim() || !toCity.trim() || !phone.trim() || !email.trim()) {
      setError('Merci de remplir tous les champs pour recevoir vos devis.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Merci de renseigner une adresse email valide.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/quick-lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from_city: fromCity, to_city: toCity, moving_date: movingDate, phone, email, source }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Une erreur est survenue.');

      // Événement de conversion Meta Pixel (si le pixel est installé)
      if (typeof (window as any).fbq === 'function') {
        (window as any).fbq('track', 'Lead');
      }
      // Événement de conversion Google Ads (si gtag est présent)
      if (typeof (window as any).gtag === 'function') {
        (window as any).gtag('event', 'generate_lead', { source });
      }

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
          <h1 className="text-xl font-bold text-gray-900 mb-2">Demande envoyée !</h1>
          <p className="text-gray-600 text-sm">
            Nos déménageurs vérifiés vont être notifiés. Vous serez recontacté au{' '}
            <span className="font-semibold">{phone}</span> très rapidement.
          </p>
          <p className="text-gray-500 text-xs mt-2">
            Un email avec un lien pour finaliser votre demande vous a été envoyé à {email}.
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
              Recevez vos devis de déménageurs vérifiés
            </h1>
            <p className="text-sm text-gray-500 text-center mt-2 mb-6">
              4 infos, 30 secondes, aucun engagement.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Ville de départ</label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-600" size={18} />
                  <input
                    type="text"
                    value={fromCity}
                    onChange={(e) => setFromCity(e.target.value)}
                    placeholder="Paris"
                    className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Ville d'arrivée</label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-600" size={18} />
                  <input
                    type="text"
                    value={toCity}
                    onChange={(e) => setToCity(e.target.value)}
                    placeholder="Lyon"
                    className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                  Date de déménagement <span className="text-gray-400 font-normal">(optionnel)</span>
                </label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-600" size={18} />
                  <input
                    type="date"
                    value={movingDate}
                    onChange={(e) => setMovingDate(e.target.value)}
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
                    placeholder="vous@exemple.fr"
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
                {loading ? 'Envoi...' : 'Recevoir mes devis gratuits'}
                {!loading && <ArrowRight size={18} />}
              </button>
            </form>

            <div className="flex items-center justify-center gap-4 mt-5 text-[11px] text-gray-500">
              <div className="flex items-center gap-1">
                <Shield size={13} className="text-blue-600" />
                Sans engagement
              </div>
              <div className="flex items-center gap-1">
                <Star size={13} className="text-blue-600" />
                Déménageurs vérifiés
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
