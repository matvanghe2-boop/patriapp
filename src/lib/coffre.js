import { todayIso, uid } from "./finance";
import { joursEntre, dateLimiteResiliation } from "./abonnements";

/**
 * Coffre à papiers — le modèle (voir COFFRE_SPEC.md, §6 et §7).
 *
 * Tout ce qui se calcule sans interface vit ici : types de documents et délais
 * de rappel, statut d'un document, tri de la liste, recherche, forme des
 * données. Le chiffrement et le stockage des fichiers sont dans
 * `coffreFichiers.js`.
 *
 * La règle délicate est celle des dates : un document n'est pas « à prévoir »
 * la veille de son échéance, mais dès que le délai de son type est entamé —
 * quatre mois avant pour un passeport, parce que les rendez-vous en mairie se
 * prennent des semaines à l'avance. C'est elle que les tests serrent de près.
 */

export const CATEGORIES = [
  { id: "identite", libelle: "Identité" },
  { id: "assurances", libelle: "Assurances" },
  { id: "achats", libelle: "Achats" },
  { id: "logement", libelle: "Logement" },
  { id: "etudes", libelle: "Études" },
  { id: "impots", libelle: "Impôts" },
  { id: "autre", libelle: "Autre" },
];

/**
 * Types de documents. `echeance` est le libellé de la date qui compte (`null` :
 * le type n'en a pas) ; `rappelJours` le délai de rappel par défaut, que les
 * réglages ou le document lui-même peuvent remplacer ; `action` ce qu'il y a à
 * faire quand le rappel tombe — c'est la phrase des rappels d'agenda et du
 * centre « À faire ».
 */
export const TYPES = [
  {
    id: "cni",
    libelle: "Carte d'identité",
    categorie: "identite",
    echeance: "Expire le",
    rappelJours: 120,
    action: "Lancer le renouvellement",
  },
  {
    id: "passeport",
    libelle: "Passeport",
    categorie: "identite",
    echeance: "Expire le",
    rappelJours: 120,
    action: "Lancer le renouvellement",
  },
  {
    id: "permis",
    libelle: "Permis de conduire",
    categorie: "identite",
    echeance: "Fin de validité du titre",
    rappelJours: 90,
    action: "Renouveler le titre",
  },
  { id: "carte_vitale", libelle: "Carte Vitale", categorie: "identite", echeance: null, rappelJours: null },
  {
    id: "identite_autre",
    libelle: "Autre pièce d'identité",
    categorie: "identite",
    echeance: "Expire le",
    rappelJours: 90,
    action: "Lancer le renouvellement",
  },
  {
    id: "contrat_assurance",
    libelle: "Contrat d'assurance ou mutuelle",
    categorie: "assurances",
    echeance: "Échéance annuelle",
    rappelJours: 60,
    recurrence: "annuelle",
    action: "Comparer avant la reconduction",
    // Un contrat a souvent déjà sa date de préavis dans Abonnements : le lier
    // évite un second rappel pour la même échéance (voir `contratLie`).
    liableAbonnements: true,
  },
  {
    id: "attestation_assurance",
    libelle: "Attestation d'assurance",
    categorie: "assurances",
    echeance: "Valable jusqu'au",
    rappelJours: 21,
    action: "Demander la nouvelle attestation",
  },
  {
    id: "tiers_payant",
    libelle: "Carte de tiers payant",
    categorie: "assurances",
    echeance: "Valable jusqu'au",
    rappelJours: 21,
    action: "Demander la nouvelle carte",
  },
  // Garantie légale de conformité : deux ans à compter de la livraison.
  {
    id: "facture",
    libelle: "Facture",
    categorie: "achats",
    echeance: "Fin de garantie",
    rappelJours: 30,
    garantieAns: 2,
    action: "Vérifier l'appareil avant la fin de garantie",
  },
  {
    id: "bail",
    libelle: "Bail",
    categorie: "logement",
    echeance: "Fin du bail",
    rappelJours: 60,
    action: "Renouveler ou donner congé",
    liableAbonnements: true,
  },
  {
    id: "quittance",
    libelle: "Quittance de loyer",
    categorie: "logement",
    echeance: null,
    rappelJours: null,
  },
  {
    id: "etat_des_lieux",
    libelle: "État des lieux",
    categorie: "logement",
    echeance: null,
    rappelJours: null,
  },
  { id: "diplome", libelle: "Diplôme", categorie: "etudes", echeance: null, rappelJours: null },
  { id: "releve_notes", libelle: "Relevé de notes", categorie: "etudes", echeance: null, rappelJours: null },
  {
    id: "certificat_scolarite",
    libelle: "Certificat de scolarité",
    categorie: "etudes",
    echeance: "Valable jusqu'au",
    rappelJours: 21,
    action: "Demander le nouveau certificat",
  },
  {
    id: "avis_imposition",
    libelle: "Avis d'imposition",
    categorie: "impots",
    echeance: null,
    rappelJours: null,
  },
  {
    id: "declaration_impots",
    libelle: "Déclaration de revenus",
    categorie: "impots",
    echeance: null,
    rappelJours: null,
  },
  {
    id: "autre",
    libelle: "Autre document",
    categorie: "autre",
    echeance: "Échéance",
    rappelJours: 30,
    action: "S'en occuper",
  },
];

