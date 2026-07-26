import { useState, useEffect, useRef, useCallback, useSyncExternalStore } from "react";
import { supabase, isSupabaseConfigured } from "./supabaseClient";
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

async function currentUserId() {
  const { data } = await supabase.auth.getUser();
  return data?.user?.id ?? null;
}

if (isSupabaseConfigured && typeof window !== "undefined") {
  markSyncEnabled();
  window.addEventListener("online", async () => {
    const userId = await currentUserId();
    if (!userId) return;
    for (const [key, entry] of latestValues) {
      pushToCloud(key, entry.value, userId, entry.updatedAt);
    }
  });
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

  // Au montage : on compare la version cloud et la version locale, et on garde
  // la plus récente des deux.
  useEffect(() => {
    let cancelled = false;
    if (!isSupabaseConfigured) {
      hasHydrated.current = true;
      return undefined;
    }
    (async () => {
      let userId;
      try {
        userId = await currentUserId();
      } catch (e) {
        markFailed(key, e);
        hasHydrated.current = true;
        return;
      }
      if (!userId || cancelled) {
        hasHydrated.current = true;
        return;
      }

      const { data, error } = await supabase
        .from(TABLE)
        .select("value, updated_at")
        .eq("id", `${userId}:${key}`)
        .maybeSingle();
      if (cancelled) return;

      const localUpdatedAt = readLocalUpdatedAt(key);
      const cloudIsNewer =
        !error && data && (!localUpdatedAt || (data.updated_at && data.updated_at > localUpdatedAt));

      if (cloudIsNewer) {
        skipNextPush.current = true;
        setState(data.value);
        writeLocal(key, data.value, data.updated_at);
        latestValues.set(key, { value: data.value, updatedAt: data.updated_at });
        markSynced(key);
      } else {
        // Rien en cloud (premier appareil), ou version locale plus récente :
        // c'est le local qui fait foi et qu'on pousse.
        const updatedAt = localUpdatedAt || new Date().toISOString();
        latestValues.set(key, { value: state, updatedAt });
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
    const updatedAt = new Date().toISOString();
    writeLocal(key, state, updatedAt);
    latestValues.set(key, { value: state, updatedAt });

    if (skipNextPush.current) {
      skipNextPush.current = false;
      return undefined;
    }
    if (!isSupabaseConfigured) return undefined;

    clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(async () => {
      const userId = await currentUserId();
      if (!userId) return;
      pushToCloud(key, state, userId, updatedAt);
    }, DEBOUNCE_MS);
    return () => clearTimeout(pushTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, key]);

  return [state, setState];
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

export async function pushAllToCloud(dump) {
  if (!isSupabaseConfigured) return;
  const userId = await currentUserId();
  if (!userId) return;
  const now = new Date().toISOString();
  const rows = Object.entries(dump).map(([key, value]) => ({
    id: `${userId}:${key}`,
    user_id: userId,
    key,
    value,
    updated_at: now,
  }));
  if (rows.length) await supabase.from(TABLE).upsert(rows);
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
