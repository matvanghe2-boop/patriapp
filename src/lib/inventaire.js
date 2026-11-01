import { todayIso, uid, lireNombre } from "./finance";
import { dateValide, ajouterAns, typeDe } from "./coffre";

/**
 * Coffre à papiers — inventaire des objets (COFFRE_SPEC.md, jalon 6).
 *
 * Ce que l'on possède et qui a de la valeur : ordinateur, téléphone,
 * électroménager, vélo, meubles. À quoi ça sert :
 *
 *  · retrouver la facture et la fin de garantie d'un appareil qui tombe en
 *    panne ;
 *  · déclarer un sinistre (vol, dégât des eaux) avec prix, date d'achat,
 *    numéro de série et facture ;
 *  · savoir pour combien de biens s'assurer en assurance habitation.
 *
 * La valeur estimée est une VÉTUSTÉ INDICATIVE : un pourcentage annuel par
 * catégorie, appliqué au prix d'achat, avec un plancher. Ce n'est ni une cote
 * de revente ni la grille d'un assureur, et l'interface le dit ; une valeur
 * saisie à la main l'emporte toujours.
 *
 * Les objets vivent dans la clé `coffre` (champ `objets`) : ils sont donc
 * chiffrés dans le cloud, synchronisés et repris par l'archive, comme les
 * documents.
 */

export const CATEGORIES_OBJETS = [
  { id: "informatique", libelle: "Informatique", tauxAnnuel: 0.25, plancher: 0.1 },
  { id: "telephonie", libelle: "Téléphonie", tauxAnnuel: 0.3, plancher: 0.1 },
  { id: "image_son", libelle: "Image et son", tauxAnnuel: 0.2, plancher: 0.1 },
  { id: "electromenager", libelle: "Électroménager", tauxAnnuel: 0.15, plancher: 0.1 },
  { id: "mobilier", libelle: "Mobilier", tauxAnnuel: 0.1, plancher: 0.1 },
  { id: "mobilite", libelle: "Vélo et mobilité", tauxAnnuel: 0.15, plancher: 0.1 },
  // Montres, bijoux, instruments de qualité : ils ne perdent pas leur valeur
  // à un rythme qu'un pourcentage annuel saurait décrire.
  { id: "valeur", libelle: "Bijoux, montres, objets de valeur", tauxAnnuel: 0, plancher: 1 },
  { id: "autre", libelle: "Autre", tauxAnnuel: 0.15, plancher: 0.1 },
];

const PAR_ID = Object.fromEntries(CATEGORIES_OBJETS.map((c) => [c.id, c]));
export const categorieObjet = (id) => PAR_ID[id] || PAR_ID.autre;

/** Garantie légale de conformité, quand rien d'autre n'est connu. */
export const GARANTIE_LEGALE_ANS = 2;

const anneesEntre = (debut, fin) =>
  (new Date(`${fin}T00:00:00`) - new Date(`${debut}T00:00:00`)) / (365.25 * 86400000);

/**
 * Valeur d'un objet aujourd'hui.
 * @returns {{ valeur: number|null, estimee: boolean }} `estimee` : calculée par
 *   la vétusté de la catégorie, et non saisie.
 */
export function valeurObjet(objet, aujourdhui = todayIso()) {
  if (Number.isFinite(objet?.valeurManuelle)) return { valeur: objet.valeurManuelle, estimee: false };
  if (!Number.isFinite(objet?.prix)) return { valeur: null, estimee: true };
  if (!dateValide(objet.dateAchat)) return { valeur: objet.prix, estimee: true };
  const { tauxAnnuel, plancher } = categorieObjet(objet.categorie);
  const ans = Math.max(0, anneesEntre(objet.dateAchat, aujourdhui));
  const coefficient = Math.max(plancher, (1 - tauxAnnuel) ** ans);
  return { valeur: Math.round(objet.prix * coefficient), estimee: true };
}

