import { chiffrer, dechiffrer, versBase64, depuisBase64 } from "./chiffrement";
import { estCoffre, normaliserCoffre } from "./coffre";
import { octetsChiffres, envoyerOctets, listerFichiersCloud, ErreurCoffre } from "./coffreFichiers";

/**
 * Coffre à papiers — archive de sauvegarde (COFFRE_SPEC.md, jalon 5).
 *
 * Les sauvegardes JSON de Patrium ne contiennent que les métadonnées du
 * coffre, pas les fichiers. Si des fichiers disparaissaient du stockage
 * (suppression par erreur, compte compromis, projet Supabase perdu), aucune
 * sauvegarde ne les rendrait. L'archive comble ce trou : un seul fichier qui
 * contient tout le coffre, et qui ne contient rien de lisible.
 *
 *  · les métadonnées y sont chiffrées par la clé de Patrium ;
 *  · les fichiers y sont tels qu'ils sont dans le stockage, chiffrés chacun
 *    par sa propre clé.
 *
 * On peut donc la ranger n'importe où (clé USB, Drive, mail à soi-même). La
 * restaurer demande la même clé : un appareil déverrouillé par la phrase ou
 * le code de secours. La clé ne change jamais, même quand la phrase change
 * (voir « Version 2 » dans chiffrement.js) : une vieille archive reste lisible.
 */

export const FORMAT_ARCHIVE = "patrium-coffre";
const VERSION_ARCHIVE = 1;

/** Nom de fichier proposé au téléchargement. */
export const nomArchive = (date = new Date()) =>
  `coffre-${date.toISOString().slice(0, 10)}.patrium-coffre.json`;

/**
 * Construit l'archive du coffre, en texte JSON.
 * @param {(fait: number, total: number) => void} [surProgression]
 */
export async function creerArchive({
  userId,
  cleMaitresse,
  coffre,
  maintenant = new Date(),
  surProgression,
}) {
  const ids = [...new Set(coffre.documents.flatMap((d) => (d.fichiers || []).map((f) => f.id)))];
  const fichiers = {};
  for (const [i, id] of ids.entries()) {
    fichiers[id] = versBase64(await octetsChiffres(userId, id));
    surProgression?.(i + 1, ids.length);
  }
  return JSON.stringify({
    format: FORMAT_ARCHIVE,
    version: VERSION_ARCHIVE,
    creeLe: maintenant.toISOString(),
    contenu: await chiffrer(cleMaitresse, coffre),
    fichiers,
  });
}

/** Lit une archive ; lève une `ErreurCoffre` si elle n'en est pas une ou si la clé n'est pas la sienne. */
export async function lireArchive(texte, cleMaitresse) {
  let archive;
  try {
    archive = JSON.parse(texte);
  } catch {
    throw new ErreurCoffre("Ce fichier n'est pas une archive du coffre.");
  }
  if (archive?.format !== FORMAT_ARCHIVE || !archive.contenu || typeof archive.fichiers !== "object") {
    throw new ErreurCoffre("Ce fichier n'est pas une archive du coffre.");
  }
  if (archive.version > VERSION_ARCHIVE) {
    throw new ErreurCoffre(
      "Cette archive vient d'une version plus récente de Patrium : mets l'application à jour."
    );
  }
  let coffre;
  try {
    coffre = normaliserCoffre(await dechiffrer(cleMaitresse, archive.contenu));
  } catch {
    throw new ErreurCoffre("Cette archive a été chiffrée avec une autre clé : elle vient d'un autre compte.");
  }
  if (!estCoffre(coffre)) throw new ErreurCoffre("Cette archive est abîmée : son contenu est illisible.");
  return { coffre, fichiers: archive.fichiers, creeLe: archive.creeLe || null };
}

/**
 * Fusionne l'archive dans le coffre actuel, sans rien écraser : les documents
 * de l'archive qui manquent reviennent ; ceux qui existent encore gardent leur
 * version actuelle, plus récente.
 */
export function fusionnerCoffres(actuel, archive) {
  const presents = new Set(actuel.documents.map((d) => d.id));
  const revenus = archive.documents.filter((d) => d?.id && !presents.has(d.id));
  return {
    coffre: { ...actuel, documents: [...actuel.documents, ...revenus] },
    documentsRestaures: revenus.length,
  };
}

/**
 * Restaure une archive : renvoie dans le stockage chaque fichier référencé qui
 * y manque, puis rend le coffre fusionné. Les fichiers sont renvoyés AVANT que
 * le coffre ne change, pour qu'aucun document restauré ne pointe vers un
 * fichier absent.
 *
 * @returns {Promise<{ coffre, coffreArchive, documentsRestaures: number, fichiersRenvoyes: number,
 *   fichiersIntrouvables: number }>} `coffreArchive` permet au composant de refaire la fusion sur l'état
 *   le plus récent du coffre, qui a pu changer pendant les envois.
 */
export async function restaurerArchive({ userId, cleMaitresse, texte, coffreActuel, surProgression }) {
  const archive = await lireArchive(texte, cleMaitresse);
  const { coffre, documentsRestaures } = fusionnerCoffres(coffreActuel, archive.coffre);

  const dansLeStockage = new Set((await listerFichiersCloud(userId)).map((f) => f.id));
  const manquants = [...new Set(coffre.documents.flatMap((d) => (d.fichiers || []).map((f) => f.id)))].filter(
    (id) => !dansLeStockage.has(id)
  );
  let fichiersRenvoyes = 0;
  let fichiersIntrouvables = 0;
  for (const [i, id] of manquants.entries()) {
    if (typeof archive.fichiers[id] === "string") {
      await envoyerOctets(userId, id, depuisBase64(archive.fichiers[id]));
      fichiersRenvoyes += 1;
    } else {
      fichiersIntrouvables += 1;
    }
    surProgression?.(i + 1, manquants.length);
  }
  return {
    coffre,
    coffreArchive: archive.coffre,
    documentsRestaures,
    fichiersRenvoyes,
    fichiersIntrouvables,
  };
}