const TYPES_PAR_ID = Object.fromEntries(TYPES.map((t) => [t.id, t]));

/** Accès sûr à un type : un identifiant inconnu (version plus récente, donnée abîmée) se lit « Autre ». */
export const typeDe = (id) => TYPES_PAR_ID[id] || TYPES_PAR_ID.autre;

export const categorieDe = (id) => CATEGORIES.find((c) => c.id === id) || CATEGORIES[CATEGORIES.length - 1];

/** Statuts affichés, avec l'état de pastille (`PastilleEtat`) qui leur correspond. */
export const STATUTS = {
  aucune: { libelle: "Sans échéance", etat: "neutre" },
  a_jour: { libelle: "À jour", etat: "ok" },
  a_prevoir: { libelle: "À prévoir", etat: "attention" },
  expire: { libelle: "Échu", etat: "critique" },
};

// ─── Fichiers acceptés ──────────────────────────────────────────────────────

/**
 * 20 Mo par fichier : le plafond de l'offre gratuite de Supabase est à 50 Mo,
 * et un scan de papier pèse rarement plus de 2 Mo. La même limite est posée
 * sur le bucket (sql/schema.sql) ; la vérifier ici évite de chiffrer pour rien
 * un fichier que le serveur refuserait.
 */
export const TAILLE_MAX_FICHIER = 20 * 1024 * 1024;

export const FORMATS_ACCEPTES = {
  "application/pdf": "PDF",
  "image/jpeg": "JPEG",
  "image/png": "PNG",
  "image/webp": "WebP",
};

