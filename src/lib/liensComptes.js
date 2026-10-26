/**
 * Liens entre le compte courant et les autres onglets.
 *
 * Un même virement peut être connu deux fois : saisi à la main dans
 * PEA & Bourse le jour où on le fait (pour un suivi en temps réel), puis lu
 * dans le relevé du compte courant un mois plus tard. Ce module les
 * rapproche, pour qu'il ne compte qu'une fois — dans le solde estimé comme
 * dans les suggestions faites à l'import.
 *
 * Montants en centimes, signés du point de vue du COMPTE COURANT : un
 * versement sur le PEA est une sortie (négatif), un retrait du PEA une
 * entrée (positif).
 */
import { soldeActuel } from "./compteCourant";
import { applyOperationsToBourse, uid } from "./finance";
import { ajouterMouvement } from "./livretsMouvements";

/** Écart rapproché : la banque peut dater un virement un ou deux jours après sa saisie. */
export const TOLERANCE_JOURS = 7;

const enJours = (iso) => {
  const [a, m, j] = String(iso).split("-").map(Number);
  return Date.UTC(a, m - 1, j) / 86400000;
};
const ecartJours = (a, b) => Math.abs(enJours(a) - enJours(b));

/**
 * Mouvements des autres onglets qui passent par le compte courant :
 * versements et retraits du portefeuille, dépôts et retraits des livrets.
 *
 * Un mouvement marqué `horsCompteCourant` (payé depuis une autre banque) est
 * listé mais ne compte nulle part.
 */