/** Document du coffre lié à l'objet (sa facture), s'il existe encore. */
export const factureDe = (objet, documents = []) =>
  (objet?.factureId && documents.find((d) => d?.id === objet.factureId)) || null;

/**
 * Fin de garantie d'un objet, et d'où elle vient : la facture liée (son
 * échéance), la date saisie sur l'objet, ou à défaut la garantie légale de
 * deux ans à partir de la date d'achat.
 *
 * @returns {{ fin: string|null, source: "facture"|"saisie"|"legale"|null, active: boolean }}
 */
export function garantieObjet(objet, documents = [], aujourdhui = todayIso()) {
  const facture = factureDe(objet, documents);
  let fin = null;
  let source = null;
  // L'échéance d'une facture est sa fin de garantie (voir les types de coffre.js).
  if (facture && dateValide(facture.echeance) && typeDe(facture.type).id === "facture") {
    fin = facture.echeance;
    source = "facture";
  } else if (dateValide(objet?.garantieFin)) {
    fin = objet.garantieFin;
    source = "saisie";
  } else if (dateValide(objet?.dateAchat)) {
    fin = ajouterAns(objet.dateAchat, GARANTIE_LEGALE_ANS);
    source = "legale";
  }
  return { fin, source, active: !!fin && fin >= aujourdhui };
}

/** Totaux de l'inventaire : nombre d'objets, prix d'achat et valeur du jour. */
export function totauxInventaire(objets = [], aujourdhui = todayIso()) {
  let achat = 0;
  let valeur = 0;
  for (const o of objets) {
    if (Number.isFinite(o?.prix)) achat += o.prix;
    const v = valeurObjet(o, aujourdhui).valeur;
    if (Number.isFinite(v)) valeur += v;
  }
  return { nombre: objets.length, achat, valeur };
}

/** Objets triés par valeur du jour, la plus forte en tête. */
export function trierObjets(objets = [], aujourdhui = todayIso()) {
  return [...objets].sort(
    (a, b) =>
      (valeurObjet(b, aujourdhui).valeur ?? -1) - (valeurObjet(a, aujourdhui).valeur ?? -1) ||
      String(a.nom).localeCompare(String(b.nom), "fr")
  );
}

// ─── Saisie ─────────────────────────────────────────────────────────────────

const montant = (v) => {
  if (v === "" || v == null) return null;
  // « 1 299,99 » : les espaces de milliers (y compris insécables) sont retirés.
  const n = typeof v === "number" ? v : lireNombre(String(v).replace(/\s/g, ""));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
};

/** Champs du formulaire ramenés à la forme stockée. */
export function normaliserObjet(saisie = {}) {
  return {
    nom: String(saisie.nom || "").trim() || "Objet sans nom",
    categorie: PAR_ID[saisie.categorie] ? saisie.categorie : "autre",
    dateAchat: dateValide(saisie.dateAchat) ? saisie.dateAchat : null,
    prix: montant(saisie.prix),
    valeurManuelle: montant(saisie.valeurManuelle),
    garantieFin: dateValide(saisie.garantieFin) ? saisie.garantieFin : null,
    factureId: saisie.factureId ? String(saisie.factureId) : null,
    numeroSerie: String(saisie.numeroSerie || "").trim(),
    notes: String(saisie.notes || "").trim(),
  };
}

export function nouvelObjet(saisie, maintenant = new Date().toISOString()) {
  return { id: `obj_${uid()}`, ...normaliserObjet(saisie), creeLe: maintenant, modifieLe: maintenant };
}

/** Saisie préremplie à partir d'une facture du coffre : nom, date d'achat, lien. */
export const objetDepuisFacture = (doc) => ({
  nom: doc?.titre && doc.titre !== typeDe(doc.type).libelle ? doc.titre : "",
  dateAchat: doc?.dateDocument || "",
  factureId: doc?.id || "",
});
