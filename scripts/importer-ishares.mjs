/**
 * Convertit un fichier de composition iShares en liste de tickers Yahoo.
 *
 *   node scripts/importer-ishares.mjs <fichier> <cle-univers>
 *   node scripts/importer-ishares.mjs ~/Downloads/iShares-Russell-2000-ETF_fund.xls russell2000
 *
 * Les compositions du Russell 2000 et du STOXX Europe 600 ne se recopient pas à
 * la main : ce sont respectivement 1 966 et 600 lignes. iShares les publie en
 * libre accès, ce qui en fait la source la plus pratique — mais leurs tickers
 * ne sont PAS ceux de Yahoo, et c'est tout le travail de ce script.
 *
 * ─── Le format ───────────────────────────────────────────────────────────────
 * Malgré leur extension `.xls`, ces fichiers sont du SpreadsheetML 2003, c'est
 * à dire du XML. Pas besoin de bibliothèque de tableur : la feuille
 * « Holdings » se lit à l'expression régulière. On la borne explicitement au
 * `</ss:Worksheet>` suivant, faute de quoi on ramasse aussi les feuilles
 * Historical, Performance et Distributions qui suivent.
 *
 * ─── Les deux pièges ─────────────────────────────────────────────────────────
 * 1. **Le suffixe de place.** iShares donne un ticker local (`ASML`, `HSBA`)
 *    et le nom complet de la bourse. Yahoo attend un suffixe (`ASML.AS`,
 *    `HSBA.L`). D'où la table PLACES ci-dessous. Le Russell est le cas facile :
 *    les valeurs américaines n'ont pas de suffixe.
 *
 * 2. **Les conventions de ticker.** Trois divergences, découvertes dans les
 *    données réelles :
 *      · Londres suffixe ses tickers d'un point : `RR.`, `BP.`, `AV.`
 *        → à retirer, sans quoi on obtiendrait `RR..L`
 *      · les classes d'actions nordiques passent par une espace :
 *        `VOLV B`, `ERIC B`, `NOVO B` → Yahoo attend `VOLV-B.ST`
 *      · un point interne marque aussi une classe : `BT.A` → `BT-A.L`
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const DOSSIER_LISTES = join(RACINE, "data", "listes");

/**
 * Nom de bourse iShares → suffixe Yahoo.
 * Une chaîne vide signifie « aucun suffixe » (places américaines).
 */
const PLACES = {
  // États-Unis
  NASDAQ: "",
  NYSE: "",
  "NYSE MKT LLC": "",
  // Europe
  "LONDON STOCK EXCHANGE": ".L",
  "NYSE EURONEXT - EURONEXT PARIS": ".PA",
  XETRA: ".DE",
  "DEUTSCHE BOERSE XETRA": ".DE",
  "SIX SWISS EXCHANGE": ".SW",
  "NASDAQ OMX NORDIC": ".ST",
  "BORSA ITALIANA": ".MI",
  "EURONEXT AMSTERDAM": ".AS",
  "BOLSA DE MADRID": ".MC",
  "OSLO BORS ASA": ".OL",
  "OMX NORDIC EXCHANGE COPENHAGEN A/S": ".CO",
  "NASDAQ OMX HELSINKI LTD.": ".HE",
  "WARSAW STOCK EXCHANGE/EQUITIES/MAIN MARKET": ".WA",
  "NYSE EURONEXT - EURONEXT BRUSSELS": ".BR",
  "WIENER BOERSE AG": ".VI",
  "IRISH STOCK EXCHANGE - ALL MARKET": ".IR",
  "NYSE EURONEXT - EURONEXT LISBON": ".LS",
};

