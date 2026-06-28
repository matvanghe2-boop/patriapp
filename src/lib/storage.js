import { useState, useEffect } from "react";

const PREFIX = "patrimoine:";

/**
 * Équivalent de useState, mais qui lit/écrit automatiquement dans le
 * localStorage du navigateur. Toutes les données restent en local sur
 * la machine de l'utilisateur — aucun serveur externe n'est utilisé.
 */
export function usePersistentState(key, initialValue) {
  const [state, setState] = useState(() => {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      return raw ? JSON.parse(raw) : initialValue;
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(state));
    } catch (e) {
      console.warn("Sauvegarde locale impossible :", e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return [state, setState];
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
