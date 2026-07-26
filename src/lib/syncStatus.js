// Petit bus d'état pour la synchronisation cloud, volontairement hors React :
// `usePersistentState` est appelé ~20 fois dans l'app et doit pouvoir signaler
// un échec sans qu'on ait à faire remonter l'information par des props.
//
// Avant, un échec de push Supabase se contentait d'un console.warn : rien ne
// distinguait, côté utilisateur, « mes données sont bien sur mes deux
// appareils » de « ça fait 20 minutes que plus rien ne part ».

const listeners = new Set();

const state = {
  /** "off" (pas de cloud configuré) | "idle" | "syncing" | "error" | "offline" */
  status: "off",
  /** Nombre de clés en attente d'écriture cloud. */
  pending: 0,
  /** Nombre de clés dont l'écriture a définitivement échoué. */
  failed: 0,
  /** Date ISO de la dernière écriture cloud réussie. */
  lastSyncedAt: null,
  /** Message d'erreur le plus récent, pour l'infobulle. */
  lastError: null,
};

const pendingKeys = new Set();
const failedKeys = new Set();

// `useSyncExternalStore` compare les instantanés par identité de référence :
// renvoyer un nouvel objet à chaque appel lui fait croire que l'état change
// en permanence, et React boucle jusqu'à « Maximum update depth exceeded ».
// On ne remplace donc l'instantané que lorsqu'une valeur a réellement bougé.
let snapshot = { ...state };

function publish() {
  const changed = Object.keys(state).some((k) => state[k] !== snapshot[k]);
  if (!changed) return;
  snapshot = { ...state };
  listeners.forEach((l) => l(snapshot));
}

export function getSyncState() {
  return snapshot;
}

export function subscribeSync(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function recompute() {
  state.pending = pendingKeys.size;
  state.failed = failedKeys.size;
  if (state.status === "off") return;
  if (failedKeys.size > 0) state.status = typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "error";
  else if (pendingKeys.size > 0) state.status = "syncing";
  else state.status = "idle";
}

export function markSyncEnabled() {
  if (state.status === "off") state.status = "idle";
  publish();
}

export function markPending(key) {
  pendingKeys.add(key);
  failedKeys.delete(key);
  state.lastError = null;
  recompute();
  publish();
}

export function markSynced(key) {
  pendingKeys.delete(key);
  failedKeys.delete(key);
  state.lastSyncedAt = new Date().toISOString();
  recompute();
  publish();
}

export function markFailed(key, error) {
  pendingKeys.delete(key);
  failedKeys.add(key);
  state.lastError = error?.message || String(error || "Erreur inconnue");
  recompute();
  publish();
}

export function _resetSyncState() {
  pendingKeys.clear();
  failedKeys.clear();
  Object.assign(state, { status: "off", pending: 0, failed: 0, lastSyncedAt: null, lastError: null });
  publish();
}
