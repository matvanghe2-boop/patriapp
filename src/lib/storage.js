import { useState, useEffect, useRef } from "react";
import { supabase, isSupabaseConfigured } from "./supabaseClient";

const PREFIX = "patrimoine:";
const TABLE = "kv_store";
const DEBOUNCE_MS = 800;

function readLocal(key, initialValue) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? JSON.parse(raw) : initialValue;
  } catch {
    return initialValue;
  }
}

function writeLocal(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch (e) {
    console.warn("Sauvegarde locale impossible :", e);
  }
}

/**
 * Équivalent de useState, mais qui lit/écrit automatiquement :
 * 1) dans le localStorage du navigateur (cache instantané, fonctionne hors-ligne),
 * 2) et — si un compte est connecté — dans Supabase (table `kv_store`), pour
 *    retrouver exactement les mêmes données sur n'importe quel autre appareil
 *    ou navigateur connecté au même compte.
 *
 * Cette fonction n'est appelée qu'une fois l'utilisateur authentifié (voir
 * <AuthGate> dans main.jsx), donc `supabase.auth.getUser()` renvoie déjà un
 * utilisateur valide dès le premier appel.
 */
export function usePersistentState(key, initialValue) {
  const [state, setState] = useState(() => readLocal(key, initialValue));
  const hasHydratedFromCloud = useRef(false);
  const skipNextPush = useRef(false);
  const pushTimer = useRef(null);

  // Au montage : on va chercher la version cloud la plus récente. Si elle
  // existe, elle prend le dessus sur le cache local (l'appareil qu'on utilise
  // là n'a peut-être pas les dernières modifs faites depuis un autre appareil).
  useEffect(() => {
    let cancelled = false;
    if (!isSupabaseConfigured) return undefined;
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;
      if (!user || cancelled) return;
      const { data, error } = await supabase
        .from(TABLE)
        .select("value")
        .eq("id", `${user.id}:${key}`)
        .maybeSingle();
      if (cancelled) return;
      if (!error && data) {
        skipNextPush.current = true;
        setState(data.value);
        writeLocal(key, data.value);
      } else {
        // Rien en cloud pour cette clé (premier appareil / première fois) :
        // on pousse la valeur locale actuelle pour amorcer la synchro.
        pushToCloud(key, state, user.id);
      }
      hasHydratedFromCloud.current = true;
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // À chaque changement : cache local instantané (comme avant), puis push
  // cloud débouncé pour ne pas spammer la base à chaque frappe.
  useEffect(() => {
    writeLocal(key, state);

    if (skipNextPush.current) {
      skipNextPush.current = false;
      return;
    }
    if (!isSupabaseConfigured) return;

    clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(async () => {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;
      if (!user) return;
      pushToCloud(key, state, user.id);
    }, DEBOUNCE_MS);
    return () => clearTimeout(pushTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, key]);

  return [state, setState];
}

async function pushToCloud(key, value, userId) {
  try {
    await supabase.from(TABLE).upsert({
      id: `${userId}:${key}`,
      user_id: userId,
      key,
      value,
      updated_at: new Date().toISOString(),
    });
  } catch (e) {
    console.warn("Synchronisation cloud impossible :", e);
  }
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
  Object.entries(dump).forEach(([k, v]) => {
    localStorage.setItem(PREFIX + k, JSON.stringify(v));
  });
}

export function clearAllData(keys) {
  keys.forEach((k) => localStorage.removeItem(PREFIX + k));
}

export async function clearCloudData(keys) {
  if (!isSupabaseConfigured) return;
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) return;
  await supabase.from(TABLE).delete().in("id", keys.map((k) => `${user.id}:${k}`));
}

export async function pushAllToCloud(dump) {
  if (!isSupabaseConfigured) return;
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) return;
  const rows = Object.entries(dump).map(([key, value]) => ({
    id: `${user.id}:${key}`, user_id: user.id, key, value, updated_at: new Date().toISOString(),
  }));
  if (rows.length) await supabase.from(TABLE).upsert(rows);
}