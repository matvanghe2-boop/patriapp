/**
 * Dividende par action rempli automatiquement, et calendrier de détachement.
 *
 * Le dividende annuel par action se saisissait à la main, ligne par ligne,
 * via le crayon : tant qu'on ne l'avait pas fait, la carte « Revenus de
 * dividendes estimés » restait vide, et une fois fait, il vieillissait sans
 * que rien ne le signale. La source de marché le connaît pourtant — c'est le
 * même chiffre que celui affiché dans la fiche de chaque titre.
 *
 * RÈGLE DE PRIORITÉ : seule une valeur EXPLICITEMENT corrigée à la main
 * (`dividendeSource: "manuel"`, posé quand on change le chiffre au crayon)
 * est protégée. Toute autre valeur suit le marché — y compris celles saisies
 * avant l'arrivée du remplissage automatique.
 *
 * La première version protégeait aussi ces anciennes saisies, faute de savoir
 * d'où elles venaient. Résultat : un portefeuille déjà renseigné ne se mettait
 * JAMAIS à jour, ce qui est exactement le cas qu'il fallait servir. Elles
 * avaient été tapées parce qu'il n'existait pas d'autre moyen, pas pour
 * contredire le marché.
 *
 * Module pur : aucune requête, aucune dépendance React.
 */

/** Intervalle entre deux vérifications automatiques, en jours. */
export const JOURS_ENTRE_VERIFICATIONS = 7;

/** La ligne accepte-t-elle une valeur automatique ? */
export function dividendeModifiableAuto(position) {
  return position?.dividendeSource !== "manuel";
}

/**
 * Champs à fusionner dans une position à partir des ratios de marché, ou
 * `null` s'il n'y a rien à changer.
 *
 * Un titre sans dividende publié (ETF capitalisant, société qui ne distribue
 * pas) reçoit 0 et non rien : la ligne est marquée vérifiée, et la carte des
 * revenus peut dire « ne verse pas de dividende » plutôt que de réclamer une
 * saisie.
 */
export function majDividendeAuto(position, ratios, aujourdhui) {
  if (!ratios || ratios.ok === false || !dividendeModifiableAuto(position)) return null;
  const parAction = Number(ratios.dividendeParAction);
  const valeur = Number.isFinite(parAction) && parAction > 0 ? parAction : 0;
  if (position?.dividendeSource === "auto" && Number(position.annual_dividend) === valeur) {
    return { dividendeMajLe: aujourdhui };
  }
  return { annual_dividend: valeur, dividendeSource: "auto", dividendeMajLe: aujourdhui };
}

/**
 * Faut-il interroger la source ? Oui dès qu'une ligne détenue n'a jamais été
 * vérifiée, ou ne l'a pas été depuis une semaine. Un dividende change une ou
 * deux fois par an : le revérifier à chaque ouverture de l'onglet coûterait
 * deux appels réseau pour rien.
 */
export function dividendesAVerifier(positions = [], aujourdhui, jours = JOURS_ENTRE_VERIFICATIONS) {
  const limite = new Date(`${aujourdhui}T12:00:00Z`);
  limite.setUTCDate(limite.getUTCDate() - jours);
  const limiteIso = limite.toISOString().slice(0, 10);
  return (positions || []).some(
    (p) => Number(p?.quantity) > 0 && (!p.dividendeVerifieLe || p.dividendeVerifieLe <= limiteIso)
  );
}

/**
 * Répartition d'un dividende annuel sur les mois de l'année, d'après les
 * détachements des douze derniers mois.
 *
 * Renvoie { "3": 0.6, "9": 0.4 } — mois (1 à 12) → part du total annuel —
 * ou `null` si aucun détachement n'a eu lieu sur la période : on ne devine
 * pas un calendrier qu'on n'a pas observé.
 *
 * La date est celle du DÉTACHEMENT ; le versement suit de quelques jours, et
 * tombe presque toujours dans le même mois.
 */
export function repartitionMensuelle(dividendes = [], aujourdhui) {
  const fin = new Date(`${aujourdhui}T12:00:00Z`);
  const debut = new Date(fin);
  debut.setUTCFullYear(debut.getUTCFullYear() - 1);
  const debutIso = debut.toISOString().slice(0, 10);

  const recents = (dividendes || []).filter(
    (d) => d?.date > debutIso && d.date <= aujourdhui && Number(d.montant) > 0
  );
  const total = recents.reduce((s, d) => s + Number(d.montant), 0);
  if (total <= 0) return null;

  const parMois = {};
  for (const d of recents) {
    const mois = String(Number(d.date.slice(5, 7)));
    parMois[mois] = (parMois[mois] || 0) + Number(d.montant) / total;
  }
  return parMois;
}
