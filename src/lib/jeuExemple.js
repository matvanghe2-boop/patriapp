import { todayIso } from "./finance";

/**
 * Passé du jeu d'exemple : un an de relevés, de versements et d'opérations.
 *
 * Le jeu d'exemple ne contenait que des soldes du jour. La courbe du
 * patrimoine, la cascade mensuelle, la trajectoire des objectifs et les
 * marqueurs d'opérations affichaient donc tous « reviens dans quelques
 * semaines » : on ne pouvait voir la moitié de l'application qu'après des
 * mois d'usage réel.
 *
 * Tout est DÉTERMINISTE (sinusoïdes, pas de hasard) et calculé par rapport à
 * la date de chargement : le jeu reste daté de l'année écoulée, quel que soit
 * le jour où on le charge, et deux chargements donnent la même courbe.
 *
 * Les chiffres sont inventés, et l'écran d'accueil le dit avant le
 * chargement. Ils sont seulement VRAISEMBLABLES : une épargne de quelques
 * centaines d'euros par mois, un marché qui monte avec des creux, et une
 * dernière valeur proche du patrimoine du jeu d'exemple — sans quoi le
 * relevé du jour ferait un saut que rien n'explique.
 */

const SEMAINES = 52;

const decaler = (iso, jours) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + jours);
  return d.toISOString().slice(0, 10);
};

const libelle = (iso) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });

/** Un relevé de patrimoine net par semaine, sur l'année écoulée. */
export function historiqueExemple(aujourdhui = todayIso()) {
  const points = [];
  for (let s = 0; s < SEMAINES; s++) {
    const date = decaler(aujourdhui, -7 * (SEMAINES - s));
    const valeur =
      29000 + // point de départ, il y a un an
      150 * s + // l'épargne, environ 650 € par mois
      20 * s + // la tendance du marché
      450 * Math.sin(s / 4.5) + // des cycles de quelques semaines
      200 * Math.sin(s / 1.7); // et le bruit d'une semaine sur l'autre
    points.push({ id: `exemple-${date}`, label: libelle(date), date, value: Math.round(valeur) });
  }
  return points;
}

/**
 * Journal du PEA : un versement de 300 € chaque mois, un renfort sur l'ETF et
 * le dividende annuel d'Air Liquide. Ce sont eux que la cascade sépare de la
 * performance, et eux que la courbe pose en marqueurs.
 */
export function operationsExemple(aujourdhui = todayIso()) {
  const ops = [];
  for (let m = 11; m >= 0; m--) {
    const d = new Date(`${aujourdhui}T12:00:00Z`);
    d.setUTCDate(5);
    d.setUTCMonth(d.getUTCMonth() - m);
    const date = d.toISOString().slice(0, 10);
    if (date > aujourdhui) continue;
    ops.push({
      id: `exemple-versement-${date}`,
      date,
      type: "VERSEMENT",
      asset: null,
      quantity: null,
      price: null,
      fees: 0,
      amount: 300,
      montantNet: 300,
      plusValueRealisee: null,
    });
  }
  ops.push({
    id: "exemple-achat-cw8",
    date: decaler(aujourdhui, -200),
    type: "ACHAT",
    asset: "CW8.PA",
    quantity: 5,
    price: 440,
    fees: 2,
    amount: null,
    montantNet: 2202,
    plusValueRealisee: null,
  });
  ops.push({
    id: "exemple-dividende-ai",
    date: decaler(aujourdhui, -150),
    type: "DIVIDENDE",
    asset: "AI.PA",
    quantity: 15,
    price: 3.3,
    fees: 0,
    amount: 49.5,
    montantNet: 49.5,
    plusValueRealisee: null,
  });
  return ops.sort((a, b) => (a.date < b.date ? 1 : -1));
}

/** Un objectif daté, parti il y a un an, pour montrer la trajectoire. */
export function objectifExemple(aujourdhui = todayIso()) {
  return {
    id: "exemple-objectif",
    libelle: "Apport immobilier",
    cible: 60000,
    echeance: decaler(aujourdhui, 365 * 3),
    departDate: decaler(aujourdhui, -7 * SEMAINES),
    departValeur: 29000,
  };
}
