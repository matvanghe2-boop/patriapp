import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";

/**
 * Bandeau « nouvelle version disponible ».
 *
 * Contrepartie du retrait de `skipWaiting()` dans `public/sw.js` : le nouveau
 * service worker s'installe puis ATTEND, au lieu de remplacer la coquille sous
 * les pieds d'une session en cours. Sans ce bandeau, il attendrait jusqu'à la
 * fermeture complète de tous les onglets — une PWA installée peut rester
 * ouverte des semaines, et l'utilisateur ne verrait jamais la mise à jour.
 *
 * Le composant ne s'affiche que lorsqu'un worker est réellement en attente, et
 * ne propose qu'une action : recharger. C'est le clic qui envoie
 * `SKIP_WAITING` ; le rechargement, lui, attend `controllerchange`, c'est-à-dire
 * la relève effective. Recharger avant celle-ci reservirait l'ancienne coquille
 * depuis le cache du worker sortant, et le bandeau réapparaîtrait aussitôt.
 */
export default function MiseAJourDisponible() {
  const [enAttente, setEnAttente] = useState(null);
  // Le rechargement n'est déclenché que si c'est NOUS qui l'avons demandé :
  // `controllerchange` se déclenche aussi à la toute première prise de
  // contrôle, où il n'y a rien à recharger.
  const rechargementDemande = useRef(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return undefined;

    const surReleve = () => {
      if (rechargementDemande.current) window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", surReleve);

    navigator.serviceWorker.ready
      .then((reg) => {
        // `controller` absent = toute première installation, pas une mise à
        // jour : proposer un rechargement n'aurait aucun sens.
        const estUneMiseAJour = () => Boolean(navigator.serviceWorker.controller);

        // Un worker peut déjà attendre au démarrage : la mise à jour a été
        // téléchargée pendant la visite précédente.
        if (reg.waiting && estUneMiseAJour()) setEnAttente(reg.waiting);

        reg.addEventListener("updatefound", () => {
          const nouveau = reg.installing;
          if (!nouveau) return;
          nouveau.addEventListener("statechange", () => {
            if (nouveau.state === "installed" && estUneMiseAJour()) setEnAttente(nouveau);
          });
        });
      })
      .catch(() => {
        // Pas de service worker enregistré (développement, navigateur qui le
        // refuse) : il n'y a simplement jamais de mise à jour à annoncer.
      });

    return () => navigator.serviceWorker.removeEventListener("controllerchange", surReleve);
  }, []);

  if (!enAttente) return null;

  const recharger = () => {
    rechargementDemande.current = true;
    enAttente.postMessage({ type: "SKIP_WAITING" });
  };

  return (
    <div
      role="status"
      className="fixed bottom-20 md:bottom-4 left-4 z-[100] flex items-center gap-3 rounded-xl border border-amber-500/40 bg-slate-900 shadow-2xl px-4 py-2.5 text-sm"
    >
      <RefreshCw size={15} className="shrink-0 text-amber-300" aria-hidden="true" />
      <span className="text-slate-200">Une nouvelle version de Patrium est prête.</span>
      <button
        onClick={recharger}
        className="btn-flash text-xs font-semibold text-amber-300 hover:text-amber-200 border border-amber-400/40 rounded-lg px-2.5 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/40"
      >
        Recharger
      </button>
    </div>
  );
}
