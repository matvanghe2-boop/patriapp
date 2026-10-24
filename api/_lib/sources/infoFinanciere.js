/**
 * Source info-financiere.gouv.fr — l'information réglementée des sociétés
 * cotées en France.
 *
 * POURQUOI CETTE SOURCE
 *
 * Yahoo couvre mal tout ce qui est plus petit que le CAC 40. Mesuré le
 * 24 octobre 2026 sur VusionGroup (SBF 120) : aucune date à venir, dernière
 * publication connue le 21 septembre — le chiffre d'affaires du T3, publié le
 * 20 octobre, n'y figurait même pas.
 *
 * Or toute société cotée sur un marché français, Euronext Growth compris, est
 * tenue de déposer son information réglementée auprès d'un diffuseur agréé,
 * et l'État la republie en données ouvertes : c'est info-financiere.gouv.fr,
 * tenu par la DILA pour le compte de l'AMF. On y trouve, le jour même, chaque
 * communiqué de résultats, de chiffre d'affaires, chaque information
 * privilégiée, chaque document d'assemblée — avec le PDF déposé.
 *
 * CE QU'ON EN TIRE
 *
 *  1. Les PUBLICATIONS passées, à date certaine : un fait déposé, pas une
 *     estimation. C'est aussi la catégorie « communiqué » que Yahoo n'a pas.
 *  2. Les RENDEZ-VOUS à venir, lus dans le texte des derniers communiqués
 *     (`agendaCommunique.js`) : la société y annonce elle-même ses prochaines
 *     dates. C'est exactement la source que le catalogue de référence exige,
 *     relevée automatiquement.
 *
 * Ce que la source ne fait pas : deviner. Une société qui n'a pas encore
 * annoncé sa prochaine date n'en a pas ici non plus.
 *
 * CONDITIONS D'USAGE
 *
 * API Opendatasoft publique, sans clé, sous Licence Ouverte. Le jeu de
 * données est interrogé par mnémonique Euronext (« VU » pour VU.PA), seul
 * champ commun avec les symboles de l'application. Tout échec est absorbé :
 * c'est un enrichissement du calendrier, pas une dépendance.
 */

import { cached } from "../http.js";
import { lireAgenda, typerLibelle } from "./agendaCommunique.js";

const URL_DEPOTS =
  "https://www.info-financiere.gouv.fr/api/explore/v2.1/catalog/datasets/flux-amf-new-prod/records";

/** Seul hôte d'où l'on accepte de télécharger un document. */
const HOTE_DOCUMENTS = "fr.ftp.opendatasoft.com";
const CHEMIN_DOCUMENTS = "/datadila/INFOFI/";

// Les dépôts d'une société arrivent au plus quelques fois par semaine.
const CACHE_DEPOTS_MS = 3 * 60 * 60_000;
// Un document déposé ne change jamais : seule la taille du cache le borne.
const CACHE_DOCUMENT_MS = 7 * 24 * 60 * 60_000;

const DELAI_MS = 8000;

/**
 * Un communiqué pèse quelques centaines de kilo-octets. Au-delà de 4 Mo, il
 * s'agit d'un rapport annuel complet : trop lourd à analyser pendant une
 * requête, et ce n'est pas là que les sociétés écrivent leur agenda.
 */
const TAILLE_MAX_DOCUMENT = 4 * 1024 * 1024;
/** L'agenda figure en tête ou en fin de communiqué, rarement après la 20e page. */
const PAGES_MAX = 20;

/** Profondeur des dépôts affichés, alignée sur les autres sources. */
const HISTORIQUE_JOURS = 120;
/**
 * Profondeur des dépôts INTERROGÉS : plus longue, parce que le communiqué
 * qui annonce l'assemblée ou le dividende peut dater de plusieurs mois.
 */
const PROFONDEUR_JOURS = 200;