export function mouvementsAutresComptes({ bourse, livrets } = {}) {
  const liste = [];
  const enveloppe = bourse?.envelope || "PEA";
  for (const op of bourse?.operations || []) {
    if (op.type !== "VERSEMENT" && op.type !== "RETRAIT") continue;
    const euros = Math.abs(Number(op.amount ?? op.montantNet ?? 0)) || 0;
    if (!euros || !op.date) continue;
    const versement = op.type === "VERSEMENT";
    liste.push({
      cle: `bourse:${op.id}`,
      source: "bourse",
      id: op.id,
      compte: enveloppe,
      date: op.date,
      montant: Math.round(euros * 100) * (versement ? -1 : 1),
      libelle: `${versement ? "Versement sur le" : "Retrait du"} ${enveloppe}`,
      horsCompteCourant: !!op.horsCompteCourant,
    });
  }
  for (const livret of livrets || []) {
    for (const m of livret.mouvements || []) {
      if (m.nature !== "depot" && m.nature !== "retrait") continue;
      const euros = Math.abs(Number(m.montant) || 0);
      if (!euros || !m.date) continue;
      const depot = m.nature === "depot";
      liste.push({
        cle: `livret:${livret.id}:${m.id}`,
        source: "livret",
        id: m.id,
        livretId: livret.id,
        compte: livret.name,
        date: m.date,
        montant: Math.round(euros * 100) * (depot ? -1 : 1),
        libelle: `${depot ? "Dépôt sur" : "Retrait de"} ${livret.name}`,
        horsCompteCourant: !!m.horsCompteCourant,
      });
    }
  }
  return liste.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Associe deux listes sur un montant identique au centime près et une date
 * proche, en prenant toujours la paire la plus proche d'abord. Chaque
 * élément ne sert qu'une fois : deux versements de 100 € la même semaine
 * restent deux versements.
 */
function apparier(gauche, droite, { tolerance = TOLERANCE_JOURS } = {}) {
  const paires = [];
  for (const g of gauche) {
    for (const d of droite) {
      if (g.montant !== d.montant) continue;
      const ecart = ecartJours(g.date, d.date);
      if (ecart <= tolerance) paires.push({ g, d, ecart });
    }
  }
  paires.sort((a, b) => a.ecart - b.ecart);
  const prisG = new Set();
  const prisD = new Set();
  const liens = new Map();
  for (const { g, d } of paires) {
    if (prisG.has(g) || prisD.has(d)) continue;
    prisG.add(g);
    prisD.add(d);
    liens.set(g.id, d);
  }
  return liens;
}

/**
 * Virements du relevé déjà enregistrés dans un autre onglet :
 * `Map(id de l'opération du relevé → mouvement)`.
 */
export function rapprocher(operations, mouvements) {
  // Un virement vers une autre personne (« VIR INST WINAMAX ») n'est jamais
  // un versement sur ses propres comptes, même au même montant.
  const virements = (operations || []).filter(
    (o) => o.analyse?.type === "virement" && (o.famille === "interne" || !o.analyse.contrepartie)
  );
  const libres = (mouvements || []).filter((m) => !m.horsCompteCourant);
  return apparier(virements, libres);
}

/**
 * Solde estimé du compte courant : le dernier relevé, plus ce qui s'est
 * passé depuis — les mouvements saisis dans les autres onglets, et ceux
 * saisis à la main dans le compte courant.
 *
 * Trois protections contre le double comptage :
 *  · un mouvement d'un autre onglet déjà présent dans un relevé (la banque
 *    l'a daté un peu après sa saisie) n'est pas ajouté une seconde fois ;
 *  · un mouvement saisi à la main dans le compte courant qui double un
 *    versement enregistré dans PEA & Bourse est écarté au profit de ce
 *    dernier ;
 *  · tout ce qui est antérieur au dernier relevé est déjà dans son solde.
 */
export function estimerSolde({ releves, provisoires = [], mouvements = [], operations = [] }) {
  const base = soldeActuel(releves);
  if (!base) return null;
  const liens = rapprocher(operations, mouvements);
  const dejaLus = new Set([...liens.values()].map((m) => m.cle));
  const autres = (mouvements || []).filter(
    (m) => !m.horsCompteCourant && m.date > base.date && !dejaLus.has(m.cle)
  );
  const saisis = (provisoires || []).filter((p) => p.date > base.date);
  const doublons = apparier(saisis, autres);
  const provisoiresRetenus = saisis.filter((p) => !doublons.has(p.id));
  const ajustement =
    provisoiresRetenus.reduce((s, p) => s + p.montant, 0) + autres.reduce((s, m) => s + m.montant, 0);
  return {
    solde: base.solde + ajustement,
    soldeReleve: base.solde,
    date: base.date,
    ajustement,
    provisoires: provisoiresRetenus.sort((a, b) => a.date.localeCompare(b.date)),
    provisoiresEnDouble: saisis.filter((p) => doublons.has(p.id)).map((p) => ({ ...p, double: doublons.get(p.id) })),
    autres,
    horsCompte: (mouvements || []).filter((m) => m.horsCompteCourant && m.date > base.date),
    liens,
    releve: base.releve,
  };
}

/**
 * Virements vers ou depuis ses propres comptes qu'aucun onglet ne connaît :
 * l'argent est parti (ou revenu), mais ni le PEA ni un livret ne l'ont vu
 * arriver. On les propose à l'enregistrement plutôt que de les créer d'office
 * — le relevé ne dit pas toujours vers QUEL compte l'argent est allé.
 */
export function virementsSansCorrespondance(enrichies, liens) {
  return (enrichies || [])
    .filter((o) => o.famille === "interne" && o.analyse?.type === "virement" && !liens.has(o.id) && !o.lienIgnore)
    .sort((a, b) => b.date.localeCompare(a.date));
}

/** Enregistre dans le portefeuille le versement (ou retrait) lu dans le relevé. */
export function enregistrerDansBourse(bourse, op) {
  const mouvement = {
    id: uid(),
    type: op.montant < 0 ? "VERSEMENT" : "RETRAIT",
    asset: null,
    amount: Math.abs(op.montant) / 100,
    date: op.date,
    origine: "compte-courant",
    broker: "Compte courant",
    transactionId: null,
  };
  return applyOperationsToBourse(bourse, [mouvement, ...(bourse?.operations || [])]);
}

/** Enregistre sur un livret le dépôt (ou retrait) lu dans le relevé. */
export function enregistrerSurLivret(livret, op) {
  return ajouterMouvement(livret, {
    id: uid(),
    date: op.date,
    montant: Math.abs(op.montant) / 100,
    nature: op.montant < 0 ? "depot" : "retrait",
  });
}
