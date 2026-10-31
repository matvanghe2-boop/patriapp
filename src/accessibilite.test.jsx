import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import axe from "axe-core";

/**
 * Contrôle d'accessibilité automatique de chaque onglet (axe-core).
 *
 * Beaucoup de corrections d'accessibilité ont été faites à la main —
 * étiquettes reliées aux champs, rôles des onglets, boutons nommés. Rien ne
 * les empêchait de régresser en silence. Ce test monte chaque onglet et
 * échoue sur toute violation de niveau « sérieux » ou « critique ».
 *
 * LIMITE ASSUMÉE : jsdom ne calcule pas les couleurs rendues, le contraste
 * (`color-contrast`) ne peut donc pas être vérifié ici. Il demanderait un vrai
 * navigateur.
 */

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

vi.mock("./lib/supabaseClient", () => ({ isSupabaseConfigured: false, supabase: null }));

import App from "./App.jsx";
import { AuthProvider } from "./lib/AuthContext";
import { PatrimoineProvider, DEMO_DATASET } from "./lib/PatrimoineContext";
import { ToastProvider } from "./lib/ToastContext";
import { ConfirmProvider } from "./lib/ConfirmContext";

const ONGLETS = [
  ["dashboard", /dashboard/i],
  ["compte", /compte/i],
  ["livrets", /livrets/i],
  ["bourse", /bourse|portefeuille/i],
  ["simulation", /simulation|projection/i],
  ["strategie", /stratégie/i],
  ["abonnements", /abonnements/i],
];

async function violations(conteneur) {
  const resultat = await axe.run(conteneur, {
    rules: {
      // Voir la limite ci-dessus.
      "color-contrast": { enabled: false },
    },
    resultTypes: ["violations"],
  });
  return resultat.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id} (${v.impact}) : ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
}

beforeEach(() => {
  localStorage.clear();
  // L'application démarre en mode local, sans l'écran d'accueil de la synchro.
  localStorage.setItem("patrimoine:modeLocal", "true");
});

function monter() {
  return render(
    <AuthProvider>
      <ToastProvider>
        <ConfirmProvider>
          <PatrimoineProvider>
            <App />
          </PatrimoineProvider>
        </ConfirmProvider>
      </ToastProvider>
    </AuthProvider>
  );
}

// Deux passages : l'application vide (premier écran d'un nouvel arrivant) et
// le jeu d'exemple, qui fait apparaître tableaux, listes et formulaires.
for (const [cas, preparer] of [
  ["vide", () => {}],
  [
    "avec le jeu d'exemple",
    () => {
      for (const [cle, valeur] of Object.entries(DEMO_DATASET)) {
        localStorage.setItem(`patrimoine:${cle}`, JSON.stringify(valeur));
      }
    },
  ],
]) {
  describe(`accessibilité des onglets — ${cas}`, () => {
    for (const [onglet, titre] of ONGLETS) {
      it(`« ${onglet} » ne présente aucune violation sérieuse`, async () => {
        preparer();
        window.location.hash = `#/${onglet}`;
        const { container } = monter();
        await screen.findByRole("heading", { level: 1, name: titre }, { timeout: 60_000 });
        expect(await violations(container)).toEqual([]);
      });
    }
  });
}
