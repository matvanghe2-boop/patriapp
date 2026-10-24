/**
 * Lecture de l'agenda annoncé DANS un communiqué de société.
 *
 * POURQUOI LIRE LE TEXTE PLUTÔT QU'UNE API
 *
 * Aucune API gratuite ne publie l'agenda à venir des valeurs d'Euronext (voir
 * `shared/calendrierReference.js`). Mais les sociétés l'écrivent elles-mêmes,
 * à la fin de presque chaque communiqué périodique : un encadré « Calendrier
 * financier », « Prochaine publication » ou « Prochains rendez-vous », ou une
 * simple phrase — « Notre assemblée générale se tiendra le lundi 5 avril
 * 2027 ». C'est précisément la source que le catalogue de référence exige
 * (« seulement des dates confirmées par la société »), relevée ici
 * automatiquement au lieu de l'être à la main.
 *
 * DEUX FORMES RECONNUES, ET RIEN D'AUTRE
 *
 *  1. Un ENCADRÉ d'agenda, repéré par son titre. Toute date complète qui le
 *     suit de près est un rendez-vous annoncé.
 *  2. Une PHRASE au futur dont le verbe annonce un événement (« seront
 *     publiés le », « se tiendra le », « will be held on »). Ailleurs dans le
 *     texte, une date future n'est PAS retenue : « financer la société
 *     jusqu'à fin 2027 » ou « échéance le 15 mars 2030 » ne sont pas des
 *     rendez-vous, et les deviner produirait exactement les fausses dates
 *     que ce projet refuse.
 *
 * Seules les dates complètes (jour, mois, année) sont lues. « Fin février
 * 2027 » ou « au premier trimestre » restent sans date : en choisir une serait
 * la fabriquer.
 *
 * Module pur : aucun accès réseau, testable sur du texte.
 */

