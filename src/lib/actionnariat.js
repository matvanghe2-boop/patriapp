/**
 * Rachats d'actions et dilution : ce que la société fait de son capital.
 *
 * Une société rend de l'argent à ses actionnaires de deux façons : le
 * dividende, et le rachat de ses propres titres, qui grossit la part de
 * chaque action restante. Ne regarder que le rendement du dividende
 * sous-estime TotalEnergies de moitié : elle rachète presque autant qu'elle
 * distribue.
 *
 * Le nombre d'actions retenu est celui de FIN D'EXERCICE (`OrdinarySharesNumber`),
 * pas le nombre moyen : ce dernier tombe de 634 à 577 millions chez Air
 * Liquide en 2025 sans aucun rachat correspondant — une donnée source erronée.
 *
 * Module pur : aucune requête, aucune dépendance React.
 */

const annee = (iso) => String(iso).slice(0, 4);

/**
 * Évolution du nombre d'actions sur les exercices publiés.
 * @returns {null | {points, debut, fin, variationPct, variationAnnuellePct, sens}}
 */
export function evolutionNombreActions(historique = []) {
  const points = (historique || [])
    .filter((e) => e?.exercice && Number.isFinite(e.OrdinarySharesNumber) && e.OrdinarySharesNumber > 0)
    .sort((a, b) => (a.exercice < b.exercice ? -1 : 1))
    .map((e) => ({ exercice: annee(e.exercice), nombre: e.OrdinarySharesNumber }));
  if (points.length < 2) return null;

  const debut = points[0];
  const fin = points[points.length - 1];
  const n = Number(fin.exercice) - Number(debut.exercice);
  const variationPct = (fin.nombre / debut.nombre - 1) * 100;
  const variationAnnuellePct = n > 0 ? ((fin.nombre / debut.nombre) ** (1 / n) - 1) * 100 : null;
  // Moins de 0,5 % par an dans un sens ou dans l'autre : les plans
  // d'actionnariat salarié et les annulations se compensent, ce n'est une
  // politique ni de rachat ni de dilution.
  const sens = variationAnnuellePct == null || Math.abs(variationAnnuellePct) < 0.5 ? "stable" : variationAnnuellePct < 0 ? "rachats" : "dilution";
  return { points, debut, fin, variationPct, variationAnnuellePct, sens };
}

/**
 * Ce que le dernier exercice a rendu aux actionnaires, rapporté à la
 * capitalisation d'aujourd'hui.
 *
 * `facteurComptes` convertit la devise des comptes dans celle de la
 * capitalisation (TotalEnergies publie en dollars et cote en euros) ; `null`
 * quand la conversion est nécessaire mais impossible — on n'affiche alors
 * rien plutôt qu'un rapport entre deux monnaies.
 */
export function rendementActionnaire(historique = [], capitalisation, facteurComptes = 1) {
  if (!(capitalisation > 0) || !Number.isFinite(facteurComptes)) return null;
  const dernier = [...(historique || [])]
    .filter((e) => e?.exercice && (Number.isFinite(e.CashDividendsPaid) || Number.isFinite(e.RepurchaseOfCapitalStock)))
    .sort((a, b) => (a.exercice < b.exercice ? -1 : 1))
    .pop();
  if (!dernier) return null;

  // Yahoo publie ces flux en négatif (sorties de trésorerie).
  const dividendes = Number.isFinite(dernier.CashDividendsPaid) ? Math.abs(dernier.CashDividendsPaid) * facteurComptes : null;
  const rachats = Number.isFinite(dernier.RepurchaseOfCapitalStock) ? Math.abs(dernier.RepurchaseOfCapitalStock) * facteurComptes : null;
  const enPct = (v) => (v == null ? null : (v / capitalisation) * 100);
  return {
    exercice: annee(dernier.exercice),
    dividendes,
    rachats,
    dividendesPct: enPct(dividendes),
    rachatsPct: enPct(rachats),
    totalPct: dividendes == null && rachats == null ? null : enPct((dividendes || 0) + (rachats || 0)),
  };
}
