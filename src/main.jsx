import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import Login from "./components/Login.jsx";
import { AuthProvider, useAuth } from "./lib/AuthContext";
import "./index.css";
import { ToastProvider } from "./lib/ToastContext";

function AuthGate() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="text-sm text-slate-500">Chargement…</div>
      </div>
    );
  }
  // Tant qu'aucune déconnexion explicite n'a eu lieu, la session Supabase
  // persiste automatiquement (voir supabaseClient.js) — donc `user` reste
  // renseigné d'une visite à l'autre, sans repasser par cet écran de connexion.
  return user ? <App /> : <Login />;
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AuthProvider>
     <ToastProvider>
      <AuthGate />
     <ToastProvider>
    </AuthProvider>
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
