import { lireNombre } from "./finance";

/**
 * Rapprochements d'abonnements.
 *
 * L'onglet Abonnements liste et totalise. Il ne RAPPROCHE rien — or c'est le
 * rapprochement qui fait économiser : deux services de streaming, deux
 * assurances qui se recouvrent, un prélèvement qui a changé de prix ou cessé
 * sur le relevé.
 *
 * DES SIGNAUX, ET AUCUNE CONCLUSION. L'application ne peut pas savoir si deux
 * abonnements de la même catégorie font double emploi — une assurance auto et
 * une assurance habitation sont deux « assurances » parfaitement légitimes.
 * Elle signale donc un rapprochement à VÉRIFIER, jamais une dépense à
 * supprimer. Le libellé de chaque signal le dit explicitement.
 */

/** Équivalent mensuel d'un abonnement, quelle que soit sa périodicité. */
export function mensualiser(sub) {
  const montant = lireNombre(sub?.montant) ?? 0;
  switch (sub?.frequence) {
    case "annuelle": return montant / 12;
    case "trimestrielle": return montant / 3;
    case "hebdomadaire": return (montant * 52) / 12;
    default: return montant;
  }
}

/**
 * @param {object} options
 * @param {Object<string, object>} options.verifications  Vérification de chaque
 *   abonnement contre le relevé (`rapprocherCompte` dans abonnements.js).
 * @returns {{id, type, libelle, detail, lignes, mensuel}[]}
 */
export function rapprochements(subs = [], contracts = [], { verifications = {} } = {}) {
  const signaux = [];
  // Un abonnement résilié ne fait plus double emploi avec rien.
  const suivis = (subs || []).filter((s) => s?.statut !== "resilie");

  // ── Doublons de catégorie ────────────────────────────────────────────────
  const parCategorie = new Map();
  for (const s of suivis) {
    if (!s?.category) continue;
    if (!parCategorie.has(s.category)) parCategorie.set(s.category, []);
    parCategorie.get(s.category).push(s);
  }

  for (const [categorie, liste] of parCategorie) {
    if (liste.length < 2) continue;
    const mensuel = liste.reduce((s, x) => s + mensualiser(x), 0);
    signaux.push({
      id: `cat-${categorie}`,
      type: "doublon",
      libelle: `${categorie} — ${liste.length} abonnements`,
      detail: liste.map((x) => x.label || "sans nom").join(", "),
      lignes: liste,
      mensuel,
    });
  }

  // ── Ce que le relevé contredit ───────────────────────────────────────────
  //
  // L'ancien signal « dormant » jugeait un abonnement à la date de prélèvement
  // SAISIE, qui ne bouge jamais : tout abonnement finissait « sans suivi »
  // quatre mois après sa création, alors que l'écran affichait une prochaine
  // date correcte. Seul le relevé peut dire qu'un prélèvement a cessé, changé
  // ou doublé : ces signaux n'existent donc que pour les abonnements retrouvés
  // sur le compte courant.
  for (const s of subs || []) {
    const v = verifications?.[s.id];
    if (!v?.trouve || !v.alerte) continue;
    const nom = s.label || "Abonnement";
    const libelles = {
      toujours_preleve: `${nom} — toujours prélevé`,
      double: `${nom} — prélevé deux fois`,
      absent: `${nom} — plus prélevé`,
      montant: `${nom} — montant changé`,
    };
    signaux.push({
      id: `releve-${v.alerte}-${s.id}`,
      type: v.alerte,
      libelle: libelles[v.alerte],
      detail: v.detail,
      lignes: [s],
      // Ce qui est en jeu : le prélèvement en trop, l'écart de prix, ou rien
      // pour un abonnement qui a cessé de coûter.
      mensuel:
        v.alerte === "absent" ? 0
        : v.alerte === "montant" ? Math.abs(v.derniere.montant - (lireNombre(s.montant) ?? 0))
        : v.derniere.montant,
    });
  }

  // ── Contrats de même catégorie qui se recouvrent ─────────────────────────
  const parCatContrat = new Map();
  for (const c of contracts) {
    if (!c?.category) continue;
    if (!parCatContrat.has(c.category)) parCatContrat.set(c.category, []);
    parCatContrat.get(c.category).push(c);
  }
  for (const [categorie, liste] of parCatContrat) {
    if (liste.length < 2) continue;
    signaux.push({
      id: `contrat-${categorie}`,
      type: "recouvrement",
      libelle: `${categorie} — ${liste.length} contrats actifs`,
      detail: liste.map((x) => x.label || "sans nom").join(", "),
      lignes: liste,
      mensuel: 0,
    });
  }

  // Le plus coûteux d'abord : c'est le seul ordre qui met en tête ce sur quoi
  // il y a quelque chose à gagner.
  return signaux.sort((a, b) => b.mensuel - a.mensuel);
}
