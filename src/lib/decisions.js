/**
 * Mes décisions, relues avec le recul : ce que mes ventes m'ont fait gagner
 * ou manquer, et à quel moment de leur fourchette j'ai acheté.
 *
 * Le cours historique vient de Yahoo, AJUSTÉ des divisions d'actions ; le
 * prix d'une opération est celui payé à l'époque. Toute comparaison ramène
 * donc d'abord le prix de l'opération à l'échelle d'aujourd'hui, à l'aide des
 * opérations SPLIT enregistrées après elle. Une division que le journal
 * ignore fausserait l'écart d'un facteur entier : chaque opération est
 * contrôlée contre le cours de sa semaine, et écartée si elle s'en éloigne
 * trop (« prix incohérent ») plutôt que comptée de travers.
 *
 * Module pur : aucune requête, aucune dépendance React.
 */

const normaliser = (s) => String(s ?? "").trim().toUpperCase();

/** Écart maximal toléré entre le prix d'une opération et le cours de sa semaine. */
const TOLERANCE_PRIX = { bas: 0.65, haut: 1.5 };

/** Seuils de lecture d'un achat dans sa fourchette sur 52 semaines. */
export const TIERS = { bas: 100 / 3, haut: 200 / 3 };

/** Facteur des divisions d'actions enregistrées APRÈS une opération. */
export function facteurDivisions(operations, ticker, date) {
  return (operations || [])
    .filter((o) => o?.type === "SPLIT" && normaliser(o.asset) === ticker && o.date > date)
    .reduce((f, o) => f * (Number(o.ratio) > 0 ? Number(o.ratio) : 1), 1);
}

const JOUR_MS = 86_400_000;
const decaler = (iso, jours) => new Date(Date.parse(`${iso}T12:00:00Z`) + jours * JOUR_MS).toISOString().slice(0, 10);

/** Barre hebdomadaire contenant une date (la dernière commencée avant elle). */
function semaineDe(series, date) {
  let retenue = null;
  for (const b of series) {
    if (b.date <= date) retenue = b;
    else break;
  }
  return retenue && date <= decaler(retenue.date, 7) ? retenue : null;
}

function prixCoherent(prixAjuste, barre) {
  if (!barre) return true; // rien pour contrôler : on fait confiance au journal
  const ref = barre.close;
  return prixAjuste >= ref * TOLERANCE_PRIX.bas && prixAjuste <= ref * TOLERANCE_PRIX.haut;
}

/** Taux vers l'euro d'une devise de cotation, pence compris. */
function tauxEuro(devise, versEuro) {
  if (!devise || devise === "EUR") return 1;
  if (devise === "GBp") return Number.isFinite(versEuro?.GBP) ? versEuro.GBP / 100 : null;
  return Number.isFinite(versEuro?.[devise]) ? versEuro[devise] : null;
}

/**
 * Chaque vente, et ce qu'aurait donné le fait de garder les titres.
 *
 * `ecart` = (cours d'aujourd'hui − prix de vente) × quantité, plus les
 * dividendes détachés depuis : positif, garder aurait rapporté plus ; négatif,
 * vendre a évité une perte. Hors frais et hors fiscalité.
 *
 * @param {object} p
 * @param {Array} p.operations
 * @param {Map<string, {series, dividendes, currency}>} p.historiques  par ticker
 * @param {Map<string, number>} [p.coursActuels]  cours des lignes encore détenues
 * @param {object} [p.versEuro]
 */
export function ventesAvecRecul({ operations = [], historiques = new Map(), coursActuels = new Map(), versEuro = {} } = {}) {
  const ventes = (operations || [])
    .filter((o) => o?.type === "VENTE" && o.date && Number(o.quantity) > 0 && Number(o.price) > 0)
    .map((o) => {
      const ticker = normaliser(o.asset);
      const h = historiques.get(ticker);
      const facteur = facteurDivisions(operations, ticker, o.date);
      const quantite = Number(o.quantity) * facteur;
      const prixVente = Number(o.price) / facteur;
      const series = h?.series || [];
      const cours = coursActuels.get(ticker) ?? series.at(-1)?.close ?? null;
      const base = { id: o.id, date: o.date, ticker, quantite, prixVente, cours, devise: h?.currency || "EUR" };
      if (!(cours > 0)) return { ...base, statut: "sans-cours" };
      if (!prixCoherent(prixVente, semaineDe(series, o.date))) return { ...base, statut: "incoherent" };

      const dividendes = (h?.dividendes || []).filter((d) => d.date > o.date).reduce((s, d) => s + d.montant, 0) * quantite;
      const ecartCours = (cours - prixVente) * quantite;
      const taux = tauxEuro(base.devise, versEuro);
      return {
        ...base,
        statut: "ok",
        variationPct: (cours / prixVente - 1) * 100,
        dividendesManques: dividendes,
        ecart: ecartCours + dividendes,
        ecartEuro: taux == null ? null : (ecartCours + dividendes) * taux,
      };
    })
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  const comptees = ventes.filter((v) => v.statut === "ok" && v.ecartEuro != null);
  return {
    ventes,
    // Ce que garder aurait rapporté de plus, et ce que vendre a évité.
    manque: comptees.filter((v) => v.ecartEuro > 0).reduce((s, v) => s + v.ecartEuro, 0),
    evite: -comptees.filter((v) => v.ecartEuro < 0).reduce((s, v) => s + v.ecartEuro, 0),
    bilan: comptees.reduce((s, v) => s + v.ecartEuro, 0),
    nbComptees: comptees.length,
  };
}

