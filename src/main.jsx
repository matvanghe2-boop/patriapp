import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
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
