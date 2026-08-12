/**
 * Dividendes perçus, dividendes attendus, et croissance d'une année sur l'autre.
 *
 * L'application savait déjà estimer un rendement théorique à partir du
 * dividende annoncé par action. Elle enregistrait par ailleurs les dividendes
 * réellement encaissés, dans le journal d'opérations (type `DIVIDENDE`). Mais
 * les deux ne se parlaient pas — or c'est leur confrontation qui est
 * instructive :
 *
 *  - un écart durable révèle une coupure de dividende, ou une saisie oubliée ;
 *  - la série année par année montre si le dividende croît, ce qu'un rendement
 *    instantané ne dit jamais.
 *
 * Module pur : aucune requête, aucune dépendance React.
 */

import { dividendeNet } from "./eligibilitePea.js";

/** Taux de conversion d'une position vers l'euro. */
function taux(position) {
  return position?.currency && position.currency !== "EUR" && position?.fxRate > 0 ? position.fxRate : 1;
}

/**
 * Dividende annuel attendu d'une position, en euros.
 *
 * `enveloppe` déduit la retenue à la source étrangère quand elle est
 * définitivement perdue, c'est-à-dire dans un PEA. Sans ce paramètre, cet
 * onglet affichait un brut et la carte « Revenus de dividendes estimés » de
 * l'onglet Portefeuille un net : deux chiffres différents pour la même chose,
 * à deux clics l'un de l'autre.
 */
export function dividendeAttendu(position, enveloppe = null) {
  const parAction = position?.annual_dividend || 0;
  if (parAction <= 0) return 0;
  const brut = parAction * (position?.quantity || 0) * taux(position);
  return enveloppe ? dividendeNet(brut, position?.ticker, enveloppe).net : brut;
}

/** Somme des dividendes attendus sur l'ensemble du portefeuille. */
export function totalAttendu(positions = [], enveloppe = null) {
  return positions.reduce((s, p) => s + dividendeAttendu(p, enveloppe), 0);
}

/** Retenue à la source annuelle perdue sur l'ensemble du portefeuille. */
export function totalRetenueSource(positions = [], enveloppe = "PEA") {
  return positions.reduce((s, p) => {
    const parAction = p?.annual_dividend || 0;
    if (parAction <= 0) return s;
    const brut = parAction * (p?.quantity || 0) * taux(p);
    return s + dividendeNet(brut, p?.ticker, enveloppe).perdue;
  }, 0);
}

/**
 * Dividendes réellement encaissés, regroupés par année civile.
 * @returns {Array<{annee: string, montant: number, nbVersements: number}>}
 */
export function percusParAnnee(operations = []) {
  const parAnnee = new Map();

  for (const op of operations) {
    if (op?.type !== "DIVIDENDE" || !op?.date) continue;
    const montant = Number(op.amount ?? op.montantNet ?? 0) || 0;
    if (montant <= 0) continue;
    const annee = String(op.date).slice(0, 4);
    const entree = parAnnee.get(annee) || { annee, montant: 0, nbVersements: 0 };
    entree.montant += montant;
    entree.nbVersements += 1;
    parAnnee.set(annee, entree);
  }

  return [...parAnnee.values()].sort((a, b) => (a.annee < b.annee ? -1 : 1));
}

/** Dividendes encaissés par actif, sur l'ensemble de l'historique. */
export function percusParActif(operations = []) {
  const parActif = new Map();
  for (const op of operations) {
    if (op?.type !== "DIVIDENDE") continue;
    const montant = Number(op.amount ?? op.montantNet ?? 0) || 0;
    if (montant <= 0) continue;
    const cle = String(op.asset || "—").toUpperCase();
    parActif.set(cle, (parActif.get(cle) || 0) + montant);
  }
  return [...parActif.entries()]
    .map(([actif, montant]) => ({ actif, montant }))
    .sort((a, b) => b.montant - a.montant);
}

