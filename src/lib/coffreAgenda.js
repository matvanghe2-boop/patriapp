import { todayIso } from "./finance";
import { statutDocument, actionDe, dateFr, ajouterJours } from "./coffre";

/**
 * Coffre à papiers — rappels dans l'agenda du téléphone (COFFRE_SPEC.md, §8.2).
 *
 * Les dates du coffre sont chiffrées dans le cloud : aucun serveur ne peut
 * donc prévenir de lui-même qu'un passeport arrive à échéance. C'est l'agenda
 * du téléphone qui s'en charge, de deux façons :
 *
 *  · un lien Google Agenda par document, qui ouvre un événement pré-rempli
 *    (sur Android, dans l'appli Agenda) — un geste pour l'enregistrer ;
 *  · un fichier `.ics` de tous les rappels, à importer depuis l'ordinateur
 *    (l'appli Google Agenda d'Android n'ouvre pas ces fichiers).
 *
 * L'agenda voit le titre et la date du rappel, jamais les notes ni le
 * fichier. Le réglage « titre neutre » remplace même le titre par une phrase
 * qui ne dit pas de quel papier il s'agit.
 */

const TITRE_NEUTRE = "Papier à renouveler — voir le coffre Patrium";
const DETAILS = "Rappel posé depuis le coffre à papiers de Patrium : le document est dans l'onglet Coffre.";

const jourMois = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const compact = (iso) => iso.replaceAll("-", "");

/**
 * Événement d'agenda d'un document, ou `null` s'il n'y a rien à rappeler
 * (pas d'échéance, ou échéance déjà passée : c'est le nouveau papier qu'il
 * faut alors ranger).
 *
 * `cible` est la date de rappel telle que le coffre la calcule ; `date` est
 * celle de l'événement, ramenée à aujourd'hui si le rappel est déjà passé —
 * un événement dans le passé ne préviendrait personne.
 *
 * @returns {{ uid, cible, date, titre, details, annuel } | null}
 */
export function evenementAgenda(doc, reglages = {}, { aujourdhui = todayIso(), contrat = null } = {}) {
  const s = statutDocument(doc, reglages, aujourdhui, contrat);
  if (!s.echeance || s.statut === "expire") return null;
  const cible = s.rappel || s.echeance;
  const annuel = !contrat && doc.recurrence === "annuelle";
  const echeance = annuel ? `chaque année le ${jourMois(s.echeance)}` : `le ${dateFr(s.echeance)}`;
  const action = contrat ? "dernier jour pour résilier" : actionDe(doc).toLowerCase();
  return {
    uid: `coffre-${doc.id}@patrium`,
    cible,
    date: cible < aujourdhui ? aujourdhui : cible,
    titre: reglages?.titreAgendaNeutre ? TITRE_NEUTRE : `${doc.titre} — ${action} (échéance ${echeance})`,
    details: DETAILS,
    annuel,
  };
}

/** Lien qui ouvre Google Agenda sur un événement d'une journée, pré-rempli. */
export function lienGoogleAgenda(evt) {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: evt.titre,
    dates: `${compact(evt.date)}/${compact(ajouterJours(evt.date, 1))}`,
    details: evt.details,
  });
  if (evt.annuel) params.set("recur", "RRULE:FREQ=YEARLY");
  return `https://calendar.google.com/calendar/render?${params}`;
}

// ─── Fichier .ics (RFC 5545) ────────────────────────────────────────────────

const echapper = (texte) =>
  String(texte).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

const encodeur = new TextEncoder();

/**
 * Coupe une ligne à 75 octets, comme l'exige la norme ; chaque suite commence
 * par une espace. La coupe se fait entre deux caractères, jamais au milieu
 * d'un « é » encodé sur deux octets.
 */
export function plierLigne(ligne) {
  if (encodeur.encode(ligne).length <= 75) return ligne;
  const morceaux = [];
  let courant = "";
  let taille = 0;
  let limite = 75;
  for (const car of ligne) {
    const n = encodeur.encode(car).length;
    if (taille + n > limite) {
      morceaux.push(courant);
      courant = "";
      taille = 0;
      limite = 74; // l'espace de continuation compte dans les 75 octets
    }
    courant += car;
    taille += n;
  }
  morceaux.push(courant);
  return morceaux.join("\r\n ");
}

const horodatage = (d) =>
  d
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");

/**
 * Calendrier `.ics` des événements donnés : un événement d'une journée par
 * document, une alarme à 9 h le jour même, et une règle annuelle pour les
 * contrats reconduits. L'identifiant de chaque événement est stable : le
 * réimporter met à jour le rappel au lieu de le dupliquer, dans les agendas
 * qui le permettent.
 */
export function fichierIcs(evenements, maintenant = new Date()) {
  const lignes = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Patrium//Coffre a papiers//FR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];
  for (const e of evenements) {
    lignes.push(
      "BEGIN:VEVENT",
      `UID:${e.uid}`,
      `DTSTAMP:${horodatage(maintenant)}`,
      `DTSTART;VALUE=DATE:${compact(e.date)}`,
      `DTEND;VALUE=DATE:${compact(ajouterJours(e.date, 1))}`,
      `SUMMARY:${echapper(e.titre)}`,
      `DESCRIPTION:${echapper(e.details)}`
    );
    if (e.annuel) lignes.push("RRULE:FREQ=YEARLY");
    lignes.push(
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      `DESCRIPTION:${echapper(e.titre)}`,
      "TRIGGER:PT9H",
      "END:VALARM",
      "END:VEVENT"
    );
  }
  lignes.push("END:VCALENDAR");
  return `${lignes.map(plierLigne).join("\r\n")}\r\n`;
}

// ─── Suivi de ce qui a été posé ─────────────────────────────────────────────

/**
 * Ce qui identifie un rappel posé : sa date (le jour et le mois seulement pour
 * un événement annuel, que la règle de récurrence fait revenir) et son titre.
 */
const cleAgenda = (evt) => `${evt.annuel ? evt.cible.slice(5) : evt.cible}|${evt.titre}`;

/**
 * Le rappel posé dans l'agenda correspond-il encore au document ?
 * `sans_objet` (rien à rappeler), `absent`, `a_jour` ou `a_mettre_a_jour`
 * (échéance, délai ou titre changés depuis).
 */
export function etatAgenda(doc, evt) {
  if (!evt) return "sans_objet";
  if (!doc?.agendaAjouteLe) return "absent";
  return doc.agendaDate === cleAgenda(evt) ? "a_jour" : "a_mettre_a_jour";
}

/** Retient qu'un rappel a été posé pour ce document. */
export const marquerAgenda = (doc, evt, maintenant = new Date().toISOString()) => ({
  ...doc,
  agendaAjouteLe: maintenant,
  agendaDate: cleAgenda(evt),
});
