import { todayIso } from "./finance";
import { ageFiscal, ajouterMois } from "./epargne";
import { statutContrat } from "./abonnements";

/**
 * Agenda financier de l'année : toutes les dates qui comptent, au même
 * endroit, sur les douze prochains mois.
 *
 * Deux sortes de dates, et l'écran les distingue :
 *  · CERTAINES — fixées par la loi ou par tes propres données : intérêts au
 *    31 décembre, révision des taux réglementés, anniversaires du PEA, date
 *    limite de résiliation d'un contrat, échéance d'un objectif ;
 *  · ESTIMÉES — publiées chaque année par l'administration : ouverture et
 *    dates limites de la déclaration de revenus, avis d'imposition,
 *    récapitulatif fiscal (IFU). Elles reprennent le calendrier de l'année
 *    précédente, décalé au même jour de la semaine, tant que le nouveau n'est
 *    pas publié.
 */

/**
 * Calendrier de la déclaration 2026 (revenus 2025), qui sert de modèle :
 * ouverture du service en ligne le jeudi 9 avril, dates limites en ligne le
 * jeudi 21 mai (départements 01 à 19), le jeudi 28 mai (20 à 54) et le jeudi
 * 4 juin (55 et plus, outre-mer).
 */
export const CALENDRIER_DECLARATION_MODELE = {
  annee: 2026,
  ouverture: "2026-04-09",
  limites: { 1: "2026-05-21", 2: "2026-05-28", 3: "2026-06-04" },
};

/** Zone de la date limite de déclaration en ligne, d'après le département. */
export function zoneDeclaration(departement) {
  const d = String(departement || "").trim().toUpperCase();
  if (!d) return null;
  if (d === "2A" || d === "2B") return 2;
  const n = Number(d);
  if (!Number.isFinite(n) || n < 1) return null;
  if (n <= 19) return 1;
  if (n <= 54) return 2;
  return 3;
}

/** La même date un an plus tard, ramenée au même jour de la semaine. */
export function memeJourAnSuivant(iso, ans = 1) {
  const d = new Date(`${iso}T12:00:00Z`);
  const cible = new Date(Date.UTC(d.getUTCFullYear() + ans, d.getUTCMonth(), d.getUTCDate(), 12));
  // On recule au même jour de la semaine (au plus six jours).
  const ecart = (cible.getUTCDay() - d.getUTCDay() + 7) % 7;
  cible.setUTCDate(cible.getUTCDate() - ecart);
  return cible.toISOString().slice(0, 10);
}

const dansLaFenetre = (date, debut, fin) => date >= debut && date <= fin;
const dateLongue = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

/**
 * @returns {{id, date, titre, detail, estimee: boolean, categorie: "impots"|"epargne"|"bourse"|"contrats"|"objectifs"}[]}
 */
