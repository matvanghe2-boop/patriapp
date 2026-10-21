import { LIVRET_A, LEP } from "./histoireTaux";

/**
 * Livrets suivis par mouvements datés.
 *
 * Un livret n'était qu'un solde : on le corrigeait à la main, et l'application
 * oubliait aussitôt l'ancien. Impossible, dès lors, de savoir ce qu'on y avait
 * déposé dans l'année, de tracer sa courbe, ou de calculer ses intérêts comme
 * la banque le fait.
 *
 * Le solde du jour reste la référence ; les mouvements datés permettent de
 * REMONTER le temps à partir de lui : le solde à une date passée est le solde
 * d'aujourd'hui, moins tout ce qui est arrivé depuis. Rien n'est donc à
 * saisir pour le passé — chaque dépôt enregistré à partir de maintenant
 * allonge l'historique.
 *
 * Module pur : aucune requête, aucune dépendance React.
 */

export const NATURES_MOUVEMENT = {
  depot: { libelle: "Dépôt", signe: 1 },
  retrait: { libelle: "Retrait", signe: -1 },
  interets: { libelle: "Intérêts crédités", signe: 1 },
  // Un ajustement corrige le solde (recalage sur le relevé de la banque) :
  // ce n'est ni de l'épargne, ni un retrait. Son montant est déjà signé.
  ajustement: { libelle: "Ajustement de solde", signe: 0 },
};

/** Montant signé d'un mouvement. */
export function montantSigne(m) {
  const nature = NATURES_MOUVEMENT[m?.nature];
  const montant = Number(m?.montant) || 0;
  if (!nature) return 0;
  return nature.signe === 0 ? montant : nature.signe * Math.abs(montant);
}

/**
 * Enregistre un mouvement et met le solde à jour. Pour un ajustement,
 * `montant` est l'écart signé ; pour les autres natures, un montant positif.
 */
export function ajouterMouvement(livret, { id, date, montant, nature }) {
  const mouvement = { id, date, montant: Number(montant) || 0, nature };
  const delta = montantSigne(mouvement);
  if (delta === 0) return livret;
  return {
    ...livret,
    balance: Math.max(0, (Number(livret?.balance) || 0) + delta),
    mouvements: [...(livret?.mouvements || []), mouvement].sort((a, b) => (a.date < b.date ? -1 : 1)),
  };
}

/** Retire un mouvement et annule son effet sur le solde. */
export function retirerMouvement(livret, idMouvement) {
  const m = (livret?.mouvements || []).find((x) => x.id === idMouvement);
  if (!m) return livret;
  return {
    ...livret,
    balance: Math.max(0, (Number(livret.balance) || 0) - montantSigne(m)),
    mouvements: livret.mouvements.filter((x) => x.id !== idMouvement),
  };
}

/** Solde au matin du jour donné : avant tout mouvement daté de ce jour ou après. */
export function soldeAvant(livret, dateIso) {
  const apres = (livret?.mouvements || [])
    .filter((m) => m.date >= dateIso)
    .reduce((s, m) => s + montantSigne(m), 0);
  return (Number(livret?.balance) || 0) - apres;
}

/** Solde au soir du jour donné. */
export function soldeAu(livret, dateIso) {
  const apres = (livret?.mouvements || [])
    .filter((m) => m.date > dateIso)
    .reduce((s, m) => s + montantSigne(m), 0);
  return (Number(livret?.balance) || 0) - apres;
}

// ── Règle des quinzaines ───────────────────────────────────────────────────

/** Premier jour de la quinzaine contenant la date : le 1er ou le 16. */
export function debutQuinzaine(dateIso) {
  const jour = Number(dateIso.slice(8, 10));
  return `${dateIso.slice(0, 8)}${jour >= 16 ? "16" : "01"}`;
}