/**
 * Chaque achat, placé dans la fourchette des 52 semaines qui l'ont précédé,
 * et comparé à un achat au cours moyen du même mois.
 *
 * `positionPct` : 0 = acheté au plus bas de l'année écoulée, 100 = au plus
 * haut. `ecartMoisPct` : négatif = payé moins cher que la moyenne du mois.
 * Sans 26 semaines d'historique avant l'achat, la fourchette ne dit rien :
 * l'achat est laissé hors de la lecture.
 */
export function qualiteAchats({ operations = [], historiques = new Map() } = {}) {
  const achats = (operations || [])
    .filter((o) => o?.type === "ACHAT" && o.date && Number(o.quantity) > 0 && Number(o.price) > 0)
    .map((o) => {
      const ticker = normaliser(o.asset);
      const series = historiques.get(ticker)?.series || [];
      const facteur = facteurDivisions(operations, ticker, o.date);
      const prix = Number(o.price) / facteur;
      const montant = Number(o.quantity) * Number(o.price);
      const base = { id: o.id, date: o.date, ticker, prix, montant };

      const debut = decaler(o.date, -364);
      const annee = series.filter((b) => b.date > debut && b.date <= o.date);
      if (annee.length < 26) return { ...base, statut: "historique-court" };
      if (!prixCoherent(prix, semaineDe(series, o.date))) return { ...base, statut: "incoherent" };

      const bas = Math.min(...annee.map((b) => b.low ?? b.close));
      const haut = Math.max(...annee.map((b) => b.high ?? b.close));
      const positionPct = haut > bas ? Math.min(100, Math.max(0, ((prix - bas) / (haut - bas)) * 100)) : 50;

      const mois = o.date.slice(0, 7);
      const duMois = series.filter((b) => b.date.slice(0, 7) === mois).map((b) => b.close);
      const moyenneMois = duMois.length ? duMois.reduce((s, v) => s + v, 0) / duMois.length : null;
      return {
        ...base,
        statut: "ok",
        bas,
        haut,
        positionPct,
        tiers: positionPct < TIERS.bas ? "bas" : positionPct > TIERS.haut ? "haut" : "milieu",
        moyenneMois,
        ecartMoisPct: moyenneMois ? (prix / moyenneMois - 1) * 100 : null,
      };
    })
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  const lus = achats.filter((a) => a.statut === "ok");
  const poids = lus.reduce((s, a) => s + a.montant, 0);
  const moyennePonderee = (cle) => {
    const avec = lus.filter((a) => a[cle] != null);
    const p = avec.reduce((s, a) => s + a.montant, 0);
    return p > 0 ? avec.reduce((s, a) => s + a[cle] * a.montant, 0) / p : null;
  };

  const parTicker = new Map();
  for (const a of lus) {
    const e = parTicker.get(a.ticker) || { ticker: a.ticker, achats: 0, montant: 0, somme: 0 };
    e.achats += 1;
    e.montant += a.montant;
    e.somme += a.positionPct * a.montant;
    parTicker.set(a.ticker, e);
  }

  return {
    achats,
    nbLus: lus.length,
    repartition: {
      bas: lus.filter((a) => a.tiers === "bas").length,
      milieu: lus.filter((a) => a.tiers === "milieu").length,
      haut: lus.filter((a) => a.tiers === "haut").length,
    },
    positionMoyennePct: poids > 0 ? moyennePonderee("positionPct") : null,
    ecartMoisMoyenPct: moyennePonderee("ecartMoisPct"),
    parLigne: [...parTicker.values()]
      .map((e) => ({ ticker: e.ticker, achats: e.achats, montant: e.montant, positionMoyennePct: e.somme / e.montant }))
      .sort((a, b) => b.montant - a.montant),
  };
}

/**
 * Période d'historique à demander pour couvrir le journal : de 52 semaines
 * avant la plus ancienne opération jusqu'à aujourd'hui.
 */
export function periodeNecessaire(operations = [], aujourdhui) {
  const dates = (operations || []).filter((o) => o?.type === "ACHAT" || o?.type === "VENTE").map((o) => o.date).filter(Boolean).sort();
  if (dates.length === 0) return null;
  const ans = (Date.parse(aujourdhui) - Date.parse(dates[0])) / (365.25 * JOUR_MS) + 1;
  if (ans <= 2) return "2y";
  if (ans <= 5) return "5y";
  if (ans <= 10) return "10y";
  return "max";
}
