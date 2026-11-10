import { retirerMouvement, ajouterMouvement, montantSigne } from "./livretsMouvements";
import { reconstituerPatrimoine, appliquerReconstitution } from "./reconstitutionPatrimoine";
import { serieSolde } from "./compteCourant";

/**
 * Réparations ponctuelles de données, appliquées une seule fois.
 *
 * Une migration (migrations.js) met une FORME de donnée à jour, à chaque
 * lecture, sans jamais rien retirer. Une réparation corrige une ERREUR précise
 * dans des données réelles : elle est ciblée par identifiant, ne s'applique
 * qu'une fois (la liste des réparations faites est persistée et synchronisée),
 * et s'annonce par une notification qui permet de l'annuler.
 *
 * ── pel-ajustement-fantome-2026-10 ─────────────────────────────────────────
 * Le PEL avait été créé avec son solde réel, versements du 7 septembre
 * compris. Ces versements ont été saisis ensuite comme mouvements datés —
 * l'ajout les a comptés une seconde fois dans le solde —, puis le solde a été
 * corrigé au crayon, ce qui a enregistré un ajustement négatif du même
 * montant, daté du jour de la correction (27 octobre).
 *
 * Le solde était juste, l'historique faux : il disait que l'argent était entré
 * le 7 septembre puis ressorti le 27 octobre. La courbe du patrimoine,
 * reconstituée à partir des livrets, comptait donc le PEL avant ses
 * versements — et le premier virement reçu le 4 septembre deux fois, sur le
 * compte courant et déjà dans le PEL. La réparation retire l'ajustement SANS
 * toucher au solde, puis recalcule la courbe sur la période des relevés.
 */
/*
 * ── livret-a-ouverture-2026-11 ─────────────────────────────────────────────
 * Même erreur, autre livret : le Livret A a été créé avec 5 000 €, sans date
 * d'ouverture ni versement daté, alors que l'argent y est arrivé le 9 novembre
 * (« Virement Livret A », −5 000 € sur le compte courant ce jour-là). Compté à
 * toutes les dates passées, il ajoutait 5 000 € à toute la courbe
 * reconstituée. La réparation date son ouverture et enregistre ce versement
 * (déjà compris dans le solde, qui ne bouge pas), puis recalcule la courbe.
 */
export const REPARATIONS = [
  {
    id: "pel-ajustement-fantome-2026-10",
    type: "retirer-ajustement",
    livretId: "a2f8d512-4dc7-4eae-869d-4a36ea771d41",
    mouvementId: "902bce22-6090-4917-aceb-7c973e9fb5e2",
  },
  {
    id: "livret-a-ouverture-2026-11",
    type: "dater-ouverture",
    livretId: "fbab52f2-17b8-4a68-9887-db1751b3bc1b",
    ouverture: "2026-11-09",
    depot: 5000,
  },
];

/**
 * Ce qu'une réparation va corriger, ou `null` si elle ne s'applique pas (ou
 * plus) à ces données. Les conditions sont strictes : une réparation ne touche
 * que l'état exact qu'elle a été écrite pour corriger.
 */
function cible(livrets, r) {
  const livret = (livrets || []).find((l) => l.id === r.livretId);
  if (!livret) return null;
  if ((r.type || "retirer-ajustement") === "retirer-ajustement") {
    const mouvement = livret.mouvements?.find((m) => m.id === r.mouvementId && m.nature === "ajustement");
    return mouvement ? { livret, date: mouvement.date, montant: montantSigne(mouvement) } : null;
  }
  if (r.type === "dater-ouverture") {
    const intact = !livret.ouverture && !(livret.mouvements || []).length && (Number(livret.balance) || 0) >= r.depot;
    return intact ? { livret, date: r.ouverture, montant: r.depot } : null;
  }
  return null;
}

function reparerLivret(livret, r) {
  if ((r.type || "retirer-ajustement") === "retirer-ajustement") {
    return retirerMouvement(livret, r.mouvementId, { garderSolde: true });
  }
  // Le versement d'ouverture est déjà dans le solde : il date l'arrivée de
  // l'argent sans le compter une seconde fois.
  return ajouterMouvement(
    { ...livret, ouverture: r.ouverture },
    { id: `${r.id}-depot`, date: r.ouverture, montant: r.depot, nature: "depot", dejaCompris: true }
  );
}

/** Réparations qui concernent ces données et n'ont pas encore été faites. */
export function reparationsAFaire(livrets, faites = [], catalogue = REPARATIONS) {
  return catalogue.filter((r) => !(faites || []).includes(r.id) && cible(livrets, r));
}

/**
 * Applique les réparations : livrets corrigés, puis courbe recalculée avec
 * eux (mêmes règles que le bouton « Reconstituer la courbe » : les points
 * saisis à la main ne sont jamais touchés).
 *
 * @returns {{ livrets, historique, details: Array<{type, nom, date, montant}>, joursCorriges: number }}
 */
export function appliquerReparations({
  reparations,
  livrets = [],
  historique = [],
  compteOperations = [],
  compteReleves = [],
  bourse = null,
  bourseHistory = [],
  dettesTotal = 0,
  jusquA,
  now,
}) {
  const details = [];
  let corriges = livrets;
  for (const r of reparations) {
    const c = cible(corriges, r);
    if (!c) continue;
    details.push({ type: r.type || "retirer-ajustement", nom: c.livret.name, date: c.date, montant: c.montant });
    corriges = corriges.map((l) => (l.id === r.livretId ? reparerLivret(l, r) : l));
  }

  let historiqueCorrige = historique;
  let joursCorriges = 0;
  const serie = serieSolde(compteOperations, compteReleves);
  if (details.length > 0 && serie.length > 0) {
    const { changements } = reconstituerPatrimoine({
      serie,
      bourseHistory,
      portefeuilleVide: !(bourse?.positions?.length > 0) && !(bourse?.cash_pocket > 0),
      livrets: corriges,
      dettesTotal,
      historique,
      jusquA,
    });
    joursCorriges = changements.length;
    if (joursCorriges > 0) historiqueCorrige = appliquerReconstitution(historique, changements, now ? { now } : undefined);
  }

  return { livrets: corriges, historique: historiqueCorrige, details, joursCorriges };
}