const MOIS = {
  janvier: 1,
  février: 2,
  fevrier: 2,
  mars: 3,
  avril: 4,
  mai: 5,
  juin: 6,
  juillet: 7,
  août: 8,
  aout: 8,
  septembre: 9,
  octobre: 10,
  novembre: 11,
  décembre: 12,
  decembre: 12,
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

const NOMS_MOIS = Object.keys(MOIS).join("|");

/**
 * Une date complète, sous l'une des trois formes rencontrées dans les
 * communiqués : « 18 novembre 2026 » (et « 1er »), « February 18, 2027 »,
 * « 18/02/2027 ». Les gardes avant et après évitent de lire « 2026 » dans
 * « 30.06.20262 » ou un jour dans un numéro de page collé au texte.
 */
const MOTIF_DATE = new RegExp(
  String.raw`(?<![\d/.])(\d{1,2})(?:er|re|st|nd|rd|th)?\s+(${NOMS_MOIS})\s+(20\d\d)(?!\d)` +
    String.raw`|(?<![a-zà-ÿ])(${NOMS_MOIS})\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(20\d\d)(?!\d)` +
    String.raw`|(?<![\d/.])(\d{1,2})[/.](\d{1,2})[/.](20\d\d)(?!\d)`,
  "gi"
);

/** Titres d'encadré d'agenda, en français et en anglais. */
const MOTIF_ANCRE = new RegExp(
  [
    "calendrier financier",
    "agenda financier",
    "agenda des publications",
    "prochaines? publications?",
    "prochaines? communications?(?: financières?)?",
    "prochains? rendez-vous",
    "prochains? [ée]v[éè]nements?",
    "financial calendar",
    "financial agenda",
    "next publications?",
    "next financial (?:publication|release|communication)s?",
    "upcoming (?:events|publications)",
    "forthcoming (?:events|publications)",
    "investor calendar",
  ].join("|"),
  "gi"
);

/**
 * Ce qui referme un encadré d'agenda. Sans cette borne, la dernière ligne de
 * l'encadré absorbait le pied de page (« Communiqué de presse… À propos de
 * Vusion… ») dans son libellé.
 *
 * Pas de `\b` ici : en JavaScript, il ne voit pas de frontière de mot devant
 * une lettre accentuée, et « À propos de DLSI » passait au travers.
 */
const MOTIF_FIN_ENCADRE =
  /(?<![a-zà-ÿ])(?:à propos d|a propos d|about [A-Z]|contacts?(?![a-zà-ÿ])|relations? investisseurs|investor relations|avertissement|disclaimer|communiqué de presse|press release)/i;

/** Puces et tirets qui séparent les lignes d'un encadré. */
const SEPARATEUR_LIGNES = /\s*(?:[•›▪►■●◦|]|\s[–—]\s|\s-\s)\s*/;

/**
 * Une date SANS année n'est pas lue (on ne choisit pas l'année à la place de
 * la société), mais elle clôt quand même une ligne. Sans cela, « Chiffre
 * d'affaires du 3ème trimestre : mercredi 21 octobre (après bourse) Résultats
 * annuels 2026 : 23 février 2027 » (Altarea) donnait un seul libellé
 * contenant les deux lignes.
 */
const DATE_SANS_ANNEE = new RegExp(
  String.raw`(?<![\d/.])\d{1,2}(?:er|re)?\s+(?:${NOMS_MOIS})(?![a-zà-ÿ])(?!\s+20\d\d)`,
  "i"
);

const JOURS = "lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|monday|tuesday|wednesday|thursday|friday";

/** Mention de séance accolée à une date : « (après bourse) », « , avant ouverture ». */
const MOTIF_SEANCE =
  /^\s*(?:\([^)]{0,50}\)|,?\s*(?:avant|après|before|after)\s+(?:la\s+|l'|the\s+)?(?:bourse|ouverture|clôture|market|close|open)\w*(?:\s+(?:de\s+la\s+bourse|des\s+marchés))?)/i;

/** Longueur maximale d'un encadré d'agenda après son titre. */
const LONGUEUR_ENCADRE = 700;

/**
 * Verbes qui annoncent un événement daté.
 *
 * Deux familles, parce que le libellé ne se trouve pas au même endroit :
 *   - voix ACTIVE (« Vusion organisera un Capital Markets Day le… ») : ce
 *     qui est annoncé vient APRÈS le verbe ;
 *   - voix PASSIVE (« Les résultats annuels seront publiés le… ») : ce qui est
 *     annoncé est le SUJET, avant le verbe.
 * Le dividende a ses propres mots, qui suffisent à qualifier la date.
 */
// « tiendra » seul est actif (« la société tiendra son assemblée ») ; dans
// « se tiendra », il est passif. Sans la garde, le verbe actif, reconnu plus
// près de la date, l'emportait et le libellé devenait « le lundi ».
const VERBES_ACTIFS =
  /\b(?:publiera|présentera|organisera|(?<!se )tiendra|communiquera|annoncera|will (?:publish|report|release|announce|present|hold|host))\b/gi;
const VERBES_PASSIFS =
  /\b(?:(?:sera|seront) (?:publi|communiqu|présent|annonc|diffus|dévoil)\w*|se (?:tiendra|tiendront|réunira|réuniront)|aura lieu|auront lieu|will be (?:published|released|reported|announced|presented|held)|will take place)\b/gi;
/**
 * Mots qui datent un dividende. Trois familles : le détachement, le
 * paiement, et la date d'arrêté des positions (« record date »), qu'on
 * reconnaît pour mieux l'ÉCARTER — Schneider écrit « Date de détachement du
 * coupon : 10 mai 2027 Date d'arrêté des positions : 11 mai 2027 », et le
 * 11 mai passait pour un second détachement, le seul mot connu avant lui.
 *
 * Bornes en lookaround et non `\b` : celui-ci ne voit aucune frontière après
 * une lettre accentuée, et « sera versé le » n'était jamais reconnu.
 */
const MOTS_DIVIDENDE = new RegExp(
  "(?<![a-zà-ÿ])(?:" +
    [
      "date de détachement",
      "détachement(?: du (?:coupon|dividende|solde|acompte))?",
      "détachée?s?",
      "ex-dividend(?:e)?(?: date)?",
      "ex-date",
      "mis(?:es?)? en paiement",
      "date de paiement",
      "(?:sera|seront) (?:versée?s?|payée?s?)",
      "versement du (?:dividende|solde|coupon|acompte)",
      "payable",
      "payment date",
      "will be paid",
      "paid on",
      "date d'arrêté(?: des positions)?",
      "arrêté des positions",
      "record date",
      "date d'enregistrement",
    ].join("|") +
    ")(?![a-zà-ÿ])",
  "gi"
);
const DIVIDENDE_ENREGISTREMENT = /arrêté|record date|enregistrement/i;
const DIVIDENDE_PAIEMENT = /paiement|payment|paid|payable|versé|versement|payé/i;

/** Portée, en caractères, entre un verbe d'annonce et sa date. */
const PORTEE_VERBE = 130;

/** Un événement annoncé au-delà de dix-huit mois n'est pas un agenda. */
const HORIZON_JOURS = 548;

const iso = (a, m, j) => `${a}-${String(m).padStart(2, "0")}-${String(j).padStart(2, "0")}`;

function dateValide(annee, mois, jour) {
  if (!(mois >= 1 && mois <= 12 && jour >= 1 && jour <= 31)) return null;
  const d = new Date(Date.UTC(annee, mois - 1, jour));
  // Le 31 avril n'existe pas : `Date` le transformerait en 1er mai.
  return d.getUTCDate() === jour ? iso(annee, mois, jour) : null;
}

/** Date AAAA-MM-JJ d'une correspondance de `MOTIF_DATE`. */
function lireDate(m) {
  if (m[1]) return dateValide(Number(m[3]), MOIS[m[2].toLowerCase()], Number(m[1]));
  if (m[4]) return dateValide(Number(m[6]), MOIS[m[4].toLowerCase()], Number(m[5]));
  return dateValide(Number(m[9]), Number(m[8]), Number(m[7]));
}

/**
 * Texte extrait d'un PDF, rendu lisible ligne à ligne.
 *
 * L'extraction PDF sépare les exposants de leur nombre : « 3ème trimestre »
 * sort en « 3\nème trimestre ». Recollés, ils évitent un libellé tronqué ; le
 * reste des blancs est aplati, car la mise en page n'apporte rien ici.
 */
export function normaliserTexte(brut = "") {
  return (
    String(brut)
      // Certains PDF codent « é » en deux caractères (e + accent combinant) :
      // sans recomposition, « assemblée » ne serait plus reconnue.
      .normalize("NFC")
      .replace(/(\d)\s*\n\s*(er|re|ème|eme|e|nd|st|rd|th)\b/g, "$1$2")
      .replace(/[’`]/g, "'")
      .replace(/\s+/g, " ")
      .trim()
  );
}

/** Ce qui fait d'un « résultat » une publication financière : une période. */
const PERIODE = String.raw`(?:annuels?|semestriels?|trimestriels?|financiers|consolidés|intermédiaires|(?:de\s+l'|d')?exercice|semestre|trimestre|premier|deuxième|second|troisième|quatrième|1er|[1-4](?:e|è|ème|eme)|[STQH][1-4]|9\s+mois|neuf\s+mois|FY)`;

/**
 * Résultats FINANCIERS. Le mot seul ne suffit pas : « OSE annonce les
 * résultats de Topline positifs » est une étude clinique, et la classer en
 * publication de résultats la mettait au calendrier comme une échéance
 * financière. Il faut une période (« annuels », « du T3 », « S1 2026 »).
 */
const RESULTATS = new RegExp(
  [
    String.raw`r[ée]sultats?\s+(?:\S+\s+){0,2}?${PERIODE}(?![a-zà-ÿ])`,
    String.raw`r[ée]sultats?\s+20\d\d`,
    String.raw`^\s*(?:publication\s+des\s+)?r[ée]sultats?\s*$`,
    String.raw`comptes,?\s+(?:annuels|semestriels|consolidés|r[ée]sultats)`,
    String.raw`(?:annual|full[- ]year|half[- ]year|interim|quarterly|first[- ]half|Q[1-4]|H[12]|FY\s?\d{0,4}|20\d\d)\s+(?:20\d\d\s+)?(?:financial\s+)?results`,
    String.raw`results\s+(?:for|of)\s+(?:the\s+)?(?:full|first|second|third|fourth|half|year|quarter|fiscal|20\d\d)`,
    "earnings",
  ].join("|"),
  "i"
);

/**
 * Chiffre d'affaires et activité. « Activité » seul est trop large — « cession
 * de l'activité Automation » n'est pas une publication — il doit être suivi
 * d'une période.
 */
const CHIFFRE_AFFAIRES =
  /chiffre d'affaires|revenues?(?![a-zà-ÿ])|(?<![a-zà-ÿ])sales(?![a-zà-ÿ])|(?<![a-zà-ÿ])ventes(?![a-zà-ÿ])|point d'activit[ée]|activit[ée]\s+(?:(?:du|au|des|de l'|à fin|sur|annuelle|premier|deuxième|troisième|quatrième|T[1-4]|S[12])(?![a-zà-ÿ])|[1-49])|information financi[èe]re trimestrielle|trading update|business update/i;

/**
 * Type d'événement d'après son libellé, dans les catégories du calendrier.
 *
 * L'ordre compte. L'assemblée d'abord : « assemblée générale appelée à voter
 * le dividende » est une assemblée. Le dividende n'est reconnu que par des
 * mots qui désignent une DATE de dividende (détachement, mise en paiement) :
 * « résultats annuels et proposition de dividende » est une publication de
 * résultats.
 */
export function typerLibelle(libelle = "") {
  const t = String(libelle);
  if (
    /assembl[ée]e\s+(?:g[ée]n[ée]rale|des actionnaires)|general meeting|\bAGM\b|shareholders'? meeting/i.test(
      t
    )
  ) {
    return "Assemblée Générale";
  }
  if (
    // « Paiement : 12 mai 2027 » en tête de ligne, dans un encadré d'agenda,
    // désigne le dividende : rien d'autre ne se paie à l'actionnaire.
    /détachement|ex-dividend|ex-date|mise en paiement|paiement du (?:dividende|solde|coupon)|^(?:date de )?(?:paiement|versement)(?![a-zà-ÿ])|dividend payment|acompte sur dividende/i.test(
      t
    )
  ) {
    return "Dividende";
  }
  if (RESULTATS.test(t)) return "Résultats";
  if (CHIFFRE_AFFAIRES.test(t) || /(?<![A-Za-zà-ÿ])CA(?![A-Za-zà-ÿ])/.test(t)) return "Chiffre d'affaires";
  return "Communication";
}

const LIBELLE_PAR_TYPE = {
  "Assemblée Générale": "Assemblée générale",
  Dividende: "Dividende",
  Résultats: "Publication des résultats",
  "Chiffre d'affaires": "Publication du chiffre d'affaires",
  Communication: "Rendez-vous annoncé par la société",
};

/** Mots de liaison et jour de la semaine restés accrochés à la date. */
const FIN_PARASITE = new RegExp(String.raw`(?:[\s:–—\-,;(]+|\s+(?:le|les|du|au|on|the|${JOURS}),?)+$`, "i");

/**
 * Début d'une autre phrase collée au libellé, faute de point dans
 * l'extraction : « Résultats annuels 2026 Toutes les publications auront
 * lieu après la clôture… » (Ateme). Sensible à la casse : c'est la majuscule
 * qui signale la reprise.
 */
const REPRISE_PHRASE =
  /\s(?:Toutes?|Tous|Les|Ces|Cette|All|These|Sous réserve|Note|Contacts?|Informations?)\s/;

/**
 * Nettoie un libellé brut : séparateurs, puces, articles, mots de liaison
 * accrochés à la date (« le lundi », « on »). Une mention de séance en tête —
 * « (après bourse) : Chiffre d'affaires du T3 », « avant bourse : résultats
 * annuels » — passe en fin de libellé.
 */
export function nettoyerLibelle(brut = "") {
  let t = String(brut)
    .replace(/[•›▪►■●◦|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[\s:–—\-,;.]+/, "")
    .replace(FIN_PARASITE, "")
    .trim();

  const parenthese = t.match(/^\(([^)]{1,40})\)\s*[:–—-]?\s*(.+)$/);
  if (parenthese) t = `${parenthese[2]} (${parenthese[1]})`;
  const seance = t.match(
    /^((?:avant|après|before|after)\s+(?:la\s+|l'|the\s+)?(?:bourse|ouverture|clôture|market|close|open)[^:]{0,30}?)\s*:\s*(.+)$/i
  );
  if (seance) t = `${seance[2]} (${seance[1].toLowerCase()})`;

  const reprise = t.slice(10).search(REPRISE_PHRASE);
  if (reprise >= 0) t = t.slice(0, reprise + 10);

  t = t.replace(/^(?:un|une|le|la|les|l'|ses|son|sa|leur|leurs|its|the|an?|our|notre|nos)\s+/i, "").trim();
  if (t.length > 120) t = `${t.slice(0, 117).replace(/\s+\S*$/, "")}…`;
  return t ? t[0].toUpperCase() + t.slice(1) : "";
}

/** Un libellé qui ne contient presque aucune lettre n'en est pas un (« AGM » en est un). */
const estLisible = (t) => (String(t).match(/[a-zà-ÿ]/gi) || []).length >= 3;

/**
 * Le libellé précède-t-il la date dans cet encadré ?
 *
 * La disposition varie d'une société à l'autre : « 18 novembre 2026 : Capital
 * Markets Day » (date puis libellé) ou « Résultats annuels : 18 février
 * 2027 » (libellé puis date). Le séparateur le dit : un deux-points juste
 * AVANT les dates signale le second cas, juste APRÈS le premier ; un tiret ou
 * un « le » comptent moins, ils servent aussi de puce.
 *
 * Ce qui ne départage rien est ignoré : le jour de la semaine (« mardi
 * 9 février ») et la mention de séance (« (avant ouverture de la bourse) »),
 * qui suivent la date dans les deux dispositions — comptée, elle faisait lire
 * l'agenda de Bureau Veritas à l'envers.
 *
 * À égalité seulement, on regarde s'il y a du texte entre le titre de
 * l'encadré et la première date — ce critère seul s'est trompé sur
 * « Prochains évènements dédiés aux investisseurs • 18 novembre… », dont la
 * fin du titre passait pour le premier libellé, décalant tous les autres.
 */
function libelleAvantDate(encadre, dates) {
  const jourEnFin = new RegExp(String.raw`\s*(?:${JOURS}),?\s*$`, "i");
  let avant = 0;
  let apres = 0;
  for (const m of dates) {
    const precede = encadre.slice(0, m.index).replace(jourEnFin, "").trimEnd();
    if (/:$/.test(precede)) avant += 2;
    else if (/[–—-]$|(?<![a-zà-ÿ])(?:le|on)$/i.test(precede)) avant += 1;

    const suit = encadre
      .slice(m.index + m[0].length)
      .replace(MOTIF_SEANCE, "")
      .trimStart();
    if (/^:/.test(suit)) apres += 2;
    else if (/^[–—-]/.test(suit)) apres += 1;
  }
  if (avant !== apres) return avant > apres;

  // Le titre se prolonge parfois d'une année (« Calendrier financier 2026 »)
  // qui n'est pas un libellé.
  const preambule = encadre.slice(0, dates[0].index).replace(/\b20\d\d\b|financière?s?|financial/gi, "");
  return estLisible(preambule);
}

/** Rendez-vous des encadrés d'agenda. */
function lireEncadres(texte) {
  const sortie = [];
  const ancres = [...texte.matchAll(MOTIF_ANCRE)];

  ancres.forEach((ancre, k) => {
    const debut = ancre.index + ancre[0].length;
    let fin = Math.min(texte.length, debut + LONGUEUR_ENCADRE);
    const suivante = ancres[k + 1];
    // Deux encadrés qui se suivent (« Calendrier financier » puis « Prochains
    // évènements ») : le premier s'arrête où commence le second.
    if (suivante && suivante.index < fin) fin = suivante.index;
    const fenetre = texte.slice(debut, fin);
    const coupure = fenetre.slice(15).search(MOTIF_FIN_ENCADRE);
    const encadre = coupure >= 0 ? fenetre.slice(0, coupure + 15) : fenetre;

    const dates = [...encadre.matchAll(MOTIF_DATE)];
    if (dates.length === 0) return;
    const libelleAvant = libelleAvantDate(encadre, dates);

    dates.forEach((m, i) => {
      const date = lireDate(m);
      if (!date) return;
      const finDate = m.index + m[0].length;

      // Le libellé est la ligne la plus PROCHE de la date, du bon côté : la
      // dernière avant elle, ou la première après. Au-delà d'une puce ou
      // d'une fin de phrase commence la ligne voisine — et, avant la date, la
      // mention de séance de la ligne précédente.
      const lignes = (
        libelleAvant
          ? encadre
              .slice(i === 0 ? 0 : dates[i - 1].index + dates[i - 1][0].length, m.index)
              .replace(MOTIF_SEANCE, "")
          : encadre.slice(finDate, dates[i + 1]?.index ?? encadre.length)
      )
        .split(SEPARATEUR_LIGNES)
        .flatMap((l) => l.split(/(?<=[a-zà-ÿ)]{2})\.\s/i))
        .flatMap((l) => l.split(DATE_SANS_ANNEE))
        .filter(estLisible);
      const libelle = nettoyerLibelle(
        // Avant la date, une séance en tête de ligne appartient à la ligne
        // précédente : on la retire au lieu de la déplacer.
        libelleAvant ? (lignes[lignes.length - 1] || "").replace(MOTIF_SEANCE, "") : lignes[0]
      );
      if (!estLisible(libelle)) return;
      // Même règle que dans les phrases : la date d'arrêté des positions
      // n'est pas un rendez-vous de l'actionnaire.
      if (/^(?:date d'arrêté|arrêté des positions|record date|date d'enregistrement)/i.test(libelle)) return;
      sortie.push({ date, type: typerLibelle(libelle), label: libelle, origine: "agenda" });
    });
  });

  return sortie;
}

/** Dernière correspondance d'un motif global dans un texte. */
function derniere(motif, texte) {
  let derniereCorrespondance = null;
  for (const m of texte.matchAll(motif)) derniereCorrespondance = m;
  return derniereCorrespondance;
}

/**
 * Rendez-vous annoncés par une phrase au futur, hors encadré.
 *
 * Pour chaque date du texte, on regarde la proposition qui la précède. Le
 * verbe le plus PROCHE de la date l'emporte : « le détachement interviendra
 * le 8 juin et la mise en paiement le 10 juin » donne deux dates distinctes,
 * chacune avec son propre mot.
 */
function lirePhrases(texte) {
  const sortie = [];
  for (const m of texte.matchAll(MOTIF_DATE)) {
    const date = lireDate(m);
    if (!date) continue;

    // La proposition : depuis la dernière fin de phrase, dans la portée.
    const avantBrut = texte.slice(Math.max(0, m.index - PORTEE_VERBE), m.index);
    const coupe = Math.max(
      avantBrut.lastIndexOf(". "),
      avantBrut.lastIndexOf("• "),
      avantBrut.lastIndexOf("; ")
    );
    const avant = coupe >= 0 ? avantBrut.slice(coupe + 2) : avantBrut;

    const dividende = derniere(MOTS_DIVIDENDE, avant);
    const actif = derniere(VERBES_ACTIFS, avant);
    const passif = derniere(VERBES_PASSIFS, avant);
    const candidats = [dividende, actif, passif].filter(Boolean);
    if (candidats.length === 0) continue;
    const plusProche = candidats.reduce((a, b) => (b.index > a.index ? b : a));

    let type;
    let label;
    if (plusProche === dividende) {
      // La date d'arrêté des positions ne concerne pas l'actionnaire : il a
      // droit au dividende s'il détient le titre la veille du détachement.
      if (DIVIDENDE_ENREGISTREMENT.test(dividende[0])) continue;
      type = "Dividende";
      label = DIVIDENDE_PAIEMENT.test(dividende[0])
        ? "Mise en paiement du dividende"
        : "Détachement du dividende";
    } else if (plusProche === actif) {
      label = nettoyerLibelle(avant.slice(actif.index + actif[0].length));
      type = typerLibelle(label);
    } else {
      // Le sujet commence à la dernière reprise de phrase : un intertitre
      // sans point final (« Résultats du S1'27 Les résultats du S1'27 seront
      // publiés… ») se répétait sinon dans le libellé.
      const sujet = avant.slice(0, passif.index);
      const reprise = derniere(/(?:^|\s)(?:Les|Le|La|L'|Notre|Nos|The|Our)\s/g, sujet);
      label = nettoyerLibelle(reprise ? sujet.slice(reprise.index) : sujet);
      type = typerLibelle(avant);
    }

    if (type === "Assemblée Générale") label = "Assemblée générale";
    if (!estLisible(label)) label = LIBELLE_PAR_TYPE[type];
    sortie.push({ date, type, label, origine: "phrase" });
  }
  return sortie;
}

/**
 * Rendez-vous annoncés par un communiqué, à venir par rapport à `aujourdhui`.
 *
 * @param {string} brut         texte du communiqué (extraction PDF brute)
 * @param {object} contexte
 * @param {string} contexte.publieLe   date du communiqué (AAAA-MM-JJ) : une
 *   date antérieure ou égale ne peut pas être une annonce — c'est un rappel.
 * @param {string} contexte.aujourdhui  date du jour (AAAA-MM-JJ)
 * @returns {Array<{date, type, label, origine}>} triés par date ; un seul
 *   événement par jour et par type, l'encadré primant sur la phrase.
 */
export function lireAgenda(brut, { publieLe = null, aujourdhui } = {}) {
  const texte = normaliserTexte(brut);
  if (!texte || !aujourdhui) return [];

  const plancher = publieLe && publieLe > aujourdhui ? publieLe : aujourdhui;
  const plafond = new Date(Date.parse(`${aujourdhui}T00:00:00Z`) + HORIZON_JOURS * 86400000)
    .toISOString()
    .slice(0, 10);

  const parCle = new Map();
  for (const e of [...lireEncadres(texte), ...lirePhrases(texte)]) {
    if (e.date < plancher || e.date > plafond) continue;
    if (publieLe && e.date <= publieLe) continue;
    const cle = `${e.type}|${e.date}`;
    if (!parCle.has(cle)) parCle.set(cle, e);
  }
  return [...parCle.values()].sort((a, b) => a.date.localeCompare(b.date));
}
