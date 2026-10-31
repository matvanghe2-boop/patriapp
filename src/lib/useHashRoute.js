import { useState, useEffect, useCallback, useMemo } from "react";

/**
 * Onglet courant synchronisé avec l'URL (`#/bourse`).
 *
 * Avant, l'onglet n'était qu'un `useState` : recharger la page ramenait
 * toujours au Dashboard, le bouton « Précédent » du navigateur sortait de
 * l'app, et il était impossible d'envoyer ou de mettre en favori un lien vers
 * un onglet précis. Le hash suffit ici (pas de routeur à installer, pas de
 * réécriture serveur à configurer côté Vercel).
 *
 * Le hash porte aussi le SOUS-onglet (`#/abonnements/calendrier`) : sans lui,
 * un rechargement ramenait au premier sous-onglet, et ni une notification ni
 * le centre « À faire » ne pouvaient mener directement au bon endroit.
 */

/** Les deux segments du hash : `#/abonnements/calendrier` → ["abonnements", "calendrier"]. */
export function lireHash(hash = typeof window !== "undefined" ? window.location.hash : "") {
  const [onglet = "", sous = ""] = String(hash).replace(/^#\/?/, "").split("?")[0].split("/");
  return { onglet, sous };
}

const versHash = (onglet, sous) => `#/${onglet}${sous ? `/${sous}` : ""}`;

/**
 * Navigation depuis n'importe quel composant, sans avoir à faire descendre un
 * `setTab` jusqu'à lui : changer le hash suffit, `useHashRoute` et
 * `useSousOnglet` l'écoutent.
 */
export function allerVers(onglet, sous = "") {
  window.location.hash = versHash(onglet, sous);
}

export function useHashRoute(validTabs, defaultTab, aliases = {}) {
  const read = useCallback(() => {
    const { onglet: raw } = lireHash();
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
    //
    // Le sous-onglet n'est conservé que si l'onglet lu est celui affiché : un
    // alias ou un onglet inconnu ne garde pas un sous-onglet qui ne lui
    // appartient pas.
    const sync = () => {
      const resolved = read();
      const { onglet, sous } = lireHash();
      setTabState(resolved);
      const attendu = versHash(resolved, onglet === resolved ? sous : "");
      if (window.location.hash !== attendu) {
        window.history.replaceState(null, "", attendu);
      }
    };

    window.addEventListener("hashchange", sync);
    sync();
    return () => window.removeEventListener("hashchange", sync);
  }, [read]);

  const setTab = useCallback((next, sous = "") => {
    if (!validTabs.includes(next)) return;
    // On passe par le hash plutôt que par setState : l'écouteur ci-dessus
    // met l'état à jour, ce qui garde URL et affichage toujours cohérents,
    // y compris quand la navigation vient du bouton « Précédent ».
    window.location.hash = versHash(next, sous);
  }, [validTabs]);

  return [tab, setTab];
}

/**
 * Sous-onglet d'une page, lu et écrit dans le second segment du hash.
 *
 * Un sous-onglet inconnu (lien périmé, faute de frappe) retombe sur le
 * sous-onglet par défaut. Le changement passe par `replaceState` : parcourir
 * les sous-onglets d'une page ne doit pas remplir l'historique, et le bouton
 * « Précédent » continue de ramener à l'onglet d'avant.
 *
 * @param {string[]} ids     Sous-onglets valides de la page.
 * @param {string}   defaut  Sous-onglet affiché sans indication dans l'URL.
 */
export function useSousOnglet(ids, defaut) {
  // Les appelants passent un littéral, recréé à chaque rendu : on se cale sur
  // son CONTENU pour que les rappels ci-dessous restent stables.
  const cle = ids.join("|");
  const valides = useMemo(() => cle.split("|"), [cle]);

  const lire = useCallback(() => {
    const { sous } = lireHash();
    return valides.includes(sous) ? sous : defaut;
  }, [valides, defaut]);

  const [sous, setSousState] = useState(lire);

  // Une navigation vers la MÊME page avec un autre sous-onglet (un lien du
  // centre « À faire » alors qu'on est déjà sur l'onglet) ne remonte pas la
  // page : seul le `hashchange` le signale.
  useEffect(() => {
    const surChangement = () => setSousState(lire());
    window.addEventListener("hashchange", surChangement);
    return () => window.removeEventListener("hashchange", surChangement);
  }, [lire]);

  const setSous = useCallback(
    (suivant) => {
      const valeur = typeof suivant === "function" ? suivant(lire()) : suivant;
      if (!valides.includes(valeur)) return;
      setSousState(valeur);
      const { onglet } = lireHash();
      if (onglet) window.history.replaceState(null, "", versHash(onglet, valeur === defaut ? "" : valeur));
    },
    [lire, valides, defaut]
  );

  return [sous, setSous];
}