/**
 * Série annuelle enrichie : montant encaissé, croissance par rapport à
 * l'année précédente, et — pour l'année en cours — le montant attendu.
 *
 * L'année en cours est marquée `partielle` : la comparer telle quelle à une
 * année pleine ferait croire à un effondrement du dividende chaque mois de
 * janvier.
 */
export function serieAnnuelle(operations = [], { attenduAnnuel = 0, anneeCourante = String(new Date().getFullYear()) } = {}) {
  const percus = percusParAnnee(operations);
  const annees = percus.map((p) => p.annee);
  if (attenduAnnuel > 0 && !annees.includes(anneeCourante)) {
    percus.push({ annee: anneeCourante, montant: 0, nbVersements: 0 });
    percus.sort((a, b) => (a.annee < b.annee ? -1 : 1));
  }

  return percus.map((p, i) => {
    const precedent = i > 0 ? percus[i - 1].montant : null;
    const partielle = p.annee === anneeCourante;
    return {
      ...p,
      partielle,
      attendu: partielle && attenduAnnuel > 0 ? attenduAnnuel : null,
      croissancePct:
        precedent != null && precedent > 0 && !partielle
          ? ((p.montant - precedent) / precedent) * 100
          : null,
    };
  });
}

/**
 * Compare l'attendu au perçu sur l'année en cours.
 *
 * `ecartPct` négatif : on encaisse moins que prévu. Sur une année entamée
 * c'est normal — d'où `avancementAnneePct`, qui donne le point de comparaison
 * honnête : à mi-année, avoir perçu 50 % de l'attendu est conforme.
 */
export function comparerAttenduPercu(operations = [], positions = [], maintenant = new Date()) {
  const attendu = totalAttendu(positions);
  const annee = String(maintenant.getFullYear());

  // Seuls les versements DÉJÀ intervenus comptent : inclure un dividende daté
  // d'octobre dans un point de situation de juillet ferait apparaître une
  // avance qui n'existe pas, et rendrait la comparaison à l'avancement de
  // l'année trompeuse.
  const limite = maintenant.toISOString().slice(0, 10);
  const echus = operations.filter((op) => op?.date && String(op.date) <= limite);
  const percu = percusParAnnee(echus).find((p) => p.annee === annee)?.montant ?? 0;

  const debutAnnee = new Date(maintenant.getFullYear(), 0, 1);
  const finAnnee = new Date(maintenant.getFullYear() + 1, 0, 1);
  const avancementAnneePct = ((maintenant - debutAnnee) / (finAnnee - debutAnnee)) * 100;

  return {
    attendu,
    percu,
    avancementAnneePct,
    // Part de l'attendu déjà encaissée. À comparer à l'avancement de l'année.
    realisationPct: attendu > 0 ? (percu / attendu) * 100 : null,
    ecartEuros: percu - attendu,
  };
}

/**
 * Rendement sur prix de revient (« yield on cost ») du portefeuille.
 * Il ne bouge pas avec le cours : c'est ce que rapporte réellement l'argent
 * investi, et il augmente quand le dividende croît.
 */
export function rendementSurPrixDeRevient(positions = []) {
  const cout = positions.reduce((s, p) => s + (p.quantity || 0) * (p.pru || 0) * taux(p), 0);
  if (cout <= 0) return null;
  return (totalAttendu(positions) / cout) * 100;
}

/**
 * Croissance annuelle moyenne du dividende, mesurée sur les années PLEINES.
 *
 * Deux façons de moyenner, et le choix n'est pas neutre : la moyenne
 * arithmétique des croissances surestime systématiquement une série volatile
 * (+50 % puis −50 % donne 0 % en moyenne arithmétique, alors qu'on a perdu
 * 25 %). On retient donc le **taux de croissance annuel composé**, qui répond
 * à la vraie question — « à quel rythme régulier serais-je passé du premier au
 * dernier montant ? ».
 *
 * L'année en cours est exclue : incomplète, elle tirerait la croissance vers
 * le bas et ferait paraître le dividende en chute chaque mois de janvier.
 */
