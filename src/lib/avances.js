import { todayIso, lireNombre } from "./finance";
import { normaliser } from "./compteCourant";

/**
 * Qui me doit quoi — les avances faites pour d'autres.
 *
 * On paie le resto ou les billets de train pour tout le monde, et chacun
 * rembourse « plus tard » par virement. Rien ne rappelait qui l'avait fait :
 * les virements reçus se perdaient parmi les autres.
 *
 * Une avance est saisie à la main (personne, montant, motif). Le rapprochement
 * est CALCULÉ, jamais enregistré : les virements reçus de cette personne,
 * postérieurs à l'avance, la remboursent dans l'ordre chronologique — la plus
 * ancienne d'abord, partiellement s'il le faut. Supprimer ou réimporter un
 * relevé met donc tout à jour sans rien laisser d'incohérent. Un remboursement
 * hors relevé (espèces, Lydia) se marque à la main.
 */

const MOTS_VIDES = new Set(["M", "MME", "MLLE", "MR", "DE", "DU", "LA", "LE", "ET"]);
const mots = (texte) => normaliser(texte).split(/[^A-Z0-9]+/).filter((m) => m.length >= 2 && !MOTS_VIDES.has(m));

/** Le virement vient-il de cette personne ? Tous les mots du nom saisi doivent y être. */
export function vientDe(op, personne) {
  const attendus = mots(personne);
  if (attendus.length === 0) return false;
  const presents = new Set([...mots(op?.analyse?.contrepartie), ...mots(op?.analyse?.titre)]);
  return attendus.every((m) => presents.has(m));
}

export function creerAvance({ id, personne, montant, date = todayIso(), motif = "", opId = null }) {
  const p = String(personne || "").trim();
  const m = lireNombre(montant);
  if (!p || !(m > 0)) return null;
  return { id, personne: p, montant: Math.round(m * 100) / 100, date, motif: String(motif).trim().slice(0, 80), opId, rembourseManuel: null };
}

/**
 * Rapproche les avances des virements reçus.
 * @param {object[]} enrichies  Opérations enrichies du compte courant (centimes).
 * @returns {{avance, rembourse: number, reste: number, statut: "rembourse"|"partiel"|"du", paiements: {date, montant}[]}[]}
 */
export function rapprocherAvances(avances = [], enrichies = []) {
  const resultats = new Map(
    (avances || []).map((a) => [a.id, { avance: a, rembourse: 0, reste: Number(a.montant) || 0, paiements: [] }])
  );

  // Les avances soldées à la main sont mises de côté.
  for (const r of resultats.values()) {
    if (r.avance.rembourseManuel) {
      r.rembourse = r.reste;
      r.reste = 0;
      r.paiements.push({ date: r.avance.rembourseManuel.date, montant: r.rembourse, manuel: true });
    }
  }

  const credits = (enrichies || [])
    .filter((o) => o.montant > 0 && o.analyse?.type === "virement")
    .sort((a, b) => a.date.localeCompare(b.date));

  const parPersonne = new Map();
  for (const r of resultats.values()) {
    if (r.reste <= 0) continue;
    const cle = normaliser(r.avance.personne);
    if (!parPersonne.has(cle)) parPersonne.set(cle, []);
    parPersonne.get(cle).push(r);
  }

  for (const liste of parPersonne.values()) {
    liste.sort((a, b) => a.avance.date.localeCompare(b.avance.date));
    const personne = liste[0].avance.personne;
    for (const op of credits) {
      if (!vientDe(op, personne)) continue;
      let disponible = op.montant / 100;
      for (const r of liste) {
        if (disponible <= 0.004) break;
        if (r.reste <= 0 || op.date < r.avance.date) continue;
        const part = Math.min(r.reste, disponible);
        r.reste = Math.round((r.reste - part) * 100) / 100;
        r.rembourse = Math.round((r.rembourse + part) * 100) / 100;
        r.paiements.push({ date: op.date, montant: Math.round(part * 100) / 100, opId: op.id });
        disponible -= part;
      }
    }
  }

  return [...resultats.values()].map((r) => ({
    ...r,
    statut: r.reste <= 0.004 ? "rembourse" : r.rembourse > 0 ? "partiel" : "du",
  }));
}

/** Ce que chacun doit encore, du plus gros au plus petit. */
export function soldesParPersonne(resultats = []) {
  const m = new Map();
  for (const r of resultats) {
    if (r.reste <= 0.004) continue;
    const cle = normaliser(r.avance.personne);
    const e = m.get(cle) || { personne: r.avance.personne, du: 0, nombre: 0, depuis: r.avance.date };
    e.du = Math.round((e.du + r.reste) * 100) / 100;
    e.nombre += 1;
    if (r.avance.date < e.depuis) e.depuis = r.avance.date;
    m.set(cle, e);
  }
  return [...m.values()].sort((a, b) => b.du - a.du);
}

/** Les personnes qui doivent quelque chose depuis plus de `jours` jours. */
export function aRelancer(resultats = [], { aujourdhui = todayIso(), jours = 30 } = {}) {
  const limite = new Date(`${aujourdhui}T00:00:00`);
  limite.setDate(limite.getDate() - jours);
  const iso = limite.toISOString().slice(0, 10);
  return soldesParPersonne(resultats.filter((r) => r.avance.date <= iso));
}
