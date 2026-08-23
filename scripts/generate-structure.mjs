// Régénère structure.txt à partir du contenu réel du dépôt.
//
// Ce fichier était maintenu à la main et avait fini par ne lister que 6 des
// 24 composants, en ignorant complètement api/, sql/ et public/ — au point
// d'induire en erreur quiconque s'en servait pour s'orienter. Un script rend
// la mise à jour triviale : `npm run structure`.
//
// C'EST GIT QUI DONNE LA LISTE, PAS LE SYSTÈME DE FICHIERS.
//
// La version précédente parcourait le disque avec `readdirSync` et filtrait
// une petite liste de dossiers écrite à la main. Elle produisait donc un
// résultat qui dépendait de la MACHINE, et la CI ne pouvait plus jamais
// passer au vert :
//
//   `.claude/settings.local.json` est exclu par le .gitignore GLOBAL de la
//   machine de développement (`~/.config/git/ignore`). Le fichier existe donc
//   en local — le script le listait — mais n'a jamais été poussé, donc il est
//   absent du runner, où le script ne le listait pas. La CI régénère puis
//   compare : la différence était structurelle, permanente, et sans rapport
//   avec le fichier réellement oublié (`public/orbit-splash.js`).
//
// `git ls-files -co --exclude-standard` renvoie les fichiers suivis (`-c`) et
// les fichiers non suivis mais non ignorés (`-o`), en appliquant TOUTES les
// règles d'exclusion : .gitignore du dépôt, exclusions locales, et le
// .gitignore global. C'est exactement la définition de « ce qui fait partie du
// projet », et elle est identique sur toutes les machines.
import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";

/**
 * Fichiers du projet selon Git, triés.
 *
 * `git ls-files` renvoie déjà des chemins en barres obliques, quelle que soit
 * la plateforme : aucune conversion de séparateur n'est nécessaire.
 *
 * Le tri est fait ici plutôt que laissé à Git : `ls-files` trie ses deux
 * catégories (suivis, puis non suivis) séparément, ce qui entremêlerait les
 * dossiers dans la sortie finale.
 */
function fichiersDuProjet() {
  const sortie = execFileSync("git", ["ls-files", "-co", "--exclude-standard"], {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  return (
    [...new Set(sortie.split("\n").filter(Boolean))]
      // `git ls-files -c` liste aussi les fichiers SUIVIS MAIS SUPPRIMÉS du
      // disque, tant que la suppression n'est pas commitée. Sans ce filtre,
      // l'arborescence continuerait d'annoncer un fichier qui n'existe plus en
      // local, et cesserait de le faire dès le commit — donc sur le runner :
      // exactement le genre d'écart machine/CI que ce script vient de corriger.
      .filter((chemin) => existsSync(chemin))
      .sort()
  );
}

// Surtout PAS de date de génération dans ce fichier.
//
// L'en-tête portait « généré le <date du jour> ». La CI régénère structure.txt
// puis échoue si `git diff` n'est pas vide : le fichier différait donc de sa
// version commitée dès le LENDEMAIN, sur ce seul horodatage, et le contrôle
// échouait sur toutes les branches sans qu'aucun fichier n'ait bougé.
//
// Un instantané d'arborescence ne doit dépendre que de l'arborescence.
const header = [
  "Arborescence du projet Patrium.",
  "Ce fichier est un instantané : le regénérer après tout ajout de fichier avec",
  "  npm run structure",
  "La liste vient de `git ls-files` : elle ne contient donc que ce qui fait",
  "partie du dépôt, et elle est identique sur toutes les machines.",
  "La description commentée de l'arborescence se trouve dans README.md.",
  "",
];

writeFileSync("structure.txt", [...header, ...fichiersDuProjet()].join("\n") + "\n");
console.log("structure.txt régénéré.");
