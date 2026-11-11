import { effetsVivants, appareilEconome } from "./mouvement";

/**
 * Changement d'onglet en cube : l'écran qu'on quitte et celui où l'on arrive
 * sont les deux faces voisines d'un cube qui tourne d'un quart de tour.
 *
 * Le navigateur photographie l'ancien écran, laisse React afficher le nouveau,
 * puis fait pivoter les deux images (View Transitions, voir scenes.css). Rien
 * n'est recalculé pendant la rotation : c'est le compositeur qui travaille.
 *
 * RÉSERVÉ aux effets vivants, et aux navigateurs qui savent le faire. Dans
 * tous les autres cas `tournerEnCube` répond `false` SANS avoir rien changé :
 * l'appelant navigue alors comme avant, avec le glissement d'origine.
 */

/** Jeton de la rotation en cours : une rotation interrompue ne nettoie pas la suivante. */
let rotation = 0;

/** Le cube est-il possible ici, maintenant ? */
export function cubePossible() {
  return (
    typeof document !== "undefined" &&
    typeof document.startViewTransition === "function" &&
    effetsVivants() &&
    !appareilEconome()
  );
}

/**
 * Fait tourner le cube autour du changement d'écran.
 *
 * @param {object} options
 * @param {"droite"|"gauche"} options.sens  D'où vient le nouvel écran.
 * @param {() => void} options.changer      Affiche le nouvel écran, de façon
 *        SYNCHRONE : à son retour, le DOM doit déjà être celui de l'arrivée.
 * @returns {boolean} `true` si la rotation est partie (et `changer` appelé).
 */
export function tournerEnCube({ sens, changer }) {
  if (!cubePossible()) return false;
  const racine = document.documentElement;
  const zone = document.getElementById("contenu-principal");
  if (!zone) return false;

  // Le point de fuite se place au milieu de l'écran, pas au milieu de la page :
  // une page de trois écrans de haut pivoterait sinon autour d'un point que
  // personne ne voit, et ses bords fileraient en biais.
  const milieu = (el) => `${Math.round(window.innerHeight / 2 - el.getBoundingClientRect().top)}px`;
  const jeton = ++rotation;
  racine.style.setProperty("--cube-prof", `${Math.round(zone.getBoundingClientRect().width / 2)}px`);
  racine.style.setProperty("--cube-y-avant", milieu(zone));
  racine.setAttribute("data-cube", sens);

  const nettoyer = () => {
    if (jeton !== rotation) return;
    racine.removeAttribute("data-cube");
    racine.style.removeProperty("--cube-prof");
    racine.style.removeProperty("--cube-y-avant");
    racine.style.removeProperty("--cube-y-apres");
  };

  try {
    const transition = document.startViewTransition(() => {
      changer();
      const arrivee = document.getElementById("contenu-principal");
      if (arrivee) racine.style.setProperty("--cube-y-apres", milieu(arrivee));
    });
    transition.finished.then(nettoyer, nettoyer);
    // Une rotation remplacée par une autre (deux onglets cliqués coup sur
    // coup, une fiche ouverte en pleine rotation) est « sautée » : le
    // navigateur rejette alors `ready`. Ce n'est pas une erreur, et elle n'a
    // rien à faire dans le journal d'erreurs de l'appareil.
    transition.ready?.catch?.(() => {});
  } catch {
    // Transition refusée (document masqué, autre transition en cours…) : on
    // change d'écran quand même, sans rotation.
    nettoyer();
    changer();
  }
  return true;
}
