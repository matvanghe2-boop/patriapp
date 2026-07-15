// Service worker minimal : sert surtout à rendre l'application "installable"
// (icône sur l'écran d'accueil / bureau) sur les navigateurs qui l'exigent.
// Pas de mise en cache agressive pour l'instant, pour ne pas servir de
// données de patrimoine périmées.

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  self.clients.claim();
});

self.addEventListener("fetch", () => {
  // Pass-through : pas de cache custom pour l'instant.
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