export function formatTaille(octets) {
  const n = Number(octets) || 0;
  if (n < 1024) return `${n} o`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} Ko`;
  return `${(n / (1024 * 1024)).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Mo`;
}

/** Message d'erreur pour un fichier qu'on ne peut pas ranger, `null` s'il convient. */
export function verifierFichier(fichier) {
  if (!fichier) return "Choisis un fichier.";
  if (!FORMATS_ACCEPTES[fichier.type]) return "Format non pris en charge : PDF, JPEG, PNG ou WebP.";
  if (!fichier.size) return "Ce fichier est vide.";
  if (fichier.size > TAILLE_MAX_FICHIER) {
    return `Fichier trop lourd (${formatTaille(fichier.size)}) : 20 Mo au maximum.`;
  }
  return null;
}

// ─── Dates ──────────────────────────────────────────────────────────────────

export const dateValide = (iso) =>
  typeof iso === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(iso) &&
  !Number.isNaN(new Date(`${iso}T00:00:00`).getTime());

/** Ajoute des jours à une date ISO, sur le calendrier local. */
export function ajouterJours(iso, jours) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + jours);
  return todayIso(d);
}

/**
 * Ajoute des années à une date ISO. Un 29 février tombe au 28 les années non
 * bissextiles, au lieu de glisser au 1er mars comme le ferait `setFullYear`.
 */
export function ajouterAns(iso, ans) {
  const [a, m, j] = iso.split("-").map(Number);
  const annee = a + ans;
  const dernierJour = new Date(annee, m, 0).getDate();
  return `${annee}-${String(m).padStart(2, "0")}-${String(Math.min(j, dernierJour)).padStart(2, "0")}`;
}

/**
 * Prochaine échéance d'un document. Pour un contrat reconduit chaque année,
 * une échéance passée avance d'autant d'années qu'il faut. Le calcul repart
 * toujours de la date saisie : un contrat au 29 février retrouve son 29 les
 * années bissextiles.
 */
export function prochaineEcheance(doc, aujourdhui = todayIso()) {
  if (!dateValide(doc?.echeance)) return null;
  if (doc.recurrence !== "annuelle" || doc.echeance >= aujourdhui) return doc.echeance;
  for (let n = 1; n <= 1000; n += 1) {
    const date = ajouterAns(doc.echeance, n);
    if (date >= aujourdhui) return date;
  }
  return null;
}

/** Délai de rappel en jours : celui du document, sinon celui des réglages, sinon celui du type. */
export function delaiRappel(doc, reglages = {}) {
  const propre = doc?.rappelJours;
  if (Number.isFinite(propre) && propre >= 0) return propre;
  const regle = reglages?.delais?.[doc?.type];
  if (Number.isFinite(regle) && regle >= 0) return regle;
  return typeDe(doc?.type).rappelJours ?? null;
}

/**
 * Contrat d'Abonnements auquel un document est lié, s'il existe encore.
 *
 * Un contrat d'assurance ou un bail est souvent déjà suivi dans Abonnements,
 * avec sa date de fin et son préavis. Le lier fait de ces dates la référence :
 * le coffre range le papier, Abonnements garde le rappel, et la même échéance
 * n'est pas signalée deux fois.
 */
export function contratLie(doc, contracts = []) {
  if (!doc?.contratId || !typeDe(doc.type).liableAbonnements) return null;
  return (contracts || []).find((c) => c?.id === doc.contratId) || null;
}

/**
 * Statut d'un document à une date donnée.
 *
 *  · `aucune`    : pas d'échéance ;
 *  · `expire`    : l'échéance est passée (la veille ou avant) ;
 *  · `a_prevoir` : la date de rappel est atteinte, l'échéance est à venir ;
 *  · `a_jour`    : sinon.
 *
 * Avec un contrat lié (voir `contratLie`), l'échéance est sa date de fin et le
 * rappel tombe à sa date limite de résiliation, comme dans Abonnements.
 *
 * @returns {{ statut, echeance, rappel, jours }} `jours` : jours avant l'échéance.
 */
export function statutDocument(doc, reglages, aujourdhui = todayIso(), contrat = null) {
  const parContrat = !!contrat && dateValide(contrat.date_fin);
  const echeance = parContrat ? contrat.date_fin : prochaineEcheance(doc, aujourdhui);
  if (!echeance) return { statut: "aucune", echeance: null, rappel: null, jours: null };
  const jours = joursEntre(aujourdhui, echeance);
  const delai = parContrat ? null : delaiRappel(doc, reglages);
  const rappel = parContrat
    ? dateLimiteResiliation(contrat)
    : delai == null
      ? null
      : ajouterJours(echeance, -delai);
  let statut = "a_jour";
  if (jours < 0) statut = "expire";
  else if (rappel && rappel <= aujourdhui) statut = "a_prevoir";
  return { statut, echeance, rappel, jours };
}

/** « 12 jours », « 3 mois », « 6 ans » — l'ordre de grandeur qui parle, pas le compte exact. */
export function dureeEnClair(jours) {
  const n = Math.abs(jours);
  if (n === 0) return "aujourd'hui";
  if (n < 45) return `${n} jour${n > 1 ? "s" : ""}`;
  if (n < 730) return `${Math.round(n / 30.44)} mois`;
  return `${Math.floor(n / 365.25)} ans`;
}

export const dateFr = (iso) =>
  iso
    ? new Date(`${iso}T00:00:00`).toLocaleDateString("fr-FR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    : "";

/** Phrase courte d'une ligne de la liste : « échéance dans 3 mois », « échu depuis 12 jours »… */
export function echeanceEnClair({ statut, echeance, jours }) {
  if (statut === "aucune") return "";
  if (statut === "expire") return `échu depuis ${dureeEnClair(jours)}`;
  if (statut === "a_prevoir")
    return jours === 0 ? "échéance aujourd'hui" : `échéance dans ${dureeEnClair(jours)}`;
  return `jusqu'au ${dateFr(echeance)}`;
}

