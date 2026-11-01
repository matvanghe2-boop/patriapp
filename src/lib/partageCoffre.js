/**
 * Coffre à papiers — fichiers reçus par le menu « Partager » d'Android
 * (COFFRE_SPEC.md, §9.2).
 *
 * Le service worker reçoit le partage (`POST /partage`, voir `share_target`
 * dans manifest.json et `recevoirPartage` dans sw.js), range les fichiers
 * dans ce cache, puis ouvre l'onglet Coffre. L'onglet les lit ici, propose de
 * les ranger, et vide le cache dans tous les cas : un fichier partagé n'a pas
 * à traîner en clair sur l'appareil une fois chiffré, ou une fois le partage
 * abandonné.
 *
 * Le nom du cache est partagé avec sw.js, qui ne peut rien importer : les deux
 * doivent rester identiques.
 */
export const CACHE_PARTAGE = "patrium-partage";

const disponible = () => typeof caches !== "undefined";

/** Fichiers partagés en attente, dans l'ordre de leur arrivée. */
export async function fichiersPartages() {
  if (!disponible() || !(await caches.has(CACHE_PARTAGE))) return [];
  const cache = await caches.open(CACHE_PARTAGE);
  const requetes = [...(await cache.keys())].sort((a, b) =>
    a.url.localeCompare(b.url, "en", { numeric: true })
  );
  const fichiers = [];
  for (const requete of requetes) {
    const reponse = await cache.match(requete);
    if (!reponse) continue;
    const blob = await reponse.blob();
    const type = reponse.headers.get("Content-Type") || blob.type || "application/octet-stream";
    let nom = "document partagé";
    try {
      nom = decodeURIComponent(reponse.headers.get("X-Nom-Fichier") || nom);
    } catch {
      /* nom mal encodé : on garde le nom par défaut */
    }
    fichiers.push(new File([blob], nom, { type }));
  }
  return fichiers;
}

/** Vide la file d'attente du partage. */
export async function oublierPartage() {
  if (disponible()) await caches.delete(CACHE_PARTAGE);
}
