import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Building2, FileCheck, MessageCircle, ShieldCheck, Users } from 'lucide-react';

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
  return <section ref={ref} className={`home-trust-bridge home-band ${revealed ? 'trust-revealed' : ''}`} aria-labelledby="trust-bridge-title">
    <div className="home-inner">
      <h2 id="trust-bridge-title">Un tiers de confiance<br /><span className="gradient-text">entre vous et votre déménageur</span></h2>
      <p className="trust-intro">Nous vérifions les professionnels et vous accompagnons à chaque étape.</p>
      <div className="trust-bridge-scene">
        <svg className="trust-bridge-arc" viewBox="0 0 1000 200" preserveAspectRatio="none" fill="none" aria-hidden="true">
          <path className="trust-arc-base" d="M160 180 C240 -20 760 -20 840 180" />
          <path className="trust-arc-draw" pathLength="1" d="M160 180 C240 -20 760 -20 840 180" />
        </svg>
        <div className="trust-person trust-client"><Users size={34} strokeWidth={1.5} aria-hidden="true" /><h3>Vous</h3><p>Votre projet, vos besoins.</p></div>
        <div className="trust-center"><img src="/ttd-logo.png" alt="TrouveTonDemenageur" width={180} height={100} loading="lazy" /><span className="trust-center-caption"><ShieldCheck size={18} aria-hidden="true" />Vérifie · Accompagne · Arbitre</span></div>
        <div className="trust-person trust-mover"><Building2 size={34} strokeWidth={1.5} aria-hidden="true" /><h3>Votre déménageur</h3><p>Un professionnel vérifié,<br />un devis sur mesure.</p></div>
      </div>
      <div className="trust-checks"><span><ShieldCheck size={16} aria-hidden="true" />KBIS vérifié</span><span><ShieldCheck size={16} aria-hidden="true" />Assurance RC Pro vérifiée</span><span><ShieldCheck size={16} aria-hidden="true" />URSSAF vérifiée</span></div>
      <p className="trust-payment">30 % à la réservation sur la plateforme — le solde directement au déménageur le jour J.</p>
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
