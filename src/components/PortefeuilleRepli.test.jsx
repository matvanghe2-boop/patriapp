/**
 * Repli des blocs de l'écran Portefeuille, de bout en bout.
 *
 * Le composant `CarteRepliable` avait ses propres tests, mais rien ne
 * garantissait qu'il soit effectivement BRANCHÉ sur chaque bloc. Il ne l'était
 * pas : sur huit blocs, trois — Plan de rééquilibrage, Watchlist et Répartition
 * sectorielle — n'avaient aucun bouton, et cliquer dessus ne faisait
 * strictement rien. Un composant qui marche mais qu'on a oublié de câbler est
 * indiscernable, pour qui s'en sert, d'un composant cassé.
 *
 * Ce test monte l'application entière et exerce chaque bloc, un par un.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Ce fichier monte l'application entière : il lui faut plus que le délai
// global de 30 s déclaré dans vite.config.js.
vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

// Stockage local pur : la coquille et la persistance sont identiques, sans
// avoir à simuler une session Supabase.
vi.mock("./../lib/supabaseClient", () => ({
  isSupabaseConfigured: false,
  supabase: null,
  supabaseConfig: { url: "", anonKey: "" },
}));

import App from "../App.jsx";
import { AuthProvider } from "../lib/AuthContext";
import { PatrimoineProvider } from "../lib/PatrimoineContext";
import { ToastProvider } from "../lib/ToastContext";
import { ConfirmProvider } from "../lib/ConfirmContext";

function renderApp() {
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

beforeEach(() => {
  localStorage.clear();
  window.location.hash = "#/bourse";
});

/** Les huit blocs repliables de l'onglet Portefeuille, avec leur clé stockée. */
const BLOCS = [
  [/Plafond de versements PEA/, "plafondPea"],
  [/Plus-value nette après impôt/, "fiscalite"],
  [/Revenus de dividendes estimés/, "dividendes"],
  [/^Positions\b/, "positions"],
  [/Plan de rééquilibrage/, "reequilibrage"],
  [/Watchlist/, "watchlist"],
  [/Répartition par ligne/, "repartition"],
  [/Répartition sectorielle/, "heatmap"],
];

describe("repli des blocs du Portefeuille", () => {
  it.each(BLOCS)("replie et déplie « %s »", async (motif, cle) => {
    renderApp();

    const bouton = await screen.findByRole("button", { name: motif }, { timeout: 30_000 });
    expect(bouton).toHaveAttribute("aria-expanded", "true");

    await userEvent.click(bouton);
    expect(screen.getByRole("button", { name: motif })).toHaveAttribute("aria-expanded", "false");

    // La préférence est écrite immédiatement : c'est ce qui la fait survivre au
    // rechargement, sans attendre un quelconque débounce.
    expect(JSON.parse(localStorage.getItem("patrimoine:widgetsReplies") || "{}")[cle]).toBe(true);

    await userEvent.click(screen.getByRole("button", { name: motif }));
    expect(screen.getByRole("button", { name: motif })).toHaveAttribute("aria-expanded", "true");
  });

  it("retrouve les blocs repliés au rechargement", async () => {
    localStorage.setItem(
      "patrimoine:widgetsReplies",
      JSON.stringify({ positions: true, watchlist: true })
    );

    renderApp();

    // Rien n'a été cliqué : l'état vient du stockage seul.
    expect(await screen.findByRole("button", { name: /^Positions\b/ }, { timeout: 30_000 })).toHaveAttribute(
      "aria-expanded",
      "false"
    );
    expect(screen.getByRole("button", { name: /Watchlist/ })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: /Revenus de dividendes estimés/ })).toHaveAttribute(
      "aria-expanded",
      "true"
    );
  });
});
