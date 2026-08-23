import "@testing-library/jest-dom/vitest";

// jsdom n'implémente pas matchMedia, utilisé par certains composants
// (recharts, media queries Tailwind interrogées en JS).
// recharts mesure ses conteneurs via ResizeObserver, que jsdom n'implémente
// pas. Un bouchon inerte suffit : les tests vérifient la logique et la
// structure accessible, pas les dimensions rendues.
if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

if (!window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}


/**
 * Dimensions non nulles pour les conteneurs mesurés.
 *
 * `ResponsiveContainer` de recharts n'affiche RIEN tant qu'il mesure une
 * largeur nulle — ce que jsdom renvoie toujours, puisqu'il ne fait aucune mise
 * en page. Les graphiques restaient donc à l'état de conteneur vide, et
 * recharts réessayait la mesure en boucle à chaque rendu.
 *
 * C'est ce qui rendait la suite si lente : `PortefeuilleRepli.test.jsx` montait
 * l'application entière neuf fois, chaque montage traînant huit conteneurs en
 * attente d'une largeur qui n'arrivait jamais. Le fichier prenait 28 s à lui
 * seul, dont 20 pour un unique test, et l'ensemble de la suite dépassait trois
 * minutes — au point que deux tests ont commencé à tomber en dépassement de
 * délai sous charge, de façon intermittente.
 *
 * Donner une taille fixe à tout élément mesuré supprime l'attente. Les tests
 * vérifient la logique et la structure accessible, jamais les dimensions
 * rendues : une valeur arbitraire mais stable est exactement ce qu'il faut.
 */
const TAILLE_TEST = { largeur: 1024, hauteur: 600 };

for (const [prop, valeur] of [
  ["offsetWidth", TAILLE_TEST.largeur],
  ["offsetHeight", TAILLE_TEST.hauteur],
  ["clientWidth", TAILLE_TEST.largeur],
  ["clientHeight", TAILLE_TEST.hauteur],
]) {
  Object.defineProperty(window.HTMLElement.prototype, prop, {
    configurable: true,
    value: valeur,
  });
}

const rectOrigine = window.Element.prototype.getBoundingClientRect;
window.Element.prototype.getBoundingClientRect = function getBoundingClientRectTest() {
  const rect = rectOrigine.call(this);
  // Seules les boîtes vides sont corrigées : si jsdom sait répondre quelque
  // chose (styles en ligne), on le laisse faire.
  if (rect.width || rect.height) return rect;
  return {
    ...rect.toJSON?.(),
    x: 0, y: 0, top: 0, left: 0,
    width: TAILLE_TEST.largeur,
    height: TAILLE_TEST.hauteur,
    right: TAILLE_TEST.largeur,
    bottom: TAILLE_TEST.hauteur,
    toJSON() { return this; },
  };
};
