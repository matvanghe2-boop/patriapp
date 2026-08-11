/**
 * Plan de rééquilibrage d'un portefeuille.
 *
 * Le simulateur d'ordre existant répondait à « combien vendre de CETTE ligne
 * pour la ramener à 10 % ? ». Utile, mais on ne rééquilibre jamais une ligne
 * isolément : vendre l'une modifie le poids de toutes les autres. Ce module
 * raisonne sur le portefeuille entier.
 *
 * Trois choix de conception :
 *
 * - **Les poids cibles sont facultatifs.** Exiger douze pourcentages avant
 *   d'afficher quoi que ce soit condamnerait la fonctionnalité à n'être jamais
 *   utilisée. Deux préréglages — équipondération, poids actuels — donnent un
 *   point de départ immédiat.
 * - **Le cash fait partie du plan.** Un rééquilibrage par apport (n'acheter
 *   que ce qui manque, sans rien vendre) est fiscalement gratuit, alors qu'une
 *   vente déclenche l'impôt. Les deux modes sont proposés.
 * - **Rien n'est appliqué automatiquement.** Le module produit une liste
 *   d'ordres à passer chez son courtier ; l'exécution reste manuelle, comme
 *   partout ailleurs dans l'application.
 *
 * Module pur : aucune requête, aucune dépendance React.
 */

/** Valeur d'une position en euros, conversion de change incluse. */
function valeurDe(position) {
  const taux =
    position?.currency && position.currency !== "EUR" && position?.fxRate > 0 ? position.fxRate : 1;
  return (position?.quantity || 0) * (position?.current_price || 0) * taux;
}

/** Répartition actuelle, en pourcentage de la valeur investie (hors cash). */
export function poidsActuels(positions = []) {
  const total = positions.reduce((s, p) => s + valeurDe(p), 0);
  if (total <= 0) return {};
  return Object.fromEntries(positions.map((p) => [p.id, (valeurDe(p) / total) * 100]));
}

/** Préréglage : chaque ligne au même poids. */
export function ciblesEquiponderees(positions = []) {
  if (positions.length === 0) return {};
  const part = 100 / positions.length;
  return Object.fromEntries(positions.map((p) => [p.id, part]));
}

/** Préréglage : figer la répartition telle qu'elle est aujourd'hui. */
export function ciblesActuelles(positions = []) {
  return poidsActuels(positions);
}

/**
 * Normalise des poids cibles pour qu'ils totalisent 100 %.
 *
 * Une saisie manuelle ne tombe jamais juste. Plutôt que de refuser un plan
 * pour 99,7 %, on ramène proportionnellement à 100 et on signale l'écart
 * d'origine — l'utilisateur voit ce qui a été corrigé.
 */
export function normaliserCibles(cibles = {}) {
  const entrees = Object.entries(cibles).filter(([, v]) => Number.isFinite(v) && v >= 0);
  const somme = entrees.reduce((s, [, v]) => s + v, 0);
  if (somme <= 0) return { cibles: {}, sommeInitiale: somme, normalise: false };
  if (Math.abs(somme - 100) < 0.01) {
    return { cibles: Object.fromEntries(entrees), sommeInitiale: somme, normalise: false };
  }
  return {
    cibles: Object.fromEntries(entrees.map(([k, v]) => [k, (v / somme) * 100])),
    sommeInitiale: somme,
    normalise: true,
  };
}

/**
 * Construit le plan d'ordres.
 *
 * @param positions   lignes du portefeuille
 * @param ciblesPct   { [id]: poids visé en % }
 * @param options.apport            liquidités à investir en plus (0 par défaut)
 * @param options.sansVente         n'acheter que ce qui manque, ne rien vendre
 * @param options.seuilTolerancePct écart en deçà duquel on ne bouge pas
 * @param options.fraisParOrdre     coût estimé d'un ordre, pour le total
 */