/** Fin de garantie proposée pour une facture : date d'achat + durée de garantie du type. */
export function garantieParDefaut(type, dateAchat) {
  const ans = typeDe(type).garantieAns;
  return ans && dateValide(dateAchat) ? ajouterAns(dateAchat, ans) : null;
}

// ─── Liste ──────────────────────────────────────────────────────────────────

const sansAccent = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

/** Documents dont le titre, le type, la catégorie, les notes ou un nom de fichier contiennent tous les mots cherchés. */
export function filtrerDocuments(documents, recherche) {
  const mots = sansAccent(recherche).trim().split(/\s+/).filter(Boolean);
  if (mots.length === 0) return documents;
  return documents.filter((d) => {
    const type = typeDe(d.type);
    const texte = sansAccent(
      [
        d.titre,
        type.libelle,
        categorieDe(type.categorie).libelle,
        d.notes,
        ...(d.fichiers || []).map((f) => f.nom),
      ].join(" ")
    );
    return mots.every((m) => texte.includes(m));
  });
}

/**
 * Organise la liste : ce qui demande d'agir (à prévoir, échu) en tête, par
 * échéance la plus proche ; le reste groupé par catégorie, par titre.
 */
export function organiserDocuments(documents, reglages, aujourdhui = todayIso(), contracts = []) {
  const entrees = documents.map((doc) => ({
    doc,
    ...statutDocument(doc, reglages, aujourdhui, contratLie(doc, contracts)),
  }));
  const aAgir = (e) => e.statut === "a_prevoir" || e.statut === "expire";
  const parTitre = (a, b) => a.doc.titre.localeCompare(b.doc.titre, "fr");

  const aTraiter = entrees
    .filter(aAgir)
    .sort((a, b) => a.echeance.localeCompare(b.echeance) || parTitre(a, b));
  const groupes = CATEGORIES.map((categorie) => ({
    categorie,
    entrees: entrees.filter((e) => !aAgir(e) && typeDe(e.doc.type).categorie === categorie.id).sort(parTitre),
  })).filter((g) => g.entrees.length > 0);

  return { aTraiter, groupes };
}

/** Taille totale des fichiers du coffre (en clair : le chiffrement n'ajoute que 29 octets par fichier). */
export const espaceUtilise = (documents) =>
  documents.reduce(
    (total, d) => total + (d.fichiers || []).reduce((s, f) => s + (Number(f.taille) || 0), 0),
    0
  );

// ─── Rappels hors de l'onglet ───────────────────────────────────────────────
//
// Le coffre ne garde pas ses échéances pour lui : elles remontent dans
// « Prochaines échéances » et le centre « À faire » du Dashboard, et dans les
// notifications que Patrium affiche quand il est ouvert (COFFRE_SPEC.md, §8.1).
// Les métadonnées sont en clair sur l'appareil, comme le reste de Patrium :
// ces rappels fonctionnent donc même coffre verrouillé, sans toucher à un
// seul fichier.

/** Ce qu'il y a à faire quand le rappel d'un document tombe. */
export const actionDe = (doc) => typeDe(doc?.type).action || "S'en occuper";

const dateCourte = (iso) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });

