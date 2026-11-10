/**
 * La Bourse de Paris est-elle ouverte ?
 *
 * Euronext Paris cote en continu de 9 h à 17 h 30, heure de Paris, du lundi
 * au vendredi, sauf six jours fériés boursiers : 1er janvier, Vendredi saint,
 * lundi de Pâques, 1er mai, 25 et 26 décembre. (Les autres fériés français —
 * 8 mai, Ascension, 14 juillet… — sont des jours de cotation.)
 *
 * L'heure est lue EN HEURE DE PARIS quel que soit le fuseau de l'appareil :
 * un téléphone resté à l'heure de New York ne doit pas déclarer la place
 * fermée à 15 h, heure de Paris.
 */

const OUVERTURE_MIN = 9 * 60;
const CLOTURE_MIN = 17 * 60 + 30;

/** Dimanche de Pâques (algorithme de Meeus/Jones/Butcher), en UTC. */
export function paques(annee) {
  const a = annee % 19;
  const b = Math.floor(annee / 100);
  const c = annee % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mois = Math.floor((h + l - 7 * m + 114) / 31);
  const jour = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(annee, mois - 1, jour));
}

function iso(d) {
  return d.toISOString().slice(0, 10);
}

/** Jours fériés de la place de Paris pour une année, en dates ISO. */
export function feriesEuronext(annee) {
  const p = paques(annee);
  const decaler = (n) => iso(new Date(p.getTime() + n * 86400000));
  return new Set([`${annee}-01-01`, decaler(-2), decaler(1), `${annee}-05-01`, `${annee}-12-25`, `${annee}-12-26`]);
}

/** Date, jour de semaine et minute de la journée, à l'heure de Paris. */
function heureDeParis(date) {
  const parties = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Paris",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value])
  );
  return {
    jour: `${parties.year}-${parties.month}-${parties.day}`,
    semaine: parties.weekday,
    minute: Number(parties.hour) * 60 + Number(parties.minute),
  };
}

/**
 * État de la séance à un instant donné.
 * @returns {{ ouvert: boolean, raison: "seance"|"avant"|"apres"|"week-end"|"ferie" }}
 */
export function etatSeance(date = new Date()) {
  const { jour, semaine, minute } = heureDeParis(date);
  if (semaine === "Sat" || semaine === "Sun") return { ouvert: false, raison: "week-end" };
  if (feriesEuronext(Number(jour.slice(0, 4))).has(jour)) return { ouvert: false, raison: "ferie" };
  if (minute < OUVERTURE_MIN) return { ouvert: false, raison: "avant" };
  if (minute >= CLOTURE_MIN) return { ouvert: false, raison: "apres" };
  return { ouvert: true, raison: "seance" };
}
