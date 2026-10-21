import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

/** Un an de clôtures déterministes, liées par un facteur commun. */
function serie(facteur, decalage = 0) {
  const points = [];
  let cours = 100;
  for (let i = 0; i < 120; i++) {
    cours *= 1 + Math.sin(i * 1.3 + decalage) * 0.01 * facteur;
    points.push({ date: new Date(Date.UTC(2025, 10, 1 + i)).toISOString().slice(0, 10), close: cours });
  }
  return points;
}

vi.mock("../lib/api", () => ({
  fetchHistory: vi.fn(async (symboles) =>
    symboles.map((s) => ({ symbol: s, ok: true, series: s === "AI.PA" ? serie(1) : s === "SU.PA" ? serie(1.2) : serie(1, 2) }))
  ),
}));

import FicheLigne from "./FicheLigne";

const bourse = {
  envelope: "PEA",
  positions: [
    { id: "ai", ticker: "AI.PA", name: "Air Liquide", type: "Action", quantity: 10, pru: 150, current_price: 175, previousClose: 170, annual_dividend: 3.36, dividendeSource: "auto", dividendeMois: { 5: 1 } },
    { id: "su", ticker: "SU.PA", name: "Schneider", type: "Action", quantity: 5, pru: 200, current_price: 220 },
    { id: "tte", ticker: "TTE.PA", name: "TotalEnergies", type: "Action", quantity: 8, pru: 55, current_price: 60 },
  ],
  operations: [
    { id: "o1", date: "2025-03-10", type: "ACHAT", asset: "AI.PA", quantity: 10, price: 150, fees: 2 },
    { id: "o2", date: "2026-05-22", type: "DIVIDENDE", asset: "AI.PA", amount: 33.6 },
    { id: "o3", date: "2026-02-01", type: "ACHAT", asset: "SU.PA", quantity: 5, price: 200 },
  ],
};

describe("FicheLigne", () => {
  it("rassemble position, dividendes, thèse et opérations de la ligne", async () => {
    render(
      <FicheLigne
        position={bourse.positions[0]}
        onClose={() => {}}
        bourse={bourse}
        strategyNotes={[{ id: "n", ticker: "AI.PA", titre: "Gaz industriels", these: "Croissance régulière.", objectif_cours: "200", statut: "intacte" }]}
      />
    );
    expect(screen.getByRole("dialog", { name: /Fiche de la ligne AI\.PA/ })).toBeInTheDocument();
    expect(screen.getByText("Air Liquide")).toBeInTheDocument();
    // Dividende : source et mois de détachement.
    expect(screen.getByText(/source de marché/)).toBeInTheDocument();
    expect(screen.getByText(/détaché en mai l'an dernier/)).toBeInTheDocument();
    expect(screen.getByText(/en 1 versement, le dernier/)).toBeInTheDocument();
    // Thèse et objectif de cours.
    expect(screen.getByText("Gaz industriels")).toBeInTheDocument();
    expect(screen.getByText(/Objectif de cours/)).toBeInTheDocument();
    // Le journal ne montre QUE les opérations de cette ligne.
    expect(screen.getByText("Achat")).toBeInTheDocument();
    expect(screen.queryAllByText("Achat")).toHaveLength(1);
    // Corrélation avec le reste du portefeuille, une fois les cours chargés.
    expect(await screen.findByText(/Bouge le plus avec/)).toBeInTheDocument();
  });

  it("invite à noter une thèse quand il n'y en a pas", () => {
    render(<FicheLigne position={bourse.positions[1]} onClose={() => {}} bourse={bourse} />);
    expect(screen.getByText(/Aucune thèse notée pour cette ligne/)).toBeInTheDocument();
  });
});
