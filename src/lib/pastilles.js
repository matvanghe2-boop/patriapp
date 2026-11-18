import { todayIso } from "./finance";
import { aClasser } from "./categorisationAssistee";
import { statutDe, statutContrat, joursEntre } from "./abonnements";
import { aRelire, derniereRevue, resultatsARelire } from "./theses";
import { CATALOGUE, normaliserEtat } from "./badges";

/**
 * Pastilles des onglets : un point sur l'onglet où quelque chose de nouveau
 * attend, qui s'éteint quand on l'ouvre.
 *
 * Chaque onglet a sa liste de NOUVEAUTÉS, identifiées de façon stable (un
 * badge et son niveau, un dividende, un marchand à classer, une échéance
 * datée). L'onglet porte une pastille tant qu'une de ses nouveautés n'a pas
 * été vue ; l'ouvrir les marque toutes comme vues. Une nouveauté qui revient
 * sous un autre identifiant — un essai prolongé, une thèse relue puis de
 * nouveau à relire — rallume la pastille, et c'est voulu.
 *
 * Un point, pas un compteur : il dit « il y a du nouveau » sans transformer
 * l'onglet en boîte de réception à vider.
 *
 * Module pur : aucune requête, aucune dépendance React.
 */

/** Fenêtre pendant laquelle un dividende ou une publication reste « nouveau ». */
export const JOURS_DIVIDENDE = 30;
export const JOURS_RESULTATS = 14;
/** Un essai gratuit s'annonce une semaine avant de devenir payant. */
export const JOURS_ESSAI = 7;

const jour = (iso) => String(iso || "").slice(0, 10);

/**
 * Nouveautés de chaque onglet, par identifiant.
 * @returns {{ badges: string[], bourse: string[], compte: string[], abonnements: string[], strategie: string[] }}
 */
export function nouveautesParOnglet({
  badges = null,
  bourse = {},
  evenements = [],
  compteEnrichies = [],
  subs = [],
  contracts = [],
  strategyNotes = [],
  aujourdhui = todayIso(),
} = {}) {
  // ── Badges : chaque niveau obtenu ──
  const etat = normaliserEtat(badges);
  const idsBadges = [];
  for (const b of CATALOGUE) {
    const n = Number(etat.obtenus[b.id]?.niveau) || 0;
    for (let i = 1; i <= n; i++) idsBadges.push(`${b.id}:${i}`);
  }

  // ── PEA & Bourse : dividende encaissé, résultats publiés ──
  const idsBourse = [];
  for (const op of bourse?.operations || []) {
    if (op?.type !== "DIVIDENDE" || !op.date) continue;
    const j = joursEntre(jour(op.date), aujourdhui);
    if (j >= 0 && j <= JOURS_DIVIDENDE) idsBourse.push(`dividende:${op.id || `${op.asset}-${jour(op.date)}`}`);
  }
  const detenus = new Set(
    (bourse?.positions || []).filter((p) => Number(p?.quantity) > 0).map((p) => String(p.ticker || "").toUpperCase())
  );
  for (const e of evenements || []) {
    if (e?.type !== "Résultats" || e.statut === "estime" || !detenus.has(String(e.ticker || "").toUpperCase())) continue;
    const j = joursEntre(jour(e.date), aujourdhui);
    if (j >= 0 && j <= JOURS_RESULTATS) idsBourse.push(`resultats:${String(e.ticker).toUpperCase()}:${jour(e.date)}`);
  }

  // ── Compte courant : marchands restés à classer ──
  const idsCompte = aClasser(compteEnrichies || []).map((g) => `classer:${g.cle}`);

  // ── Abonnements : fin d'essai proche, préavis qui approche ──
  const idsAbonnements = [];
  for (const s of subs || []) {
    if (statutDe(s) !== "essai" || !s.fin_essai) continue;
    const j = joursEntre(aujourdhui, s.fin_essai);
    if (j >= 0 && j <= JOURS_ESSAI) idsAbonnements.push(`essai:${s.id}:${s.fin_essai}`);
  }
  for (const c of contracts || []) {
    const st = statutContrat(c, aujourdhui);
    if (st.key === "a_renouveler") idsAbonnements.push(`preavis:${c.id}:${st.limite}`);
  }

  // ── Stratégie : thèse à relire, résultats publiés depuis la dernière relecture ──
  const idsStrategie = [];
  for (const n of strategyNotes || []) {
    if (aRelire(n, aujourdhui)) idsStrategie.push(`relire:${n.id}:${jour(derniereRevue(n))}`);
  }
  for (const { note, evenement } of resultatsARelire({ notes: strategyNotes, evenements, aujourdhui })) {
    idsStrategie.push(`resultats:${note.id}:${jour(evenement.date)}`);
  }

  return {
    badges: idsBadges,
    bourse: idsBourse,
    compte: idsCompte,
    abonnements: idsAbonnements,
    strategie: [...new Set(idsStrategie)],
  };
}

/** Onglets portant une pastille : au moins une nouveauté pas encore vue. */
export function ongletsAvecPastille(nouveautes = {}, vues = {}) {
  const sortie = new Set();
  for (const [onglet, ids] of Object.entries(nouveautes)) {
    const vus = new Set(Array.isArray(vues?.[onglet]) ? vues[onglet] : []);
    if ((ids || []).some((id) => !vus.has(id))) sortie.add(onglet);
  }
  return sortie;
}

/**
 * Marque comme vues les nouveautés actuelles d'un onglet. Seules les
 * nouveautés encore en cours sont gardées : la liste ne grossit pas avec le
 * temps. Rend l'objet d'origine si rien ne change.
 */
export function marquerVues(vues, onglet, ids = []) {
  const actuelles = Array.isArray(vues?.[onglet]) ? vues[onglet] : [];
  const prochaines = [...new Set(ids)].sort();
  if (actuelles.length === prochaines.length && actuelles.every((id, i) => id === prochaines[i])) return vues;
  return { ...(vues && typeof vues === "object" ? vues : {}), [onglet]: prochaines };
}