/** Premier jour de la quinzaine qui suit STRICTEMENT la date. */
export function quinzaineSuivante(dateIso) {
  const jour = Number(dateIso.slice(8, 10));
  if (jour < 16) return `${dateIso.slice(0, 8)}16`;
  const d = new Date(`${dateIso.slice(0, 7)}-15T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  return `${d.toISOString().slice(0, 7)}-01`;
}

/**
 * Date de valeur d'un mouvement, selon la règle des livrets réglementés :
 * une somme déposée rapporte à partir du 1er ou du 16 qui SUIT le dépôt ;
 * une somme retirée cesse de rapporter dès le début de la quinzaine du
 * retrait.
 */
export function dateDeValeur(m) {
  return montantSigne(m) >= 0 ? quinzaineSuivante(m.date) : debutQuinzaine(m.date);
}

/**
 * Série de taux officielle d'un livret réglementé, d'après son nom : le LDDS
 * suit toujours le taux du Livret A. `null` pour un autre support, dont le
 * taux saisi est alors pris pour constant sur l'année.
 */
export function serieTauxPour(livret) {
  const nom = String(livret?.name || "").toLowerCase();
  if (/\blep\b|épargne populaire/.test(nom)) return LEP;
  if (/livret a\b|\bldds?\b|développement durable/.test(nom)) return LIVRET_A;
  return null;
}

/** Taux (décimal) en vigueur à une date. */
function tauxAu(serie, dateIso, tauxParDefaut) {
  if (!serie) return tauxParDefaut;
  let taux = null;
  for (const e of serie) {
    if (e.date <= dateIso) taux = e.taux / 100;
    else break;
  }
  return taux ?? tauxParDefaut;
}

/**
 * Intérêts d'une année, calculés quinzaine par quinzaine comme la banque :
 * pour chacune des 24 quinzaines, le solde EN VALEUR au premier jour, au
 * taux en vigueur ce jour-là, sur un vingt-quatrième d'année.
 *
 * Les quinzaines à venir reprennent le dernier solde connu : le résultat est
 * une estimation tant que l'année n'est pas finie, et le dit (`estime`).
 * Intérêts crédités au 31 décembre.
 */
export function interetsQuinzaines(livret, annee, { aujourdhui } = {}) {
  const serie = serieTauxPour(livret);
  const tauxParDefaut = Number(livret?.rate) || 0;
  const debutAnnee = `${annee}-01-01`;
  const soldeDepart = soldeAvant(livret, debutAnnee);
  const mouvementsAnnee = (livret?.mouvements || []).filter((m) => m.date >= debutAnnee);

  const quinzaines = [];
  for (let mois = 1; mois <= 12; mois++) {
    for (const jour of ["01", "16"]) {
      const debut = `${annee}-${String(mois).padStart(2, "0")}-${jour}`;
      const solde =
        soldeDepart +
        mouvementsAnnee.filter((m) => dateDeValeur(m) <= debut).reduce((s, m) => s + montantSigne(m), 0);
      const taux = tauxAu(serie, debut, tauxParDefaut);
      quinzaines.push({ debut, solde, taux, interets: (Math.max(0, solde) * taux) / 24 });
    }
  }

  const total = quinzaines.reduce((s, q) => s + q.interets, 0);
  const acquis = aujourdhui ? quinzaines.filter((q) => q.debut <= aujourdhui).reduce((s, q) => s + q.interets, 0) : total;
  return {
    total,
    acquis,
    estime: Boolean(aujourdhui && `${annee}-12-31` >= aujourdhui),
    methode: serie ? "taux officiels" : "taux saisi",
    quinzaines,
  };
}

/** Somme des dépôts nets (dépôts − retraits) sur une période, intérêts et ajustements exclus. */
export function depotsNets(livrets = [], depuis, jusqua) {
  let total = 0;
  for (const l of livrets || []) {
    for (const m of l?.mouvements || []) {
      if (m.date < depuis || m.date > jusqua) continue;
      if (m.nature === "depot" || m.nature === "retrait") total += montantSigne(m);
    }
  }
  return total;
}

/** Le livret a-t-il un historique de mouvements ? */
export const aDesMouvements = (livret) => (livret?.mouvements || []).length > 0;
