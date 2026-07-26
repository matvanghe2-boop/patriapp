import React from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

/**
 * Filet de sécurité global.
 *
 * Sans lui, la moindre exception de rendu dans un composant (une position
 * mal formée, un champ absent après une migration de données) laissait une
 * page entièrement blanche, sans message ni moyen d'action — le pire scénario
 * pour une app où l'utilisateur croit avoir perdu ses données alors qu'elles
 * sont intactes dans le localStorage.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Erreur de rendu :", error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4">
        <div className="max-w-md w-full rounded-2xl border border-rose-500/30 bg-slate-900 p-6 text-center">
          <AlertTriangle className="mx-auto text-rose-300 mb-3" size={28} aria-hidden="true" />
          <h1 className="text-lg font-semibold text-slate-100">Une erreur inattendue est survenue</h1>
          <p className="text-sm text-slate-400 mt-2 leading-relaxed">
            Tes données n'ont pas été perdues : elles sont toujours stockées sur cet appareil et sur
            ton compte. Recharger la page suffit généralement à repartir.
          </p>
          <pre className="mt-3 text-left text-[11px] text-slate-500 bg-slate-950 border border-slate-800 rounded-lg p-3 overflow-x-auto">
            {this.state.error?.message || String(this.state.error)}
          </pre>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 inline-flex items-center gap-2 text-sm font-semibold bg-amber-400 hover:bg-amber-300 text-slate-950 rounded-lg px-4 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/40"
          >
            <RotateCcw size={14} aria-hidden="true" /> Recharger l'application
          </button>
        </div>
      </div>
    );
  }
}