/** Nombre de communiqués lus par société pour y chercher l'agenda. */
const COMMUNIQUES_LUS = 3;
/** Sociétés traitées de front. */
const CONCURRENCE = 4;
/**
 * Temps accordé à la lecture des PDF pendant une requête de calendrier.
 * Les dépôts eux-mêmes sont toujours rendus ; seul l'agenda d'une société
 * dont les documents tardent est remis à la requête suivante, qui le
 * trouvera en cache.
 */
const BUDGET_AGENDA_MS = 12_000;

/**
 * Sous-types d'information retenus, et ce qu'ils deviennent.
 *
 * Ceux qui manquent sont écartés à dessein : déclarations hebdomadaires de
 * rachat d'actions, nombre de droits de vote, franchissements de seuil.
 * Lectra en dépose plusieurs par semaine ; affichés, ils noyaient les
 * quelques communiqués qui comptent.
 */
const SOUS_TYPES = {
  "Information financière trimestrielle": { famille: "periodique" },
  "Informations privilégiées": { famille: "communique" },
  "Communiqués publiés en période d'offre publique d'acquisition": { famille: "communique" },
  "Rapports financiers et d'audit annuels": { type: "Communication", label: "Rapport financier annuel" },
  "Rapports financiers et d'audit semestriels/examens réduits": {
    type: "Communication",
    label: "Rapport financier semestriel",
  },
  "Modalités de mise à disposition des documents préparatoires à l'AG": {
    type: "Communication",
    label: "Documents préparatoires à l'assemblée générale",
  },
  "Document de référence": { type: "Communication", label: "Document d'enregistrement universel" },
  "Modalités de mise à disposition de document de référence ou de ses actualisations": {
    type: "Communication",
    label: "Document d'enregistrement universel",
  },
  "Modalités de mise à disposition de prospectus": { type: "Communication", label: "Prospectus" },
};

const LIBELLES_GENERIQUES = {
  Résultats: "Communiqué de résultats",
  "Chiffre d'affaires": "Communiqué de chiffre d'affaires",
  Communication: "Communiqué",
};

/**
 * Mnémonique Euronext d'un symbole Yahoo de la place de Paris.
 * « VU.PA » → « VU », « ALKAL.PA » → « ALKAL ». Tout autre symbole → null :
 * la source ne couvre que les émetteurs français.
 *
 * Le motif est aussi une protection : la valeur est insérée dans une requête
 * ODSQL, elle ne doit contenir ni guillemet ni opérateur.
 */
export function mnemonique(symbole) {
  const m = String(symbole || "")
    .toUpperCase()
    .match(/^([A-Z0-9]{1,8})\.PA$/);
  return m ? m[1] : null;
}

/**
 * Le lien d'un dépôt pointe-t-il bien vers l'entrepôt de documents de la
 * DILA ? On ne télécharge rien d'autre : un champ de données ouvertes reste
 * une donnée tierce, et le suivre aveuglément ferait de cette fonction un
 * relais vers n'importe quelle adresse.
 */
export function urlDocumentAutorisee(brut) {
  let u;
  try {
    u = new URL(String(brut));
  } catch {
    return false;
  }
  return (
    u.protocol === "https:" &&
    u.hostname.toLowerCase() === HOTE_DOCUMENTS &&
    u.pathname.startsWith(CHEMIN_DOCUMENTS) &&
    u.pathname.toLowerCase().endsWith(".pdf")
  );
}

/**
 * Titre de dépôt rendu lisible dans une case de calendrier.
 *
 * Le préfixe « NOM DE LA SOCIÉTÉ : » est retiré. Un titre long est coupé à
 * son premier séparateur : « Chiffre d'affaires du 3ème trimestre 2026 -
 * Forte croissance au troisième trimestre, portée par… » dit l'essentiel
 * avant le tiret, le reste est l'accroche du communiqué, que le lien donne.
 */
