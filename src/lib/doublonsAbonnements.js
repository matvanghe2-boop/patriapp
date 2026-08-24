import { lireNombre, todayIso } from "./finance";

/**
 * Rapprochements d'abonnements.
 *
 * L'onglet Abonnements liste et totalise. Il ne RAPPROCHE rien — or c'est le
 * rapprochement qui fait économiser : deux services de streaming, deux
 * assurances qui se recouvrent, un abonnement dont la date de prélèvement n'a
 * plus bougé depuis huit mois.
 *
 * TROIS SIGNAUX, ET AUCUNE CONCLUSION. L'application ne peut pas savoir si deux
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

const MOIS_MS = 30.44 * 86400000;

/**
 * @returns {{id, type, libelle, detail, lignes, mensuel}[]}
 */
export function rapprochements(subs = [], contracts = [], { aujourdhui = todayIso() } = {}) {
  const signaux = [];

  // ── Doublons de catégorie ────────────────────────────────────────────────
  const parCategorie = new Map();
  for (const s of subs) {
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

  // ── Abonnements dormants ─────────────────────────────────────────────────
  //
  // Une date de prochain prélèvement qui n'a pas bougé depuis des mois signale
  // presque toujours un abonnement qu'on ne suit plus — pas nécessairement
  // inutile, mais dont personne n'a vérifié qu'il servait encore.
  for (const s of subs) {
    if (!s?.prochaine_date) continue;
    const ecart = new Date(`${aujourdhui}T00:00:00`) - new Date(`${s.prochaine_date}T00:00:00`);
    if (!Number.isFinite(ecart) || ecart < 4 * MOIS_MS) continue;
    signaux.push({
      id: `dormant-${s.id}`,
      type: "dormant",
      libelle: `${s.label || "Abonnement"} — non mis à jour`,
      detail: `Prochain prélèvement encore au ${s.prochaine_date}, il y a ${Math.round(ecart / MOIS_MS)} mois.`,
      lignes: [s],
      mensuel: mensualiser(s),
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
