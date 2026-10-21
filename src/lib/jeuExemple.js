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

/*
 * Les deux historiques du jeu sont construits à partir des MÊMES composantes,
 * pour que leurs écarts racontent une histoire cohérente :
 *
 *   patrimoine = livrets + valeur du portefeuille
 *   valeur du portefeuille = capital investi + gain
 *
 * Le capital monte de 300 € à chaque versement du journal, les livrets de
 * dépôts réguliers et de leurs intérêts au 31 décembre, et le gain suit le
 * marché. La cascade retrouve donc, mois après mois, une épargne et une part
 * du marché plausibles — et les deux séries aboutissent aux soldes du jeu
 * (22 000 € de livrets, 15 500 € investis, 1 593 € de plus-value).
 */
const CAPITAL_FINAL = 15500;
const GAIN_FINAL = 1593;
const LIVRETS_FINAL = 22000;
const INTERETS_ANNUELS = 7000 * 0.017 + 15000 * 0.025; // Livret A + fonds euros
const DEPOT_HEBDO = 75;

function composantes(aujourdhui) {
  const versements = operationsExemple(aujourdhui)
    .filter((op) => op.type === "VERSEMENT")
    .map((op) => op.date);
  const capitalDepart = CAPITAL_FINAL - 300 * versements.length;
  const dateDepart = decaler(aujourdhui, -7 * SEMAINES);
  const premierJanvier = `${aujourdhui.slice(0, 4)}-01-01`;
  const interetsDansLaFenetre = premierJanvier > dateDepart;
  const livretsDepart = LIVRETS_FINAL - DEPOT_HEBDO * (SEMAINES - 1) - (interetsDansLaFenetre ? INTERETS_ANNUELS : 0);

  const points = [];
  for (let s = 0; s < SEMAINES; s++) {
    const date = decaler(aujourdhui, -7 * (SEMAINES - s));
    const capital = capitalDepart + 300 * versements.filter((v) => v <= date).length;
    const gain =
      600 + // plus-value déjà acquise il y a un an
      (GAIN_FINAL - 600) * (s / (SEMAINES - 1)) + // la tendance du marché
      // Des cycles de quelques semaines et le bruit d'une semaine sur
      // l'autre, comptés à REBOURS depuis la fin : ils s'annulent au dernier
      // relevé, qui tombe donc sur le gain du jour sans saut inexpliqué.
      350 * Math.sin((SEMAINES - 1 - s) / 4.5) +
      120 * Math.sin((SEMAINES - 1 - s) / 1.7);
    const livrets =
      livretsDepart + DEPOT_HEBDO * s + (interetsDansLaFenetre && date >= premierJanvier ? INTERETS_ANNUELS : 0);
    points.push({ date, capital, valeur: capital + gain, livrets });
  }
  return points;
}

/** Un relevé de patrimoine net par semaine, sur l'année écoulée. */
export function historiqueExemple(aujourdhui = todayIso()) {
  return composantes(aujourdhui).map((p) => ({
    id: `exemple-${p.date}`,
    label: libelle(p.date),
    date: p.date,
    value: Math.round(p.livrets + p.valeur),
  }));
}

/**
 * Historique du portefeuille — valeur et capital investi — aux mêmes dates.
 * C'est lui qui permet de séparer le marché de l'épargne ; sans lui, la
 * cascade du jeu refuserait, à juste titre, de décomposer quoi que ce soit.
 */
export function portefeuilleExemple(aujourdhui = todayIso()) {
  return composantes(aujourdhui).map((p) => ({
    date: p.date,
    valeur: Math.round(p.valeur),
    capital: Math.round(p.capital),
  }));
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
