import { chiffrer, dechiffrer, versBase64, depuisBase64 } from "./chiffrement";
import { supabase } from "./supabaseClient";

/**
 * Coffre à papiers — chiffrement et stockage des fichiers (COFFRE_SPEC.md, §3
 * et §4).
 *
 * Chaque fichier est chiffré DANS LE NAVIGATEUR avec sa propre clé AES-GCM,
 * tirée au hasard. Cette clé de fichier est elle-même chiffrée (« enveloppée »)
 * par la clé maîtresse de Patrium, celle que dérive la phrase secrète, et
 * rangée dans les métadonnées du document. Le bucket Supabase ne reçoit que
 * des octets chiffrés, sous un nom sans rapport avec le document.
 *
 * Pourquoi une clé par fichier plutôt que la clé maîtresse directement : une
 * sauvegarde JSON de Patrium (export, sauvegarde automatique, transfert par
 * QR) contient les métadonnées du coffre. Avec des clés enveloppées, cette
 * sauvegarde seule n'ouvre aucun fichier. Changer un jour de clé maîtresse ne
 * demandera par ailleurs que de réenvelopper ces clés, sans retélécharger ni
 * rechiffrer un seul fichier.
 *
 * Format d'un fichier chiffré :
 *
 *     octet 0      version du format (1)
 *     octets 1–12  vecteur d'initialisation AES-GCM
 *     octets 13–…  texte chiffré, suivi de l'étiquette d'authenticité
 *
 * AES-GCM est authentifié : un octet altéré ou une mauvaise clé fait échouer
 * le déchiffrement, au lieu de rendre un fichier corrompu.
 */

export const BUCKET = "coffre";
const VERSION_FORMAT = 1;
const TAILLE_IV = 12;
const ENTETE = 1 + TAILLE_IV;

/** Erreur montrée telle quelle à l'utilisateur. */
export class ErreurCoffre extends Error {
  constructor(message) {
    super(message);
    this.name = "ErreurCoffre";
  }
}

const FICHIER_ILLISIBLE = "Fichier illisible : il a été altéré, ou chiffré avec une autre clé.";

/**
 * Chiffre les octets d'un fichier avec une clé neuve.
 * @returns {{ octets: Uint8Array, cle: object }} le fichier chiffré et sa clé enveloppée par `cleMaitresse`.
 */
export async function chiffrerFichier(cleMaitresse, octets) {
  const cleFichier = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);
  const iv = crypto.getRandomValues(new Uint8Array(TAILLE_IV));
  const chiffre = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, cleFichier, octets));

  const sortie = new Uint8Array(ENTETE + chiffre.length);
  sortie[0] = VERSION_FORMAT;
  sortie.set(iv, 1);
  sortie.set(chiffre, ENTETE);

  const brute = new Uint8Array(await crypto.subtle.exportKey("raw", cleFichier));
  return { octets: sortie, cle: await chiffrer(cleMaitresse, versBase64(brute)) };
}

/** Déchiffre un fichier ; lève une `ErreurCoffre` si la clé n'est pas la bonne ou si le fichier a été altéré. */
export async function dechiffrerFichier(cleMaitresse, cleEnveloppee, octets) {
  if (!(octets instanceof Uint8Array) || octets.length <= ENTETE || octets[0] !== VERSION_FORMAT) {
    throw new ErreurCoffre(FICHIER_ILLISIBLE);
  }
  try {
    const brute = depuisBase64(await dechiffrer(cleMaitresse, cleEnveloppee));
    const cleFichier = await crypto.subtle.importKey("raw", brute, { name: "AES-GCM" }, false, ["decrypt"]);
    const clair = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: octets.subarray(1, ENTETE) },
      cleFichier,
      octets.subarray(ENTETE)
    );
    return new Uint8Array(clair);
  } catch {
    throw new ErreurCoffre(FICHIER_ILLISIBLE);
  }
}

// ─── Stockage Supabase ──────────────────────────────────────────────────────

/** Les politiques du bucket n'ouvrent à chacun que son dossier `<user_id>/`. */
export const cheminFichier = (userId, fichierId) => `${userId}/${fichierId}.bin`;