export function evenementsAgenda({
  aujourdhui = todayIso(), departement = null, livrets = [], bourse = {}, contracts = [], objectifs = [],
} = {}) {
  const fin = ajouterMois(aujourdhui, 12);
  const liste = [];
  const ajouter = (e) => {
    if (dansLaFenetre(e.date, aujourdhui, fin)) liste.push(e);
  };
  const anneeCourante = Number(aujourdhui.slice(0, 4));

  for (const an of [anneeCourante, anneeCourante + 1]) {
    // ── Livrets : intérêts et révisions ──────────────────────────────────
    if (livrets.length > 0) {
      ajouter({ id: `interets-${an}`, date: `${an}-12-31`, titre: "Intérêts des livrets crédités", detail: "À enregistrer début janvier, dans Livrets & Épargne.", estimee: false, categorie: "epargne" });
    }
    for (const mois of ["02", "08"]) {
      ajouter({ id: `revision-${an}-${mois}`, date: `${an}-${mois}-01`, titre: "Révision du taux du Livret A, du LDDS et du LEP", detail: "Le nouveau taux est annoncé quelques jours avant.", estimee: false, categorie: "epargne" });
    }

    // ── Impôts (calendrier estimé d'après le modèle) ─────────────────────
    const decalage = an - CALENDRIER_DECLARATION_MODELE.annee;
    if (decalage >= 0) {
      const estimee = decalage > 0;
      const decaler = (iso) => (decalage === 0 ? iso : memeJourAnSuivant(iso, decalage));
      ajouter({ id: `ifu-${an}`, date: `${an}-02-15`, titre: "Récapitulatif fiscal (IFU) de ta banque et de ton courtier", detail: "Il sert à vérifier les montants pré-remplis de la déclaration.", estimee: true, categorie: "impots" });
      ajouter({ id: `declaration-ouverture-${an}`, date: decaler(CALENDRIER_DECLARATION_MODELE.ouverture), titre: `Ouverture de la déclaration de revenus ${an - 1}`, detail: "Service en ligne sur impots.gouv.fr.", estimee, categorie: "impots" });
      const zone = zoneDeclaration(departement);
      if (zone) {
        ajouter({ id: `declaration-limite-${an}`, date: decaler(CALENDRIER_DECLARATION_MODELE.limites[zone]), titre: "Date limite de la déclaration en ligne", detail: `Zone ${zone}, d'après ton département.`, estimee, categorie: "impots" });
      } else {
        ajouter({ id: `declaration-limite-${an}`, date: decaler(CALENDRIER_DECLARATION_MODELE.limites[1]), titre: "Première date limite de la déclaration en ligne", detail: "Elle dépend de ton département : renseigne-le pour avoir la tienne.", estimee, categorie: "impots" });
      }
      ajouter({ id: `avis-${an}`, date: `${an}-07-31`, titre: "Avis d'impôt disponible", detail: "Fin juillet ou début août, dans ton espace particulier.", estimee: true, categorie: "impots" });
    }
  }

  // ── Bourse : les cinq ans du PEA ───────────────────────────────────────
  if (bourse?.peaOuverture) {
    ajouter({
      id: "pea-5",
      date: ajouterMois(bourse.peaOuverture, 60),
      titre: "Ton PEA a 5 ans",
      detail: "Un retrait ne le clôture plus, et les gains sont exonérés d'impôt sur le revenu (les prélèvements sociaux restent dus).",
      estimee: false,
      categorie: "bourse",
    });
  }

  // ── Livrets : âge fiscal (assurance-vie, PEL) ─────────────────────────
  for (const l of livrets) {
    const age = ageFiscal(l, { aujourdhui });
    for (const j of age?.jalons || []) {
      ajouter({ id: `age-${l.id}-${j.ans}`, date: j.date, titre: `${l.name} : ${j.ans} ans`, detail: j.texte, estimee: false, categorie: "epargne" });
    }
  }

  // ── Contrats et objectifs ─────────────────────────────────────────────
  for (const c of contracts) {
    const st = statutContrat(c, aujourdhui);
    if (st.limite) {
      ajouter({ id: `contrat-${c.id}`, date: st.limite, titre: `Dernier jour pour résilier ${c.label || "un contrat"}`, detail: `Fin d'engagement le ${dateLongue(c.date_fin)}.`, estimee: false, categorie: "contrats" });
    }
  }
  for (const o of objectifs) {
    if (o.echeance) {
      ajouter({ id: `objectif-${o.id}`, date: o.echeance, titre: `Échéance de l'objectif « ${o.libelle || "Objectif"} »`, detail: "", estimee: false, categorie: "objectifs" });
    }
  }

  return liste.sort((a, b) => a.date.localeCompare(b.date) || a.titre.localeCompare(b.titre));
}

/** Rappels « c'est demain » pour le panneau de notifications. */
export function rappelsAgenda(evenements = [], { aujourdhui = todayIso(), vus = [] } = {}) {
  const d = new Date(`${aujourdhui}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  const demain = d.toISOString().slice(0, 10);
  const dejaVus = new Set(vus || []);
  return (evenements || [])
    .filter((e) => e.date === demain && !dejaVus.has(e.id))
    .map((e) => ({ id: `agenda-${e.id}`, agendaId: e.id, label: `Demain — ${e.titre}${e.estimee ? " (date estimée)" : ""}`, type: "agenda", source: "agenda" }));
}
