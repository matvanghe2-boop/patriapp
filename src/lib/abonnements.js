import { lireNombre, todayIso, projectMonthly } from "./finance";
import { normaliser } from "./compteCourant";
import { mensualiser } from "./doublonsAbonnements";

/**
 * Abonnements — tout ce que l'onglet calcule, sans interface.
 *
 * Trois sources se croisent ici :
 *  · ce que l'utilisateur DÉCLARE (montant, périodicité, date de prélèvement,
 *    statut, usage) ;
 *  · ce que le relevé CONSTATE (les prélèvements importés du compte courant) ;
 *  · le CALENDRIER qui découle des deux.
 *
 * Le déclaré n'est jamais corrigé en silence par le constaté : un écart est
 * présenté comme tel, et c'est l'utilisateur qui décide lequel des deux a
 * raison.
 */

export { mensualiser };

export const FREQUENCES = {
  hebdomadaire: { libelle: "Hebdomadaire", court: "sem.", jours: 7 },
  mensuelle: { libelle: "Mensuelle", court: "mois", mois: 1 },
  trimestrielle: { libelle: "Trimestrielle", court: "trim.", mois: 3 },
  annuelle: { libelle: "Annuelle", court: "an", mois: 12 },
};

/** Durée moyenne d'une période, en jours — pour juger d'une absence. */
function joursPeriode(frequence) {
  const f = FREQUENCES[frequence] || FREQUENCES.mensuelle;
  return f.jours ?? f.mois * 30.44;
}

/**
 * Cycle de vie. `etat` est celui des pastilles (`PastilleEtat`) : un essai
 * n'est pas une alerte, mais il appelle une décision avant sa date de fin.
 */
export const STATUTS = {
  actif: { libelle: "Actif", court: "Actif", etat: "ok" },
  essai: { libelle: "Essai gratuit", court: "Essai", etat: "attention" },
  a_resilier: { libelle: "À résilier", court: "À résilier", etat: "critique" },
  resilie: { libelle: "Résilié", court: "Résilié", etat: "neutre" },
};

export const USAGES = {
  souvent: { libelle: "Souvent", poids: 0 },
  parfois: { libelle: "Parfois", poids: 0.5 },
  jamais: { libelle: "Jamais", poids: 1 },
};

export const CATEGORIES_ABO = [
  "Streaming", "Logiciel / Cloud", "Sport / Bien-être", "Presse", "Téléphonie",
  "Assurance", "Énergie", "Logement", "Transport", "Autre",
];

export const statutDe = (sub) => (STATUTS[sub?.statut] ? sub.statut : "actif");

/** Un abonnement qui coûte réellement quelque chose aujourd'hui. */
export const estPaye = (sub) => ["actif", "a_resilier"].includes(statutDe(sub));

export const annualiser = (sub) => mensualiser(sub) * 12;

// ─── Calendrier ──────────────────────────────────────────────────────────────

const pad = (n) => String(n).padStart(2, "0");
const joursDansMois = (a, m) => new Date(a, m + 1, 0).getDate();

/**
 * k-ième échéance après `base`. Les mois sont comptés depuis la date de
 * départ, et non de proche en proche : un prélèvement du 31 tombe le 30 avril
 * puis revient au 31 mai, au lieu de dériver au 30 pour toujours.
 */
