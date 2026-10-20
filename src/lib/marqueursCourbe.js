import { eur, lireNombre } from "./finance";

/**
 * Deux aides pour les petites et grandes courbes du patrimoine : savoir si une
 * série mérite d'être tracée, et poser les opérations du journal sur une
 * courbe dont les points ne tombent pas les mêmes jours qu'elles.
 */

/**
 * En dessous de trois points, une mini-courbe ne montre rien.
 *
 * Deux points tracent toujours un segment droit : il « monte » ou il
 * « descend », et l'œil y lit une tendance là où il n'y a qu'un écart entre
 * deux relevés. Le composant `Sparkline` accepte deux points, parce que les
 * lignes du portefeuille l'alimentent avec des séries de cours qui en ont
 * toujours des dizaines ; les cartes de synthèse, elles, démarrent avec un
 * historique vide et passeraient des semaines à afficher ce segment trompeur.
 */
export const POINTS_MIN_SPARKLINE = 3;

/**
 * Valeurs d'une série prêtes pour une sparkline, ou tableau vide si la série
 * est trop courte pour dire quelque chose.
 *
 * Les relevés sans valeur numérique sont écartés plutôt que comptés à zéro :
 * un zéro au milieu d'une courbe de patrimoine dessinerait un effondrement qui
 * n'a jamais eu lieu.
 */
export function serieSparkline(points = [], cle = "value") {
  const valeurs = [...(points || [])]
    .filter((p) => lireNombre(p?.[cle]) != null)
    .sort((a, b) => ((a.date || "") < (b.date || "") ? -1 : (a.date || "") > (b.date || "") ? 1 : 0))
    .map((p) => lireNombre(p[cle]));
  return valeurs.length >= POINTS_MIN_SPARKLINE ? valeurs : [];
}

/**
 * Natures d'opérations posées sur la courbe du patrimoine net.
 *
 * Les trois premières reprennent le code couleur de la courbe du portefeuille
 * (onglet Performance), qui les importe d'ici : deux palettes tenues à la main
 * finissent toujours par diverger, et une pastille verte ne doit pas vouloir
 * dire « achat » sur un écran et autre chose sur le suivant.
 *
 * VERSEMENT et RETRAIT n'avaient pas de sens sur la seule poche bourse, ils en
 * ont un sur le patrimoine net : un versement fait monter la courbe sans
 * qu'aucune performance n'y soit pour rien, et c'est exactement ce que le
 * repère doit permettre de lire. Couleurs choisies loin du vert et du rouge,
 * pour qu'un retrait ne se confonde pas avec une vente.
 *
 * L'AJUSTEMENT est volontairement ABSENT : une correction de poche cash n'est
 * pas un mouvement d'argent (voir `buildCashAdjustment`), et la marquer ici
 * ferait revenir, sous forme de pastille, la confusion qu'il a fallu corriger
 * dans le capital investi.
 */
export const NATURES_MARQUEUR = {
  ACHAT: { couleur: "#22c55e", libelle: "Achat" },
  VENTE: { couleur: "#ef4444", libelle: "Vente" },
  DIVIDENDE: { couleur: "#3b82f6", libelle: "Dividende" },
  VERSEMENT: { couleur: "#f59e0b", libelle: "Versement" },
  RETRAIT: { couleur: "#d946ef", libelle: "Retrait" },
};
const ORDRE_NATURES = ["VERSEMENT", "RETRAIT", "ACHAT", "VENTE", "DIVIDENDE"];

/**
 * Une opération à marquer, ou pas.
 *
 * Les VERSEMENT/RETRAIT portant `origine: "ajustement-cash"` sont des
 * corrections de solde créées avant l'introduction du type AJUSTEMENT, et
 * que l'utilisateur n'a pas encore converties : leur nature est CERTAINE
 * (voir `versementsSuspects`), donc on ne les présente pas comme des
 * versements. Les suspects seulement « probables » restent marqués : ce n'est
 * qu'une présomption, et c'est à l'utilisateur de trancher dans Opérations.
 */
