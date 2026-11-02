import { useEffect, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import video from '../assets/moving_truck_web.mp4.asset.json';
import poster from '../assets/moving_truck_poster.jpg.asset.json';

// Media is hosted on this project's immutable asset CDN, not the competitor's site.
const ASSET_ORIGIN = 'https://move-finder-joy.lovable.app';

export function HeroBackgroundVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [allowMotion, setAllowMotion] = useState(false);

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    const update = () => setAllowMotion(!preference.matches && !connection?.saveData);
    update();
    preference.addEventListener('change', update);
    return () => preference.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const element = videoRef.current;
    if (!element) return;
    if (allowMotion) void element.play().catch(() => setPlaying(false));
    else element.pause();
  }, [allowMotion]);

  const toggle = () => {
    const element = videoRef.current;
    if (!element) return;
    if (playing) element.pause();
    else {
      if (!element.getAttribute('src')) {
        element.src = ASSET_ORIGIN + video.url;
        element.load();
      }
      void element.play().catch(() => setPlaying(false));
    }
  };

  return (
    <>
      <img className="hero-motion-media absolute inset-0 h-full w-full object-cover" src={ASSET_ORIGIN + poster.url} alt="" aria-hidden="true" fetchPriority="high" />
      <video ref={videoRef} className="hero-motion-media absolute inset-0 h-full w-full object-cover" src={allowMotion ? ASSET_ORIGIN + video.url : undefined} poster={ASSET_ORIGIN + poster.url} muted loop playsInline preload="none" aria-hidden="true" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onError={() => setPlaying(false)} />
      <button type="button" className="hero-motion-toggle" onClick={toggle} aria-label={playing ? 'Mettre le fond vidéo en pause' : 'Lire le fond vidéo'} title={playing ? 'Mettre le fond vidéo en pause' : 'Lire le fond vidéo'}>
        {playing ? <Pause size={18} aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}
      </button>
    </>
  );
}
