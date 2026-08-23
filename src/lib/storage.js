import { useState, useEffect, useRef, useCallback, useSyncExternalStore } from "react";
import { supabase, isSupabaseConfigured, supabaseConfig } from "./supabaseClient";
import {
  subscribeSync,
  getSyncState,
  markSyncEnabled,
  markPending,
  markSynced,
  markFailed,
} from "./syncStatus";

const PREFIX = "patrimoine:";
const META_PREFIX = "patrimoine:__meta:";
const TABLE = "kv_store";
const DEBOUNCE_MS = 800;
const MAX_PUSH_ATTEMPTS = 4;

function readLocal(key, initialValue) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? JSON.parse(raw) : initialValue;
  } catch {
    return initialValue;
  }
}

function writeLocal(key, value, updatedAt) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
    if (updatedAt) localStorage.setItem(META_PREFIX + key, updatedAt);
  } catch (e) {
    console.warn("Sauvegarde locale impossible :", e);
  }
}

/**
 * Horodatage de la dernière modification locale d'une clé. C'est lui qui
 * arbitre le conflit cloud/local : sans cet horodatage, l'ancienne version
 * adoptait systématiquement la valeur cloud au montage, écrasant au passage
 * une modification faite localement entre-temps.
 */
function readLocalUpdatedAt(key) {
  try {
    return localStorage.getItem(META_PREFIX + key);
  } catch {
    return null;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Écriture cloud avec réessais à délai croissant. Un échec réseau ponctuel
 * (perte de wifi, 503 momentané) ne doit pas se solder par une donnée
 * définitivement absente d'un des appareils ; et un échec durable doit être
 * visible dans l'interface plutôt que noyé dans la console.
 */
async function pushToCloud(key, value, userId, updatedAt) {
  markPending(key);
  let lastError = null;
  for (let attempt = 0; attempt < MAX_PUSH_ATTEMPTS; attempt++) {
    if (attempt > 0) await sleep(2 ** attempt * 400);
    try {
      const { error } = await supabase.from(TABLE).upsert({
        id: `${userId}:${key}`,
        user_id: userId,
        key,
        value,
        updated_at: updatedAt,
      });
      if (error) throw error;
      dirtyKeys.delete(key);
      markSynced(key);
      return true;
    } catch (e) {
      lastError = e;
      // Hors ligne : inutile de brûler les tentatives, le retour en ligne
      // relancera la synchronisation (voir l'écouteur "online" plus bas).
      if (typeof navigator !== "undefined" && !navigator.onLine) break;
    }
  }
  console.warn(`Synchronisation cloud impossible pour "${key}" :`, lastError);
  markFailed(key, lastError);
  return false;
}

// Dernière valeur connue de chaque clé, pour pouvoir tout re-pousser au retour
// en ligne sans dépendre du cycle de vie des composants.
const latestValues = new Map();

// Clés modifiées dont l'écriture cloud n'est pas encore confirmée. C'est ce
// sous-ensemble — presque toujours une seule clé — qu'on tente de sauver à la
// fermeture de la page, et non l'intégralité du patrimoine : une requête
// `keepalive` est plafonnée à 64 Ko de corps par la spécification.
const dirtyKeys = new Set();

// setState de chaque clé actuellement montée, pour pouvoir lui appliquer une
// valeur cloud plus récente sans repasser par un remontage du composant (voir
// pullAllFromCloud plus bas — c'est ce qui permet à la PWA du téléphone de se
// mettre à jour sans que l'utilisateur ait à fermer/rouvrir l'app).
const activeSetters = new Map();

/**
 * Identité courante, tenue à jour par l'abonnement d'authentification plutôt
 * que redemandée avant chaque lecture et chaque écriture.
 *
 * L'ancienne version appelait `supabase.auth.getUser()`, qui est une requête
 * RÉSEAU de validation du jeton. Avec une trentaine de clés persistées montées
 * dans le même rendu, le seul démarrage de l'application en déclenchait autant
 * — auxquelles s'ajoutait une lecture cloud par clé.
 *
 * `getSession()` lit la session déjà persistée localement par le SDK, sans
 * réseau. Le jeton d'accès est conservé ici parce que `flushAllToCloud` en a
 * besoin de façon SYNCHRONE : sur `pagehide`, plus aucune promesse n'a le
 * temps de se résoudre.
 */
let session = { userId: null, accessToken: null };

function appliquerSession(s) {
  session = { userId: s?.user?.id ?? null, accessToken: s?.access_token ?? null };
}

async function currentUserId() {
  if (!isSupabaseConfigured) return null;
  if (session.userId) return session.userId;
  const { data } = await supabase.auth.getSession();
  appliquerSession(data?.session);
  return session.userId;
}

/**
 * Lecture cloud MUTUALISÉE de toutes les clés de l'utilisateur, en une requête.
 *
 * Chaque `usePersistentState` interrogeait Supabase pour sa propre clé
 * (`eq(id).maybeSingle()`). C'est exactement le problème déjà corrigé pour le
 * polling — voir `pullAllFromCloud` — mais jamais pour le montage, qui est
 * pourtant le moment où toutes les clés arrivent d'un coup.
 *
 * La promesse est partagée : le premier hook qui se monte déclenche la
 * requête, tous les autres attendent le même résultat.
 */
let hydratationCloud = null;

function hydraterDepuisCloud() {
  if (hydratationCloud) return hydratationCloud;
  hydratationCloud = (async () => {
    const userId = await currentUserId();
    if (!userId) return new Map();
    const { data, error } = await supabase
      .from(TABLE)
      .select("key, value, updated_at")
      .eq("user_id", userId);
    if (error || !data) {
      // Un échec ne doit pas être mis en cache : sans cette remise à zéro, une
      // coupure réseau au démarrage ferait croire à toutes les clés que le
      // cloud est vide, et leur ferait pousser l'état local par-dessus.
      hydratationCloud = null;
      return new Map();
    }
    return new Map(data.map((row) => [row.key, row]));
  })();
  return hydratationCloud;
}

/**
 * Applique une ligne cloud localement si elle est plus récente que ce qu'on a
 * déjà (même arbitrage updated_at que dans l'effet de montage de
 * usePersistentState).
 */
function applyCloudRow(key, row) {
  const localUpdatedAt = readLocalUpdatedAt(key);
  if (localUpdatedAt && row.updated_at && row.updated_at <= localUpdatedAt) return;

  writeLocal(key, row.value, row.updated_at);
  latestValues.set(key, { value: row.value, updatedAt: row.updated_at });
  // La valeur locale vient d'être remplacée par celle du cloud : il n'y a plus
  // rien à y repousser, et la laisser marquée « à écrire » ferait renvoyer au
  // serveur ce qu'on vient d'en recevoir.
  dirtyKeys.delete(key);
  const setState = activeSetters.get(key);
  if (setState) setState(row.value);
  markSynced(key);
}

/**
 * Revérifie le cloud pour toutes les clés actuellement affichées. Déclenché
 * quand l'onglet/l'app revient au premier plan et à intervalles réguliers tant
 * qu'elle est visible — sans abonnement temps réel, juste de simples lectures
 * périodiques, pour que deux appareils connectés au même compte finissent
 * toujours par converger sans action manuelle.
 *
 * Une SEULE requête couvre toutes les clés (`in (…)`). L'ancienne version
 * bouclait en séquentiel avec un `maybeSingle()` par clé : avec ~24 clés
 * montées et un tick toutes les 10 s, cela représentait près de 9 000 requêtes
 * par heure d'application ouverte, pour un unique utilisateur.
 */
let isPolling = false;
async function pullAllFromCloud() {
  if (!isSupabaseConfigured || isPolling) return;
  if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
  const keys = [...activeSetters.keys()];
  if (keys.length === 0) return;
  isPolling = true;
  try {
    const userId = await currentUserId();
    if (!userId) return;
    const { data, error } = await supabase
      .from(TABLE)
      .select("key, value, updated_at")
      .in("id", keys.map((k) => `${userId}:${k}`));
    if (error || !data) return;
    data.forEach((row) => applyCloudRow(row.key, row));
  } finally {
    isPolling = false;
  }
}

// 45 s plutôt que 10 : le retour au premier plan (`visibilitychange`/`focus`)
// déclenche déjà une relecture immédiate, qui couvre le cas réel « je passe
// du téléphone à l'ordi ». Ce tick n'est qu'un filet pour l'app laissée
// ouverte au premier plan sur deux appareils à la fois.
const POLL_INTERVAL_MS = 45_000;

/**
 * Pousse immédiatement les clés en attente, sans attendre le débounce de
 * 800 ms — y compris quand la page est en train d'être détruite.
 *
 * L'ancienne version commençait par `await currentUserId()`, c'est-à-dire par
 * un appel réseau. Sur `pagehide`, le navigateur détruit la page bien avant sa
 * résolution : la boucle de poussée n'était jamais atteinte, et le cas que
 * cette fonction était précisément censée couvrir — « je saisis une valeur puis
 * je referme aussitôt » — restait perdu côté cloud.
 *
 * D'où deux changements : l'identité et le jeton sont déjà en mémoire (aucune
 * attente), et l'écriture part en `keepalive`, seule façon pour une requête de
 * survivre à la fermeture d'un onglet. Le client Supabase n'expose pas cette
 * option, on passe donc directement par PostgREST.
 */
function flushAllToCloud() {
  if (!isSupabaseConfigured || dirtyKeys.size === 0) return;
  const { userId, accessToken } = session;
  if (!userId || !accessToken) return;

  const lignes = [];
  for (const key of dirtyKeys) {
    const entry = latestValues.get(key);
    if (!entry) continue;
    lignes.push({
      id: `${userId}:${key}`,
      user_id: userId,
      key,
      value: entry.value,
      updated_at: entry.updatedAt,
    });
  }
  if (lignes.length === 0) return;

  try {
    fetch(`${supabaseConfig.url}/rest/v1/${TABLE}?on_conflict=id`, {
      method: "POST",
      keepalive: true,
      headers: {
        "Content-Type": "application/json",
        apikey: supabaseConfig.anonKey,
        Authorization: `Bearer ${accessToken}`,
        // `merge-duplicates` fait de ce POST un véritable upsert, comme celui
        // du client ; `return=minimal` évite de rapatrier les lignes écrites.
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(lignes),
    })
      .then((r) => {
        if (r.ok) lignes.forEach(({ key }) => dirtyKeys.delete(key));
      })
      // La page peut disparaître avant la réponse : l'écriture a tout de même
      // été émise, et les clés resteront marquées pour la prochaine ouverture.
      .catch(() => {});
  } catch {
    /* contexte déjà détruit : il n'y a plus rien à tenter */
  }
}

/** Réémission des clés en échec pendant que la page est encore bien vivante. */
async function repousserClesEnAttente() {
  if (!isSupabaseConfigured || dirtyKeys.size === 0) return;
  const userId = await currentUserId();
  if (!userId) return;
  for (const key of [...dirtyKeys]) {
    const entry = latestValues.get(key);
    if (entry) pushToCloud(key, entry.value, userId, entry.updatedAt);
  }
}

if (isSupabaseConfigured && typeof window !== "undefined") {
  markSyncEnabled();

  // L'identité est suivie à la source plutôt que redemandée : `onAuthStateChange`
  // émet la session courante dès l'abonnement, puis à chaque connexion,
  // déconnexion et rafraîchissement de jeton.
  supabase.auth.onAuthStateChange((_evenement, s) => {
    const precedent = session.userId;
    appliquerSession(s);
    // Changement de compte : ce qui a été hydraté ne concerne plus personne.
    if (session.userId !== precedent) hydratationCloud = null;
  });

  // Retour en ligne : la page est vivante, on repasse par le client normal et
  // ses réessais plutôt que par l'écriture d'urgence.
  window.addEventListener("online", repousserClesEnAttente);
  // Retour au premier plan (on rouvre la PWA, on change d'onglet) : on revérifie
  // tout de suite plutôt que d'attendre le prochain tick d'intervalle.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") pullAllFromCloud();
    else flushAllToCloud();
  });
  // pagehide couvre aussi la fermeture d'onglet/app, que visibilitychange ne
  // déclenche pas toujours de façon fiable selon les navigateurs.
  window.addEventListener("pagehide", flushAllToCloud);
  window.addEventListener("focus", pullAllFromCloud);
  setInterval(pullAllFromCloud, POLL_INTERVAL_MS);
}

/**
 * Équivalent de useState, mais qui lit/écrit automatiquement :
 * 1) dans le localStorage du navigateur (cache instantané, fonctionne hors-ligne),
 * 2) et — si un compte est connecté — dans Supabase (table `kv_store`), pour
 *    retrouver exactement les mêmes données sur n'importe quel autre appareil
 *    ou navigateur connecté au même compte.
 *
 * Arbitrage cloud/local : la version la plus récemment modifiée gagne
 * (comparaison des `updated_at`). Une modification faite localement pendant
 * que la requête cloud est en vol n'est donc plus écrasée — c'est le bug que
 * le drapeau `hasHydratedFromCloud`, posé mais jamais lu, était censé éviter.
 *
 * L'arbitrage repose entièrement sur le fait que l'horodatage local N'EST PAS
 * réécrit tant que la valeur n'a pas réellement changé. Les deux gardes qui
 * l'assurent — la lecture de `localUpdatedAt` avant tout `await`, et le
 * témoin `etatAuMontage` — sont indissociables : retirer l'une des deux
 * suffit à rendre la version cloud systématiquement perdante, sans qu'aucune
 * erreur ne soit visible. Le comportement est couvert par `storage.test.jsx`.
 *
 * Limite assumée : deux appareils modifiant la MÊME clé hors ligne en
 * parallèle ne fusionnent pas — le dernier à se reconnecter gagne. Un vrai
 * merge demanderait un modèle de données relationnel plutôt qu'un blob JSON
 * par clé (voir la note « Modèle de données » du README).
 */
export function usePersistentState(key, initialValue) {
  const [state, setState] = useState(() => readLocal(key, initialValue));
  const hasHydrated = useRef(false);
  const skipNextPush = useRef(false);
  const pushTimer = useRef(null);

  // Valeur exacte lue au montage. Elle sert de témoin : tant que l'état lui est
  // identique, rien n'a été modifié et il n'y a donc rien à réécrire.
  const etatAuMontage = useRef(state);

  // Le poll périodique (pullAllFromCloud) a besoin de pouvoir appliquer une
  // valeur cloud plus récente à ce composant précis, d'où cet enregistrement.
  useEffect(() => {
    activeSetters.set(key, setState);
    return () => activeSetters.delete(key);
  }, [key]);

  // Au montage : on compare la version cloud et la version locale, et on garde
  // la plus récente des deux.
  useEffect(() => {
    let cancelled = false;
    if (!isSupabaseConfigured) {
      hasHydrated.current = true;
      return undefined;
    }
    // Horodatage local lu MAINTENANT, pendant le rendu de l'effet et donc
    // avant tout ce que la suite pourrait écrire. C'était la cause du bug :
    // l'effet de persistance ci-dessous s'exécutait avant que cette requête
    // n'aboutisse et repoussait l'horodatage local à « maintenant ». La
    // comparaison `cloud > local` devenait alors structurellement fausse, et
    // AUCUNE version cloud ne pouvait plus jamais être adoptée au montage —
    // le contraire exact de ce que ce bloc est censé faire.
    const localUpdatedAt = readLocalUpdatedAt(key);

    (async () => {
      let lignes;
      try {
        lignes = await hydraterDepuisCloud();
      } catch (e) {
        markFailed(key, e);
        hasHydrated.current = true;
        return;
      }
      const userId = session.userId;
      if (!userId || cancelled) {
        hasHydrated.current = true;
        return;
      }

      const data = lignes.get(key) || null;
      const cloudIsNewer =
        data && (!localUpdatedAt || (data.updated_at && data.updated_at > localUpdatedAt));

      if (cloudIsNewer) {
        skipNextPush.current = true;
        setState(data.value);
        writeLocal(key, data.value, data.updated_at);
        latestValues.set(key, { value: data.value, updatedAt: data.updated_at });
        markSynced(key);
      } else {
        // Rien en cloud (premier appareil), ou version locale plus récente :
        // c'est le local qui fait foi et qu'on pousse. La clé est marquée en
        // attente le temps de la poussée — `pushToCloud` la libère en cas de
        // succès — pour qu'une fermeture immédiate de l'onglet la rattrape.
        const updatedAt = localUpdatedAt || new Date().toISOString();
        latestValues.set(key, { value: state, updatedAt });
        dirtyKeys.add(key);
        pushToCloud(key, state, userId, updatedAt);
      }
      hasHydrated.current = true;
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // À chaque changement : cache local instantané, puis push cloud débouncé
  // pour ne pas écrire en base à chaque frappe.
  useEffect(() => {
    // Rien n'a changé depuis le montage : l'état est encore exactement celui
    // qui a été lu dans le localStorage. Le réécrire ne changerait pas son
    // contenu mais repousserait son horodatage à « maintenant », faisant
    // paraître cet appareil plus récent que le cloud à chaque ouverture — et
    // écrasant au passage une saisie faite ailleurs. C'est l'autre moitié du
    // même bug que celui traité dans l'effet d'hydratation.
    if (state === etatAuMontage.current) {
      latestValues.set(key, {
        value: state,
        updatedAt: readLocalUpdatedAt(key) || new Date().toISOString(),
      });
      return undefined;
    }

    // Valeur qui vient d'être adoptée depuis le cloud : elle est déjà écrite en
    // local avec l'horodatage du cloud. La ré-horodater la ferait passer pour
    // une modification de cet appareil.
    if (skipNextPush.current) {
      skipNextPush.current = false;
      return undefined;
    }

    const updatedAt = new Date().toISOString();
    writeLocal(key, state, updatedAt);
    latestValues.set(key, { value: state, updatedAt });

    if (!isSupabaseConfigured) return undefined;
    dirtyKeys.add(key);

    clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(async () => {
      const userId = await currentUserId();
      if (!userId) return;
      pushToCloud(key, state, userId, updatedAt);
    }, DEBOUNCE_MS);
    return () => clearTimeout(pushTimer.current);
  }, [state, key]);

  return [state, setState];
}

/**
 * Remet à zéro les caches de module (session, hydratation, clés en attente).
 * Réservé aux tests : ces caches sont volontairement partagés par toutes les
 * instances du hook, ils survivent donc au démontage des composants.
 */
export function _resetStorageCache() {
  session = { userId: null, accessToken: null };
  hydratationCloud = null;
  latestValues.clear();
  dirtyKeys.clear();
  activeSetters.clear();
}

/** État de synchronisation courant, pour l'indicateur de l'interface. */
export function useSyncStatus() {
  return useSyncExternalStore(subscribeSync, getSyncState, getSyncState);
}

/** Force une réécriture cloud de toutes les clés en échec. */
export function useRetrySync() {
  return useCallback(async () => {
    if (!isSupabaseConfigured) return;
    const userId = await currentUserId();
    if (!userId) return;
    for (const [key, entry] of latestValues) {
      await pushToCloud(key, entry.value, userId, entry.updatedAt);
    }
  }, []);
}

/**
 * Bouton "Actualiser" manuel : relit le cloud tout de suite et applique ce
 * qu'il trouve de plus récent, sans attendre le prochain tick de polling. Le
 * moyen le plus simple et le plus fiable de forcer la synchro à la demande,
 * quel que soit l'appareil.
 */
export function useManualRefresh() {
  return useCallback(() => pullAllFromCloud(), []);
}

export function exportAllData(keys) {
  const dump = {};
  keys.forEach((k) => {
    const raw = localStorage.getItem(PREFIX + k);
    if (raw) {
      try {
        dump[k] = JSON.parse(raw);
      } catch {
        /* ignore */
      }
    }
  });
  return dump;
}

export function importAllData(dump) {
  const now = new Date().toISOString();
  Object.entries(dump).forEach(([k, v]) => {
    localStorage.setItem(PREFIX + k, JSON.stringify(v));
    // On horodate l'import au moment présent : sans cela, la version cloud
    // (plus récente) écraserait la sauvegarde qu'on vient tout juste de
    // restaurer, au prochain chargement.
    localStorage.setItem(META_PREFIX + k, now);
  });
}

export function clearAllData(keys) {
  keys.forEach((k) => {
    localStorage.removeItem(PREFIX + k);
    localStorage.removeItem(META_PREFIX + k);
    // Sans cet oubli en mémoire, le `pagehide` déclenché par le rechargement
    // qui suit la réinitialisation repoussait aussitôt vers le cloud les
    // valeurs qu'on vient d'effacer.
    latestValues.delete(k);
    dirtyKeys.delete(k);
  });
}

export async function clearCloudData(keys) {
  if (!isSupabaseConfigured) return;
  const userId = await currentUserId();
  if (!userId) return;
  await supabase.from(TABLE).delete().in(
    "id",
    keys.map((k) => `${userId}:${k}`)
  );
}

/**
 * Date du dernier export de sauvegarde, pour pouvoir rappeler à l'utilisateur
 * qu'il n'a pas de copie hors du navigateur depuis longtemps.
 */
const LAST_BACKUP_KEY = "patrimoine:__lastBackupAt";

export function getLastBackupAt() {
  try {
    return localStorage.getItem(LAST_BACKUP_KEY);
  } catch {
    return null;
  }
}

export function markBackupDone() {
  try {
    localStorage.setItem(LAST_BACKUP_KEY, new Date().toISOString());
  } catch {
    /* stockage indisponible : on n'insiste pas */
  }
}
