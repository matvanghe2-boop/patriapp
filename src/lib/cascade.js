import { operationCashDelta } from "./finance";

/**
 * Décomposition mensuelle du patrimoine, en cascade.
 *
 * « Mon patrimoine a monté de 4 200 € ce mois-ci » ne dit pas l'essentiel :
 * est-ce parce qu'on a versé 4 000 €, ou parce que le marché a travaillé ?
 * Les deux produisent la même courbe et n'ont rien à voir.
 *
 * La cascade sépare donc les quatre mouvements :
 *
 *   patrimoine de début
 *     + versements nets   (argent qu'on a APPORTÉ — ce n'est pas une performance)
 *     + dividendes        (encaissés, donc acquis)
 *     − frais             (ce que l'intermédiaire a prélevé)
 *     + plus-values       (ce que le marché a fait, en résiduel)
 *   = patrimoine de fin
 *
 * LES PLUS-VALUES SONT UN RÉSIDU, ET C'EST VOULU. On ne les additionne pas
 * ligne à ligne : il faudrait pour cela connaître la valorisation de chaque
 * position à chaque instant, que l'application n'historise pas. En les
 * déduisant de l'écart constaté, la cascade BOUCLE toujours — début + tous
 * les mouvements = fin, au centime près. Une somme de plus-values calculée à
 * part laisserait un écart inexpliqué, et c'est précisément l'écart
 * inexpliqué qu'on cherche à supprimer.
 *
 * Conséquence assumée : tout ce qui n'est ni versement, ni dividende, ni
 * frais se retrouve dans les plus-values — y compris une correction de saisie.
 */

/** Mois AAAA-MM d'une date ISO. */
const moisDe = (iso) => String(iso || "").slice(0, 7);

/** Dernier relevé de chaque mois, et dernier relevé antérieur au premier mois. */
function valeursParMois(historique = []) {
  const parMois = new Map();
  const tries = [...historique]
    .filter((p) => p?.date)
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  for (const p of tries) {
    const v = Number(p.valeur ?? p.net ?? p.total);
    if (Number.isFinite(v)) parMois.set(moisDe(p.date), v);
  }
  return { parMois, tries };
}

/**
 * @param {object} p
 * @param {Array} p.historique  Relevés de patrimoine [{date, valeur}].
 * @param {Array} p.operations  Journal d'opérations.
 * @param {number} p.mois       Nombre de mois à remonter.
 */
export function cascadeMensuelle({ historique = [], operations = [], mois = 6 } = {}) {
  const { parMois } = valeursParMois(historique);
  if (parMois.size < 2) return [];

  const moisTries = [...parMois.keys()].sort();
  const retenus = moisTries.slice(-mois);

  const sortie = [];

  for (const m of retenus) {
    const indexGlobal = moisTries.indexOf(m);
    // Sans mois précédent, il n'y a pas d'écart à décomposer : on ne peut pas
    // dire d'où vient une valeur dont on ignore le point de départ.
    if (indexGlobal === 0) continue;

    const debut = parMois.get(moisTries[indexGlobal - 1]);
    const fin = parMois.get(m);
    if (!Number.isFinite(debut) || !Number.isFinite(fin)) continue;

    let versements = 0;
    let dividendes = 0;
    let frais = 0;

    for (const op of operations) {
      if (moisDe(op?.date) !== m) continue;

      if (op.type === "VERSEMENT" || op.type === "RETRAIT") {
        versements += operationCashDelta(op);
      } else if (op.type === "DIVIDENDE") {
        dividendes += Number(op.amount ?? op.montantNet ?? 0) || 0;
      }
      // Les frais sont prélevés quel que soit le type d'opération.
      frais += Number(op.fees) || 0;
    }

    /*
     * Les composants sont arrondis AVANT le calcul du résidu, et le résidu
     * est déduit des valeurs arrondies.
     *
     * Arrondir chaque terme séparément laissait la cascade ouverte d'un euro :
     * des frais de 7,50 € arrondis à 7 tandis que le résidu était calculé sur
     * 7,50 produisaient un total de 56 001 pour une fin de mois à 56 000. Un
     * euro d'écart suffit à faire douter de tout le reste — alors que c'est
     * la seule chose que cette décomposition promet : qu'elle BOUCLE.
     *
     * Les ajustements de solde ne sont PAS des flux externes : ils corrigent
     * une saisie, ils n'apportent pas d'argent. Ils retombent donc dans le
     * résidu, comme n'importe quelle variation non expliquée.
     */
    const debutArrondi = Math.round(debut);
    const finArrondie = Math.round(fin);
    const versementsArrondis = Math.round(versements);
    const dividendesArrondis = Math.round(dividendes);
    const fraisArrondis = Math.round(-frais);

    const plusValues =
      finArrondie - debutArrondi - versementsArrondis - dividendesArrondis - fraisArrondis;

    sortie.push({
      mois: m,
      debut: debutArrondi,
      versements: versementsArrondis,
      dividendes: dividendesArrondis,
      frais: fraisArrondis,
      plusValues,
      fin: finArrondie,
      variation: finArrondie - debutArrondi,
    });
  }

  return sortie;
}

/**
 * Met un mois à plat pour un graphique en cascade : chaque barre porte sa
 * base invisible et sa hauteur, de sorte qu'elle démarre là où la précédente
 * s'arrête.
 */
export function barresCascade(moisDecompose) {
  if (!moisDecompose) return [];
  const etapes = [
    { cle: "debut", libelle: "Début de mois", valeur: moisDecompose.debut, type: "total" },
    { cle: "versements", libelle: "Versements nets", valeur: moisDecompose.versements, type: "flux" },
    { cle: "plusValues", libelle: "Plus-values", valeur: moisDecompose.plusValues, type: "marche" },
    { cle: "dividendes", libelle: "Dividendes", valeur: moisDecompose.dividendes, type: "marche" },
    { cle: "frais", libelle: "Frais", valeur: moisDecompose.frais, type: "cout" },
    { cle: "fin", libelle: "Fin de mois", valeur: moisDecompose.fin, type: "total" },
  ];

  let curseur = 0;
  return etapes.map((e) => {
    if (e.type === "total") {
      curseur = e.valeur;
      return { ...e, base: 0, hauteur: e.valeur };
    }
    const base = e.valeur >= 0 ? curseur : curseur + e.valeur;
    const hauteur = Math.abs(e.valeur);
    curseur += e.valeur;
    return { ...e, base, hauteur };
  });
}
