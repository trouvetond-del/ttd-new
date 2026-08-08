import { useState } from 'react';
import { Phone, Mail, Calendar, CheckCircle, Shield, Star, ArrowRight, User } from 'lucide-react';
import { Logo } from '../components/Logo';
import AddressAutocomplete from '../components/AddressAutocomplete';

type AddressValue = {
  fullAddress: string;
  street: string;
  city: string;
  postalCode: string;
  country: string;
  latitude?: number;
  longitude?: number;
};

const emptyAddress: AddressValue = {
  fullAddress: '', street: '', city: '', postalCode: '', country: 'France',
};

// Une adresse "acceptable" tapée à la main sans passer par la suggestion
// Google (ex: script bloqué par un bloqueur de pub) : au moins un numéro et
// une longueur raisonnable. Moins précis pour le calcul de distance, mais on
// ne bloque jamais la capture du lead pour cette raison.
function isPlausibleManualAddress(raw: string): boolean {
  return raw.trim().length >= 8 && /\d/.test(raw);
}

export function QuickLeadPage() {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [fromAddress, setFromAddress] = useState<AddressValue>(emptyAddress);
  const [toAddress, setToAddress] = useState<AddressValue>(emptyAddress);
  const [fromAddressRaw, setFromAddressRaw] = useState('');
  const [toAddressRaw, setToAddressRaw] = useState('');
  // Ville de secours, saisie à la main : uniquement affichée/utilisée quand
  // l'utilisateur a tapé une adresse sans sélectionner de suggestion Google
  // (fromAddress.city reste alors vide). Sans ça, la demande arrive en admin
  // sans ville, invisible pour le matching déménageurs et injustifiable en
  // admin (cf. cas Isabelle Hauguel du 08/08).
  const [fromCityManual, setFromCityManual] = useState('');
  const [toCityManual, setToCityManual] = useState('');
  // Type de logement collecté dès ce premier formulaire (comme Nextories,
  // Demenagement24, Officiel du déménagement, AnyVan...) au lieu d'être
  // repoussé après création de compte. Corrige à la source le problème du
  // "cubage manquant" et permet un prix indicatif instantané, qui augmente
  // la confiance et la conversion sur tous les sites concurrents étudiés.
  const [homeSize, setHomeSize] = useState('');
  const [homeType, setHomeType] = useState<'Appartement' | 'Maison'>('Appartement');

  // Même barème que src/utils/priceValidation.ts (SmartPriceCalculator),
  // pour rester cohérent avec l'estimation affichée ailleurs dans l'app.
  const HOME_SIZE_BASE_PRICE: Record<string, number> = {
    Studio: 750, T1: 1000, T2: 1500, T3: 2250, T4: 3000, 'T5+': 3750,
  };
  const HOME_SIZE_VOLUME_M3: Record<string, number> = {
    Studio: 15, T1: 20, T2: 30, T3: 45, T4: 60, 'T5+': 80,
  };

  function haversineKm(lat1?: number, lng1?: number, lat2?: number, lng2?: number): number | null {
    if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return null;
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  const priceEstimate = (() => {
    if (!homeSize) return null;
    let base = HOME_SIZE_BASE_PRICE[homeSize] || 1500;
    if (homeType === 'Maison') base *= 1.2;
    const distance = haversineKm(fromAddress.latitude, fromAddress.longitude, toAddress.latitude, toAddress.longitude);
    if (distance) {
      if (distance > 200) base += 90 + (distance - 200) * 0.45;
      else if (distance > 50) base += (distance - 50) * 0.6;
    }
    return { min: Math.round(base * 0.85 / 10) * 10, max: Math.round(base * 1.15 / 10) * 10 };
  })();
  const [movingDate, setMovingDate] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  // Source publicitaire : ?src=meta, ?src=google, etc.
  const params = new URLSearchParams(window.location.search);
  const source = params.get('src') || 'direct';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!firstName.trim() || !lastName.trim()) {
      setError('Merci de renseigner votre nom et prénom.');
      return;
    }
    const fromValid = fromAddress.fullAddress.trim() || isPlausibleManualAddress(fromAddressRaw);
    const toValid = toAddress.fullAddress.trim() || isPlausibleManualAddress(toAddressRaw);
    if (!fromValid || !toValid) {
      setError('Merci de renseigner une adresse de départ et une adresse d\'arrivée complètes (numéro, rue, ville).');
      return;
    }
    // La ville est obligatoire dans tous les cas : soit fournie par Google
    // (fromAddress.city), soit saisie à la main si l'autocomplete n'a pas
    // été utilisé. Sans ville, la demande est inexploitable pour les
    // déménageurs et invisible dans le matching -- on ne la laisse plus
    // passer, même si le reste de l'adresse est "plausible".
    const resolvedFromCity = fromAddress.city || fromCityManual.trim();
    const resolvedToCity = toAddress.city || toCityManual.trim();
    if (!resolvedFromCity || !resolvedToCity) {
      setError('Merci de préciser la ville de départ et la ville d\'arrivée.');
      return;
    }
    if (!homeSize) {
      setError('Merci d\'indiquer la taille de votre logement pour recevoir une estimation.');
      return;
    }
    if (!phone.trim() || !email.trim()) {
      setError('Merci de renseigner votre téléphone et votre email.');
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
      const res = await fetch('/api/quick-lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          from_address: fromAddress.fullAddress || fromAddressRaw.trim(),
          from_city: resolvedFromCity,
          from_postal_code: fromAddress.postalCode,
          from_latitude: fromAddress.latitude ?? null,
          from_longitude: fromAddress.longitude ?? null,
          to_address: toAddress.fullAddress || toAddressRaw.trim(),
          to_city: resolvedToCity,
          to_postal_code: toAddress.postalCode,
          to_latitude: toAddress.latitude ?? null,
          to_longitude: toAddress.longitude ?? null,
          moving_date: movingDate,
          phone,
          email,
          source,
          home_size: homeSize,
          home_type: homeType,
          volume_m3: HOME_SIZE_VOLUME_M3[homeSize] || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Une erreur est survenue.');

      // Événements de conversion
      if (typeof (window as any).fbq === 'function') (window as any).fbq('track', 'Lead');
      if (typeof (window as any).gtag === 'function') (window as any).gtag('event', 'generate_lead', { source });

      // L'email de vérification (code + bouton "Créer mon mot de passe")
      // est envoyé côté serveur par api/quick-lead.ts, indépendamment de
      // Supabase Auth (pour éviter les templates email piégeux de Supabase).

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
          <p className="text-gray-500 text-xs mt-3 bg-blue-50 rounded-lg p-3">
            📩 Un email vous a été envoyé à <strong>{email}</strong> avec un bouton pour créer votre
            mot de passe et finaliser votre dossier en 2 minutes (étage, ascenseur, inventaire...).
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
              Recevez vos devis de déménageurs vérifiés
            </h1>
            <p className="text-sm text-gray-500 text-center mt-2 mb-6">
              1 minute, aucun engagement.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Prénom</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-600" size={18} />
                    <input
                      type="text"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="Jean"
                      className="w-full pl-10 pr-3 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Nom</label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Dupont"
                    className="w-full px-3 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                </div>
              </div>

              <AddressAutocomplete
                id="from-address"
                label="Adresse de départ"
                required
                value={fromAddress.fullAddress}
                placeholder="12 rue de la Paix, Paris"
                onAddressSelect={(addr) => setFromAddress(addr)}
                onInputChange={(raw) => setFromAddressRaw(raw)}
              />
              {fromAddressRaw.trim().length > 0 && !fromAddress.city && (
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                    Ville de départ
                  </label>
                  <input
                    type="text"
                    value={fromCityManual}
                    onChange={(e) => setFromCityManual(e.target.value)}
                    placeholder="Ex : Le Havre"
                    className="w-full px-3 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                  <p className="mt-1 text-xs text-amber-600">
                    Suggestion d'adresse non sélectionnée : précisez la ville pour qu'on puisse vous trouver un déménageur.
                  </p>
                </div>
              )}

              <AddressAutocomplete
                id="to-address"
                label="Adresse d'arrivée"
                required
                value={toAddress.fullAddress}
                placeholder="5 avenue Foch, Lyon"
                onAddressSelect={(addr) => setToAddress(addr)}
                onInputChange={(raw) => setToAddressRaw(raw)}
              />
              {toAddressRaw.trim().length > 0 && !toAddress.city && (
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                    Ville d'arrivée
                  </label>
                  <input
                    type="text"
                    value={toCityManual}
                    onChange={(e) => setToCityManual(e.target.value)}
                    placeholder="Ex : Lyon"
                    className="w-full px-3 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                  <p className="mt-1 text-xs text-amber-600">
                    Suggestion d'adresse non sélectionnée : précisez la ville pour qu'on puisse vous trouver un déménageur.
                  </p>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                  Taille de votre logement actuel
                </label>
                <div className="grid grid-cols-3 gap-2 mb-2">
                  {(['Appartement', 'Maison'] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setHomeType(t)}
                      className={`col-span-1 py-2 rounded-lg text-sm font-medium border transition ${
                        homeType === t
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-gray-600 border-gray-200'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {['Studio', 'T1', 'T2', 'T3', 'T4', 'T5+'].map((size) => (
                    <button
                      key={size}
                      type="button"
                      onClick={() => setHomeSize(size)}
                      className={`py-2 rounded-lg text-sm font-medium border transition ${
                        homeSize === size
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-gray-600 border-gray-200'
                      }`}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>

              {priceEstimate && (
                <div className="bg-gradient-to-br from-blue-50 to-emerald-50 border border-blue-200 rounded-xl p-4 text-center">
                  <p className="text-xs text-gray-600 mb-1">Estimation indicative de votre déménagement</p>
                  <p className="text-2xl font-bold text-blue-700">
                    {priceEstimate.min}€ – {priceEstimate.max}€
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    Prix réel confirmé par le(s) déménageur(s) qui vous contacteront
                  </p>
                </div>
              )}

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
