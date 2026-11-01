/**
 * Coffre à papiers — fichiers gardés sur l'appareil pour la consultation hors
 * ligne (COFFRE_SPEC.md, jalon 5).
 *
 * On garde ici les octets CHIFFRÉS, tels qu'ils sont dans le bucket : rien de
 * lisible n'est écrit sur le disque, et le cache ne vaut rien sans la clé.
 * C'est ce qui permet de montrer sa carte de mutuelle à la pharmacie sans
 * réseau, sans affaiblir le coffre.
 *
 * IndexedDB plutôt que le localStorage, limité à quelques mégaoctets et qui
 * ne stocke que du texte. Là où IndexedDB manque (navigation privée de
 * certains navigateurs, tests), toutes les fonctions deviennent sans effet :
 * le coffre retélécharge simplement à chaque ouverture.
 *
 * Le réglage « garder les fichiers sur cet appareil » est propre à
 * l'appareil : il vit dans le localStorage, hors de la synchronisation.
 */

const BASE = "patrium-coffre";
const MAGASIN = "fichiers";
const CLE_REGLAGE = "patrimoine:__coffreHorsLigne";

let promesseBase = null;

function ouvrirBase() {
  return new Promise((resoudre, rejeter) => {
    if (typeof indexedDB === "undefined") {
      resoudre(null);
      return;
    }
    const demande = indexedDB.open(BASE, 1);
    demande.onupgradeneeded = () => demande.result.createObjectStore(MAGASIN);
    demande.onsuccess = () => resoudre(demande.result);
    demande.onerror = () => rejeter(demande.error);
  });
}

const base = () => {
  if (!promesseBase) promesseBase = ouvrirBase().catch(() => null);
  return promesseBase;
};

const attendre = (demande) =>
  new Promise((resoudre, rejeter) => {
    demande.onsuccess = () => resoudre(demande.result);
    demande.onerror = () => rejeter(demande.error);
  });

async function magasin(mode) {
  const db = await base();
  return db ? db.transaction(MAGASIN, mode).objectStore(MAGASIN) : null;
}

// ─── Réglage de l'appareil ──────────────────────────────────────────────────

/** Garder les fichiers sur cet appareil ? Oui par défaut : ils y sont chiffrés. */
export function horsLigneActif() {
  try {
    return localStorage.getItem(CLE_REGLAGE) !== "non";
  } catch {
    return false;
  }
}

export function reglerHorsLigne(actif) {
  try {
    localStorage.setItem(CLE_REGLAGE, actif ? "oui" : "non");
  } catch {
    /* stockage indisponible : le réglage par défaut s'applique */
  }
  // Demande au navigateur de ne pas évincer ces données quand l'espace manque.
  if (actif) globalThis.navigator?.storage?.persist?.().catch?.(() => {});
}

// ─── Fichiers ───────────────────────────────────────────────────────────────

/** Octets chiffrés d'un fichier gardé sur l'appareil, ou `null`. */
export async function lireEnCache(id) {
  try {
    const m = await magasin("readonly");
    const valeur = m ? await attendre(m.get(id)) : null;
    return valeur ? new Uint8Array(valeur) : null;
  } catch {
    return null;
  }
}

/** Garde les octets chiffrés d'un fichier, si le réglage le permet. */
export async function mettreEnCache(id, octets) {
  if (!horsLigneActif()) return;
  try {
    const m = await magasin("readwrite");
    if (m) await attendre(m.put(octets, id));
  } catch {
    /* plus de place : le fichier sera retéléchargé à la prochaine ouverture */
  }
}

export async function retirerDuCache(ids) {
  try {
    const m = await magasin("readwrite");
    if (m) await Promise.all(ids.map((id) => attendre(m.delete(id))));
  } catch {
    /* rien à retirer */
  }
}

/** Identifiants et tailles des fichiers gardés sur l'appareil. */
export async function contenuCache() {
  try {
    const m = await magasin("readonly");
    if (!m) return [];
    const [cles, valeurs] = await Promise.all([attendre(m.getAllKeys()), attendre(m.getAll())]);
    return cles.map((id, i) => ({ id, taille: valeurs[i]?.byteLength || 0 }));
  } catch {
    return [];
  }
}

export async function viderCache() {
  try {
    const m = await magasin("readwrite");
    if (m) await attendre(m.clear());
  } catch {
    /* rien à vider */
  }
}
