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

/** Taux de conversion d'une position vers l'euro. */
function taux(position) {
  return position?.currency && position.currency !== "EUR" && position?.fxRate > 0 ? position.fxRate : 1;
}

/** Dividende annuel attendu d'une position, en euros. */
export function dividendeAttendu(position) {
  const parAction = position?.annual_dividend || 0;
  if (parAction <= 0) return 0;
  return parAction * (position?.quantity || 0) * taux(position);
}

/** Somme des dividendes attendus sur l'ensemble du portefeuille. */
export function totalAttendu(positions = []) {
  return positions.reduce((s, p) => s + dividendeAttendu(p), 0);
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
