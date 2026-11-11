// Page d'arrivée des publicités Google/Meta : pas de menu, formulaire visible
// immédiatement. Les informations sont reprises dans le formulaire complet
// (création du compte à l'envoi), et la personne est relancée si elle s'arrête.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, BadgeCheck, FileText, Users } from 'lucide-react';
import { rememberAcquisitionSource, sourceFromUrl } from '../utils/acquisitionSource';
import { saveQuotePrefill } from '../utils/quotePrefill';
import { trackAdEvent } from '../lib/ads';

const SIZES = ['Studio', 'T1', 'T2', 'T3', 'T4', 'T5+'];
const TITLE = 'Devis déménagement gratuit : jusqu’à 3 déménageurs vérifiés | TrouveTonDéménageur';

function setMeta(name: string, content: string) {
  let el = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null;
  if (!el) { el = document.createElement('meta'); el.name = name; document.head.appendChild(el); }
  el.content = content;
}

export default function AdLandingPage() {
  const navigate = useNavigate();
  const city = new URLSearchParams(window.location.search).get('ville')?.slice(0, 60) || '';
  const [from, setFrom] = useState(city);
  const [to, setTo] = useState('');
  const [date, setDate] = useState('');
  const [homeType, setHomeType] = useState('Appartement');
  const [size, setSize] = useState('T2');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    document.title = TITLE;
    setMeta('robots', 'noindex, follow');
    rememberAcquisitionSource(sourceFromUrl(window.location.search));
    const ld = document.createElement('script');
    ld.type = 'application/ld+json';
    ld.text = JSON.stringify({ '@context': 'https://schema.org', '@type': 'MovingCompany', name: 'TrouveTonDéménageur', url: 'https://www.trouvetondemenageur.fr', telephone: '+33189707881', areaServed: city || 'France', address: { '@type': 'PostalAddress', streetAddress: '60 rue François Ier', postalCode: '75008', addressLocality: 'Paris', addressCountry: 'FR' } });
    document.head.appendChild(ld);
    return () => { ld.remove(); setMeta('robots', 'index, follow'); };
  }, [city]);

  const minDate = new Date().toISOString().split('T')[0];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const phoneDigits = phone.replace(/[\s.\-()]/g, '');
    if (from.trim().length < 2 || to.trim().length < 2) return setError('Indiquez la ville de départ et la ville d’arrivée.');
    if (!date) return setError('Indiquez la date souhaitée.');
    if (name.trim().length < 2) return setError('Indiquez votre nom.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError('Indiquez une adresse email valide.');
    if (!/^(\+33|0)[67]\d{8}$/.test(phoneDigits)) return setError('Indiquez un numéro de mobile (06 ou 07).');
    setSending(true);
    const source = sourceFromUrl(window.location.search);
    rememberAcquisitionSource(source);
    saveQuotePrefill({ client_name: name.trim(), client_email: email.trim(), client_phone: phone.trim(), moving_date: date, from_home_type: homeType, from_home_size: size, departure_city: from.trim(), arrival_city: to.trim() });
    const [firstName, ...rest] = name.trim().split(/\s+/);
    // Garde ses coordonnées pour la relance si elle ne termine pas le formulaire complet.
    await fetch('/api/save-partial-lead', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ leadType: 'client', email, phone, firstName, lastName: rest.join(' '), source }) }).catch(() => {});
    trackAdEvent('Lead');
    if (typeof (window as any).gtag === 'function') (window as any).gtag('event', 'generate_lead', { source });
    navigate('/client/quote');
  }

  const input = 'w-full px-3 py-2.5 rounded-lg border border-gray-300 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-800">
      <div className="max-w-5xl mx-auto px-4 py-5 sm:py-8 grid md:grid-cols-2 gap-6 md:gap-10 items-start">
        <div className="text-white md:pt-6">
          <img src="/logo.png" alt="TrouveTonDéménageur" className="h-9 w-auto mb-5" />
          <h1 className="text-2xl sm:text-4xl font-extrabold leading-tight">{city ? `Déménageur à ${city}` : 'Votre déménagement, entre de bonnes mains'}</h1>
          <h2 className="mt-3 text-base sm:text-lg text-blue-100">Comparez jusqu’à 3 devis gratuits de déménageurs vérifiés. Une équipe à votre écoute, sans engagement.</h2>
          <ul className="mt-5 space-y-2.5 text-sm sm:text-base hidden md:block">
            <li className="flex gap-2"><BadgeCheck className="w-5 h-5 text-emerald-300 shrink-0" />Déménageurs vérifiés : KBIS, URSSAF et assurance contrôlés</li>
            <li className="flex gap-2"><FileText className="w-5 h-5 text-emerald-300 shrink-0" />Jusqu’à 3 devis à comparer, gratuitement</li>
            <li className="flex gap-2"><Users className="w-5 h-5 text-emerald-300 shrink-0" />Une équipe joignable au 01 89 70 78 81</li>
          </ul>
        </div>
        <form onSubmit={submit} className="bg-white rounded-2xl shadow-2xl p-5 sm:p-6 space-y-3" noValidate>
          <p className="font-bold text-gray-900 text-lg">Recevoir mes devis</p>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm text-gray-700">Ville de départ<input className={input} value={from} onChange={e => setFrom(e.target.value)} autoComplete="address-level2" /></label>
            <label className="text-sm text-gray-700">Ville d’arrivée<input className={input} value={to} onChange={e => setTo(e.target.value)} /></label>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <label className="text-sm text-gray-700 col-span-1">Date<input type="date" min={minDate} className={input} value={date} onChange={e => setDate(e.target.value)} /></label>
            <label className="text-sm text-gray-700">Logement<select className={input} value={homeType} onChange={e => setHomeType(e.target.value)}><option>Appartement</option><option>Maison</option></select></label>
            <label className="text-sm text-gray-700">Taille<select className={input} value={size} onChange={e => setSize(e.target.value)}>{SIZES.map(s => <option key={s}>{s}</option>)}</select></label>
          </div>
          <label className="block text-sm text-gray-700">Nom et prénom<input className={input} value={name} onChange={e => setName(e.target.value)} autoComplete="name" /></label>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="text-sm text-gray-700">Email<input type="email" className={input} value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" /></label>
            <label className="text-sm text-gray-700">Mobile<input type="tel" className={input} value={phone} onChange={e => setPhone(e.target.value)} autoComplete="tel" /></label>
          </div>
          {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
          <button disabled={sending} className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2">
            {sending ? 'Un instant…' : <>Continuer ma demande <ArrowRight className="w-4 h-4" /></>}
          </button>
          <p className="text-xs text-gray-500">Étape suivante : adresses, étages et volume, puis création de votre espace pour suivre vos devis. <a href="/legal/privacy-policy" className="underline">Confidentialité</a></p>
        </form>
      </div>
    </div>
  );
}
