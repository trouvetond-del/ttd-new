import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackLabel?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

// Filet de sécurité : sans ça, une erreur JS non gérée n'importe où dans
// l'arbre React fait planter TOUTE l'application (page blanche totale),
// même pour une erreur locale à une seule modale (cf. bug du 06/08 sur
// PendingMoverDetailModal). Avec ça, seul le composant concerné affiche
// une erreur, le reste de l'app (menu, autres pages) reste utilisable.
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary a intercepté une erreur:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 m-4 bg-red-50 border border-red-200 rounded-xl">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-red-900">
                {this.props.fallbackLabel || 'Une erreur est survenue'}
              </h3>
              <p className="text-sm text-red-700 mt-1">
                {this.state.error?.message || 'Erreur inconnue'}
              </p>
              <button
                onClick={() => this.setState({ hasError: false, error: null })}
                className="mt-3 text-sm font-medium text-red-700 underline"
              >
                Réessayer
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
