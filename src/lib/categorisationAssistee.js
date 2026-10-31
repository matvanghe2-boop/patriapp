import { CATEGORIES, categorie, normaliser } from "./compteCourant";
import { auditerContexte } from "../../shared/anonymiser";

/**
 * Catégorisation assistée des opérations du compte courant.
 *
 * Les mots-clés de `compteCourant.js` classent les grandes enseignes. Tout le
 * reste — le bar du coin, le kiné, la petite boutique en ligne — tombe dans
 * « Autres dépenses », et il fallait le reclasser opération par opération.
 *
 * Deux étages, du plus sûr au plus coûteux :
 *  1. LOCAL, sans réseau : un marchand déjà classé dont le nom commence
 *     pareil (« Le Fournil de Lille » après « Le Fournil Wazemmes »), puis des
 *     indices génériques (« KINE », « BAR », « PRESSING »…) ;
 *  2. IA, à la demande : seuls les NOMS des marchands partent, sans montant,
 *     sans date, et jamais un virement vers une personne.
 *
 * Rien n'est appliqué sans l'accord de l'utilisateur : une suggestion devient
 * une règle de classement d'un geste, comme une correction manuelle.
 */

const A_CLASSER = new Set(["autres-depenses", "autres-revenus"]);

/**
 * Marchands restés « Autres », regroupés par clé, les plus coûteux d'abord.
 * Les virements en sont exclus : un virement vers une personne n'est pas un
 * marchand, et ne doit jamais partir vers un service d'IA.
 */
export function aClasser(enrichies = []) {
  const groupes = new Map();
  for (const op of enrichies || []) {
    if (!A_CLASSER.has(op.categorie) || op.categorieManuelle || !op.analyse?.cle) continue;
    if (op.analyse.type === "virement") continue;
    const cle = op.analyse.cle;
    if (!groupes.has(cle)) {
      groupes.set(cle, { cle, titre: op.analyse.titre, type: op.analyse.type, sens: op.montant < 0 ? "debit" : "credit", ops: [], total: 0 });
    }
    const g = groupes.get(cle);
    g.ops.push(op);
    g.total += Math.abs(op.montant);
  }
  return [...groupes.values()]
    .map((g) => ({ ...g, nombre: g.ops.length, derniere: g.ops.map((o) => o.date).sort().pop() }))
    .sort((a, b) => b.total - a.total);
}

/** Mots trop courants pour rapprocher deux marchands. */
const MOTS_VIDES = new Set([
  "SAS", "SARL", "SA", "EURL", "LE", "LA", "LES", "DE", "DU", "DES", "ET", "AU", "AUX", "CHEZ", "THE", "SNC",
  "CARTE", "PRLV", "SEPA", "PAYPAL", "SUMUP", "ZETTLE", "STRIPE",
]);

const premierMot = (cle) => normaliser(cle).split(/[^A-Z0-9&]+/).find((m) => m.length >= 4 && !MOTS_VIDES.has(m)) || null;

/** Indices génériques, absents des mots-clés d'enseignes. */
const INDICES = [
  ["sante", ["KINE", "OSTEO", "PODOLOGUE", "INFIRMIER", "LABORATOIRE", "LABO", "RADIOLOGIE", "CLINIQUE", "HOPITAL", "OPTIQUE", "AUDITION", "ORTHO"]],
  ["restauration", ["CAFE", "BISTRO", "BISTROT", "TRAITEUR", "PATISSERIE", "FOURNIL", "CREPE", "PIZZERIA", "RAMEN", "BOUILLON", "CANTINE", "FAST"]],
  ["loisirs", ["BAR", "PUB", "THEATRE", "MUSEE", "CONCERT", "FESTIVAL", "PARC", "PISCINE", "PATINOIRE", "BILLARD", "ARCADE"]],
  ["transport", ["TAXI", "VTC", "LIME", "DOTT", "TIER", "VELIB", "V'LILLE", "CARBURANT", "STATION", "AUTOROUTE", "GARAGE", "CONTROLE TECHNIQUE"]],
  ["shopping", ["BOUTIQUE", "SHOP", "STORE", "MODE", "PRESSING", "COIFF", "BARBER", "LIBRAIRIE", "PAPETERIE", "FLEURISTE", "TABAC"]],
  ["logement", ["LOYER", "AGENCE", "IMMOBILIER", "FONCIA", "NEXITY", "SYNDIC", "BRICO"]],
  ["courses", ["EPICERIE", "MARCHE", "PRIMEUR", "BOUCHERIE", "FROMAGERIE", "SUPERETTE", "MINIMARKET"]],
  ["abonnements", ["PREMIUM", "SUBSCRIPTION", "ABONNEMENT", "MEMBERSHIP"]],
];
const MOTIFS_INDICES = INDICES.map(([id, mots]) => [
  id,
  new RegExp(`(?:^|[^A-Z0-9])(?:${mots.map((m) => m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`),
]);

