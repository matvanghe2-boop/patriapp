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
export function useHashRoute(validTabs, defaultTab, aliases = {}) {
  const read = useCallback(() => {
    const raw = window.location.hash.replace(/^#\/?/, "").split("?")[0];
    if (validTabs.includes(raw)) return raw;
    // Onglet déplacé ou renommé : on redirige au lieu de renvoyer
    // silencieusement l'utilisateur sur la page d'accueil.
    const alias = aliases[raw];
    return alias && validTabs.includes(alias) ? alias : defaultTab;
    // `aliases` est un littéral défini au niveau module côté appelant : le
    // lister en dépendance recréerait la fonction à chaque rendu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [validTabs, defaultTab]);

  const [tab, setTabState] = useState(read);

  useEffect(() => {
    // Aligne l'état ET l'URL sur l'onglet réellement affiché.
    //
    // La normalisation doit se faire à chaque résolution, pas seulement au
    // montage : arriver sur #/immobilier par un lien externe déclenche un
    // simple `hashchange` (aucun remontage), et l'URL resterait alors figée
    // sur un onglet qui n'existe plus alors que Simulation est affiché.
    const sync = () => {
      const resolved = read();
      setTabState(resolved);
      if (window.location.hash !== `#/${resolved}`) {
        window.history.replaceState(null, "", `#/${resolved}`);
      }
    };

    window.addEventListener("hashchange", sync);
    sync();
    return () => window.removeEventListener("hashchange", sync);
  }, [read]);

  const setTab = useCallback((next) => {
    if (!validTabs.includes(next)) return;
    // On passe par le hash plutôt que par setState : l'écouteur ci-dessus
    // met l'état à jour, ce qui garde URL et affichage toujours cohérents,
    // y compris quand la navigation vient du bouton « Précédent ».
    window.location.hash = `#/${next}`;
  }, [validTabs]);

  return [tab, setTab];
}
