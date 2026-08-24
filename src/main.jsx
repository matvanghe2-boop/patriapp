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
import { ApparenceProvider } from "./lib/ApparenceContext";
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
      {/* Les préférences d'affichage passent par `usePersistentState`, donc
          par Supabase : elles doivent être montées SOUS l'authentification,
          comme le reste de l'état persisté. */}
      <ApparenceProvider>
        <App />
      </ApparenceProvider>
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
/*
 * ENREGISTREMENT RÉSERVÉ À LA PRODUCTION.
 *
 * En développement, Vite sert chaque module sous son propre chemin
 * (`/src/lib/themes.js`) — des URL stables, sans empreinte. Le service worker
 * les prend pour des ressources de coquille et les met en cache « cache
 * d'abord » : après une modification, le navigateur continue de servir
 * l'ANCIEN module. Le symptôme est déroutant au possible, du genre « le module
 * ne fournit pas l'export X » alors que le fichier sur le disque le fournit
 * bel et bien, et il survit à un rechargement forcé.
 *
 * En production le problème n'existe pas : les fragments produits par Vite
 * portent une empreinte dans leur nom, et changent donc d'URL à chaque build.
 */
/*
 * NETTOYAGE EN DÉVELOPPEMENT.
 *
 * Ne plus enregistrer le service worker ne suffit pas : celui qui a été
 * enregistré lors d'une session précédente continue de contrôler la page, et
 * de servir depuis son cache les modules `/src/*.js` et la feuille de style.
 * On voit alors du code d'hier avec un message qui ne colle à rien — « le
 * module ne fournit pas l'export X » alors que le fichier le fournit, ou des
 * règles CSS pourtant présentes dans la source et absentes à l'exécution.
 * Le symptôme survit au rechargement forcé, ce qui le rend particulièrement
 * difficile à relier à sa cause.
 *
 * On désenregistre donc activement, et on vide les caches qu'il avait posés.
 */
if ("serviceWorker" in navigator && import.meta.env.DEV) {
  navigator.serviceWorker.getRegistrations().then((regs) => {
    if (regs.length === 0) return;
    Promise.all(regs.map((r) => r.unregister()))
      .then(() => caches.keys())
      .then((noms) => Promise.all(noms.filter((n) => n.startsWith("patrium")).map((n) => caches.delete(n))))
      .then(() => window.location.reload());
  });
}

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Échec silencieux : l'app fonctionne normalement sans service worker,
      // seule l'installation / les futures notifications push seraient indisponibles.
    });
  });
}
