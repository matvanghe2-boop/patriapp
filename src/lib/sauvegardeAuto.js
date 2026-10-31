import { todayIso } from "./finance";

/**
 * Sauvegarde automatique dans un dossier choisi par l'utilisateur.
 *
 * L'export JSON manuel suppose qu'on pense à le faire. Sur Chrome et Edge
 * (ordinateur), l'API File System Access permet de choisir UNE fois un
 * dossier — idéalement synchronisé avec un cloud personnel — puis d'y écrire
 * une sauvegarde chaque semaine sans rien demander.
 *
 * Le « droit d'écrire » dans le dossier est mémorisé par le navigateur
 * (IndexedDB pour la poignée, permission accordée au site). Quand le
 * navigateur la redemande, il faut un clic : l'application affiche alors un
 * bouton « Reprendre » plutôt que d'échouer en silence.
 *
 * Ailleurs (Safari, Firefox, téléphone), l'API n'existe pas : le rappel de
 * sauvegarde manuel reste le seul filet, et l'écran le dit.
 */

const BASE = "patrium";
const MAGASIN = "reglages";
const CLE_DOSSIER = "dossierSauvegarde";
const CLE_DERNIERE = "patrium:derniereSauvegardeAuto";
export const INTERVALLE_JOURS = 7;

export const sauvegardeAutoDisponible = () =>
  typeof window !== "undefined" && typeof window.showDirectoryPicker === "function" && typeof indexedDB !== "undefined";

// ─── IndexedDB minimal : une poignée de dossier ne tient pas dans le localStorage ─
function ouvrirBase() {
  return new Promise((resoudre, rejeter) => {
    const requete = indexedDB.open(BASE, 1);
    requete.onupgradeneeded = () => requete.result.createObjectStore(MAGASIN);
    requete.onsuccess = () => resoudre(requete.result);
    requete.onerror = () => rejeter(requete.error);
  });
}
async function transaction(mode, action) {
  const base = await ouvrirBase();
  return new Promise((resoudre, rejeter) => {
    const t = base.transaction(MAGASIN, mode);
    const requete = action(t.objectStore(MAGASIN));
    t.oncomplete = () => resoudre(requete?.result);
    t.onerror = () => rejeter(t.error);
  });
}
const lireDossier = () => transaction("readonly", (m) => m.get(CLE_DOSSIER));
const ecrireDossier = (poignee) => transaction("readwrite", (m) => m.put(poignee, CLE_DOSSIER));
const effacerDossier = () => transaction("readwrite", (m) => m.delete(CLE_DOSSIER));

/** Nom du fichier d'une sauvegarde : un par jour, le plus récent remplace celui du jour. */
export const nomFichier = (date = todayIso()) => `patrium-sauvegarde-${date}.json`;

export function derniereSauvegardeAuto() {
  try {
    return localStorage.getItem(CLE_DERNIERE);
  } catch {
    return null;
  }
}

/** Une sauvegarde est-elle due ? Jamais faite, ou faite il y a `jours` jours ou plus. */
export function sauvegardeDue(derniere, aujourdhui = todayIso(), jours = INTERVALLE_JOURS) {
  if (!derniere) return true;
  const ecart = (new Date(`${aujourdhui}T00:00:00`) - new Date(`${String(derniere).slice(0, 10)}T00:00:00`)) / 86400000;
  return ecart >= jours;
}

/**
 * État de la sauvegarde automatique.
 * @returns {Promise<{active: boolean, nom?: string, permission?: "granted"|"prompt"|"denied", derniere: string|null}>}
 */
export async function etatSauvegardeAuto() {
  const derniere = derniereSauvegardeAuto();
  if (!sauvegardeAutoDisponible()) return { active: false, derniere };
  try {
    const poignee = await lireDossier();
    if (!poignee) return { active: false, derniere };
    const permission = await poignee.queryPermission({ mode: "readwrite" });
    return { active: true, nom: poignee.name, permission, derniere, poignee };
  } catch {
    return { active: false, derniere };
  }
}

/** Fait choisir le dossier (geste de l'utilisateur requis) et le mémorise. */
export async function choisirDossier() {
  const poignee = await window.showDirectoryPicker({ id: "patrium-sauvegardes", mode: "readwrite" });
  await ecrireDossier(poignee);
  return poignee;
}

/** Redemande le droit d'écrire (geste de l'utilisateur requis). */
export async function reprendrePermission(poignee) {
  return (await poignee.requestPermission({ mode: "readwrite" })) === "granted";
}

export async function arreterSauvegardeAuto() {
  await effacerDossier();
}

/**
 * Écrit la sauvegarde du jour dans le dossier.
 * @param {object} donnees  L'export complet (`exportAllData`).
 */
export async function ecrireSauvegarde(poignee, donnees, { date = todayIso() } = {}) {
  const fichier = await poignee.getFileHandle(nomFichier(date), { create: true });
  const flux = await fichier.createWritable();
  await flux.write(JSON.stringify(donnees, null, 2));
  await flux.close();
  try {
    localStorage.setItem(CLE_DERNIERE, new Date().toISOString());
  } catch {
    /* ignore */
  }
  return nomFichier(date);
}