function echeance(base, k, frequence) {
  const [a, m, j] = base.split("-").map(Number);
  const f = FREQUENCES[frequence] || FREQUENCES.mensuelle;
  if (f.jours) {
    const d = new Date(a, m - 1, j + k * f.jours);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  const total = m - 1 + k * f.mois;
  const annee = a + Math.floor(total / 12);
  const mois = ((total % 12) + 12) % 12;
  return `${annee}-${pad(mois + 1)}-${pad(Math.min(j, joursDansMois(annee, mois)))}`;
}

/** Date de départ du calendrier : la fin d'essai prime, puisque c'est le premier prélèvement. */
function dateDepart(sub) {
  if (statutDe(sub) === "essai" && sub.fin_essai) return sub.fin_essai;
  return sub.prochaine_date || null;
}

const PLAFOND_ITERATIONS = 5000;

/** Échéances d'un abonnement comprises entre deux dates incluses. */
function echeancesEntre(sub, debut, fin) {
  const base = dateDepart(sub);
  if (!base) return [];
  const dates = [];
  for (let k = 0; k < PLAFOND_ITERATIONS; k++) {
    const d = echeance(base, k, sub.frequence);
    if (d > fin) break;
    if (d >= debut) dates.push(d);
  }
  return dates;
}

/**
 * Prochain prélèvement, projeté depuis la date saisie. C'est cette date qui
 * est AFFICHÉE ; la date enregistrée, elle, ne bouge pas — d'où l'erreur de
 * l'ancien signal « dormant », qui jugeait un abonnement à sa date saisie.
 */
export function prochainPrelevement(sub, aujourdhui = todayIso()) {
  if (statutDe(sub) === "resilie") return null;
  const base = dateDepart(sub);
  if (!base) return null;
  for (let k = 0; k < PLAFOND_ITERATIONS; k++) {
    const d = echeance(base, k, sub.frequence);
    if (d >= aujourdhui) return d;
  }
  return null;
}

/** Jours pleins entre deux dates ISO. */
export function joursEntre(debut, fin) {
  const a = new Date(`${debut}T00:00:00`);
  const b = new Date(`${fin}T00:00:00`);
  return Math.round((b - a) / 86400000);
}

/**
 * Prélèvements d'un mois (« 2026-11 »), jour par jour, avec leur cumul.
 * Un essai n'y figure qu'à partir de sa date de fin : avant, il ne coûte rien.
 */
export function prelevementsDuMois(subs = [], mois) {
  const [a, m] = mois.split("-").map(Number);
  const nbJours = joursDansMois(a, m - 1);
  const debut = `${mois}-01`;
  const fin = `${mois}-${pad(nbJours)}`;

  const parJour = new Map();
  for (const sub of subs || []) {
    const statut = statutDe(sub);
    if (statut === "resilie") continue;
    const montant = lireNombre(sub.montant) ?? 0;
    for (const date of echeancesEntre(sub, debut, fin)) {
      const jour = Number(date.slice(8, 10));
      if (!parJour.has(jour)) parJour.set(jour, []);
      parJour.get(jour).push({ sub, montant, essai: statut === "essai" && date === sub.fin_essai });
    }
  }

  let cumul = 0;
  const jours = [...parJour.keys()]
    .sort((x, y) => x - y)
    .map((jour) => {
      const items = parJour.get(jour);
      const total = items.reduce((s, x) => s + x.montant, 0);
      cumul += total;
      return { jour, date: `${mois}-${pad(jour)}`, items, total, cumul };
    });
  return { mois, nbJours, jours, total: cumul };
}

// ─── Totaux, économies, arbitrages ───────────────────────────────────────────

export function totaux(subs = []) {
  const payes = (subs || []).filter(estPaye);
  const mensuel = payes.reduce((s, x) => s + mensualiser(x), 0);
  return {
    mensuel,
    annuel: mensuel * 12,
    nombre: payes.length,
    essais: (subs || []).filter((s) => statutDe(s) === "essai"),
    resilies: (subs || []).filter((s) => statutDe(s) === "resilie"),
  };
}

/**
 * Économies réalisées depuis chaque résiliation : les prélèvements qui
 * auraient eu lieu entre la résiliation et aujourd'hui. On compte les
 * ÉCHÉANCES évitées plutôt qu'un prorata : un abonnement annuel résilié il y a
 * trois mois n'a rien fait économiser tant que sa date de renouvellement n'est
 * pas passée.
 */
export function economiesRealisees(subs = [], aujourdhui = todayIso()) {
  const lignes = [];
  for (const sub of subs || []) {
    if (statutDe(sub) !== "resilie" || !sub.resilie_le || !sub.prochaine_date) continue;
    const montant = lireNombre(sub.montant) ?? 0;
    // Le lendemain de la résiliation : un prélèvement du jour même a eu lieu.
    const evitees = echeancesEntre(sub, sub.resilie_le, aujourdhui).filter((d) => d > sub.resilie_le);
    lignes.push({ sub, echeances: evitees.length, montant: evitees.length * montant });
  }
  return { total: lignes.reduce((s, l) => s + l.montant, 0), lignes };
}

/**
 * Candidats à la résiliation : ce qui coûte le plus pour ce qui sert le moins.
 * Seuls les abonnements dont l'usage a été renseigné entrent dans le
 * classement — l'application ne présume pas qu'un abonnement est inutile.
 */
export function candidatsResiliation(subs = []) {
  return (subs || [])
    .filter((s) => estPaye(s) && USAGES[s.usage]?.poids > 0)
    .map((s) => ({ sub: s, mensuel: mensualiser(s), score: mensualiser(s) * USAGES[s.usage].poids }))
    .sort((a, b) => b.score - a.score);
}

/** Valeur d'un versement mensuel placé `annees` ans au taux donné. */
export function valeurPlacee(mensuel, tauxPct, annees) {
  if (!(mensuel > 0) || !(annees > 0)) return 0;
  return projectMonthly(0, tauxPct || 0, mensuel, Math.round(annees * 12));
}

/**
 * Rappels de fin d'essai, pour le panneau de notifications : de trois jours
 * avant jusqu'au jour même. Passé ce jour, l'abonnement est payant et le
 * rappel n'a plus d'objet.
 */
export function rappelsEssais(subs = [], aujourdhui = todayIso(), { joursAvant = 3 } = {}) {
  return (subs || [])
    // `rappelEssaiVu` porte la date de fin déjà rappelée : un essai prolongé
    // (nouvelle date) se rappelle de nouveau.
    .filter((s) => statutDe(s) === "essai" && s.fin_essai && s.rappelEssaiVu !== s.fin_essai)
    .map((s) => ({ s, j: joursEntre(aujourdhui, s.fin_essai) }))
    .filter(({ j }) => j >= 0 && j <= joursAvant)
    .map(({ s, j }) => {
      const quand = j === 0 ? "aujourd'hui" : j === 1 ? "demain" : `dans ${j} jours`;
      const montant = lireNombre(s.montant);
      return {
        id: `essai-${s.id}-${s.fin_essai}`,
        label: `Essai ${s.label || "gratuit"} : premier prélèvement ${quand}${
          montant ? ` (${montant.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €)` : ""
        }. Résilie avant si tu ne le gardes pas.`,
        type: "essai",
        source: "abonnements",
        subId: s.id,
      };
    });
}

// ─── Contrats ────────────────────────────────────────────────────────────────

/** Dernier jour pour envoyer sa résiliation : la fin d'engagement moins le préavis. */
export function dateLimiteResiliation(contrat) {
  if (!contrat?.date_fin) return null;
  const preavis = lireNombre(contrat.preavis_jours) ?? 0;
  const d = new Date(`${contrat.date_fin}T00:00:00`);
  d.setDate(d.getDate() - preavis);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Statut d'un contrat. La date qui compte n'est pas la fin du contrat mais la
 * date limite de résiliation : passée, il est « à résilier » (trop tard pour
 * cette échéance, s'il n'est pas déjà fait) ; à moins de 30 jours, « à
 * renouveler » — c'est le moment de décider.
 */
export function statutContrat(contrat, aujourdhui = todayIso()) {
  if (!contrat?.date_fin) return { key: "actif", label: "Actif", etat: "ok" };
  if (contrat.date_fin < aujourdhui) return { key: "expire", label: "Expiré", etat: "neutre" };
  const limite = dateLimiteResiliation(contrat);
  if (aujourdhui >= limite) return { key: "a_resilier", label: "À résilier", etat: "critique", limite };
  if (joursEntre(aujourdhui, limite) <= 30) return { key: "a_renouveler", label: "À renouveler", etat: "attention", limite };
  return { key: "actif", label: "Actif", etat: "ok", limite };
}

// ─── Rapprochement avec le relevé ────────────────────────────────────────────

/** Mots trop génériques pour identifier un marchand. */
const MOTS_VIDES = new Set([
  "SAS", "SARL", "SA", "COM", "WWW", "FR", "EU", "PRLV", "SEPA", "CARTE", "ABONNEMENT", "ABO",
  "THE", "LES", "DES", "DE", "DU", "LA", "LE", "ET", "PLUS", "SERVICES", "SERVICE", "FRANCE", "PAYMENT", "PAYMENTS",
]);

const mots = (texte) =>
  normaliser(texte)
    .split(/[^A-Z0-9&]+/)
    .filter((m) => m.length >= 3 && !MOTS_VIDES.has(m));

/**
 * Un abonnement correspond-il à une clé de marchand du relevé ? La clé posée
 * à l'ajout depuis le relevé (`cleCompte`) fait foi ; à défaut, tous les mots
 * distinctifs du nom saisi doivent se retrouver dans le libellé bancaire —
 * « Free Box » ne doit pas capter les prélèvements de « Free Mobile ».
 */
export function correspond(sub, cle) {
  if (!sub || !cle) return false;
  if (sub.cleCompte) return sub.cleCompte === cle;
  const attendus = mots(sub.label);
  if (attendus.length === 0) return false;
  const presents = new Set(mots(cle));
  return attendus.every((m) => presents.has(m));
}

const euros = (centimes) => Math.round(Math.abs(centimes)) / 100;

/** « 2026-11 » décalé de n mois. */
function decalerMois(mois, n) {
  const [a, m] = mois.split("-").map(Number);
  const total = m - 1 + n;
  return `${a + Math.floor(total / 12)}-${pad((((total % 12) + 12) % 12) + 1)}`;
}
const proches = (a, b) => Math.abs(a - b) <= Math.max(0.05, Math.abs(b) * 0.01);

/**
 * Vérification d'un abonnement contre ses prélèvements constatés.
 *
 * @returns {{trouve: false} | {
 *   trouve: true, derniere: {date, montant}, depuis: string|null, ancien: number|null,
 *   alerte: null | "toujours_preleve" | "double" | "absent" | "montant", detail: string,
 * }}
 */
function verifier(sub, ops, finDonnees) {
  if (ops.length === 0) return { trouve: false };
  const tries = [...ops].sort((a, b) => a.date.localeCompare(b.date));
  const derniereOp = tries[tries.length - 1];
  const derniere = { date: derniereOp.date, montant: euros(derniereOp.montant) };

  // Depuis quand le montant actuel s'applique : on remonte tant que les
  // montants restent identiques.
  let i = tries.length - 1;
  while (i > 0 && proches(euros(tries[i - 1].montant), derniere.montant)) i--;
  const ancien = i > 0 ? euros(tries[i - 1].montant) : null;
  const depuis = i > 0 ? tries[i].date : null;

  const declare = lireNombre(sub.montant);
  const statut = statutDe(sub);
  let alerte = null;
  let detail = "";

  // Un double prélèvement ancien a déjà été vu (ou remboursé) : seuls les
  // trois derniers mois de relevés comptent.
  const parMois = new Map();
  for (const o of tries) parMois.set(o.date.slice(0, 7), (parMois.get(o.date.slice(0, 7)) || 0) + 1);
  const moisRecent = finDonnees ? decalerMois(finDonnees.slice(0, 7), -2) : "";
  const moisDouble = (sub.frequence || "mensuelle") === "mensuelle"
    ? [...parMois.entries()].filter(([m, n]) => n >= 2 && m >= moisRecent).map(([m]) => m).pop()
    : null;

  if (statut === "resilie" && sub.resilie_le && derniere.date > sub.resilie_le) {
    alerte = "toujours_preleve";
    detail = `Encore prélevé le ${dateFr(derniere.date)}, après ta résiliation du ${dateFr(sub.resilie_le)}.`;
  } else if (moisDouble) {
    alerte = "double";
    detail = `Prélevé ${parMois.get(moisDouble)} fois en ${new Date(`${moisDouble}-01T00:00:00`).toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}.`;
  } else if (statut !== "resilie" && statut !== "essai" && finDonnees &&
    joursEntre(derniere.date, finDonnees) > joursPeriode(sub.frequence) * 1.5 + 5) {
    alerte = "absent";
    detail = `Dernier prélèvement constaté le ${dateFr(derniere.date)} — plus rien depuis sur tes relevés.`;
  } else if (statut !== "resilie" && declare != null && !proches(derniere.montant, declare)) {
    alerte = "montant";
    detail = ancien != null && proches(ancien, declare)
      ? `Passé de ${fmt(ancien)} à ${fmt(derniere.montant)} le ${dateFr(depuis)}.`
      : `Prélevé ${fmt(derniere.montant)} le ${dateFr(derniere.date)}, tu as déclaré ${fmt(declare)}.`;
  }

  return { trouve: true, derniere, ancien, depuis, alerte, detail, nombre: tries.length };
}

const fmt = (v) => `${v.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const dateFr = (iso) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });

/**
 * Croise les abonnements suivis avec les opérations du compte courant.
 *
 * @param {object[]} subs
 * @param {object[]} enrichies  Opérations enrichies (`enrichir`), en centimes.
 * @param {object}   options
 * @param {object[]} options.charges  Charges récurrentes détectées (`recurrences().charges`).
 * @param {string[]} options.ignores  Clés de marchands que l'utilisateur a écartées.
 * @returns {{verifications: Object<string, object>, detectes: object[]}}
 */
export function rapprocherCompte(subs = [], enrichies = [], { charges = [], ignores = [] } = {}) {
  const debits = (enrichies || []).filter((o) => o.montant < 0 && o.famille !== "interne" && o.analyse?.cle);
  const finDonnees = (enrichies || []).reduce((max, o) => (o.date > max ? o.date : max), "");

  const verifications = {};
  for (const sub of subs || []) {
    const ops = debits.filter((o) => correspond(sub, o.analyse.cle));
    verifications[sub.id] = verifier(sub, ops, finDonnees);
  }

  const ecartes = new Set(ignores || []);
  const detectes = (charges || []).filter(
    (c) => !ecartes.has(c.cle) && !(subs || []).some((s) => correspond(s, c.cle))
  );

  return { verifications, detectes };
}

const STREAMING = /NETFLIX|SPOTIFY|DISNEY|DEEZER|CANAL|PRIME|YOUTUBE|APPLE|PARAMOUNT|CRUNCHYROLL|MAX\b/;
const PAR_CATEGORIE_COMPTE = {
  sport: "Sport / Bien-être",
  telecom: "Téléphonie",
  factures: "Énergie",
  logement: "Logement",
  transport: "Transport",
};

/** Abonnement prêt à enregistrer, à partir d'une charge détectée sur le relevé. */
export function aboDepuisCharge(charge, id) {
  const categorie =
    charge.categorie === "abonnements"
      ? STREAMING.test(normaliser(charge.titre)) ? "Streaming" : "Logiciel / Cloud"
      : PAR_CATEGORIE_COMPTE[charge.categorie] || "Autre";
  return {
    id,
    category: categorie,
    label: charge.titre,
    montant: Math.round(charge.montant) / 100,
    frequence: "mensuelle",
    prochaine_date: charge.prochaine,
    statut: "actif",
    // La clé du relevé, pour que le rapprochement ne repose pas sur le nom.
    cleCompte: charge.cle,
  };
}
