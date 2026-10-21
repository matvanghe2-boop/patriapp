/**
 * Remplissage automatique du dividende par action, de bout en bout.
 *
 * Défaut rapporté : sur un portefeuille déjà renseigné à la main, rien ne se
 * mettait à jour. Deux causes : les anciennes saisies étaient protégées comme
 * des choix, et le remplissage n'était déclenché que par le bouton
 * « Actualiser les cours », alors que les cours s'actualisent seuls à
 * l'ouverture de l'onglet. Ce test monte l'application, ouvre PEA & Bourse
 * SANS rien cliquer, et vérifie que la valeur du marché a remplacé l'ancienne.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

vi.mock("./../lib/supabaseClient", () => ({
  isSupabaseConfigured: false,
  supabase: null,
  supabaseConfig: { url: "", anonKey: "" },
}));

const fetchScreen = vi.fn(async (symboles) =>
  symboles.map((s) => ({ symbole: s, ok: true, dividendeParAction: s === "AI.PA" ? 3.36 : null }))
);
const fetchHistory = vi.fn(async (symboles, _range, _intervalle, options) =>
  options?.dividendes
    ? symboles.map((s) => ({
        symbol: s,
        ok: true,
        series: [],
        dividendes: s === "AI.PA" ? [{ date: "2026-05-18", montant: 3.36 }] : [],
      }))
    : []
);

vi.mock("../lib/api", async (importOriginal) => {
  const reel = await importOriginal();
  return {
    ...reel,
    fetchScreen: (...a) => fetchScreen(...a),
    fetchHistory: (...a) => fetchHistory(...a),
    fetchQuotes: async () => [],
    fetchTauxChange: async () => [],
  };
});

import App from "../App.jsx";
import { AuthProvider } from "../lib/AuthContext";
import { PatrimoineProvider } from "../lib/PatrimoineContext";
import { ToastProvider } from "../lib/ToastContext";
import { ConfirmProvider } from "../lib/ConfirmContext";

const lireBourse = () => JSON.parse(localStorage.getItem("patrimoine:bourse") || "{}");

beforeEach(() => {
  localStorage.clear();
  fetchScreen.mockClear();
  // Un portefeuille renseigné AVANT le remplissage automatique : dividende
  // tapé à la main, sans source.
  localStorage.setItem(
    "patrimoine:bourse",
    JSON.stringify({
      envelope: "PEA",
      cash_pocket: 0,
      operations: [],
      positions: [
        { id: "ai", ticker: "AI.PA", name: "Air Liquide", quantity: 10, pru: 150, current_price: 175, type: "Action", annual_dividend: 3 },
        { id: "cw8", ticker: "CW8.PA", name: "Amundi MSCI World", quantity: 2, pru: 400, current_price: 500, type: "ETF", annual_dividend: 0 },
      ],
    })
  );
  window.location.hash = "#/bourse";
});

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

describe("dividende par action automatique", () => {
  it("met à jour une ancienne saisie dès l'ouverture de l'onglet, sans clic", async () => {
    renderApp();
    await waitFor(() => expect(fetchScreen).toHaveBeenCalled(), { timeout: 30_000 });
    await waitFor(
      () => {
        const ai = lireBourse().positions.find((p) => p.ticker === "AI.PA");
        expect(ai.annual_dividend).toBe(3.36);
        expect(ai.dividendeSource).toBe("auto");
        expect(ai.dividendeMois).toEqual({ 5: 1 });
      },
      { timeout: 30_000 }
    );
    // L'ETF capitalisant est marqué vérifié, à zéro.
    const cw8 = lireBourse().positions.find((p) => p.ticker === "CW8.PA");
    expect(cw8.annual_dividend).toBe(0);
    expect(cw8.dividendeVerifieLe).toBeTruthy();
    // Et la mise à jour est annoncée, avec de quoi l'annuler.
    expect(await screen.findByText(/Dividende par action mis à jour : AI\.PA/)).toBeInTheDocument();
  });

  it("ne réinterroge pas la source la semaine suivante", async () => {
    const b = lireBourse();
    const aujourdhui = new Date().toISOString().slice(0, 10);
    b.positions = b.positions.map((p) => ({ ...p, dividendeVerifieLe: aujourdhui }));
    localStorage.setItem("patrimoine:bourse", JSON.stringify(b));

    renderApp();
    await screen.findByRole("tab", { name: /Portefeuille/ }, { timeout: 30_000 });
    // Laisse aux effets de montage le temps de partir s'ils devaient le faire.
    await new Promise((r) => setTimeout(r, 1500));
    expect(fetchScreen).not.toHaveBeenCalled();
  });
});
