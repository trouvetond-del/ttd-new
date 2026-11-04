import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Camera, CheckCircle, ChevronDown, Pause, Play, Truck } from 'lucide-react';
import departure from '../../assets/photo-departure.asset.json';
import loading from '../../assets/photo-loading.asset.json';
import arrival from '../../assets/photo-arrival.asset.json';

const ASSET_ORIGIN = 'https://move-finder-joy.lovable.app';

function MotionToggle({ paused, onClick, label }: { paused: boolean; onClick: () => void; label: string }) {
  return <button type="button" className="home-motion-toggle" onClick={onClick} aria-label={`${paused ? 'Reprendre' : 'Mettre en pause'} ${label}`} title={`${paused ? 'Reprendre' : 'Mettre en pause'} ${label}`} aria-pressed={paused}>{paused ? <Play size={18} /> : <Pause size={18} />}</button>;
}

const partners = [
  { name: 'Stripe', mark: 'S', tone: 'stripe' },
  { name: 'Dropbox Sign', mark: 'D', tone: 'dropbox' },
  { name: 'Vercel', mark: '▲', tone: 'vercel' },
];

export function HomePartners() {
  const [paused, setPaused] = useState(false);
  return <section className="home-partners home-band" aria-labelledby="home-partners-title">
    <div className="home-section-heading"><h2 id="home-partners-title">Nos <span className="gradient-text">partenaires</span></h2><MotionToggle paused={paused} onClick={() => setPaused(p => !p)} label="le défilement des partenaires" /></div>
    <div className={`partner-tunnel ${paused ? 'is-paused' : ''}`}>
      <div className="partner-track">
        {[0, 1].map(copy => <div key={copy} className="partner-group" aria-hidden={copy === 1 ? true : undefined}>
          {[0, 1, 2].flatMap(repeat => partners.map(partner => <div className="partner-item" key={`${repeat}-${partner.name}`} aria-hidden={repeat > 0 ? true : undefined}><span className={`partner-mark partner-mark-${partner.tone}`} aria-hidden="true">{partner.mark}</span><span>{partner.name}</span></div>))}
        </div>)}
      </div>
    </div>
    <Link className="home-text-link" to="/partners">Découvrir nos partenaires <ArrowRight size={16} /></Link>
  </section>;
}

const faqs = [
  { question: 'Combien coûte un déménagement ?', answer: 'Le prix dépend du volume, de la distance, des étages, des accès et des prestations choisies. Une estimation donne un ordre de grandeur ; seul le devis du déménageur précise le prix de votre projet.' },
  { question: 'Comment obtenir mes devis gratuits ?', answer: 'Renseignez les adresses, la date, les étages, les accès et le volume de votre déménagement. Créez votre compte à la fin du formulaire, puis envoyez votre demande pour recevoir jusqu’à 3 devis sous 24 h, sans engagement.' },
  { question: 'Que faire si le volume ou les accès changent ?', answer: 'Prévenez le déménageur dès que possible. Un volume ou des conditions d’accès différents peuvent nécessiter un ajustement du devis : faites confirmer les changements avant le déménagement.' },
  { question: 'Qui réalise mon déménagement ?', answer: 'Le professionnel que vous choisissez réalise votre déménagement. TrouveTonDemenageur vous met en relation, vérifie les documents des professionnels et vous accompagne dans le suivi de votre projet.' },
  { question: 'Que faire si un meuble est abîmé ?', answer: 'Signalez le dommage au déménageur et conservez les photos prises avant le chargement et à l’arrivée. La comparaison des photos aide à documenter le dossier et à transmettre les éléments utiles à son assurance.' },
];

export function HomeFAQ() {
  return <section className="home-faq home-band" aria-labelledby="home-faq-title">
    <div className="home-inner"><h2 id="home-faq-title">Vos questions <span className="gradient-text">avant de déménager</span></h2>
      <div className="home-faq-list">{faqs.map(faq => <details key={faq.question} className="home-faq-item"><summary>{faq.question}<ChevronDown size={20} aria-hidden="true" /></summary><p>{faq.answer}</p></details>)}
        <Link to="/faq" className="home-faq-more">Plus de questions <ArrowRight size={20} /></Link>
      </div>
    </div>
  </section>;
}

const steps = [
  { title: '1. Au départ', text: 'Vous photographiez', image: ASSET_ORIGIN + departure.url, alt: 'Photographie d’un canapé avant le déménagement', Icon: Camera },
  { title: '2. Au chargement', text: 'Le pro photographie', image: ASSET_ORIGIN + loading.url, alt: 'Déménageur photographiant un canapé protégé dans le camion', Icon: Truck },
  { title: '3. À l’arrivée', text: 'Vous vérifiez', image: ASSET_ORIGIN + arrival.url, alt: 'Vérification du canapé livré dans le nouveau logement', Icon: CheckCircle },
];

export function HomePhotoProtection() {
  const section = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    const element = section.current;
    if (!element) return;
    const observer = new IntersectionObserver(entries => setVisible(entries.some(entry => entry.isIntersecting)), { threshold: 0.15 });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return <section ref={section} className={`home-photos home-band ${visible ? 'is-visible' : ''} ${paused ? 'is-paused' : ''}`} aria-labelledby="home-photo-title">
    <div className="home-inner"><div className="home-section-heading"><h2 id="home-photo-title">Vos biens protégés <span className="gradient-text">en 3 photos</span></h2><MotionToggle paused={paused} onClick={() => setPaused(p => !p)} label="l’animation des photos" /></div>
      <p className="home-photo-intro">Client et déménageur sont protégés de la même façon.</p>
      <div className="home-photo-grid">{steps.map(step => <figure key={step.title} className="home-photo-step"><div className="home-photo-frame"><img src={step.image} alt={step.alt} loading="lazy" width={512} height={512} /><span className="home-photo-icon"><step.Icon size={24} /></span></div><figcaption><h3>{step.title}</h3><p>{step.text}</p></figcaption></figure>)}</div>
      <p className="home-photo-note">Un dégât ? Notre IA compare les photos et tranche sur des preuves, pas sur des paroles.</p>
    </div>
  </section>;
}
