import { uid, todayIso } from "./finance";

/**
 * Dates de calendrier saisies à la main.
 *
 * POURQUOI CETTE ÉCHAPPATOIRE EXISTE
 *
 * Aucune source gratuite ne publie l'agenda à venir des valeurs d'Euronext.
 * Mesuré, pas supposé :
 *
 *   - Yahoo, sur douze valeurs du CAC, n'avait une date de résultats encore à
 *     venir que pour quatre d'entre elles. Pour Schneider, Veolia et Vinci,
 *     la dernière date connue remontait à juillet.
 *   - Twelve Data, sur un plan gratuit, refuse purement et simplement les
 *     symboles Euronext — y compris sur `/quote` — et ferme `/earnings`,
 *     `/dividends` et `/earnings_calendar` à tous les plans inférieurs.
 *   - Euronext chiffre les réponses de son propre site.
 *   - SEC EDGAR ne couvre que les sociétés américaines.
 *
 * Or ces dates EXISTENT : elles sont publiées sur l'« agenda financier » du
 * site investisseurs de chaque société. Elles sont simplement hors de portée
 * d'une API gratuite.
 *
 * Plutôt que d'attendre qu'un fournisseur veuille bien les donner, on permet
 * de les saisir. C'est le même parti pris que `shared/ratesCatalog.js` pour
 * les taux réglementés : quand aucune API ne sert la donnée, une référence
 * tenue à la main, datée et sourcée, vaut mieux qu'une case vide.
 *
 * Ces dates priment sur toutes les sources automatiques (voir `RANG_SOURCE`
 * dans `api/_lib/sources/fusion.js`) : un rafraîchissement ne les écrase
 * jamais.
 */

/** Types proposés, alignés sur ceux qu'affiche le calendrier. */
export const TYPES_MANUELS = [
  "Résultats",
  "Chiffre d'affaires",
  "Dividende",
  "Assemblée Générale",
  "Communication",
];

/**
 * Normalise une saisie en événement de calendrier.
 * Renvoie `null` si l'essentiel manque — mieux vaut refuser que d'enregistrer
 * une ligne qui s'affichera sans date ou sans titre.
 */
export function creerDateManuelle({ ticker, type, date, label, source } = {}) {
  const t = String(ticker || "").trim().toUpperCase();
  const d = String(date || "").trim();
  if (!t || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  if (!TYPES_MANUELS.includes(type)) return null;

  return {
    id: uid(),
    ticker: t,
    type,
    date: d,
    label: String(label || "").trim() || type,
    // L'URL de l'agenda financier d'où vient la date : c'est elle qui rend la
    // saisie vérifiable plus tard, quand on aura oublié d'où elle sortait.
    source: String(source || "").trim() || null,
    saisiLe: todayIso(),
  };
}

/**
 * Met les saisies à la forme attendue par le calendrier, en ne gardant que
 * les tickers réellement suivis : une ligne vendue ne doit pas continuer à
 * peupler l'agenda.
 */
export function evenementsManuels(saisies = [], tickersSuivis = []) {
  const suivis = new Set(tickersSuivis.map((t) => String(t).toUpperCase()));
  return saisies
    .filter((s) => s?.date && s?.ticker && suivis.has(String(s.ticker).toUpperCase()))
    .map((s) => ({
      ticker: s.ticker,
      name: s.ticker,
      type: s.type,
      date: s.date,
      label: s.label || s.type,
      fournisseur: "manuel",
      // Relevée sur l'agenda officiel de la société : c'est un fait, pas une
      // extrapolation.
      statut: "confirme",
      lien: s.source || null,
      manuelId: s.id,
    }));
}

/** Supprime une saisie. */
export function retirerDateManuelle(saisies = [], id) {
  return saisies.filter((s) => s.id !== id);
}
