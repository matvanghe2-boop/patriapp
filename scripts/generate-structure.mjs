// Régénère structure.txt à partir du contenu réel du dépôt.
//
// Ce fichier était maintenu à la main et avait fini par ne lister que 6 des
// 24 composants, en ignorant complètement api/, sql/ et public/ — au point
// d'induire en erreur quiconque s'en servait pour s'orienter. Un script rend
// la mise à jour triviale : `npm run structure`.

import { readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = process.cwd();
const IGNORED = new Set(["node_modules", ".git", "dist", ".vercel", ".vscode"]);
const IGNORED_FILES = /^\.env/;

function walk(dir, out = []) {
  for (const entry of readdirSync(dir).sort()) {
    if (IGNORED.has(entry) || IGNORED_FILES.test(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(relative(ROOT, full).split(sep).join("/"));
  }
  return out;
}

const header = [
  "Arborescence du projet Patrium — généré le " + new Date().toISOString().slice(0, 10) + ".",
  "Ce fichier est un instantané : le regénérer après tout ajout de fichier avec",
  "  npm run structure",
  "La description commentée de l'arborescence se trouve dans README.md.",
  "",
];

writeFileSync("structure.txt", [...header, ...walk(ROOT)].join("\n") + "\n");
console.log("structure.txt régénéré.");
