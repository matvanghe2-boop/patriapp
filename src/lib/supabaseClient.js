import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && anonKey);

if (!isSupabaseConfigured) {
  // On ne bloque pas l'app : elle reste utilisable en local uniquement
  // (comme avant), avec un message clair pour toi côté écran de connexion.
  console.warn(
    "Supabase non configuré : ajoute VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY (voir .env.example) pour activer la synchronisation multi-appareils."
  );
}

// `persistSession: true` + `autoRefreshToken: true` (valeurs par défaut du
// SDK) : la session est gardée dans le localStorage du navigateur et
// rafraîchie automatiquement. Tant que tu ne cliques pas sur
// "Se déconnecter", tu restes connecté(e) — y compris après avoir fermé
// l'onglet, redémarré l'appareil, etc.
export const supabase = isSupabaseConfigured
  ? createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;