/** Traduit une erreur du stockage en phrase qui dit quoi faire. */
export function messageErreurStockage(erreur) {
  const texte = `${erreur?.message || ""} ${erreur?.error || ""} ${erreur?.statusCode || erreur?.status || ""}`;
  if (/bucket not found/i.test(texte)) {
    return "Le stockage du coffre n'existe pas encore : exécute le bloc « Coffre » de sql/schema.sql dans Supabase.";
  }
  if (/row-level security|unauthorized|\b403\b/i.test(texte)) {
    return "Supabase refuse l'accès au coffre : vérifie que le bloc « Coffre » de sql/schema.sql a bien été exécuté.";
  }
  if (/maximum allowed size|too large|\b413\b/i.test(texte))
    return "Fichier trop lourd pour le stockage : 20 Mo au maximum.";
  if (/failed to fetch|network/i.test(texte)) return "Pas de réseau : réessaie une fois connecté.";
  return `Le stockage a renvoyé une erreur${erreur?.message ? ` : ${erreur.message}` : "."}`;
}

function bucket() {
  if (!supabase)
    throw new ErreurCoffre("La synchronisation n'est pas configurée : le coffre a besoin de Supabase.");
  return supabase.storage.from(BUCKET);
}

/**
 * Chiffre un fichier et l'envoie.
 * @returns {Promise<object>} sa fiche pour les métadonnées du document : `{ id, nom, mime, taille, cle }`.
 */
export async function rangerFichier({ userId, cleMaitresse, fichier }) {
  const { octets, cle } = await chiffrerFichier(cleMaitresse, new Uint8Array(await fichier.arrayBuffer()));
  const id = `f_${crypto.randomUUID()}`;
  const { error } = await bucket().upload(cheminFichier(userId, id), new Blob([octets]), {
    contentType: "application/octet-stream",
    upsert: false,
  });
  if (error) throw new ErreurCoffre(messageErreurStockage(error));
  return { id, nom: fichier.name, mime: fichier.type, taille: fichier.size, cle };
}

/** Télécharge et déchiffre un fichier du coffre ; rend un `Blob` de son type d'origine. */
export async function ouvrirFichier({ userId, cleMaitresse, fichier }) {
  const { data, error } = await bucket().download(cheminFichier(userId, fichier.id));
  if (error) throw new ErreurCoffre(messageErreurStockage(error));
  const clair = await dechiffrerFichier(cleMaitresse, fichier.cle, new Uint8Array(await data.arrayBuffer()));
  return new Blob([clair], { type: fichier.mime || "application/octet-stream" });
}

export async function supprimerFichiers(userId, ids) {
  if (!ids.length) return;
  const { error } = await bucket().remove(ids.map((id) => cheminFichier(userId, id)));
  if (error) throw new ErreurCoffre(messageErreurStockage(error));
}

/**
 * Efface TOUS les fichiers du coffre de cet utilisateur, y compris ceux
 * qu'aucun document ne référence plus. Appelé par « Tout réinitialiser » :
 * effacer les métadonnées sans les fichiers laisserait des scans de pièces
 * d'identité dans le stockage, chiffrés mais bien présents.
 */
export async function viderCoffreCloud(userId) {
  if (!supabase) return;
  const PAGE = 1000;
  // Borne de sécurité : une suppression refusée en silence par les politiques
  // ferait relister indéfiniment les mêmes fichiers.
  for (let tour = 0; tour < 50; tour += 1) {
    const { data, error } = await bucket().list(userId, { limit: PAGE });
    // Bucket jamais créé : le coffre n'a jamais servi, il n'y a rien à effacer.
    if (error && /bucket not found/i.test(error.message || "")) return;
    if (error) throw new ErreurCoffre(messageErreurStockage(error));
    if (!data?.length) return;
    const { error: erreurSuppression } = await bucket().remove(data.map((o) => `${userId}/${o.name}`));
    if (erreurSuppression) throw new ErreurCoffre(messageErreurStockage(erreurSuppression));
    if (data.length < PAGE) return;
  }
}
