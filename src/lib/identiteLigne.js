import { estFonds } from "./exposition";

/**
 * Ce que la cotation apprend sur la ligne elle-même : sa nature et son nom.
 *
 * Une ligne née du journal d'ordres (voir `replayLedger`) ne connaît que son
 * ticker : elle reçoit ce ticker pour nom et « Action » pour type, faute de
 * mieux. Un ETF acheté puis importé depuis un avis d'opéré restait donc
 * « PNAS.PA · Action » pour toujours : jamais décomposé, rangé en France
 * d'après sa place de cotation, compté comme une concentration sur une seule
 * société.
 *
 * La source de marché, elle, sait de quoi il s'agit, et chaque actualisation
 * des cours l'interroge déjà : on lui prend ce qu'elle dit au passage.
 *
 * Deux garde-fous :
 *  - le type n'est corrigé que VERS un fonds, jamais dans l'autre sens — une
 *    ligne déjà rangée en fonds (« ETF », « Fonds / OPCVM ») n'est pas
 *    rétrogradée sur la foi d'une source qui se tromperait ;
 *  - le nom n'est remplacé que s'il n'est que le ticker : un nom saisi n'est
 *    jamais écrasé.
 */

/** Types d'instrument de la source de marché → type de ligne de l'application. */
const TYPE_FONDS = { ETF: "ETF", MUTUALFUND: "Fonds / OPCVM" };

const normaliser = (s) => String(s ?? "").trim().toUpperCase();

/**
 * Correctif à appliquer à la ligne d'après sa cotation, ou `null` s'il n'y a
 * rien à changer.
 * @returns {null | {type?: string, name?: string}}
 */
export function identiteDepuisCotation(position, cotation) {
  if (!position || !cotation?.ok) return null;
  const correctif = {};

  const fonds = TYPE_FONDS[cotation.instrumentType];
  if (fonds && !estFonds(position)) correctif.type = fonds;

  const ticker = normaliser(position.ticker);
  const nom = String(cotation.name ?? "").trim();
  const nomActuel = normaliser(position.name);
  if (nom && normaliser(nom) !== ticker && (!nomActuel || nomActuel === ticker)) correctif.name = nom;

  return Object.keys(correctif).length > 0 ? correctif : null;
}