export function croissanceAnnuelleMoyenne(operations = [], { anneeCourante = String(new Date().getFullYear()) } = {}) {
  const pleines = percusParAnnee(operations).filter((a) => a.annee !== anneeCourante && a.montant > 0);
  if (pleines.length < 2) {
    return { tauxPct: null, nbAnnees: pleines.length, premiere: pleines[0]?.annee ?? null, derniere: pleines.at(-1)?.annee ?? null };
  }

  const premier = pleines[0];
  const dernier = pleines[pleines.length - 1];
  const periodes = Number(dernier.annee) - Number(premier.annee);
  if (periodes <= 0 || premier.montant <= 0) {
    return { tauxPct: null, nbAnnees: pleines.length, premiere: premier.annee, derniere: dernier.annee };
  }

  const taux = (Math.pow(dernier.montant / premier.montant, 1 / periodes) - 1) * 100;
  return {
    tauxPct: Number.isFinite(taux) ? taux : null,
    nbAnnees: pleines.length,
    premiere: premier.annee,
    derniere: dernier.annee,
  };
}

/**
 * Projection des dividendes futurs, à taux de croissance constant.
 *
 * Point de départ : le dividende ATTENDU sur douze mois (dividende annoncé par
 * action × quantités), et non le dernier encaissement. Ce dernier peut être
 * partiel — une ligne achetée en cours d'année n'a pas versé une année pleine —
 * et servirait alors de base à toute la courbe.
 *
 * Aucune projection n'est produite sans taux : extrapoler sur une croissance
 * inventée reviendrait à dessiner une courbe qui a l'air d'une donnée.
 */
export function projeterDividendes({ baseAnnuelle = 0, tauxCroissancePct = null, annees = 10, anneeDepart = new Date().getFullYear() } = {}) {
  if (!(baseAnnuelle > 0) || tauxCroissancePct == null || !Number.isFinite(tauxCroissancePct)) return [];

  const taux = tauxCroissancePct / 100;
  const sortie = [];
  for (let i = 1; i <= Math.max(0, annees); i++) {
    sortie.push({
      annee: String(anneeDepart + i),
      projete: baseAnnuelle * Math.pow(1 + taux, i),
      projection: true,
    });
  }
  return sortie;
}

/**
 * Série complète prête pour un graphique en barres : années encaissées, année
 * en cours, puis projection.
 *
 * Les trois natures restent distinctes dans les données (`partielle`,
 * `projection`) pour que l'affichage puisse les peindre différemment — mélanger
 * un encaissement constaté et une extrapolation dans la même barre serait la
 * meilleure façon de faire passer une hypothèse pour un fait.
 */
export function serieAvecProjection(operations = [], positions = [], options = {}) {
  const {
    anneesProjection = 10,
    tauxForce = null,
    anneeCourante = String(new Date().getFullYear()),
  } = options;

  const attendu = totalAttendu(positions);
  const historique = serieAnnuelle(operations, { attenduAnnuel: attendu, anneeCourante });
  const croissance = croissanceAnnuelleMoyenne(operations, { anneeCourante });
  const tauxRetenu = tauxForce != null && Number.isFinite(tauxForce) ? tauxForce : croissance.tauxPct;

  const projection = projeterDividendes({
    baseAnnuelle: attendu,
    tauxCroissancePct: tauxRetenu,
    annees: anneesProjection,
    anneeDepart: Number(anneeCourante),
  });

  return {
    serie: [...historique, ...projection],
    croissance,
    tauxRetenu,
    tauxEstImpose: tauxForce != null && Number.isFinite(tauxForce),
    attendu,
    // Ce que rapporterait la dernière année projetée, utile en synthèse.
    dernierProjete: projection.at(-1)?.projete ?? null,
    cumulProjete: projection.reduce((s, p) => s + p.projete, 0),
  };
}
