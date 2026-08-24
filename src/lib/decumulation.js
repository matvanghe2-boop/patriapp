import { lireNombre } from "./finance";

/**
 * Décumulation — la phase de retrait.
 *
 * L'onglet Simulation projette l'ACCUMULATION : capital, versements, intérêts
 * composés. Il ne sait pas faire le chemin inverse, qui est pourtant la raison
 * d'être de tout ce qu'on accumule. « Combien puis-je retirer par mois, et
 * jusqu'à quand ? » n'a aucune réponse dans l'application aujourd'hui.
 *
 * DEUX PRÉCAUTIONS, parce que c'est le premier calcul de Patrium qui touche à
 * une décision de vie :
 *
 *  · **Le rendement est supposé CONSTANT.** C'est faux, et il faut le dire :
 *    une séquence de mauvaises années en début de retrait épuise un capital
 *    bien plus vite que la même moyenne étalée — le « risque de séquence ».
 *    La fonction expose donc aussi une variante dégradée, pour que l'écart
 *    soit visible plutôt que supposé.
 *  · **L'inflation est explicite.** Retirer 1 400 € par mois pendant vingt ans
 *    ne veut rien dire sans préciser si ce montant est indexé. Le paramètre
 *    existe, il n'a pas de valeur par défaut cachée.
 */

/**
 * Projette l'épuisement d'un capital soumis à des retraits mensuels.
 *
 * @param {object} p
 * @param {number} p.capital          Capital de départ.
 * @param {number} p.retraitMensuel   Retrait du premier mois.
 * @param {number} p.tauxAnnuelPct    Rendement annuel net supposé.
 * @param {number} p.inflationPct     Indexation annuelle du retrait.
 * @param {number} p.maxAnnees        Horizon de calcul.
 * @returns {{annees: {annee, capital, retraitAnnuel}[], epuiseApresMois: number|null, perpetuel: boolean}}
 */
export function projeterDecumulation({
  capital = 0,
  retraitMensuel = 0,
  tauxAnnuelPct = 0,
  inflationPct = 0,
  maxAnnees = 50,
} = {}) {
  const c0 = lireNombre(capital) ?? 0;
  const r0 = lireNombre(retraitMensuel) ?? 0;
  const tauxMensuel = (lireNombre(tauxAnnuelPct) ?? 0) / 100 / 12;
  const inflation = (lireNombre(inflationPct) ?? 0) / 100;

  const annees = [{ annee: 0, capital: c0, retraitAnnuel: r0 * 12 }];

  /*
   * Capital nul : la boucle conclurait « épuisé après 1 mois », ce qui est
   * exact au sens du calcul et absurde à l'écran — un patrimoine vide n'a pas
   * une durée de vie d'un mois, il n'a rien à projeter. On sort donc avec un
   * épuisement à zéro mois, qui dit la même chose sans laisser croire à un
   * décompte.
   */
  if (c0 <= 0) return { annees, epuiseApresMois: 0, perpetuel: false, vide: true };

  let restant = c0;
  let retrait = r0;
  let epuiseApresMois = null;

  for (let mois = 1; mois <= maxAnnees * 12; mois++) {
    // Les intérêts courent sur le capital du DÉBUT de mois, puis le retrait est
    // prélevé. L'ordre inverse surestimerait la durée d'un mois de rendement à
    // chaque itération — soit plusieurs années sur un horizon long.
    restant = restant * (1 + tauxMensuel) - retrait;

    if (restant <= 0 && epuiseApresMois == null) {
      epuiseApresMois = mois;
      restant = 0;
    }

    if (mois % 12 === 0) {
      annees.push({
        annee: mois / 12,
        capital: Math.max(0, restant),
        retraitAnnuel: retrait * 12,
      });
      // L'indexation s'applique une fois par an, comme une revalorisation
      // réelle — et non mois par mois, ce qui la composerait douze fois.
      retrait *= 1 + inflation;
    }

    if (restant <= 0) break;
  }

  return {
    annees,
    epuiseApresMois,
    // « Perpétuel » au sens strict : le capital n'a pas été entamé sur tout
    // l'horizon calculé. On ne prétend pas à l'infini, seulement à l'horizon.
    perpetuel: epuiseApresMois == null,
  };
}

/**
 * Retrait mensuel qui laisse le capital intact — le seuil que tout le monde
 * cherche.
 *
 * Sans indexation c'est un simple produit ; avec, aucune formule fermée
 * n'existe et une dichotomie est la voie honnête. Trente itérations suffisent
 * à l'euro près sur les ordres de grandeur concernés.
 */
export function retraitPerpetuel({ capital = 0, tauxAnnuelPct = 0, inflationPct = 0, maxAnnees = 50 } = {}) {
  const c = lireNombre(capital) ?? 0;
  const taux = lireNombre(tauxAnnuelPct) ?? 0;
  const inflation = lireNombre(inflationPct) ?? 0;
  if (c <= 0 || taux <= 0) return 0;

  // Sans indexation, le capital tient exactement si le retrait annuel égale
  // les intérêts annuels.
  if (inflation <= 0) return (c * (taux / 100)) / 12;

  let bas = 0;
  let haut = (c * (taux / 100)) / 12;
  for (let i = 0; i < 30; i++) {
    const milieu = (bas + haut) / 2;
    const { perpetuel } = projeterDecumulation({
      capital: c,
      retraitMensuel: milieu,
      tauxAnnuelPct: taux,
      inflationPct: inflation,
      maxAnnees,
    });
    if (perpetuel) bas = milieu;
    else haut = milieu;
  }
  return bas;
}

/** « 284 mois » → « 23 ans et 8 mois ». */
export function formaterDuree(mois) {
  if (mois == null) return null;
  const a = Math.floor(mois / 12);
  const m = mois % 12;
  if (a === 0) return `${m} mois`;
  if (m === 0) return `${a} an${a > 1 ? "s" : ""}`;
  return `${a} an${a > 1 ? "s" : ""} et ${m} mois`;
}
