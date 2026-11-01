import { todayIso } from "./finance";

/**
 * Coffre à papiers — dates trouvées dans le texte d'un PDF (COFFRE_SPEC.md,
 * §9.3).
 *
 * Le texte vient de pdf.js, sur l'appareil : rien ne part vers un service
 * tiers, et une photo n'a pas de texte à lire (pas d'OCR, par choix). Les
 * dates trouvées sont PROPOSÉES à côté des champs, jamais appliquées sans un
 * clic : une heuristique se trompe, et une échéance fausse est pire qu'une
 * échéance vide.
 *
 * Le classement tient au contexte. Une date précédée de « valable jusqu'au »
 * ou « expire » est une échéance ; précédée de « délivré le » ou « date
 * d'achat », c'est la date du document. Sans indice, une date future est
 * plutôt une échéance et une date passée plutôt celle du document, avec un
 * score plus faible.
 */

const MOIS = {
  janvier: 1,
  janv: 1,
  fevrier: 2,
  fevr: 2,
  fev: 2,
  mars: 3,
  avril: 4,
  avr: 4,
  mai: 5,
  juin: 6,
  juillet: 7,
  juil: 7,
  aout: 8,
  septembre: 9,
  sept: 9,
  sep: 9,
  octobre: 10,
  oct: 10,
  novembre: 11,
  nov: 11,
  decembre: 12,
  dec: 12,
};

const INDICES_ECHEANCE =
  /(expir|valable|valide jusqu|validite|jusqu'?au|date de fin|fin de (?:garantie|contrat|bail|validite)|echeance|garanti|renouvel|reconduction|au plus tard|resiliation)/;
const INDICES_DOCUMENT =
  /(deliv|emis|emission|etabli|fait (?:a [a-z' -]{1,30})?le|achat|achete|facture|date d'effet|signe|commande|edite)/;

/** Fenêtre de texte, avant la date, où chercher un indice. */
const AVANT = 50;

/**
 * Texte en minuscules sans accents, de la MÊME longueur que l'original :
 * chaque caractère est remplacé par un seul, pour que les positions trouvées
 * dans l'un désignent les mêmes caractères dans l'autre.
 */
function normaliser(texte) {
  return [...texte]
    .map((c) => {
      const n = c
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
      return n.length === 1 ? n : c.toLowerCase().length === 1 ? c.toLowerCase() : c;
    })
    .join("");
}

const pad = (n) => String(n).padStart(2, "0");

function isoValide(annee, mois, jour) {
  if (annee < 1900 || annee > 2100 || mois < 1 || mois > 12 || jour < 1) return null;
  if (jour > new Date(annee, mois, 0).getDate()) return null;
  return `${annee}-${pad(mois)}-${pad(jour)}`;
}

const anneeComplete = (a) => (a.length === 2 ? 2000 + Number(a) : Number(a));

/** Toutes les dates du texte, avec leur position. */
function datesBrutes(norm) {
  const trouvees = [];
  const noter = (iso, index, longueur) => iso && trouvees.push({ date: iso, index, longueur });

  for (const m of norm.matchAll(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})\b/g)) {
    noter(isoValide(anneeComplete(m[3]), Number(m[2]), Number(m[1])), m.index, m[0].length);
  }
  for (const m of norm.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) {
    noter(isoValide(Number(m[1]), Number(m[2]), Number(m[3])), m.index, m[0].length);
  }
  const noms = Object.keys(MOIS)
    .sort((a, b) => b.length - a.length)
    .join("|");
  for (const m of norm.matchAll(new RegExp(`\\b(\\d{1,2})(?:er)?\\s+(${noms})\\.?\\s+(\\d{4})\\b`, "g"))) {
    noter(isoValide(Number(m[3]), MOIS[m[2]], Number(m[1])), m.index, m[0].length);
  }
  return trouvees;
}

/**
 * Dates proposées pour un document.
 *
 * @returns {{ echeances: Suggestion[], documents: Suggestion[] }} chaque
 *   suggestion : `{ date, indice, contexte }`, la plus probable en tête.
 *   `indice` vaut `true` quand un mot du texte a guidé le classement.
 */
export function suggererDates(texte, { aujourdhui = todayIso(), max = 4 } = {}) {
  const original = String(texte || "");
  const norm = normaliser(original);
  const meilleures = new Map();

  for (const d of datesBrutes(norm)) {
    const avant = norm.slice(Math.max(0, d.index - AVANT), d.index);
    let sorte;
    let score;
    // L'indice le plus proche de la date l'emporte : « délivré le 12/03/2021,
    // valable jusqu'au 11/03/2031 » contient les deux mots avant la seconde date.
    const posEcheance = Math.max(
      ...[...avant.matchAll(new RegExp(INDICES_ECHEANCE, "g"))].map((m) => m.index),
      -1
    );
    const posDocument = Math.max(
      ...[...avant.matchAll(new RegExp(INDICES_DOCUMENT, "g"))].map((m) => m.index),
      -1
    );
    if (posEcheance >= 0 || posDocument >= 0) {
      sorte = posEcheance > posDocument ? "echeances" : "documents";
      score = 2;
    } else {
      sorte = d.date > aujourdhui ? "echeances" : "documents";
      score = 1;
    }
    const cle = `${sorte}|${d.date}`;
    const precedente = meilleures.get(cle);
    if (precedente && precedente.score >= score) continue;
    const debut = Math.max(0, d.index - 30);
    const contexte = original
      .slice(debut, d.index + d.longueur)
      .replace(/\s+/g, " ")
      .trim();
    meilleures.set(cle, { sorte, score, date: d.date, contexte: `${debut > 0 ? "…" : ""}${contexte}` });
  }

  const trier = (sorte, sens) =>
    [...meilleures.values()]
      .filter((s) => s.sorte === sorte)
      .sort((a, b) => b.score - a.score || sens * a.date.localeCompare(b.date))
      .slice(0, max)
      .map(({ date, score, contexte }) => ({ date, indice: score > 1, contexte }));

  // Échéances : la plus proche d'abord ; dates du document : la plus récente d'abord.
  return { echeances: trier("echeances", 1), documents: trier("documents", -1) };
}