/**
 * Pendant combien de jours après l'échéance le centre « À faire » signale un
 * papier échu. Au-delà, il reste marqué « Échu » dans le coffre, sans revenir
 * chaque jour sur l'accueil : une garantie terminée depuis un an n'appelle
 * plus aucune action.
 */
export const JOURS_SIGNALEMENT_ECHU = 30;

/**
 * Documents datés, avec leur statut. Ceux qui sont liés à un contrat
 * d'Abonnements sont écartés : Abonnements signale déjà leur préavis.
 */
function documentsDates(coffre, contracts, aujourdhui) {
  if (!estCoffre(coffre)) return [];
  return coffre.documents
    .filter((doc) => doc && !contratLie(doc, contracts))
    .map((doc) => ({ doc, ...statutDocument(doc, coffre.reglages, aujourdhui) }))
    .filter((e) => e.echeance);
}

/**
 * Entrées pour « Prochaines échéances », dans la forme de `prochainesEcheances`.
 * Comme pour un préavis, la date retenue est celle où il faut AGIR (le
 * rappel), l'échéance passant en détail ; une fois le rappel passé, c'est
 * l'échéance elle-même qui s'affiche quand elle approche.
 */
export function echeancesDuCoffre(
  coffre,
  { contracts = [], aujourdhui = todayIso(), fenetreJours = 42 } = {}
) {
  const liste = [];
  for (const e of documentsDates(coffre, contracts, aujourdhui)) {
    const joursRappel = e.rappel ? joursEntre(aujourdhui, e.rappel) : null;
    if (joursRappel != null && joursRappel >= 0 && joursRappel <= fenetreJours) {
      liste.push({
        id: `coffre-${e.doc.id}`,
        date: e.rappel,
        jours: joursRappel,
        type: "papier",
        libelle: `${actionDe(e.doc)} — ${e.doc.titre}`,
        detail: `échéance le ${dateFr(e.echeance)}`,
      });
    } else if (e.jours >= 0 && e.jours <= fenetreJours) {
      liste.push({
        id: `coffre-${e.doc.id}`,
        date: e.echeance,
        jours: e.jours,
        type: "papier",
        libelle: `Échéance — ${e.doc.titre}`,
        detail: typeDe(e.doc.type).libelle,
      });
    }
  }
  return liste;
}

/** Lignes du centre « À faire » : papiers à prévoir, et papiers échus depuis moins d'un mois. */
export function aFaireDuCoffre(coffre, { contracts = [], aujourdhui = todayIso() } = {}) {
  const liste = [];
  const lien = { onglet: "coffre", sous: "echeances" };
  for (const e of documentsDates(coffre, contracts, aujourdhui)) {
    if (e.statut === "a_prevoir") {
      liste.push({
        id: `coffre-${e.doc.id}`,
        urgence: e.jours <= 7 ? "critique" : "attention",
        type: "papier",
        texte: `${e.doc.titre} : ${actionDe(e.doc).toLowerCase()} — échéance le ${dateCourte(e.echeance)}.`,
        lien,
      });
    } else if (e.statut === "expire" && -e.jours <= JOURS_SIGNALEMENT_ECHU) {
      liste.push({
        id: `coffre-${e.doc.id}`,
        urgence: "critique",
        type: "papier",
        texte: `${e.doc.titre} est échu depuis le ${dateCourte(e.echeance)} : range le nouveau dans le coffre.`,
        lien,
      });
    }
  }
  return liste;
}

/**
 * Notifications de Patrium ouvert : une par document à prévoir, jusqu'à ce
 * qu'elle soit acquittée. L'acquittement retient la date de rappel vue
 * (`rappelVu`) : l'année suivante, un contrat récurrent sonne de nouveau.
 */
export function rappelsCoffreDus(coffre, { contracts = [], aujourdhui = todayIso() } = {}) {
  return documentsDates(coffre, contracts, aujourdhui)
    .filter((e) => e.statut === "a_prevoir" && e.doc.rappelVu !== e.rappel)
    .map((e) => ({
      id: `coffre-${e.doc.id}-${e.rappel}`,
      docId: e.doc.id,
      rappel: e.rappel,
      type: "coffre",
      source: "coffre",
      label: `${e.doc.titre} : ${actionDe(e.doc).toLowerCase()} (échéance le ${dateFr(e.echeance)})`,
    }));
}