export function nettoyerTitre(titre, nomSociete = null) {
  let t = String(titre || "")
    .replace(/\s+/g, " ")
    .trim();
  // Le nom de la société en tête, quel que soit le séparateur : « VINCI -
  // 9M 2026… », « Vusion - Forte croissance… ». Reconnu à ce que chaque mot
  // de la tête appartient au nom déposé (« Vusion » pour « VUSIONGROUP ») ou
  // est une forme juridique. « VINCI Airports – Trafic… » garde sa tête :
  // « Airports » dit de quelle filiale il s'agit.
  const tete = t.match(/^([A-Za-zÀ-ÿ][^:–—-]{1,40}?)\s*(?::|[-–—])\s+(?=\S)/);
  const nom = String(nomSociete || "").toUpperCase().replace(/[^A-ZÀ-Ý]/g, "");
  const motDuNom = (mot) => {
    const m = mot.toUpperCase().replace(/[^A-ZÀ-Ý]/g, "");
    return !m || nom.includes(m) || /^(?:SA|SE|SCA|NV|GROUPE?|GROUP)$/.test(m);
  };
  if (tete && nom && tete[1].split(/\s+/).every(motDuNom)) t = t.slice(tete[0].length);
  else t = t.replace(/^[A-ZÀ-Ý0-9][A-ZÀ-Ý0-9 &'.-]{1,40}\s*:\s+(?=\S)/, "");
  if (t.length > 70) {
    const separateur = t.slice(12).search(/\s[-–—:]\s/);
    if (separateur >= 0 && separateur + 12 <= 90) t = t.slice(0, separateur + 12);
  }
  if (t.length > 140) t = `${t.slice(0, 137).replace(/\s+\S*$/, "")}…`;
  return t ? t[0].toUpperCase() + t.slice(1) : t;
}

/**
 * Un titre qui ne dit rien du contenu : « Informations privilégiées / Autres
 * communiqués » (Sensorion), ou « LECTRA : » sans rien derrière.
 */
function titreGenerique(titre) {
  const t = String(titre || "").trim();
  return (
    !t || /^(?:informations? privilégiées?|inside information)\s*\//i.test(t) || /^[^:]{1,40}:\s*$/.test(t)
  );
}

/**
 * Type d'un dépôt, dans les catégories du calendrier.
 *
 * Un communiqué qui PARLE du dividende ou de l'assemblée n'est pas la date
 * du dividende ou de l'assemblée : l'avis de convocation paraît un mois
 * avant la réunion. Ces communiqués restent donc des « Communication » à
 * leur date de dépôt ; la date de l'événement lui-même, quand le texte la
 * donne, est relevée par la lecture de l'agenda.
 */
function typerDepot(conf, titre) {
  if (conf.type) return conf.type;
  // « Mise en ligne du document Pre-H1 2026 Results Communication » annonce
  // un document préparatoire, pas la publication : le mot « Results » le
  // classait en résultats, un mois avant les vrais. Idem pour l'annonce
  // d'une conférence téléphonique.
  if (
    /^(?:mise en ligne|mise à disposition|availability|disponibilité)\b|conference call|conférence téléphonique|webcast/i.test(
      titre
    )
  ) {
    return "Communication";
  }
  const type = typerLibelle(titre);
  if (conf.famille === "periodique") return type === "Résultats" ? "Résultats" : "Chiffre d'affaires";
  if (type === "Résultats" || type === "Chiffre d'affaires") return type;
  // Un titre sans « résultats » ni « chiffre d'affaires » peut quand même
  // désigner la publication périodique par sa PÉRIODE : « VINCI : Excellente
  // performance économique au S1 2026 » est le communiqué de résultats
  // semestriels. Classé « Communication », il ne rejoignait pas la date de
  // résultats de Yahoo, et la fiche restait sans document. Une assemblée ou
  // un dividende (typés autrement par `typerLibelle`) ne passent pas ici.
  if (type === "Communication") {
    if (MARQUEUR_TRIMESTRE.test(titre)) return "Chiffre d'affaires";
    if (MARQUEUR_SEMESTRE.test(titre)) return "Résultats";
  }
  return "Communication";
}

const MARQUEUR_TRIMESTRE = /(?<![A-Za-z0-9])(?:T[1-4]|Q[1-4]|9M)(?![A-Za-z0-9])|trimestr|9 mois|neuf mois/i;
const MARQUEUR_SEMESTRE = /(?<![A-Za-z0-9])(?:S[12]|H[12])(?![A-Za-z0-9])|semestr/i;

/** Mots d'un communiqué de publication qui ne nomme pas sa période. */
const MOTS_PUBLICATION = /perspectives?|croissance|performance|guidance|outlook|objectifs?/i;

/** Date AAAA-MM-JJ, en heure de Paris, d'un horodatage de dépôt. */
function jourDepot(depot, formaterDate) {
  const ms = Date.parse(depot?.informationdeposee_inf_dat_emt || "");
  return Number.isNaN(ms) ? null : formaterDate(Math.floor(ms / 1000));
}

/**
 * Dépôts d'une seule langue, triés du plus récent au plus ancien.
 *
 * Les sociétés déposent le même communiqué en français et en anglais — à la
 * même minute, ou à quelques jours d'écart (Air Liquide a déposé la version
 * anglaise d'un communiqué deux jours AVANT la française). Dédoublonner par
 * jour ne suffisait donc pas : les versions anglaises sont écartées dès que
 * la société dépose aussi en français. Celles qui ne déposent qu'en anglais
 * restent couvertes.
 */
function trierDepots(depots = []) {
  const francais = (d) => (d?.informationdeposee_inf_lng_inf === "Anglais" ? 1 : 0);
  const deposeEnFrancais = depots.some((d) => d && francais(d) === 0);
  return depots
    .filter((d) => d && (!deposeEnFrancais || francais(d) === 0))
    .sort((a, b) => {
      const jourA = String(a?.informationdeposee_inf_dat_emt || "").slice(0, 10);
      const jourB = String(b?.informationdeposee_inf_dat_emt || "").slice(0, 10);
      if (jourA !== jourB) return jourB.localeCompare(jourA);
      return francais(a) - francais(b);
    });
}

/**
 * Dépôts convertis en événements de calendrier, un par jour et par type.
 * @param {Array} depots  lignes brutes du jeu de données
 */
export function evenementsDepots(depots, symbole, { formaterDate, aujourdhui }) {
  const plancher = new Date(Date.parse(`${aujourdhui}T00:00:00Z`) - HISTORIQUE_JOURS * 86400000)
    .toISOString()
    .slice(0, 10);
  const parCle = new Map();

  for (const depot of trierDepots(depots)) {
    const conf = SOUS_TYPES[depot?.sous_type_d_information];
    if (!conf) continue;
    const date = jourDepot(depot, formaterDate);
    if (!date || date < plancher) continue;

    const titre = depot.informationdeposee_inf_tit_inf;
    const type = typerDepot(conf, titre);
    const cle = `${type}|${date}`;
    if (parCle.has(cle)) continue;

    parCle.set(cle, {
      ticker: symbole,
      name: depot.identificationsociete_iso_nom_soc || symbole,
      type,
      date,
      label: conf.label || (titreGenerique(titre) ? LIBELLES_GENERIQUES[type] : nettoyerTitre(titre, depot.identificationsociete_iso_nom_soc)),
      // Un dépôt réglementaire est un fait daté : confirmé par construction.
      statut: "confirme",
      fournisseur: "info-financiere",
      lien: urlDocumentAutorisee(depot.url_de_recuperation) ? depot.url_de_recuperation : null,
    });
  }
  return [...parCle.values()];
}

/**
 * Les communiqués où chercher l'agenda : les plus récents de ceux qui en
 * portent un d'ordinaire — publications périodiques, communiqués de
 * résultats ou d'activité, documents d'assemblée, annonces de calendrier.
 * Une seule langue par jour : la version anglaise répète la française.
 */
export function communiquesAgenda(depots, { limite = COMMUNIQUES_LUS } = {}) {
  const retenus = [];
  const joursVus = new Set();

  for (const depot of trierDepots(depots)) {
    if (!urlDocumentAutorisee(depot?.url_de_recuperation)) continue;
    const sousType = depot.sous_type_d_information;
    const titre = String(depot.informationdeposee_inf_tit_inf || "");

    const pertinent =
      sousType === "Information financière trimestrielle" ||
      sousType === "Modalités de mise à disposition des documents préparatoires à l'AG" ||
      (SOUS_TYPES[sousType]?.famille === "communique" &&
        (["Résultats", "Chiffre d'affaires"].includes(typerLibelle(titre)) ||
          // « LECTRA : Premier semestre 2026 : amélioration… » est un
          // communiqué de résultats qui ne contient pas le mot.
          /trimestre|semestre|exercice|annuel|quarter|half-year|full-year|\b[TSQH][1-4]\b/i.test(titre) ||
          /calendrier|agenda|calendar|assembl|meeting|dividende|dividend/i.test(titre)));
    if (!pertinent) continue;

    const jour = String(depot.informationdeposee_inf_dat_emt || "").slice(0, 10);
    const cle = `${jour}|${sousType}`;
    if (joursVus.has(cle)) continue;
    joursVus.add(cle);

    retenus.push(depot);
    if (retenus.length >= limite) break;
  }
  return retenus;
}

/**
 * Réunit les agendas de plusieurs communiqués, du plus RÉCENT au plus ancien.
 *
 * Une société qui décale une date l'écrit dans son communiqué suivant ;
 * l'ancien continue d'annoncer l'ancienne date. On garde donc l'agenda le
 * plus récent tel quel, et des communiqués plus anciens seulement les types
 * d'événement qu'il ne mentionne pas — sans quoi une date déplacée
 * apparaîtrait deux fois, l'ancienne passant pour vraie.
 */
export function combinerAgendas(agendas = []) {
  const typesCouverts = new Set();
  const sortie = [];
  for (const agenda of agendas) {
    const typesDeCeCommunique = new Set();
    for (const e of agenda) {
      if (typesCouverts.has(e.type)) continue;
      sortie.push(e);
      typesDeCeCommunique.add(e.type);
    }
    typesDeCeCommunique.forEach((t) => typesCouverts.add(t));
  }
  return sortie;
}

async function lireAvecDelai(url, options = {}) {
  const controleur = new AbortController();
  const minuteur = setTimeout(() => controleur.abort(), DELAI_MS);
  try {
    // Aucune redirection suivie : les deux hôtes répondent directement, et
    // une redirection est précisément ce qui ferait sortir de la liste
    // blanche une URL qui y était entrée.
    const r = await fetch(url, { ...options, redirect: "error", signal: controleur.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r;
  } finally {
    clearTimeout(minuteur);
  }
}

/** Dépôts récents d'une société, par mnémonique. */
async function lireDepots(mnemo, depuis, jusqua = null) {
  // Le filtre se fait côté serveur : sans lui, les déclarations de rachat
  // occupaient la page de résultats et repoussaient les communiqués au-delà.
  const sousTypes = Object.keys(SOUS_TYPES)
    .map((s) => `"${s}"`)
    .join(",");
  const where =
    `identificationsociete_iso_code_tkr_iso_cd_tkr="${mnemo}"` +
    ` and informationdeposee_inf_dat_emt >= "${depuis}"` +
    (jusqua ? ` and informationdeposee_inf_dat_emt < "${jusqua}"` : "") +
    ` and sous_type_d_information in (${sousTypes})`;
  const champs = [
    "informationdeposee_inf_dat_emt",
    "informationdeposee_inf_tit_inf",
    "informationdeposee_inf_lng_inf",
    "sous_type_d_information",
    "identificationsociete_iso_nom_soc",
    "url_de_recuperation",
  ].join(",");
  const url =
    `${URL_DEPOTS}?where=${encodeURIComponent(where)}` +
    `&order_by=${encodeURIComponent("informationdeposee_inf_dat_emt desc")}` +
    `&limit=100&select=${champs}`;
  const r = await lireAvecDelai(url, { headers: { Accept: "application/json" } });
  const data = await r.json();
  return Array.isArray(data?.results) ? data.results : [];
}

const FAMILLE_PUBLICATION = new Set(["Résultats", "Chiffre d'affaires"]);

/** Écart en jours entre deux dates AAAA-MM-JJ. */
const ecartJours = (a, b) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000);

/**
 * Le communiqué déposé qui correspond à un événement, parmi les dépôts
 * d'une société autour de sa date.
 *
 * POURQUOI CHERCHER APRÈS COUP
 *
 * Le calendrier ne rattache un dépôt à un événement que s'ils tombent le
 * même jour avec le même type. Il en reste sans document : une date de
 * résultats Yahoo quand le communiqué, faute du mot « résultats » dans son
 * titre, a été classé « Communication » (Vinci et Capgemini en juillet) ; une
 * publication plus ancienne que l'historique gardé (L'Oréal en février). La
 * fiche de l'événement interroge donc le registre à la demande.
 *
 * On accepte un jour d'écart — un communiqué publié à 17 h 45 est parfois
 * daté du lendemain par l'une ou l'autre source — mais pas n'importe quel
 * document : pour une publication de résultats, un communiqué sur un contrat
 * le même jour serait la mauvaise lecture. Le type doit correspondre, ou au
 * moins appartenir à la même famille.
 */
export function choisirCommunique(depots, { date, type = null, formaterDate }) {
  let meilleur = null;
  let meilleurScore = -1;
  for (const depot of trierDepots(depots)) {
    const conf = SOUS_TYPES[depot?.sous_type_d_information];
    if (!conf || !urlDocumentAutorisee(depot.url_de_recuperation)) continue;
    const jour = jourDepot(depot, formaterDate);
    if (!jour || Math.abs(ecartJours(jour, date)) > 1) continue;

    const titre = depot.informationdeposee_inf_tit_inf;
    const t = typerDepot(conf, titre);
    let pertinence;
    if (conf.type) pertinence = 0; // rapport, documents d'assemblée : pas un communiqué
    else if (type && t === type) pertinence = 3;
    else if (FAMILLE_PUBLICATION.has(type) && FAMILLE_PUBLICATION.has(t)) pertinence = 2;
    // « Capgemini relève ses perspectives pour 2026 », publié le jour même des
    // résultats : c'est leur communiqué, qui ne dit ni « résultats » ni sa
    // période. Le même jour seulement — un jour plus tôt, ce pourrait être
    // une annonce distincte.
    else if (FAMILLE_PUBLICATION.has(type) && jour === date && MOTS_PUBLICATION.test(titre)) pertinence = 2;
    else pertinence = 1;

    // Une publication de résultats ne se lit pas dans un communiqué
    // quelconque du même jour.
    const exigee = FAMILLE_PUBLICATION.has(type) ? 2 : 1;
    if (pertinence < exigee) continue;

    // La pertinence prime, puis la date exacte. À égalité, l'ordre de
    // `trierDepots` (le plus récent, en français) tranche.
    const score = pertinence * 10 + (jour === date ? 1 : 0);
    if (score > meilleurScore) {
      meilleur = { url: depot.url_de_recuperation, titre: nettoyerTitre(titre, depot.identificationsociete_iso_nom_soc), date: jour, type: t };
      meilleurScore = score;
    }
  }
  return meilleur;
}

/**
 * Cherche dans le registre le communiqué d'une société à une date donnée.
 * `null` si la valeur n'est pas parisienne ou si rien ne correspond.
 */
export async function communiqueDuJour(symbole, date, type, { formaterDate, lireDepotsSociete = lireDepots } = {}) {
  const mnemo = mnemonique(symbole);
  if (!mnemo || !/^\d{4}-\d{2}-\d{2}$/.test(String(date)) || typeof formaterDate !== "function") return null;
  const jour = (decalage) => new Date(Date.parse(`${date}T00:00:00Z`) + decalage * 86400000).toISOString().slice(0, 10);
  // Deux jours de part et d'autre en UTC, pour couvrir le jour d'écart toléré
  // une fois les horodatages ramenés à l'heure de Paris.
  const depots = await lireDepotsSociete(mnemo, jour(-2), jour(2));
  return choisirCommunique(depots, { date, type, formaterDate });
}

/**
 * Retire en-têtes et pieds de page, que l'extraction répète à chaque page.
 *
 * Le communiqué de Vusion du 20 octobre en comptait six lignes, six fois :
 * raison sociale, capital, RCS, téléphone… Le texte affiché commençait par
 * là, et le résumé les lisait autant de fois. Une ligne vue au moins trois
 * fois et assez longue pour ne pas être un intitulé de tableau (« Variation
 * (en %) ») est tenue pour un en-tête ; les filets (« __________ ») aussi.
 */
function sansEntetesRepetes(texte) {
  const lignes = texte.split("\n");
  const occurrences = new Map();
  for (const l of lignes) {
    const cle = l.trim();
    if (cle) occurrences.set(cle, (occurrences.get(cle) || 0) + 1);
  }
  return lignes
    .filter((l) => {
      const cle = l.trim();
      if (/^[_\-–—=.\s]{4,}$/.test(cle)) return false;
      return !(cle.length >= 18 && occurrences.get(cle) >= 3);
    })
    .join("\n");
}

/**
 * Texte d'un PDF rendu lisible à l'écran.
 *
 * L'extraction rend une ligne par ligne de MISE EN PAGE : une phrase coupée
 * en trois au fil des colonnes, des exposants séparés de leur nombre
 * (« 3\nème »). On ne garde un retour à la ligne qu'après une fin de phrase,
 * et devant une puce ; tous les autres redeviennent des espaces.
 */
export function texteLisiblePdf(brut = "") {
  const FIN = "\u0000";
  return sansEntetesRepetes(String(brut).normalize("NFC").replace(/\r/g, ""))
    .replace(/(\d)\s*\n\s*(er|re|ème|eme|e|nd|st|rd|th)\b/g, "$1$2")
    .replace(/[ \t\u00a0\u202f]+/g, " ")
    .replace(/([.!?:])[ ]*\n/g, `$1${FIN}`)
    .replace(/\s*\n\s*/g, " ")
    .replaceAll(FIN, "\n")
    .replace(/[ ]*([•▪►■●◼◾▸➢])[ ]*/g, "\n$1 ")
    .replace(/[ ]*\n[ ]*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Texte d'un document déposé (PDF).
 *
 * Exporté pour le résumé de publication, qui lit les mêmes documents. Les
 * gardes sont celles de `parse-pdf.js` : taille bornée AVANT de lancer
 * l'analyse, signature `%PDF-` vérifiée.
 */
export async function texteDocument(url) {
  if (!urlDocumentAutorisee(url)) throw new Error("Document hors de l'entrepôt de la DILA");
  const r = await lireAvecDelai(url, { headers: { Accept: "application/pdf" } });
  const annonce = Number(r.headers.get("content-length") || 0);
  if (annonce > TAILLE_MAX_DOCUMENT) throw new Error("Document trop volumineux");
  const tampon = Buffer.from(await r.arrayBuffer());
  if (tampon.length > TAILLE_MAX_DOCUMENT) throw new Error("Document trop volumineux");
  if (tampon.subarray(0, 5).toString("latin1") !== "%PDF-") throw new Error("Document non PDF");

  // Le module interne, et non le point d'entrée du paquet : celui-ci lance
  // un fichier de démonstration quand il se croit exécuté directement, ce
  // qui arrive selon la façon dont il est chargé. Import différé : seul un
  // calendrier contenant des valeurs françaises paie son chargement.
  const { default: pdfParse } = await import("pdf-parse/lib/pdf-parse.js");
  const { text } = await pdfParse(tampon, { max: PAGES_MAX });
  return text || "";
}

/**
 * Agenda annoncé dans UN communiqué. Mis en cache par document : il ne change
 * jamais. Le filtrage par la date du jour se fait à la lecture, pas avant la
 * mise en cache, pour qu'un résultat caché hier reste juste aujourd'hui.
 */
async function agendaDuCommunique(depot, { formaterDate, aujourdhui, lireTexte }) {
  const publieLe = jourDepot(depot, formaterDate);
  const url = depot.url_de_recuperation;
  const annonces = await cached(`dila:agenda:${url}`, CACHE_DOCUMENT_MS, async () =>
    lireAgenda(await lireTexte(url), { publieLe, aujourdhui: publieLe })
  );
  return annonces.filter((e) => e.date >= aujourdhui).map((e) => ({ ...e, annonceLe: publieLe, lien: url }));
}

/** Promesse bornée dans le temps : `defaut` si elle n'a pas abouti. */
function auPlusTard(promesse, ms, defaut) {
  let minuteur;
  const delai = new Promise((resolve) => {
    minuteur = setTimeout(() => resolve(defaut), Math.max(0, ms));
  });
  return Promise.race([promesse, delai]).finally(() => clearTimeout(minuteur));
}

/** Exécute `tache` sur chaque élément, `limite` à la fois au maximum. */
async function parLots(elements, limite, tache) {
  const sortie = [];
  for (let i = 0; i < elements.length; i += limite) {
    sortie.push(...(await Promise.all(elements.slice(i, i + limite).map(tache))));
  }
  return sortie;
}

/**
 * Événements de calendrier — publications déposées et rendez-vous annoncés —
 * pour une liste de symboles. Seuls les symboles de la place de Paris sont
 * interrogés ; un échec sur l'un d'eux ne fait jamais tomber le lot.
 *
 * `lireDepotsSociete` et `lireTexte` sont injectables pour les tests.
 */
export async function evenementsInfoFinanciere(
  symboles = [],
  {
    formaterDate,
    maintenant = new Date(),
    budgetMs = BUDGET_AGENDA_MS,
    lireDepotsSociete = lireDepots,
    lireTexte = texteDocument,
  } = {}
) {
  const parisiens = symboles.map((s) => [s, mnemonique(s)]).filter(([, m]) => m);
  if (parisiens.length === 0 || typeof formaterDate !== "function") return [];

  const aujourdhui = formaterDate(Math.floor(maintenant.getTime() / 1000));
  const depuis = new Date(maintenant.getTime() - PROFONDEUR_JOURS * 86400000).toISOString().slice(0, 10);
  const echeance = Date.now() + budgetMs;

  const resultats = await parLots(parisiens, CONCURRENCE, async ([symbole, mnemo]) => {
    try {
      const depots = await cached(`dila:depots:${mnemo}`, CACHE_DEPOTS_MS, () =>
        lireDepotsSociete(mnemo, depuis)
      );
      const publications = evenementsDepots(depots, symbole, { formaterDate, aujourdhui });

      const lecture = Promise.all(
        communiquesAgenda(depots).map((d) =>
          agendaDuCommunique(d, { formaterDate, aujourdhui, lireTexte }).catch(() => [])
        )
      ).then(combinerAgendas);
      const annonces = await auPlusTard(lecture, echeance - Date.now(), []);

      const nom = depots[0]?.identificationsociete_iso_nom_soc || symbole;
      const agenda = annonces.map((e) => ({
        ticker: symbole,
        name: nom,
        type: e.type,
        date: e.date,
        label: e.label,
        // Annoncé par la société elle-même dans un communiqué déposé : c'est
        // la définition de « confirmé » qu'applique tout le calendrier.
        statut: "confirme",
        fournisseur: "info-financiere",
        lien: e.lien,
        annonceLe: e.annonceLe,
      }));
      return [...agenda, ...publications];
    } catch {
      return [];
    }
  });
  return resultats.flat();
}
