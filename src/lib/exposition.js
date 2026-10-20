import { valeurPosition } from "./finance";
import { secteurDe, NON_CLASSE } from "./sectors";
import { compositionDe, poidsSectorielsIndice, poidsPaysIndice } from "./compositionEtf";
import { placeDuTicker } from "../../shared/eligibilitePea.js";

/**
 * Exposition réelle du portefeuille : par secteur et par pays, ETF décomposés.
 *
 * Une ligne d'action est exposée à UN secteur et UN pays. Un ETF dont l'indice
 * est au catalogue (voir compositionEtf.js) est exposé à tous ceux de son
 * indice, au prorata publié : sa valeur est donc découpée en autant de
 * « parts » qu'il y a de secteurs ou de pays dans la fiche de l'indice.
 *
 * Tout ce qui calcule une répartition passe par ici — santé, treemap,
 * Screener — pour qu'un même portefeuille donne la même réponse partout.
 */

/** Fonds, ETF, OPCVM : jamais rangés d'après leur place de cotation. */
export const estFonds = (position) => /etf|fonds|fund|opcvm|sicav/i.test(String(position?.type || ""));

/**
 * Parts sectorielles.
 * @returns {Array<{ticker, nom, secteur, valeur, etf: null | {indice, date, source, part}}>}
 */
export function partsSectorielles(positions = [], manuels = {}) {
  const parts = [];
  for (const p of positions || []) {
    const valeur = valeurPosition(p);
    if (!(valeur > 0)) continue;
    const ticker = String(p.ticker || "").toUpperCase();
    const nom = p.name || p.ticker;
    const composition = compositionDe(ticker);
    if (composition) {
      for (const [secteur, part] of poidsSectorielsIndice(composition)) {
        parts.push({
          ticker,
          nom,
          secteur,
          valeur: valeur * part,
          etf: { indice: composition.indice, date: composition.date, source: composition.source, part },
        });
      }
    } else {
      parts.push({ ticker, nom, secteur: secteurDe({ ticker }, manuels), valeur, etf: null });
    }
  }
  return parts;
}

/** Valeur par secteur, triée de la plus grosse à la plus petite. */
export function valeurParSecteur(positions = [], manuels = {}) {
  const parSecteur = new Map();
  for (const part of partsSectorielles(positions, manuels)) {
    parSecteur.set(part.secteur, (parSecteur.get(part.secteur) || 0) + part.valeur);
  }
  return [...parSecteur.entries()].sort((a, b) => b[1] - a[1]);
}

/**
 * Poids par secteur, en % de la valeur totale — même forme que
 * `poidsSectoriels` du Screener, qu'il remplace.
 */
export function poidsParSecteur(positions = [], manuels = {}) {
  const entrees = valeurParSecteur(positions, manuels);
  const total = entrees.reduce((s, [, v]) => s + v, 0);
  if (total <= 0) return {};
  return Object.fromEntries(entrees.map(([s, v]) => [s, (v / total) * 100]));
}

/** Libellé du bloc agrégé que la fiche MSCI ne détaille pas. */
export const PAYS_AGREGE = "Autres pays développés";

/**
 * Parts géographiques.
 *
 * D'où vient le pays, dans cet ordre :
 *  - « indice » : la fiche de l'indice que réplique l'ETF ;
 *  - « fiche »  : le pays enregistré sur la ligne ;
 *  - « cotation » : déduit de la place de cotation (suffixe du ticker). Juste
 *    dans l'immense majorité des cas, mais pas toujours — Stellantis, société
 *    néerlandaise, se négocie à Paris. L'écran dit quelle part en relève.
 *
 * Un fonds hors catalogue n'est JAMAIS rangé d'après sa place de cotation :
 * un ETF monde coté à Paris n'est pas un placement français. Il reste inconnu.
 */
export function partsGeographiques(positions = []) {
  const parts = [];
  let inconnu = 0;
  let total = 0;
  for (const p of positions || []) {
    const valeur = valeurPosition(p);
    if (!(valeur > 0)) continue;
    total += valeur;
    const ticker = String(p.ticker || "").toUpperCase();
    const composition = compositionDe(ticker);
    if (composition) {
      for (const [pays, part] of poidsPaysIndice(composition)) {
        parts.push({ ticker, pays, valeur: valeur * part, origine: "indice" });
      }
      continue;
    }
    const enregistre = p.pays || p.country || null;
    if (enregistre) {
      parts.push({ ticker, pays: enregistre, valeur, origine: "fiche" });
      continue;
    }
    const place = estFonds(p) ? null : placeDuTicker(ticker);
    if (place?.pays) {
      parts.push({ ticker, pays: place.pays, valeur, origine: "cotation" });
      continue;
    }
    inconnu += valeur;
  }
  return { parts, inconnu, total };
}

export { NON_CLASSE };