/** Lignes de la feuille « Holdings », en objets indexés par en-tête. */
function lireHoldings(chemin) {
  const buf = readFileSync(chemin, "utf8");
  const debut = buf.indexOf('ss:Name="Holdings"');
  if (debut === -1) throw new Error("Feuille « Holdings » introuvable — est-ce bien un export iShares ?");
  const fin = buf.indexOf("</ss:Worksheet>", debut);

  const lignes = [...buf.slice(debut, fin === -1 ? undefined : fin).matchAll(/<ss:Row>([\s\S]*?)<\/ss:Row>/g)].map(
    (m) => [...m[1].matchAll(/<ss:Data[^>]*>([\s\S]*?)<\/ss:Data>/g)].map((c) => c[1])
  );

  // L'en-tête n'est pas la première ligne : le fichier commence par une
  // dizaine de lignes de métadonnées (date, nom du fonds, encours…). Et il ne
  // porte pas le même nom d'une gamme à l'autre.
  const iEntete = lignes.findIndex((l) => l[0] === "Ticker" || l[0] === "Issuer Ticker");
  if (iEntete === -1) throw new Error("Ligne d'en-tête introuvable (ni « Ticker » ni « Issuer Ticker »).");
  const entete = lignes[iEntete];

  return lignes
    .slice(iEntete + 1)
    .filter((l) => l.length >= entete.length - 2)
    .map((l) => Object.fromEntries(entete.map((h, k) => [h, l[k]])));
}

/** Ticker local iShares → symbole Yahoo. `null` si inexploitable. */
export function versSymboleYahoo(tickerLocal, nomBourse) {
  const brut = String(tickerLocal || "").trim().toUpperCase();
  if (!brut || brut === "--") return null;

  const suffixe = PLACES[String(nomBourse || "").trim().toUpperCase()];
  if (suffixe === undefined) return null; // place non cartographiée

  const normalise = brut
    .replace(/\.$/, "") // Londres : « RR. » → « RR »
    .replace(/[ .]/g, "-") // classes d'actions : « VOLV B » et « BT.A » → « VOLV-B », « BT-A »
    .replace(/-+/g, "-");

  return normalise ? `${normalise}${suffixe}` : null;
}

function main() {
  const [chemin, cle] = process.argv.slice(2);
  if (!chemin || !cle) {
    console.error("Usage : node scripts/importer-ishares.mjs <fichier.xls> <cle-univers>");
    process.exit(1);
  }

  const lignes = lireHoldings(chemin);
  const actions = lignes.filter((l) => l["Asset Class"] === "Equity");

  const symboles = [];
  const ignores = [];
  const placesInconnues = new Set();

  for (const l of actions) {
    const local = l.Ticker ?? l["Issuer Ticker"];
    const symbole = versSymboleYahoo(local, l.Exchange);
    if (symbole) symboles.push(symbole);
    else {
      ignores.push(`${local} (${l.Exchange})`);
      if (l.Exchange && !(String(l.Exchange).toUpperCase() in PLACES)) placesInconnues.add(l.Exchange);
    }
  }

  const uniques = [...new Set(symboles)].sort();
  const sortie = join(DOSSIER_LISTES, `${cle}.txt`);

  writeFileSync(
    sortie,
    [
      `# Univers « ${cle} » — généré depuis un export de composition iShares.`,
      `#`,
      `#   node scripts/importer-ishares.mjs <fichier> ${cle}`,
      `#`,
      `# Source : ${basename(chemin)}`,
      `# ${actions.length} actions dans le fichier, ${uniques.length} symboles Yahoo retenus.`,
      `#`,
      `# NE PAS ÉDITER À LA MAIN : régénérer depuis un export à jour. Les symboles`,
      `# qui ne répondent pas sont rapportés par « npm run univers » dans`,
      `# data/listes/rapport.json — ils restent ici, mais coûtent un appel par`,
      `# rafraîchissement.`,
      ``,
      ...uniques,
      ``,
    ].join("\n")
  );

  console.log(`${actions.length} actions lues, ${uniques.length} symboles écrits → data/listes/${cle}.txt`);
  if (ignores.length > 0) {
    console.log(`${ignores.length} ignoré(s) : ${ignores.slice(0, 8).join(", ")}${ignores.length > 8 ? "…" : ""}`);
  }
  if (placesInconnues.size > 0) {
    console.log(`Places non cartographiées, à ajouter à PLACES : ${[...placesInconnues].join(", ")}`);
  }
}

// Exécuté seulement en ligne de commande : le fichier est aussi importé par
// ses tests, qui n'ont ni argument ni fichier à convertir.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