/**
 * Suggestion locale pour un marchand à classer, ou `null`.
 * @returns {null | {categorie, source: "similaire"|"indice", detail}}
 */
export function suggestionLocale(groupe, enrichies = []) {
  const mot = premierMot(groupe.cle);
  if (mot) {
    const compte = new Map();
    let exemple = null;
    for (const op of enrichies || []) {
      if (A_CLASSER.has(op.categorie) || op.analyse?.cle === groupe.cle) continue;
      if (premierMot(op.analyse?.cle) !== mot) continue;
      if (categorie(op.categorie).famille !== (groupe.sens === "debit" ? "depense" : "revenu")) continue;
      compte.set(op.categorie, (compte.get(op.categorie) || 0) + 1);
      exemple = exemple || op.analyse.titre;
    }
    const meilleure = [...compte.entries()].sort((a, b) => b[1] - a[1])[0];
    if (meilleure) return { categorie: meilleure[0], source: "similaire", detail: `comme « ${exemple} »` };
  }
  if (groupe.sens === "debit") {
    const texte = ` ${normaliser(groupe.cle)} `;
    for (const [id, motif] of MOTIFS_INDICES) {
      if (motif.test(texte)) return { categorie: id, source: "indice", detail: "d'après le nom" };
    }
  }
  return null;
}

// ─── Étage IA ────────────────────────────────────────────────────────────────

/** Catégories proposables au modèle : seulement celles d'une dépense ou d'un revenu. */
const PROPOSABLES = CATEGORIES.filter((c) => c.famille !== "interne" && !A_CLASSER.has(c.id) && c.id !== "aide-familiale");

/**
 * Contexte envoyé au modèle : des références opaques (`m1`, `m2`…) et des
 * noms de marchands, rien d'autre. Un marchand dont le nom ressemblerait à un
 * identifiant (ticker, e-mail, ISIN) est retiré avant l'envoi plutôt que de
 * faire refuser toute la requête par l'audit du serveur.
 */
export function contexteCategories(groupes = []) {
  const references = {};
  const marchands = [];
  for (const g of groupes) {
    const ref = `m${marchands.length + 1}`;
    const entree = { ref, marchand: g.titre, nature: g.type === "prelevement" ? "prélèvement" : g.type === "carte" ? "paiement par carte" : "autre", sens: g.sens };
    if (!auditerContexte({ entree }).sain) continue;
    marchands.push(entree);
    references[ref] = g.cle;
  }
  return {
    contexte: {
      marchands,
      categories: PROPOSABLES.map((c) => ({ code: c.id, intitule: c.libelle, sens: c.famille === "revenu" ? "credit" : "debit" })),
    },
    references,
  };
}

/**
 * Lit la réponse du modèle — un objet JSON `{ "m1": "restauration", … }`,
 * éventuellement entouré de texte ou d'un bloc de code — et ne garde que les
 * codes de catégorie valides pour des références connues.
 *
 * @returns {Object<string, string>}  clé de marchand → identifiant de catégorie
 */
export function lireReponseCategories(texte, references = {}) {
  const debut = String(texte || "").indexOf("{");
  const fin = String(texte || "").lastIndexOf("}");
  if (debut < 0 || fin <= debut) return {};
  let brut;
  try {
    brut = JSON.parse(texte.slice(debut, fin + 1));
  } catch {
    return {};
  }
  const valides = new Set(PROPOSABLES.map((c) => c.id));
  const sortie = {};
  for (const [ref, code] of Object.entries(brut || {})) {
    if (references[ref] && valides.has(code)) sortie[references[ref]] = code;
  }
  return sortie;
}