export function acquitterRappelCoffre(coffre, docId, rappel) {
  if (!estCoffre(coffre)) return coffre;
  return {
    ...coffre,
    documents: coffre.documents.map((d) => (d?.id === docId ? { ...d, rappelVu: rappel } : d)),
  };
}

// ─── Forme des données ──────────────────────────────────────────────────────

export const COFFRE_VIDE = {
  version: 1,
  documents: [],
  // Inventaire des objets (jalon 6, voir inventaire.js).
  objets: [],
  reglages: { delais: {}, titreAgendaNeutre: false },
};

export const estCoffre = (v) => !!v && typeof v === "object" && Array.isArray(v.documents);

/** Champs saisis dans le formulaire, ramenés à la forme stockée. */
export function normaliserSaisie(saisie = {}) {
  const type = TYPES_PAR_ID[saisie.type] ? saisie.type : "autre";
  const rappel =
    saisie.rappelJours === "" || saisie.rappelJours == null ? NaN : Math.round(Number(saisie.rappelJours));
  return {
    type,
    titre: String(saisie.titre || "").trim() || typeDe(type).libelle,
    dateDocument: dateValide(saisie.dateDocument) ? saisie.dateDocument : null,
    echeance: dateValide(saisie.echeance) ? saisie.echeance : null,
    recurrence: saisie.recurrence === "annuelle" ? "annuelle" : null,
    rappelJours: Number.isFinite(rappel) && rappel >= 0 ? rappel : null,
    notes: String(saisie.notes || "").trim(),
    contratId: typeDe(type).liableAbonnements && saisie.contratId ? String(saisie.contratId) : null,
  };
}

export function nouveauDocument(saisie, fichiers = [], maintenant = new Date().toISOString()) {
  return {
    id: `doc_${uid()}`,
    ...normaliserSaisie(saisie),
    fichiers,
    agendaAjouteLe: null,
    agendaDate: null,
    rappelVu: null,
    creeLe: maintenant,
    modifieLe: maintenant,
  };
}

/**
 * Migration de la clé `coffre` (voir migrations.js) : complète ce qui manque,
 * sans rien retirer, et rend la même référence quand tout est déjà en ordre.
 */
export function normaliserCoffre(valeur) {
  if (!valeur || typeof valeur !== "object" || Array.isArray(valeur)) return valeur;
  const m = {};
  if (valeur.version == null) m.version = 1;

  if (!Array.isArray(valeur.documents)) {
    m.documents = [];
  } else {
    let change = false;
    const documents = valeur.documents.map((d) => {
      if (!d || typeof d !== "object") return d;
      const c = {};
      if (!Array.isArray(d.fichiers)) c.fichiers = [];
      if (typeof d.notes !== "string") c.notes = d.notes == null ? "" : String(d.notes);
      // Une récurrence inconnue (version plus récente) est gardée telle quelle :
      // `prochaineEcheance` la traite simplement comme « pas de récurrence ».
      if (d.recurrence === undefined) c.recurrence = null;
      if (!Object.keys(c).length) return d;
      change = true;
      return { ...d, ...c };
    });
    if (change) m.documents = documents;
  }

  if (!Array.isArray(valeur.objets)) m.objets = [];

  const r = valeur.reglages;
  if (!r || typeof r !== "object" || Array.isArray(r)) {
    m.reglages = { ...COFFRE_VIDE.reglages, delais: {} };
  } else {
    const c = {};
    if (!r.delais || typeof r.delais !== "object" || Array.isArray(r.delais)) c.delais = {};
    if (typeof r.titreAgendaNeutre !== "boolean") c.titreAgendaNeutre = Boolean(r.titreAgendaNeutre);
    if (Object.keys(c).length) m.reglages = { ...r, ...c };
  }

  return Object.keys(m).length ? { ...valeur, ...m } : valeur;
}