function aMarquer(op) {
  if (!op?.date || !NATURES_MARQUEUR[op.type]) return false;
  if ((op.type === "VERSEMENT" || op.type === "RETRAIT") && op.origine === "ajustement-cash") return false;
  return true;
}

/** Montant affiché d'une opération, toujours positif : le sens est dans le libellé. */
export function montantOperation(op) {
  const q = lireNombre(op?.quantity) ?? 0;
  const p = lireNombre(op?.price) ?? 0;
  const f = lireNombre(op?.fees) ?? 0;
  switch (op?.type) {
    case "ACHAT": return q * p + f;
    case "VENTE": return q * p - f;
    case "DIVIDENDE":
    case "VERSEMENT":
    case "RETRAIT":
      return Math.abs(lireNombre(op.amount ?? op.montantNet) ?? 0);
    default: return null;
  }
}

/** « Achat AIR ×10 — 1 012,00 € », « Versement — 500,00 € ». */
export function decrireOperation(op) {
  const nature = NATURES_MARQUEUR[op?.type];
  if (!nature) return "";
  const titre = op.asset ? ` ${op.asset}` : "";
  const quantite = (op.type === "ACHAT" || op.type === "VENTE") && op.quantity ? ` ×${op.quantity}` : "";
  const montant = montantOperation(op);
  return `${nature.libelle}${titre}${quantite}${montant ? ` — ${eur(montant, 2)}` : ""}`;
}

/**
 * Rattache chaque opération à un point de la courbe et les regroupe.
 *
 * Une opération ne tombe pas forcément un jour où un relevé existe : le
 * patrimoine n'est relevé que les jours où l'application est ouverte, et
 * l'historique est compacté avec le temps. On la rattache au DERNIER point
 * connu avant elle — c'est la valeur qu'avait le patrimoine quand elle a eu
 * lieu. Sans ce rattachement la pastille ne s'affiche pas du tout, puisque
 * recharts ne sait poser un repère que sur une abscisse existante.
 *
 * Les opérations antérieures au premier point, ou postérieures au dernier,
 * sont ignorées : les poser sur un bord ferait croire qu'elles ont eu lieu à
 * ce moment-là.
 *
 * Le regroupement se fait par INDICE de point et non par date : c'est
 * l'indice qui identifie un point sans ambiguïté, quel que soit l'axe.
 *
 * @param operations journal d'opérations (`bourse.operations`)
 * @param points     points mesurés de la courbe, avec `date` et la valeur sous `cleValeur`
 * @returns {Array<{ indice, point, date, valeur, natures: Array<{nature, ops}> }>}
 */
export function marqueursOperations(operations = [], points = [], cleValeur = "value") {
  const mesures = (points || [])
    .map((point, indice) => ({ point, indice }))
    .filter(({ point }) => point?.date && Number.isFinite(point[cleValeur]));
  if (mesures.length === 0) return [];
  const premiere = mesures[0].point.date;
  const derniere = mesures[mesures.length - 1].point.date;

  const groupes = new Map();
  for (const op of operations || []) {
    if (!aMarquer(op) || op.date < premiere || op.date > derniere) continue;
    let cible = mesures[0];
    for (const m of mesures) {
      if (m.point.date <= op.date) cible = m;
      else break;
    }
    if (!groupes.has(cible.indice)) groupes.set(cible.indice, { cible, natures: new Map() });
    const natures = groupes.get(cible.indice).natures;
    if (!natures.has(op.type)) natures.set(op.type, []);
    natures.get(op.type).push(op);
  }

  return [...groupes.values()]
    .sort((a, b) => a.cible.indice - b.cible.indice)
    .map(({ cible, natures }) => ({
      indice: cible.indice,
      point: cible.point,
      date: cible.point.date,
      valeur: cible.point[cleValeur],
      natures: ORDRE_NATURES.filter((n) => natures.has(n)).map((nature) => ({ nature, ops: natures.get(nature) })),
    }));
}
