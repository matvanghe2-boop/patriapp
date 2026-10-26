/**
 * Compte courant : ce que l'application déduit des opérations importées.
 *
 * Tout ce module raisonne en CENTIMES entiers (voir releveBourso.js) : les
 * soldes recalculés doivent retomber exactement sur ceux de la banque, et
 * c'est précisément l'égalité exacte qui permet de détecter une opération
 * manquante ou en double.
 *
 * Trois couches, de la plus sûre à la plus interprétative :
 *  1. le relevé tel que la banque l'a écrit (dates, montants, libellés) ;
 *  2. sa LECTURE : type d'opération, marchand, contrepartie, motif ;
 *  3. son CLASSEMENT dans une catégorie de budget — une proposition, que
 *     l'utilisateur corrige, et dont la correction prime toujours.
 */

// ─── Catégories ──────────────────────────────────────────────────────────────

/**
 * `famille` décide de la place d'une opération dans le budget :
 *  · `depense` / `revenu` — ce qui sort du foyer ou y entre ;
 *  · `interne` — l'argent qui change seulement de poche (vers un livret, un
 *    PEA, un autre compte à son nom). Le compter comme une dépense ferait
 *    passer chaque mise de côté pour un trou dans le budget.
 */
export const CATEGORIES = [
  { id: "courses", libelle: "Courses", famille: "depense" },
  { id: "restauration", libelle: "Restauration", famille: "depense" },
  { id: "transport", libelle: "Transport", famille: "depense" },
  { id: "logement", libelle: "Logement", famille: "depense" },
  { id: "factures", libelle: "Énergie & factures", famille: "depense" },
  { id: "telecom", libelle: "Téléphone & internet", famille: "depense" },
  { id: "abonnements", libelle: "Abonnements", famille: "depense" },
  { id: "shopping", libelle: "Shopping", famille: "depense" },
  { id: "loisirs", libelle: "Loisirs & sorties", famille: "depense" },
  { id: "voyages", libelle: "Voyages", famille: "depense" },
  { id: "sport", libelle: "Sport", famille: "depense" },
  { id: "sante", libelle: "Santé", famille: "depense" },
  { id: "jeux", libelle: "Jeux d'argent", famille: "depense" },
  { id: "retraits", libelle: "Retraits d'espèces", famille: "depense" },
  { id: "frais", libelle: "Frais bancaires", famille: "depense" },
  { id: "impots", libelle: "Impôts & taxes", famille: "depense" },
  { id: "virements-emis", libelle: "Virements envoyés", famille: "depense" },
  { id: "autres-depenses", libelle: "Autres dépenses", famille: "depense" },
  { id: "salaire", libelle: "Salaire", famille: "revenu" },
  // Jamais attribuée d'office : rien dans un libellé ne dit qu'un virement
  // vient d'un parent. Elle s'obtient par une règle sur la personne.
  { id: "aide-familiale", libelle: "Aide familiale", famille: "revenu" },
  { id: "aides", libelle: "Aides & allocations", famille: "revenu" },
  { id: "remboursements", libelle: "Remboursements", famille: "revenu" },
  { id: "virements-recus", libelle: "Virements reçus", famille: "revenu" },
  { id: "autres-revenus", libelle: "Autres revenus", famille: "revenu" },
  { id: "entre-mes-comptes", libelle: "Entre mes comptes", famille: "interne" },
  { id: "epargne", libelle: "Épargne & placements", famille: "interne" },
];

const PAR_ID = new Map(CATEGORIES.map((c) => [c.id, c]));

/** Catégorie par identifiant ; une catégorie inconnue retombe sur « Autres ». */
export function categorie(id) {
  return PAR_ID.get(id) || PAR_ID.get("autres-depenses");
}

// ─── Lecture du libellé ──────────────────────────────────────────────────────

