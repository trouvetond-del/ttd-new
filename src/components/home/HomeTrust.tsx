import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Building2, FileCheck, MessageCircle, ShieldCheck, Users, Check, Pause, Play, Truck, ArrowRight } from 'lucide-react';

function useReveal() {
  const ref = useRef<HTMLElement>(null);
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        setRevealed(true);
        observer.disconnect();
      }
    }, { threshold: 0.2 });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { ref, revealed };
}

export function HomeTrustBridge() {
  const { ref, revealed } = useReveal();
  const [paused, setPaused] = useState(false);
  return <section ref={ref} className={`home-trust-bridge home-band ${revealed ? 'trust-revealed' : ''} ${paused ? 'is-paused' : ''}`} aria-labelledby="trust-bridge-title">
    <div className="home-inner">
      <div className="home-section-heading"><h2 id="trust-bridge-title">Un tiers de confiance<br /><span className="gradient-text">entre vous et votre déménageur</span></h2>
        <button type="button" className="home-motion-toggle" onClick={() => setPaused(value => !value)} aria-label={paused ? 'Reprendre le parcours animé' : 'Mettre en pause le parcours animé'} title={paused ? 'Reprendre le parcours animé' : 'Mettre en pause le parcours animé'} aria-pressed={paused}>{paused ? <Play size={18} /> : <Pause size={18} />}</button>
      </div>
      <p className="trust-intro">Nous vérifions les professionnels et vous accompagnons à chaque étape.</p>
      <div className="trust-journey">
        <div className="trust-request-line trust-request-first" aria-hidden="true"><span /><ArrowRight size={16} /></div>
        <div className="trust-request-line trust-request-second" aria-hidden="true"><span /><ArrowRight size={16} /></div>
        <div className="trust-stop trust-client"><div className="trust-node"><Users size={36} strokeWidth={1.5} aria-hidden="true" /></div><h3>Vous</h3><p>Votre demande</p></div>
        <div className="trust-stop trust-platform"><div className="trust-logo-node"><img src="/logo.png" alt="TTD.fr — Trouve Ton Déménageur" width={100} height={100} loading="lazy" /><span className="trust-validation" aria-hidden="true"><Check size={19} strokeWidth={3} /></span></div><h3>TTD vérifie</h3><p>Et vous accompagne</p></div>
        <div className="trust-stop trust-mover"><div className="trust-node"><Building2 size={36} strokeWidth={1.5} aria-hidden="true" /></div><h3>Votre déménageur</h3><p>Un professionnel vérifié</p></div>
        <div className="trust-delivery" aria-hidden="true"><div className="trust-road" /><span className="trust-road-start" /><span className="trust-road-end" /><div className="trust-moving-truck"><Truck size={36} strokeWidth={1.6} /></div></div>
      </div>
      <p className="trust-delivery-caption"><Truck size={18} aria-hidden="true" />Le déménageur vient à vous.</p>
      <div className="trust-checks"><span><ShieldCheck size={16} aria-hidden="true" />KBIS vérifié</span><span><ShieldCheck size={16} aria-hidden="true" />Assurance RC Pro vérifiée</span><span><ShieldCheck size={16} aria-hidden="true" />URSSAF vérifiée</span></div>
    </div>
  </section>;
}

export function HomeTrustReasons() {
  const { ref, revealed } = useReveal();
  return <section ref={ref} className={`home-trust-reasons home-band ${revealed ? 'trust-revealed' : ''}`} aria-labelledby="trust-reasons-title">
    <div className="home-inner trust-reasons-layout">
      <div className="trust-reasons-heading"><h2 id="trust-reasons-title">Pourquoi nous faire <span className="gradient-text">confiance</span></h2><p>Gratuit, sans engagement.</p></div>
      <ul className="trust-reasons-list">
        <li className="trust-reason"><ShieldCheck size={32} strokeWidth={1.5} aria-hidden="true" /><div><h3>Déménageurs vérifiés</h3><p>KBIS, assurance et URSSAF contrôlés.</p></div></li>
        <li className="trust-reason"><FileCheck size={32} strokeWidth={1.5} aria-hidden="true" /><div><h3>Jusqu’à 3 devis sous 24 h</h3><p>Vous comparez, vous choisissez.</p></div></li>
        <li className="trust-reason"><MessageCircle size={32} strokeWidth={1.5} aria-hidden="true" /><div><h3>Retrouvez-nous sur Trustpilot</h3><a className="trust-review-link" href="https://fr.trustpilot.com/review/trouvetondemenageur.fr" target="_blank" rel="noopener noreferrer">Voir notre page<ArrowUpRight size={17} aria-hidden="true" /></a></div></li>
      </ul>
    </div>
  </section>;
}
