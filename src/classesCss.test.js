/**
 * Toute classe maison employée dans le code doit exister dans index.css.
 *
 * Ce test répare une panne qui s'est produite DEUX FOIS, à l'identique :
 *
 *  1. `btn-flash` était posée sur quatre boutons sans exister dans la feuille.
 *     L'effet de clic prévu ne faisait rien. Le commentaire d'index.css
 *     raconte la correction.
 *  2. `btn-press` était posée sur le conteneur de toast, sans exister non
 *     plus — la correction précédente n'avait pas relu le reste du projet.
 *
 * Une classe absente ne lève aucune erreur : le navigateur ignore
 * silencieusement un nom inconnu, le composant s'affiche normalement, et seul
 * l'effet visuel manque. Rien, dans le code comme à l'exécution, ne distingue
 * « la classe n'existe pas » de « la classe existe et ne fait pas grand-chose ».
 * D'où ce test.
 *
 * PÉRIMÈTRE : uniquement les familles de classes que ce projet écrit lui-même.
 * Les utilitaires Tailwind sont générés à la compilation et n'ont rien à faire
 * ici — vérifier `text-sm` ou `font-medium` reviendrait à tester Tailwind.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

// `fileURLToPath` plutôt que `new URL(...).pathname` : sous Windows, ce
// dernier renvoie « /C:/… », un chemin que `readFileSync` ne sait pas ouvrir.
const RACINE = dirname(fileURLToPath(import.meta.url));

/**
 * Familles de classes maison. Une famille est ajoutée ici quand index.css la
 * déclare ET que son préfixe ne peut pas entrer en collision avec un
 * utilitaire Tailwind (ce qui exclut `text-`, `font-` et `card` tout court).
 */
const FAMILLES_MAISON = [
  /^btn-[\w-]+$/,
  /^collapse-[\w-]+$/,
  /^modal-[\w-]+$/,
  /^stagger-[\w-]+$/,
  /^ghost-[\w-]+$/,
  /^card-interactive$/,
  /^table-cards$/,
  /^tap-target$/,
  /^pop-in$/,
  /^skeleton$/,
];

const estMaison = (token) => FAMILLES_MAISON.some((re) => re.test(token));

/** Classes réellement déclarées dans index.css, sélecteurs composés compris. */
function classesDeclarees() {
  const css = readFileSync(join(RACINE, "index.css"), "utf8");
  const declarees = new Set();
  for (const [, nom] of css.matchAll(/\.([a-zA-Z][\w-]*)/g)) declarees.add(nom);
  return declarees;
}

/** Tous les fichiers source de src/, hors tests. */
function fichiersSource(dir = RACINE, out = []) {
  for (const entree of readdirSync(dir)) {
    const complet = join(dir, entree);
    if (statSync(complet).isDirectory()) fichiersSource(complet, out);
    else if (/\.jsx?$/.test(entree) && !/\.test\.jsx?$/.test(entree)) out.push(complet);
  }
  return out;
}

/**
 * Classes maison employées, avec le fichier qui les emploie.
 *
 * On lit le contenu des `className` — littéraux comme gabarits — puis on
 * découpe sur les espaces. Les fragments d'interpolation (`${...}`) sont
 * retirés d'abord : ils contiennent des expressions, pas des noms de classe.
 */
function classesEmployees() {
  const usages = new Map();
  for (const fichier of fichiersSource()) {
    const source = readFileSync(fichier, "utf8");
    for (const [, contenu] of source.matchAll(/className=(?:\{`([^`]*)`\}|"([^"]*)")/g)) {
      for (const token of (contenu ?? "").replace(/\$\{[^}]*\}/g, " ").split(/\s+/)) {
        if (!estMaison(token)) continue;
        if (!usages.has(token)) usages.set(token, new Set());
        usages.get(token).add(relative(RACINE, fichier));
      }
    }
  }
  return usages;
}

describe("classes CSS maison", () => {
  it("sont toutes déclarées dans index.css", () => {
    const declarees = classesDeclarees();
    const orphelines = [...classesEmployees()]
      .filter(([nom]) => !declarees.has(nom))
      .map(([nom, fichiers]) => `${nom} (${[...fichiers].join(", ")})`);

    expect(orphelines, `Classes employées mais jamais déclarées dans src/index.css :\n  ${orphelines.join("\n  ")}`).toEqual([]);
  });

  it("détecte bien une classe absente", () => {
    // Garde-fou du garde-fou : si `estMaison` cessait de reconnaître les
    // familles maison, le test précédent passerait au vert sans rien vérifier.
    expect(estMaison("btn-press")).toBe(true);
    expect(estMaison("btn-flash")).toBe(true);
    expect(estMaison("text-sm")).toBe(false);
    expect(estMaison("font-medium")).toBe(false);
  });
});
