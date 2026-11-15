import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Building2, FileCheck, MessageCircle, ShieldCheck, Users, Check, Pause, Play, Truck } from 'lucide-react';

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
      <div className="tb-stage">
        <div className="tb-row">
          <div className="tb-stop tb-client"><div className="tb-node"><span className="tb-halo" aria-hidden="true" /><Users size={34} strokeWidth={1.5} aria-hidden="true" /></div><h3>Vous</h3><p>Votre demande</p></div>
          <div className="tb-link tb-link-1" aria-hidden="true"><span className="tb-comet" /></div>
          <div className="tb-stop tb-platform"><div className="tb-brand"><span className="tb-ring" aria-hidden="true" /><span className="tb-wave" aria-hidden="true" /><span className="tb-brand-text"><span className="tb-blue">Trouve Ton</span><span className="tb-green">Déménageur</span></span><span className="tb-check" aria-hidden="true"><Check size={16} strokeWidth={3} /></span></div><h3>Nous vérifions</h3><p>Et vous accompagnons</p></div>
          <div className="tb-link tb-link-2" aria-hidden="true"><span className="tb-comet" /></div>
          <div className="tb-stop tb-mover"><div className="tb-node"><span className="tb-halo" aria-hidden="true" /><Building2 size={34} strokeWidth={1.5} aria-hidden="true" /></div><h3>Votre déménageur</h3><p>Un professionnel vérifié</p></div>
        </div>
        <div className="tb-road" aria-hidden="true">
          <div className="tb-asphalt"><span className="tb-dashes" /></div>
          <div className="tb-truck">
            <svg viewBox="0 0 220 110" width="150" height="75">
              <defs>
                <linearGradient id="tbBox" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffffff" /><stop offset="1" stopColor="#e3e9f2" /></linearGradient>
                <linearGradient id="tbCab" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2f6fe0" /><stop offset="1" stopColor="#1846a8" /></linearGradient>
                <linearGradient id="tbStripe" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#2563eb" /><stop offset="1" stopColor="#16a34a" /></linearGradient>
                <linearGradient id="tbGlass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#cfe6ff" /><stop offset="1" stopColor="#6c9fd8" /></linearGradient>
              </defs>
              <ellipse cx="110" cy="100" rx="98" ry="6" fill="#0f172a" opacity=".18" />
              <rect x="62" y="10" width="150" height="70" rx="6" fill="url(#tbBox)" stroke="#c7d2e2" />
              <rect x="62" y="52" width="150" height="9" fill="url(#tbStripe)" />
              <text x="137" y="40" textAnchor="middle" fontFamily="inherit" fontWeight="800" fontSize="15" fill="#1d4ed8">trouvetondemenageur<tspan fill="#16a34a">.fr</tspan></text>
              <path d="M62 34 H30 Q20 34 15 46 L8 62 V80 H62 Z" fill="url(#tbCab)" />
              <path d="M56 40 H33 Q27 40 24 47 L19 58 H56 Z" fill="url(#tbGlass)" />
              <rect x="5" y="70" width="8" height="5" rx="2" fill="#fde68a" className="tb-headlight" />
              <rect x="6" y="78" width="206" height="6" rx="3" fill="#334155" />
              <g className="tb-wheel" style={{ transformOrigin: '42px 86px' }}><circle cx="42" cy="86" r="13" fill="#111827" /><circle cx="42" cy="86" r="6" fill="#9ca3af" /><path d="M42 74 V98 M30 86 H54" stroke="#4b5563" strokeWidth="2" /></g>
              <g className="tb-wheel" style={{ transformOrigin: '170px 86px' }}><circle cx="170" cy="86" r="13" fill="#111827" /><circle cx="170" cy="86" r="6" fill="#9ca3af" /><path d="M170 74 V98 M158 86 H182" stroke="#4b5563" strokeWidth="2" /></g>
            </svg>
          </div>
        </div>
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
