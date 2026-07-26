import { useState, useEffect, useCallback } from "react";

/**
 * Onglet courant synchronisé avec l'URL (`#/bourse`).
 *
 * Avant, l'onglet n'était qu'un `useState` : recharger la page ramenait
 * toujours au Dashboard, le bouton « Précédent » du navigateur sortait de
 * l'app, et il était impossible d'envoyer ou de mettre en favori un lien vers
 * un onglet précis. Le hash suffit ici (pas de routeur à installer, pas de
 * réécriture serveur à configurer côté Vercel).
 */
export function useHashRoute(validTabs, defaultTab) {
  const read = useCallback(() => {
    const raw = window.location.hash.replace(/^#\/?/, "").split("?")[0];
    return validTabs.includes(raw) ? raw : defaultTab;
  }, [validTabs, defaultTab]);

  const [tab, setTabState] = useState(read);

  useEffect(() => {
    const onHashChange = () => setTabState(read());
    window.addEventListener("hashchange", onHashChange);
    // Première visite sans hash : on en pose un pour que le bouton
    // « Précédent » ait un point de départ cohérent.
    if (!window.location.hash) window.history.replaceState(null, "", `#/${defaultTab}`);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [read, defaultTab]);

  const setTab = useCallback((next) => {
    if (!validTabs.includes(next)) return;
    // On passe par le hash plutôt que par setState : l'écouteur ci-dessus
    // met l'état à jour, ce qui garde URL et affichage toujours cohérents,
    // y compris quand la navigation vient du bouton « Précédent ».
    window.location.hash = `#/${next}`;
  }, [validTabs]);

  return [tab, setTab];
}
