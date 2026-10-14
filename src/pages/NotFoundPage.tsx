import { useEffect } from 'react';
import { Link } from 'react-router-dom';

// Page 404 : dit à Google de ne pas indexer les adresses inexistantes
// (avant, toute adresse inconnue renvoyait l'accueil = "soft 404").
export default function NotFoundPage() {
  useEffect(() => {
    document.title = 'Page introuvable | TrouveTonDéménageur';
    let m = document.querySelector('meta[name="robots"]') as HTMLMetaElement | null;
    const prev = m?.content;
    if (!m) { m = document.createElement('meta'); m.name = 'robots'; document.head.appendChild(m); }
    m.content = 'noindex, follow';
    return () => { if (m && prev) m.content = prev; };
  }, []);
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 text-center">
      <h1 className="text-3xl font-bold mb-4">Page introuvable</h1>
      <p className="mb-6 text-gray-600">Cette page n'existe pas ou a été déplacée.</p>
      <div className="flex gap-4">
        <Link to="/" className="underline">Accueil</Link>
        <Link to="/devis-rapide" className="font-semibold text-blue-600">Obtenir mon devis gratuit</Link>
      </div>
    </div>
  );
}
