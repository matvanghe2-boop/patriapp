import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import Login, { LOCAL_ONLY_FLAG } from "./components/Login.jsx";
import { isSupabaseConfigured } from "./lib/supabaseClient";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import MiseAJourDisponible from "./components/MiseAJourDisponible.jsx";
import { AuthProvider, useAuth } from "./lib/AuthContext";
import { ToastProvider } from "./lib/ToastContext";
import { ConfirmProvider } from "./lib/ConfirmContext";
import { PatrimoineProvider } from "./lib/PatrimoineContext";
import "./index.css";

function AuthGate() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div role="status" className="text-sm text-slate-500">
          Chargement…
        </div>
      </div>
    );
  }
  // Tant qu'aucune déconnexion explicite n'a eu lieu, la session Supabase
  // persiste automatiquement (voir supabaseClient.js) — donc `user` reste
  // renseigné d'une visite à l'autre, sans repasser par cet écran de connexion.
  // Sans Supabase configuré, l'app reste pleinement utilisable en stockage
  // local : une variable d'environnement oubliée au déploiement ne doit pas
  // transformer l'écran de connexion en cul-de-sac.
  const localOnly = !isSupabaseConfigured && sessionStorage.getItem(LOCAL_ONLY_FLAG) === "1";
  if (!user && !localOnly) return <Login />;

  // Le provider patrimonial n'est monté qu'une fois l'utilisateur connu :
  // usePersistentState interroge Supabase dès son montage, il ne doit pas
  // partir avant que la session soit établie.
  return (
    <PatrimoineProvider>
      <App />
    </PatrimoineProvider>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <ToastProvider>
          <ConfirmProvider>
            <AuthGate />
            {/* Hors de l'AuthGate : une mise à jour doit pouvoir être annoncée
                même sur l'écran de connexion. */}
            <MiseAJourDisponible />
          </ConfirmProvider>
        </ToastProvider>
      </AuthProvider>
    </ErrorBoundary>
  </React.StrictMode>
);

// Service worker : rend l'app installable (icône écran d'accueil / bureau)
// et prépare le terrain pour de vraies notifications push si un backend est
// ajouté un jour. Sans HTTPS (ex: dev local en http://localhost), certains
// navigateurs l'autorisent quand même sur localhost.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Échec silencieux : l'app fonctionne normalement sans service worker,
      // seule l'installation / les futures notifications push seraient indisponibles.
    });
  });
}
