import { lireNombre, todayIso } from "./finance";

/**
 * Rétrospective annuelle — le calcul.
 *
 * Séparé de l'affichage parce que ce sont des fonctions pures, testables sans
 * monter le moindre composant, et parce que c'est là que se cachent les
 * décisions discutables : que faire d'une année incomplète, comment définir
 * « le meilleur mois », que compter comme un dividende.
 *
 * RÈGLE GÉNÉRALE : on ne fabrique rien. Chaque chiffre est soit mesuré, soit
 * absent. Une rétrospective qui interpole les mois manquants raconterait une
 * année qui n'a pas eu lieu, et c'est exactement ce que le reste de
 * l'application refuse de faire — l'historique démarre vide, le TRI n'est
 * affiché que si le journal couvre toute la position.
 */

const mois = (iso) => String(iso || "").slice(0, 7);
const annee = (iso) => String(iso || "").slice(0, 4);

const NOMS_MOIS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

/** « 2026-03 » → « mars ». */
export function nomMois(cle) {
  const m = Number(String(cle).slice(5, 7));
  return NOMS_MOIS[m - 1] || cle;
}

/**
 * Une case par jour de l'année, dans l'ordre.
 *
 * `variation: null` marque un jour SANS RELEVÉ — l'application n'a pas été
 * ouverte. C'est toute la valeur de cette vue par rapport à une courbe, qui
 * relie les points en silence et laisse croire à une continuité qui n'existe
 * pas.
 *
 * Les jours à venir de l'année en cours sont exclus : une année ne se remplit
 * pas d'avance.
 */
export function joursDeLAnnee(historique = [], an, aujourdHui = new Date()) {
  const parDate = new Map(
    historique
      .filter((p) => annee(p.date) === String(an))
      .map((p) => [p.date, lireNombre(p.value) ?? 0])
  );

  const debut = new Date(`${an}-01-01T00:00:00`);
  const finAnnee = new Date(`${an}-12-31T00:00:00`);
  const fin = aujourdHui < finAnnee ? aujourdHui : finAnnee;

  const jours = [];
  let precedente = null;
  for (let d = new Date(debut); d <= fin; d.setDate(d.getDate() + 1)) {
    // `todayIso` et non `toISOString` : ce dernier convertit en UTC, et à
    // l'est de Greenwich minuit local retombe la VEILLE. Toutes les cases
    // seraient décalées d'un jour, et aucune ne correspondrait plus à un
    // relevé — le calendrier paraîtrait vide sans qu'aucune erreur ne le dise.
    const iso = todayIso(d);
    const valeur = parDate.get(iso);
    if (valeur == null) {
      jours.push({ date: iso, variation: null });
      continue;
    }
    jours.push({ date: iso, variation: precedente == null ? 0 : valeur - precedente });
    precedente = valeur;
  }
  return jours;
}

/** Agrégats mensuels du patrimoine : première et dernière valeur relevée. */
function parMois(historique, an) {
  const groupes = new Map();
  for (const p of historique) {
    if (annee(p.date) !== String(an)) continue;
    const cle = mois(p.date);
    const v = lireNombre(p.value) ?? 0;
    const g = groupes.get(cle);
    if (!g) groupes.set(cle, { cle, debut: v, fin: v, premiereDate: p.date, derniereDate: p.date });
    else {
      if (p.date < g.premiereDate) { g.debut = v; g.premiereDate = p.date; }
      if (p.date > g.derniereDate) { g.fin = v; g.derniereDate = p.date; }
    }
  }
  return [...groupes.values()].sort((a, b) => (a.cle < b.cle ? -1 : 1));
}

/**
 * Construit la rétrospective d'une année.
 *
 * @returns {{
 *   an: number, exploitable: boolean, joursReleves: number,
 *   debut: number|null, fin: number|null, variation: number|null, variationPct: number|null,
 *   meilleurMois: object|null, pireMois: object|null,
 *   dividendes: number, operations: number, achats: number, ventes: number,
 *   meilleureLigne: object|null, tauxEpargneMoyen: number|null, jours: object[]
 * }}
 */
export function construireRetrospective({
  an,
  historyPast = [],
  operations = [],
  positions = [],
  profileHistory = [],
  aujourdHui = new Date(),
} = {}) {
  const points = historyPast
    .filter((p) => annee(p.date) === String(an))
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  const jours = joursDeLAnnee(historyPast, an, aujourdHui);
  const joursReleves = jours.filter((j) => j.variation != null).length;

  const debut = points.length ? lireNombre(points[0].value) : null;
  const fin = points.length ? lireNombre(points[points.length - 1].value) : null;
  const variation = debut != null && fin != null ? fin - debut : null;
  const variationPct = debut && variation != null ? (variation / debut) * 100 : null;

  const moisAgreges = parMois(points, an).map((m) => ({ ...m, delta: m.fin - m.debut }));
  // Deux relevés au minimum dans le mois : avec un seul point, début et fin se
  // confondent et le mois ressort systématiquement à zéro, ce qui fausserait
  // le classement.
  const moisComparables = moisAgreges.filter((m) => m.premiereDate !== m.derniereDate);
  const tries = [...moisComparables].sort((a, b) => b.delta - a.delta);

  const opsAnnee = operations.filter((o) => annee(o.date) === String(an));
  const dividendes = opsAnnee
    .filter((o) => o.type === "DIVIDENDE")
    .reduce((s, o) => s + (lireNombre(o.amount) ?? 0), 0);

  // La meilleure ligne se juge sur la plus-value latente en pourcentage, la
  // seule mesure comparable entre une position de 300 € et une de 30 000 €.
  const meilleureLigne = positions
    .filter((p) => (lireNombre(p.pru) ?? 0) > 0 && (lireNombre(p.current_price) ?? 0) > 0)
    .map((p) => ({
      nom: p.name || p.ticker,
      ticker: p.ticker,
      pct: (((lireNombre(p.current_price) ?? 0) - (lireNombre(p.pru) ?? 0)) / (lireNombre(p.pru) ?? 1)) * 100,
    }))
    .sort((a, b) => b.pct - a.pct)[0] || null;

  const tauxAnnee = profileHistory
    .filter((e) => annee(e.date) === String(an))
    .map((e) => {
      const rev = lireNombre(e.monthly_income) ?? 0;
      const dep = lireNombre(e.monthly_expenses) ?? 0;
      return rev > 0 ? ((rev - dep) / rev) * 100 : null;
    })
    .filter((x) => x != null);

  return {
    an,
    // Sous trente jours relevés, il n'y a pas d'année à raconter — seulement
    // quelques points épars. Mieux vaut le dire que d'afficher un bilan qui
    // ressemble à un bilan sans en être un.
    exploitable: joursReleves >= 30,
    joursReleves,
    debut,
    fin,
    variation,
    variationPct,
    meilleurMois: tries[0] || null,
    pireMois: tries.length > 1 ? tries[tries.length - 1] : null,
    dividendes,
    operations: opsAnnee.length,
    achats: opsAnnee.filter((o) => o.type === "ACHAT").length,
    ventes: opsAnnee.filter((o) => o.type === "VENTE").length,
    meilleureLigne,
    tauxEpargneMoyen: tauxAnnee.length ? tauxAnnee.reduce((s, x) => s + x, 0) / tauxAnnee.length : null,
    jours,
  };
}

/** Années pour lesquelles il existe au moins un relevé. */
export function anneesDisponibles(historyPast = []) {
  return [...new Set(historyPast.map((p) => annee(p.date)).filter(Boolean))]
    .map(Number)
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => b - a);
}