export function construirePlan(positions = [], ciblesPct = {}, options = {}) {
  const { apport = 0, sansVente = false, seuilTolerancePct = 1, fraisParOrdre = 0 } = options;

  const valeurInvestie = positions.reduce((s, p) => s + valeurDe(p), 0);

  // Les lignes sans cible explicite prennent leur poids ACTUEL avant
  // normalisation. Sans cela, saisir 70 % sur une seule ligne revenait à lui
  // donner 100 % : la normalisation ne voyait qu'elle et ramenait sa part à
  // l'intégralité du portefeuille — l'inverse de ce que l'utilisateur demande.
  const completes = {};
  for (const p of positions) {
    const poidsActuel = valeurInvestie > 0 ? (valeurDe(p) / valeurInvestie) * 100 : 0;
    completes[p.id] = Number.isFinite(ciblesPct[p.id]) ? ciblesPct[p.id] : poidsActuel;
  }

  const { cibles, sommeInitiale, normalise } = normaliserCibles(completes);

  // En mode « sans vente », l'apport est la seule ressource : la base de calcul
  // reste la valeur totale visée, mais aucune ligne ne peut être réduite.
  const baseCible = valeurInvestie + Math.max(0, apport);

  const ordres = positions.map((p) => {
    const valeur = valeurDe(p);
    const poidsActuelPct = valeurInvestie > 0 ? (valeur / valeurInvestie) * 100 : 0;
    const poidsCiblePct = cibles[p.id] ?? poidsActuelPct;
    const valeurCible = (poidsCiblePct / 100) * baseCible;
    let ecartEuros = valeurCible - valeur;

    if (sansVente && ecartEuros < 0) ecartEuros = 0;

    const cours = (p?.current_price || 0) * (p?.currency && p.currency !== "EUR" && p?.fxRate > 0 ? p.fxRate : 1);
    const quantite = cours > 0 ? ecartEuros / cours : 0;

    // Sous la tolérance, on ne bouge pas : un rééquilibrage à 0,3 % coûte des
    // frais et de l'impôt pour un effet nul.
    const ecartPoidsPct = poidsCiblePct - poidsActuelPct;
    const negligeable = Math.abs(ecartPoidsPct) < seuilTolerancePct;

    return {
      id: p.id,
      ticker: p.ticker,
      nom: p.name,
      valeur,
      poidsActuelPct,
      poidsCiblePct,
      ecartPoidsPct,
      ecartEuros: negligeable ? 0 : ecartEuros,
      quantite: negligeable ? 0 : quantite,
      sens: negligeable || ecartEuros === 0 ? "aucun" : ecartEuros > 0 ? "achat" : "vente",
      negligeable,
      // Plus-value latente proportionnelle à la part vendue : c'est elle qui
      // sera imposée. Approximation assumée — le PRU est moyen, pas par lot.
      plusValueCedee:
        ecartEuros < 0 && valeur > 0
          ? ((valeur - (p.quantity || 0) * (p.pru || 0) * (p?.currency && p.currency !== "EUR" && p?.fxRate > 0 ? p.fxRate : 1)) *
              Math.min(1, Math.abs(ecartEuros) / valeur))
          : 0,
    };
  });

  const aExecuter = ordres.filter((o) => o.sens !== "aucun");
  const totalAchats = aExecuter.filter((o) => o.sens === "achat").reduce((s, o) => s + o.ecartEuros, 0);
  const totalVentes = aExecuter.filter((o) => o.sens === "vente").reduce((s, o) => s + Math.abs(o.ecartEuros), 0);

  return {
    ordres,
    aExecuter,
    totalAchats,
    totalVentes,
    // Positif : il manque des liquidités. Négatif : la vente en dégage.
    besoinLiquidites: totalAchats - totalVentes - Math.max(0, apport),
    plusValueCedeeTotale: aExecuter.reduce((s, o) => s + Math.max(0, o.plusValueCedee), 0),
    fraisEstimes: aExecuter.length * (fraisParOrdre || 0),
    valeurInvestie,
    ciblesNormalisees: normalise,
    sommeCiblesInitiale: sommeInitiale,
    // Écart absolu moyen à la cible : une mesure simple du « à quel point le
    // portefeuille a dérivé ».
    deriveMoyennePct:
      ordres.length > 0
        ? ordres.reduce((s, o) => s + Math.abs(o.ecartPoidsPct), 0) / ordres.length
        : 0,
  };
}
