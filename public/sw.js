// Service worker de Patrium.
//
// L'application est installable mais restait inutilisable hors ligne : ce
// fichier laissait toutes les requêtes passer sans rien mettre en cache. C'est
// d'autant plus dommage que TOUTES les données patrimoniales vivent déjà dans
// le localStorage : seule la coquille (HTML, JS, CSS) manquait pour que l'app
// fonctionne sans réseau.
//
// Deux stratégies, et une abstention volontaire :
//
//  - **Coquille applicative** (HTML, JS, CSS, icônes) : « stale-while-revalidate ».
//    On sert le cache immédiatement et on rafraîchit en arrière-plan. Le
//    démarrage est instantané, et une nouvelle version est prise au chargement
//    suivant.
//  - **Navigation** : réseau d'abord, cache en repli. Ainsi une mise en ligne
//    est visible tout de suite quand le réseau répond, et l'app démarre quand
//    même s'il ne répond pas.
//  - **`/api/*` : jamais de cache.** Un cours de bourse ou un taux périmé
//    servi silencieusement serait pire qu'une erreur réseau visible. Les
//    endpoints portent déjà leur propre cache HTTP côté serveur.

// À INCRÉMENTER dès que la coquille change de façon non hachée : les fichiers
// de `public/` (orbit-header.js, icônes) et ce fichier lui-même gardent une URL
// stable, donc la stratégie « cache d'abord » continue de servir l'ancienne
// version tant que ce nom ne bouge pas. Les fragments produits par Vite, eux,
// portent un hachage dans leur nom et se renouvellent d'eux-mêmes.
//
// v2 : polices auto-hébergées, orbit-header.js rapatrié, refonte des styles.
// v3 : orbit-splash.js rapatrié à son tour (écran de chargement du réseau).
// v4 : polices réduites au latin, et surtout FIN DU skipWaiting automatique
//      (voir plus bas) — la mise à jour est désormais proposée, pas imposée.
const VERSION = "patrium-v4";
const CACHE_COQUILLE = `${VERSION}-coquille`;

// Le strict minimum pour afficher quelque chose hors ligne. Les fragments
// (chunks) générés par Vite portent un nom haché à chaque build : les lister
// ici serait vain, ils sont mis en cache au fil de l'eau par le `fetch`.
const RESSOURCES_INITIALES = ["/", "/index.html", "/manifest.json", "/icon-192.png", "/icon-512.png"];

/**
 * PAS DE `skipWaiting()` AUTOMATIQUE.
 *
 * L'ancienne version prenait la main dès son installation et purgeait les
 * caches de la précédente — dans un onglet DÉJÀ OUVERT. Or les onglets de
 * l'application sont chargés à la demande (`React.lazy`) et leurs fragments
 * portent un nom haché qui change à chaque build. Ouvrir « PEA & Bourse »
 * après un déploiement pouvait donc échouer sur un
 * `Failed to fetch dynamically imported module` : l'écran restait vide, sans
 * la moindre explication, et seul un rechargement manuel réparait.
 *
 * Le nouveau worker attend désormais. L'application détecte son arrivée
 * (voir `main.jsx`) et propose un rechargement ; c'est ce clic qui envoie le
 * message `SKIP_WAITING` ci-dessous. La mise à jour reste immédiate quand
 * l'utilisateur la veut, et ne casse plus une session en cours.
 */
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_COQUILLE)
      // `addAll` échoue en bloc si une seule ressource manque : on tolère les
      // absences pour ne pas empêcher l'installation du service worker.
      .then((cache) => Promise.allSettled(RESSOURCES_INITIALES.map((url) => cache.add(url))))
  );
});

// Déclenché par l'application quand l'utilisateur accepte le rechargement.
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((noms) => Promise.all(noms.filter((n) => !n.startsWith(VERSION)).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

/** Ressource de coquille : même origine, et pas un appel d'API. */
function estCoquille(url) {
  return (
    url.origin === self.location.origin &&
    !url.pathname.startsWith("/api/") &&
    /\.(?:js|css|woff2?|png|svg|ico|webmanifest|json)$/.test(url.pathname)
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Les données de marché ne doivent jamais être servies depuis un cache local.
  if (url.pathname.startsWith("/api/")) return;

  // Navigation : réseau d'abord, index en cache si hors ligne.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((reponse) => {
          const copie = reponse.clone();
          caches.open(CACHE_COQUILLE).then((cache) => cache.put("/index.html", copie));
          return reponse;
        })
        .catch(() => caches.match("/index.html").then((r) => r || Response.error()))
    );
    return;
  }

  if (!estCoquille(url)) return;

  event.respondWith(
    caches.open(CACHE_COQUILLE).then(async (cache) => {
      const enCache = await cache.match(request);
      const reseau = fetch(request)
        .then((reponse) => {
          if (reponse && reponse.status === 200) cache.put(request, reponse.clone());
          return reponse;
        })
        .catch(() => null);
      // Cache d'abord quand il existe ; le rafraîchissement se poursuit en
      // arrière-plan et servira au chargement suivant.
      return enCache || (await reseau) || Response.error();
    })
  );
});

// Prêt à recevoir de vraies notifications push si un backend les envoie un
// jour (voir README pour la marche à suivre). Sans backend, cet écouteur ne
// sera jamais déclenché — les rappels affichés aujourd'hui viennent du code
// de l'application elle-même (voir Notifications.jsx), pas de ce fichier.
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload = {};
  try { payload = event.data.json(); } catch { payload = { title: "Patrium", body: event.data.text() }; }
  event.waitUntil(
    self.registration.showNotification(payload.title || "Patrium", {
      body: payload.body || "",
      icon: payload.icon,
      badge: payload.badge,
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clientsArr) => {
      if (clientsArr.length > 0) return clientsArr[0].focus();
      return self.clients.openWindow("/");
    })
  );
});
