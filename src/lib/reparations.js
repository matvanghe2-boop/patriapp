import { retirerMouvement, montantSigne } from "./livretsMouvements";
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
export const REPARATIONS = [
  {
    id: "pel-ajustement-fantome-2026-10",
    livretId: "a2f8d512-4dc7-4eae-869d-4a36ea771d41",
    mouvementId: "902bce22-6090-4917-aceb-7c973e9fb5e2",
  },
];

function ajustementCible(livrets, r) {
  const livret = (livrets || []).find((l) => l.id === r.livretId);
  const mouvement = livret?.mouvements?.find((m) => m.id === r.mouvementId && m.nature === "ajustement");
  return mouvement ? { livret, mouvement } : null;
}

/** Réparations qui concernent ces données et n'ont pas encore été faites. */
export function reparationsAFaire(livrets, faites = [], catalogue = REPARATIONS) {
  return catalogue.filter((r) => !(faites || []).includes(r.id) && ajustementCible(livrets, r));
}

/**
 * Applique les réparations : livrets corrigés, puis courbe recalculée avec
 * eux (mêmes règles que le bouton « Reconstituer la courbe » : les points
 * saisis à la main ne sont jamais touchés).
 *
 * @returns {{ livrets, historique, details: Array<{nom, date, montant}>, joursCorriges: number }}
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
    const cible = ajustementCible(corriges, r);
    if (!cible) continue;
    details.push({ nom: cible.livret.name, date: cible.mouvement.date, montant: montantSigne(cible.mouvement) });
    corriges = corriges.map((l) => (l.id === r.livretId ? retirerMouvement(l, r.mouvementId, { garderSolde: true }) : l));
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