/** Majuscules sans accents ni ponctuation superflue : la forme de comparaison. */
export function normaliser(texte) {
  return String(texte ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9'&*.\- ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const CIVILITES = new Set(["M", "MR", "MME", "MLLE", "MLE", "MONSIEUR", "MADAME"]);

function sansCivilite(nom) {
  const mots = String(nom ?? "").trim().split(/\s+/).filter(Boolean);
  while (mots.length > 1 && CIVILITES.has(normaliser(mots[0]).replace(/\./g, ""))) mots.shift();
  return mots.join(" ");
}

// Enseignes dont le libellé bancaire est illisible tel quel.
const ENSEIGNES = [
  [/^MC ?DONALD'?S?\b/, "McDonald's"],
  [/^BK\b/, "Burger King"],
  [/^CARREFOURMARKET\b/, "Carrefour Market"],
  [/^E\.?LECLERC\b/, "E.Leclerc"],
  [/^AMAZON|^AMZN/, "Amazon"],
  [/^UBER \*?EATS/, "Uber Eats"],
  [/^SNCF/, "SNCF"],
];

/**
 * Nom d'affichage : « LEROY MERLIN » → « Leroy Merlin ».
 *
 * Les jetons qui contiennent des chiffres sont des numéros de magasin ou de
 * terminal (« BK K0123 VILLENEUVE 2 ») : ils sont retirés, sauf s'il ne resterait
 * plus rien.
 */
export function nomLisible(brut) {
  const n = normaliser(brut);
  for (const [motif, nom] of ENSEIGNES) {
    if (motif.test(n)) {
      const suite = n.replace(motif, "").trim().split(" ").filter((m) => m && !/\d/.test(m));
      return [nom, ...suite.map(casse)].join(" ").trim();
    }
  }
  const mots = String(brut ?? "").trim().split(/\s+/).filter(Boolean);
  const sansNumeros = mots.filter((m) => !/\d/.test(m));
  return (sansNumeros.length > 0 ? sansNumeros : mots).map(casse).join(" ");
}

function casse(mot) {
  return mot
    .toLowerCase()
    .replace(/(^|[\s'’\-.])(\p{L})/gu, (_, sep, lettre) => sep + lettre.toUpperCase());
}

const EST_REFERENCE = /^R[ÉÈEéèe]f\b/i;
const EST_MANDAT = /^RUM\b/i;
const EST_PERIODE = /^\d{2}-\d{2}-\d{4}\s*\/\s*\d{2}-\d{2}-\d{4}$/;
const EST_DONNEUR = /^Vir(?:\.|ement)?\s+de\b/i;
// Un jeton seul, long, mêlant lettres et chiffres — ou un long numéro — : un
// identifiant technique, pas un motif.
const EST_IDENTIFIANT = (l) =>
  !/\s/.test(l) && ((l.length >= 10 && /\d/.test(l) && /[A-Z]/i.test(l)) || /^\d{6,}$/.test(l));

// Nom de personne : un à quatre mots à majuscule initiale, dont le dernier —
// le nom de famille — entièrement en capitales (« Jean DUPONT », « MME CLAIRE
// PETIT »). C'est ce qui distingue « Vir PEL de Jean DUPONT » d'un motif comme
// « Virement loyer de juin ».
const NOM = "(?:[A-ZÀ-Ý][\\p{L}'-]*\\s+){0,3}[A-ZÀ-Ý][A-ZÀ-Ý'-]+";
const VIR_DE = new RegExp(`^Vir(?:ement|\\.)?\\s+(?:(.*?)\\s+)?de\\s+(${NOM})$`, "u");
// « Virement train Jean DUPONT » : un motif, puis « Prénom NOM ».
const VIR_MOTIF_NOM = /^Vir(?:ement|\.)?\s+(.+?)\s+([A-ZÀ-Ý][\p{Ll}'-]+(?:[\s-][A-ZÀ-Ý][\p{Ll}'-]+)?\s+[A-ZÀ-Ý][A-ZÀ-Ý'-]+)$/u;

/**
 * Lecture d'une opération : son type, son titre, sa contrepartie, son motif.
 *
 * Calée sur les libellés BoursoBank (« CARTE 05/05/26 … CB*1234 », « PRLV
 * SEPA … », « VIR INST … », « VIR SEPA … »), qui reprennent les préfixes
 * normalisés communs aux banques françaises.
 */
export function analyserOperation(op) {
  const libelle = String(op?.libelle ?? "").replace(/\s+/g, " ").trim();
  const complements = (op?.complements || []).map((l) => String(l).trim()).filter(Boolean);
  const reference =
    complements.map((l) => l.match(/^R[ÉÈEéèe]f\s*:?\s*(\S+)/i)?.[1]).find(Boolean) || null;

  let type = "autre";
  let titreBrut = libelle;
  let contrepartie = null;
  let dateAchat = null;
  // Motif écrit dans le libellé lui-même (« Vir PEL de … », « Virement train … »).
  let motifLibelle = null;

  const carte = libelle.match(/^CARTE\s+(\d{2})\/(\d{2})\/(\d{2})\s+(.*?)(?:\s+CB\*\d{4})?$/i);
  const prlv = libelle.match(/^PRLV\s+(?:SEPA\s+)?(.+)$/i);
  const vir = libelle.match(/^VIR(?:EMENT)?\s+(?:(?:SEPA|INST)\s+)?(.+)$/i);

  if (carte) {
    type = "carte";
    dateAchat = `20${carte[3]}-${carte[2]}-${carte[1]}`;
    titreBrut = carte[4] || libelle;
  } else if (/^RETRAIT\b/i.test(libelle)) {
    type = "retrait";
    titreBrut = "Retrait d'espèces";
  } else if (prlv) {
    type = "prelevement";
    contrepartie = prlv[1];
    titreBrut = prlv[1];
  } else if (vir) {
    type = "virement";
    const reste = vir[1];
    const de = reste.match(VIR_DE);
    const motifNom = reste.match(VIR_MOTIF_NOM);
    if (/^Virement\s+depuis\s+\S+$/i.test(reste)) {
      // « Virement depuis BoursoBank » : le bénéficiaire est la ligne suivante.
      contrepartie =
        complements.find((l) => !EST_REFERENCE.test(l) && !EST_IDENTIFIANT(l) && !EST_DONNEUR.test(l)) || null;
      titreBrut = contrepartie || reste;
    } else if (de || motifNom) {
      // La contrepartie devient le titre quel que soit le motif : tous les
      // virements d'une même personne se regroupent sous une seule clé, et
      // une seule règle de classement les couvre.
      const [, motif, nom] = de || motifNom;
      contrepartie = nom;
      titreBrut = nom;
      motifLibelle = motif?.trim() || null;
    } else if (/^Vir(?:ement|\.)?\s+/i.test(reste)) {
      // Motif et nom mêlés sans forme reconnaissable : on garde le libellé
      // entier plutôt que de deviner où finit l'un et où commence l'autre.
      titreBrut = reste;
    } else {
      contrepartie = reste;
      titreBrut = reste;
    }
  } else if (/^(CHQ|CHEQUE|REMISE\s+CH)/i.test(libelle)) {
    type = "cheque";
  } else if (/^(COTISATION|FRAIS|COMMISSION|AGIOS|INTERETS?\s+DEBIT)/i.test(normaliser(libelle))) {
    type = "frais";
  }

  if (contrepartie) contrepartie = sansCivilite(contrepartie);
  const cleContrepartie = contrepartie ? normaliser(contrepartie) : null;

  // Le motif est la ligne de complément qui n'est ni une référence, ni un
  // mandat, ni le rappel du donneur d'ordre, ni le nom déjà affiché.
  const motif =
    type === "carte" || type === "prelevement"
      ? null
      : complements.find(
          (l) =>
            !EST_REFERENCE.test(l) &&
            !EST_MANDAT.test(l) &&
            !EST_PERIODE.test(l) &&
            !EST_DONNEUR.test(l) &&
            !EST_IDENTIFIANT(l) &&
            normaliser(sansCivilite(l)) !== cleContrepartie &&
            !normaliser(libelle).includes(normaliser(l))
        ) || motifLibelle;

  const titre = type === "retrait" ? titreBrut : nomLisible(sansCivilite(titreBrut));
  return {
    type,
    titre,
    contrepartie: contrepartie ? nomLisible(contrepartie) : null,
    motif,
    reference,
    dateAchat,
    // Clé de regroupement : c'est sur elle que porte une règle « toujours
    // classer X en Y ». Le titre lisible est stable d'un mois à l'autre, là où
    // le libellé brut change avec la date d'achat.
    cle: normaliser(titre),
  };
}

export const LIBELLES_TYPE = {
  carte: "Carte",
  prelevement: "Prélèvement",
  virement: "Virement",
  retrait: "Retrait",
  cheque: "Chèque",
  frais: "Frais",
  autre: "Opération",
};

// ─── Classement ──────────────────────────────────────────────────────────────

/**
 * Mots-clés par catégorie, testés sur le libellé, la contrepartie et les
 * compléments normalisés. L'ordre compte : la première catégorie qui
 * correspond l'emporte.
 */
const MOTS_CLES = [
  ["jeux", ["WINAMAX", "BETCLIC", "UNIBET", "PMU", "FDJ", "PARIONS", "ZEBET", "POKERSTARS", "BWIN"]],
  ["epargne", ["LIVRET", "LDDS", "PEL", "ASSURANCE VIE", "VERSEMENT PEA"]],
  ["salaire", ["SALAIRE", "PAIE", "REMUNERATION"]],
  ["aides", ["CAF", "FRANCE TRAVAIL", "POLE EMPLOI", "CROUS", "PRIME ACTIVITE", "BOURSE ETUDIANT"]],
  ["remboursements", ["RBST", "REMBOURSEMENT", "REMB", "CPAM", "AMELI", "MUTUELLE"]],
  ["impots", ["DGFIP", "IMPOT", "TRESOR PUBLIC", "AMENDE", "ANTAI"]],
  ["telecom", ["FREE MOBILE", "FREE TELECOM", "ORANGE", "SFR", "BOUYGUES", "SOSH", "B&YOU"]],
  ["factures", ["EDF", "ENGIE", "EKWATEUR", "VEOLIA", "SUEZ", "ENI GAS", "OHM ENERGIE"]],
  ["abonnements", [
    "NETFLIX", "SPOTIFY", "DISNEY", "DEEZER", "CANAL", "PRIME VIDEO", "AMAZON PRIME", "APPLE.COM",
    "YOUTUBE", "PLAYSTATION", "XBOX", "OPENAI", "CHATGPT", "ANTHROPIC", "ADOBE", "MICROSOFT",
  ]],
  ["sport", ["BASIC FIT", "BASIC-FIT", "FITNESS PARK", "KEEP COOL", "DECATHLON", "INTERSPORT", "GO SPORT"]],
  ["courses", [
    "CARREFOUR", "LECLERC", "AUCHAN", "LIDL", "ALDI", "INTERMARCHE", "MONOPRIX", "FRANPRIX", "CASINO",
    "SUPER U", "HYPER U", "U EXPRESS", "CORA", "NETTO", "LEADER PRICE", "GRAND FRAIS", "PICARD", "BIOCOOP",
    "SPAR", "PROXI", "VIVAL",
  ]],
  ["restauration", [
    "MCDONALD", "BURGER KING", "KFC", "QUICK", "SUBWAY", "DOMINO", "PIZZA", "UBER EATS", "DELIVEROO",
    "JUST EAT", "STARBUCKS", "BRIOCHE DOREE", "TACOS", "RESTAURANT", "BRASSERIE", "BOULANGERIE", "SUSHI",
    "BURGER", "KEBAB", "CHICKEN", "SNACK", "FOOD", "CREPERIE",
  ]],
  ["transport", [
    "SNCF", "OUIGO", "RATP", "NAVIGO", "ILEVIA", "TOTALENERGIES", "TOTAL ", "ESSO", "SHELL", "AVIA",
    "UBER", "BOLT", "HEETCH", "BLABLACAR", "PEAGE", "SANEF", "APRR", "VINCI AUTOROUTES", "PARKING",
  ]],
  ["voyages", [
    "HOMAIR", "AIRBNB", "BOOKING", "HOTEL", "CAMPING", "RYANAIR", "EASYJET", "AIR FRANCE", "TRANSAVIA",
    "VOLOTEA", "EUROSTAR", "FLIXBUS",
  ]],
  ["loisirs", [
    "LASER GAME", "BOWLING", "CINEMA", "UGC", "PATHE", "GAUMONT", "KINEPOLIS", "CGR", "TICKETMASTER",
    "STEAM", "KARTING", "ESCAPE GAME",
  ]],
  ["shopping", [
    "AMAZON", "FNAC", "DARTY", "CDISCOUNT", "ZALANDO", "SHEIN", "ACTION", "IKEA", "LEROY MERLIN",
    "CASTORAMA", "BOULANGER", "ZARA", "KIABI", "PRIMARK", "VINTED", "H&M",
  ]],
  ["sante", ["PHARMACIE", "PHARMA", "DOCTOLIB", "MEDECIN", "DENTISTE", "OPTICIEN", "KRYS", "AFFLELOU"]],
  ["frais", ["COTISATION", "COMMISSION", "AGIOS", "FRAIS BANCAIRES"]],
];

const MOTIFS = MOTS_CLES.map(([id, mots]) => [
  id,
  new RegExp(`(?:^|[^A-Z0-9])(?:${mots.map((m) => m.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?:$|[^A-Z0-9])`),
]);

/**
 * Le virement est-il fait entre deux comptes du titulaire ?
 *
 * Vrai si TOUS les mots du nom du titulaire figurent dans la contrepartie :
 * « VANDAMME LUCAS » reconnaît « M. Lucas Vandamme », mais pas « Jean
 * Vandamme », qui est un autre membre de la famille.
 */
export function estEntreMesComptes(analyse, titulaire) {
  if (!titulaire || !analyse?.contrepartie || analyse.type !== "virement") return false;
  const mots = normaliser(titulaire).split(" ").filter((m) => m.length >= 2);
  if (mots.length < 2) return false;
  const cible = new Set(normaliser(analyse.contrepartie).split(" "));
  return mots.every((m) => cible.has(m));
}

/**
 * Catégorie proposée pour une opération.
 *
 * Ordre de priorité : le choix fait à la main sur CETTE opération, puis une
 * règle de l'utilisateur pour ce marchand ou cette contrepartie, puis un
 * virement entre ses propres comptes, puis les mots-clés, et enfin une
 * catégorie par défaut selon le type et le sens.
 */
export function categoriser(op, { analyse = analyserOperation(op), regles = [], titulaire = null } = {}) {
  if (op?.categorieManuelle && PAR_ID.has(op.categorieManuelle)) return op.categorieManuelle;

  const regle = (regles || []).find((r) => r.cle === analyse.cle);
  if (regle && PAR_ID.has(regle.categorie)) return regle.categorie;

  if (estEntreMesComptes(analyse, titulaire)) return "entre-mes-comptes";

  const credit = op.montant > 0;
  const texte = ` ${normaliser([op.libelle, analyse.titre, analyse.motif].filter(Boolean).join(" "))} `;
  for (const [id, motif] of MOTIFS) {
    if (!motif.test(texte)) continue;
    const famille = PAR_ID.get(id).famille;
    // Un mot-clé de revenu sur un débit (« REMBOURSEMENT » d'un prêt qu'on
    // fait soi-même) ne doit pas transformer la sortie en entrée.
    if (famille === "revenu" && !credit) continue;
    // « Vir PEL de Jean DUPONT » : le mot PEL ne fait pas d'un virement venu
    // d'une AUTRE personne un simple déplacement entre ses propres comptes —
    // c'est de l'argent qui arrive, et le classer « interne » le faisait
    // disparaître des entrées. Le mot-clé ne compte que s'il désigne la
    // contrepartie elle-même (« VIR SEPA LIVRET A »).
    if (
      famille === "interne" &&
      analyse.type === "virement" &&
      analyse.contrepartie &&
      !motif.test(` ${normaliser(analyse.contrepartie)} `)
    ) {
      continue;
    }
    return id;
  }

  if (analyse.type === "retrait") return "retraits";
  if (analyse.type === "frais") return "frais";
  if (analyse.type === "virement") return credit ? "virements-recus" : "virements-emis";
  return credit ? "autres-revenus" : "autres-depenses";
}

// ─── Import et doublons ──────────────────────────────────────────────────────

/** Identifiant d'un relevé : même compte, même période ⇒ même relevé. */
export function idReleve(releve) {
  return [releve.banque, releve.compte || "?", releve.debut || "?", releve.fin || "?"].join("-");
}

/**
 * Empreintes des opérations d'un lot.
 *
 * Deux opérations identiques le même jour sont parfaitement possibles — deux
 * virements de 100 € de la même personne, deux cafés. Le RANG d'apparition
 * dans le lot entre donc dans l'empreinte : réimporter le même relevé redonne
 * les mêmes rangs, donc les mêmes empreintes, sans jamais fusionner deux
 * opérations réelles.
 */
export function empreintes(operations) {
  const vus = new Map();
  return operations.map((op) => {
    const ref = analyserOperation(op).reference || "";
    const base = [op.date, op.montant, normaliser(op.libelle), ref].join("|");
    const rang = vus.get(base) || 0;
    vus.set(base, rang + 1);
    return `${base}#${rang}`;
  });
}

/**
 * Prépare l'import d'un relevé lu : ce qui est nouveau, ce qui est déjà là.
 *
 * Ne modifie rien : l'écran montre ce bilan AVANT toute écriture, et
 * l'utilisateur choisit de confirmer ou non.
 */
export function preparerImport(releveLu, { operations = [], releves = [] } = {}, { fichier = null, maintenant = new Date() } = {}) {
  const id = idReleve(releveLu);
  const dejaLa = new Set(operations.map((o) => o.empreinte));
  const cles = empreintes(releveLu.operations);
  const nouvelles = [];
  let doublons = 0;

  releveLu.operations.forEach((op, i) => {
    if (dejaLa.has(cles[i])) {
      doublons += 1;
      return;
    }
    nouvelles.push({
      id: `${id}:${i}`,
      empreinte: cles[i],
      releveId: id,
      ordre: op.ordre ?? i,
      date: op.date,
      dateValeur: op.dateValeur,
      montant: op.montant,
      libelle: op.libelle,
      complements: op.complements || [],
    });
  });

  const releve = {
    id,
    banque: releveLu.banque,
    compte: releveLu.compte,
    titulaire: releveLu.titulaire,
    debut: releveLu.debut,
    fin: releveLu.fin,
    soldeDebut: releveLu.soldeDebut,
    soldeFin: releveLu.soldeFin,
    nbOperations: releveLu.operations.length,
    controleOk: releveLu.controle?.ok ?? false,
    ecart: releveLu.controle?.ecart ?? null,
    fichier,
    importeLe: maintenant.toISOString(),
  };

  return { releve, nouvelles, doublons, releveDejaImporte: releves.some((r) => r.id === id) };
}

/**
 * Prépare un lot de plusieurs fichiers, chacun en tenant compte des
 * précédents : choisir deux fois le même relevé dans la même sélection ne doit
 * pas doubler ses opérations. Les fichiers illisibles sont gardés tels quels
 * (`{ fichier, erreur }`) pour être affichés.
 */
export function preparerLots(resultats, existant = {}) {
  let cumul = { operations: existant.operations || [], releves: existant.releves || [] };
  const lots = [];
  for (const r of resultats || []) {
    if (r.erreur) {
      lots.push(r);
      continue;
    }
    const lot = preparerImport(r.releve, cumul, { fichier: r.fichier });
    cumul = appliquerImport(lot, cumul);
    lots.push({ ...r, lot });
  }
  return lots;
}

/** Applique un import préparé : renvoie les nouvelles listes, sans muter. */
export function appliquerImport({ releve, nouvelles }, { operations = [], releves = [] }) {
  return {
    operations: [...operations, ...nouvelles],
    releves: [...releves.filter((r) => r.id !== releve.id), releve],
  };
}

/** Retire un relevé et toutes ses opérations. */
export function retirerReleve(id, { operations = [], releves = [] }) {
  return {
    operations: operations.filter((o) => o.releveId !== id),
    releves: releves.filter((r) => r.id !== id),
  };
}

// ─── Soldes ──────────────────────────────────────────────────────────────────

/**
 * Solde après chaque opération, comme sur une application bancaire.
 *
 * Calculé relevé par relevé, depuis son solde d'ouverture et dans l'ordre
 * exact du document : ce n'est pas une estimation, c'est le solde que la
 * banque a tenu ligne après ligne.
 */
export function soldesApres(operations, releves) {
  const ouverture = new Map((releves || []).map((r) => [r.id, r.soldeDebut]));
  const parReleve = new Map();
  for (const op of operations || []) {
    if (!parReleve.has(op.releveId)) parReleve.set(op.releveId, []);
    parReleve.get(op.releveId).push(op);
  }
  const soldes = new Map();
  for (const [id, ops] of parReleve) {
    let solde = ouverture.get(id);
    if (solde == null) continue;
    for (const op of [...ops].sort((a, b) => a.ordre - b.ordre)) {
      solde += op.montant;
      soldes.set(op.id, solde);
    }
  }
  return soldes;
}

/** Dernier solde connu : celui du relevé le plus récent. */
export function soldeActuel(releves) {
  const dernier = [...(releves || [])]
    .filter((r) => r.soldeFin != null && r.fin)
    .sort((a, b) => a.fin.localeCompare(b.fin))
    .pop();
  return dernier ? { solde: dernier.soldeFin, date: dernier.fin, releve: dernier } : null;
}

/**
 * Solde en fin de journée, pour la courbe : un point par jour où le compte a
 * bougé, plus l'ouverture de chaque relevé.
 */
export function serieSolde(operations, releves) {
  const soldes = soldesApres(operations, releves);
  const parJour = new Map();
  for (const r of releves || []) {
    if (r.debut && r.soldeDebut != null && !parJour.has(r.debut)) {
      parJour.set(r.debut, { date: r.debut, solde: r.soldeDebut, ordre: -1 });
    }
  }
  const triees = [...(operations || [])].sort(
    (a, b) => a.date.localeCompare(b.date) || String(a.releveId).localeCompare(String(b.releveId)) || a.ordre - b.ordre
  );
  for (const op of triees) {
    if (!soldes.has(op.id)) continue;
    parJour.set(op.date, { date: op.date, solde: soldes.get(op.id) });
  }
  return [...parJour.values()].sort((a, b) => a.date.localeCompare(b.date)).map(({ date, solde }) => ({ date, solde }));
}

/**
 * Raccords entre relevés successifs.
 *
 * Le solde de clôture d'un relevé doit être le solde d'ouverture du suivant.
 * Quand ce n'est pas le cas, il manque un relevé entre les deux — ou des
 * opérations ont été perdues. On le signale au lieu de tracer une courbe qui
 * relierait les deux bouts comme si de rien n'était.
 */
export function raccordsReleves(releves) {
  const tries = [...(releves || [])].filter((r) => r.debut && r.fin).sort((a, b) => a.debut.localeCompare(b.debut));
  const trous = [];
  for (let i = 1; i < tries.length; i += 1) {
    const avant = tries[i - 1];
    const apres = tries[i];
    if (avant.soldeFin == null || apres.soldeDebut == null) continue;
    if (avant.soldeFin !== apres.soldeDebut) {
      trous.push({ apres: avant.fin, avant: apres.debut, ecart: apres.soldeDebut - avant.soldeFin });
    }
  }
  return trous;
}

// ─── Statistiques ────────────────────────────────────────────────────────────

/** Opérations enrichies de leur lecture et de leur catégorie. */
export function enrichir(operations, { regles = [], titulaire = null } = {}) {
  return (operations || []).map((op) => {
    const analyse = analyserOperation(op);
    const cat = categoriser(op, { analyse, regles, titulaire });
    return { ...op, analyse, categorie: cat, famille: categorie(cat).famille };
  });
}

export const moisDe = (iso) => String(iso).slice(0, 7);

/** Mois couverts, du plus ancien au plus récent (« 2026-05 »). */
export function moisDisponibles(operations) {
  return [...new Set((operations || []).map((o) => moisDe(o.date)))].sort();
}

/**
 * Bilan d'un ensemble d'opérations enrichies (un mois, en général).
 *
 * Les dépenses se lisent par catégorie en montant NET : un remboursement par
 * carte chez le même marchand vient en déduction de la catégorie, au lieu de
 * gonfler les revenus.
 */
export function bilan(enrichies) {
  let entrees = 0;
  let sorties = 0;
  let interneSortant = 0;
  let interneEntrant = 0;
  const parCategorie = new Map();
  const parTitre = new Map();

  for (const op of enrichies || []) {
    if (op.famille === "interne") {
      if (op.montant < 0) interneSortant += -op.montant;
      else interneEntrant += op.montant;
      continue;
    }
    if (op.famille === "depense") {
      sorties -= op.montant;
      parCategorie.set(op.categorie, (parCategorie.get(op.categorie) || 0) - op.montant);
      if (op.montant < 0) {
        const t = parTitre.get(op.analyse.titre) || { titre: op.analyse.titre, montant: 0, nombre: 0, categorie: op.categorie };
        t.montant += -op.montant;
        t.nombre += 1;
        parTitre.set(op.analyse.titre, t);
      }
    } else {
      entrees += op.montant;
    }
  }

  const depensesParCategorie = [...parCategorie.entries()]
    .filter(([, montant]) => montant > 0)
    .map(([id, montant]) => ({ id, libelle: categorie(id).libelle, montant }))
    .sort((a, b) => b.montant - a.montant);

  return {
    entrees,
    sorties,
    net: entrees - sorties,
    interneSortant,
    interneEntrant,
    tauxEpargne: entrees > 0 ? (entrees - sorties) / entrees : null,
    depensesParCategorie,
    principauxPostes: [...parTitre.values()].sort((a, b) => b.montant - a.montant).slice(0, 5),
    nombre: (enrichies || []).length,
  };
}

/** Entrées et sorties mois par mois, hors mouvements entre ses comptes. */
export function parMois(enrichies) {
  const mois = new Map();
  for (const op of enrichies || []) {
    if (op.famille === "interne") continue;
    const m = moisDe(op.date);
    const l = mois.get(m) || { mois: m, entrees: 0, sorties: 0 };
    // Même convention que `bilan` : un remboursement reçu sur une catégorie de
    // dépense réduit les sorties au lieu de compter comme une entrée.
    if (op.famille === "depense") l.sorties -= op.montant;
    else l.entrees += op.montant;
    mois.set(m, l);
  }
  return [...mois.values()].sort((a, b) => a.mois.localeCompare(b.mois)).map((l) => ({ ...l, net: l.entrees - l.sorties }));
}
