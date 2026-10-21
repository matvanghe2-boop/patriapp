import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

/**
 * Un titre coté en euros dont les comptes sont publiés en dollars — le cas de
 * TotalEnergies. Le PER historique divisait des euros par des dollars.
 */
const exercice = (annee, v) => ({
  exercice: `${annee}-12-31`,
  TotalRevenue: 200e9,
  NetIncome: 15e9,
  TotalAssets: 290e9,
  OperatingCashFlow: 30e9,
  LongTermDebt: 45e9,
  CurrentAssets: 95e9,
  CurrentLiabilities: 90e9,
  GrossProfit: 55e9,
  OrdinarySharesNumber: 2300e6,
  CashDividendsPaid: -8e9,
  RepurchaseOfCapitalStock: -8e9,
  DilutedEPS: 6,
  coursCloture: 55,
  ...v,
});

const FICHE = {
  devise: "EUR",
  deviseComptes: "USD",
  secteur: "Energy",
  industrie: "Oil & Gas Integrated",
  cours: 60,
  capitalisation: 130e9,
  per: 9,
  historique: [
    exercice(2022, { OrdinarySharesNumber: 2480e6, DilutedEPS: 8 }),
    exercice(2023, { OrdinarySharesNumber: 2350e6, DilutedEPS: 8 }),
    exercice(2024, { OrdinarySharesNumber: 2250e6, DilutedEPS: 6.5 }),
    exercice(2025, { OrdinarySharesNumber: 2140e6, DilutedEPS: 6, NetIncome: 13e9 }),
  ],
  consensus: { anneeEnCours: { exercice: "2026-12-31", bpaEstime: 7, numAnalystes: 12 }, anneeSuivante: null },
  surprises: [
    { finTrimestre: "2026-03-31", bpaEstime: 2.4, bpaPublie: 2.45, surprisePct: 2.1 },
    { finTrimestre: "2026-06-30", bpaEstime: 2.71, bpaPublie: 2.68, surprisePct: -1.1 },
  ],
};

// Douze mois de clôtures autour de 55 €, et des détachements trimestriels.
const CLOTURES = Array.from({ length: 30 }, (_, i) => ({ date: new Date(Date.UTC(2024, 3 + i, 1)).toISOString().slice(0, 10), close: 55 + (i % 5) }));
const DIVIDENDES = [];
for (let a = 2015; a <= 2025; a++) for (const m of ["03", "06", "09", "12"]) DIVIDENDES.push({ date: `${a}-${m}-20`, montant: 0.6 + (a - 2015) * 0.02 });

vi.mock("../lib/api", () => ({
  fetchFundamentals: vi.fn(async () => FICHE),
  fetchTauxChange: vi.fn(async () => [{ devise: "USD", ok: true, versEuro: 0.5 }]),
  fetchHistory: vi.fn(async (symboles, periode, intervalle, options) => [
    { symbol: symboles[0], ok: true, series: CLOTURES, ...(options?.dividendes ? { dividendes: DIVIDENDES } : {}) },
  ]),
}));

import FicheFinanciere from "./FicheFinanciere";

describe("FicheFinanciere — comptes publiés dans une autre monnaie", () => {
  it("convertit le bénéfice par action avant de calculer le PER historique", async () => {
    const onFiche = vi.fn();
    render(<FicheFinanciere symbole="TTE.PA" devise="EUR" onFiche={onFiche} />);
    // BPA 2025 : 6 $ × 0,5 = 3 € ; cours 55 à 59 € → PER entre 18 et 20.
    // Sans conversion, il aurait été entre 9 et 10.
    // Quatre étapes asynchrones s'enchaînent (fiche, taux, cours mensuels) :
    // un délai plus large que la seconde par défaut, pour la machine chargée.
    const ligne = await screen.findByText(/PER d'aujourd'hui/, {}, { timeout: 5000 });
    const per = Number(ligne.textContent.match(/(\d+),(\d)/).slice(1).join("."));
    expect(per).toBeGreaterThan(17);
    expect(per).toBeLessThan(21);
    // Marché reçoit le même historique converti.
    const derniere = onFiche.mock.calls.at(-1)[0];
    expect(derniere.historique.at(-1).DilutedEPS).toBe(3);
  });

  it("montre rachats, note de solidité, dividende sur dix ans et surprises de résultats", async () => {
    render(<FicheFinanciere symbole="TTE.PA" devise="EUR" />);
    expect(await screen.findByText(/Rachats d'actions et dilution/)).toBeInTheDocument();
    expect(screen.getByText(/la société rachète ses titres/i)).toBeInTheDocument();
    expect(screen.getByText(/Comptes publiés en USD, convertis au taux du jour/)).toBeInTheDocument();
    expect(screen.getByText(/Note de solidité \(Piotroski\)/)).toBeInTheDocument();
    expect(screen.getByText(/Résultats publiés face aux prévisions/)).toBeInTheDocument();
    expect(screen.getByText(/Au-dessus des attentes 1 fois sur 2/)).toBeInTheDocument();
    expect(await screen.findByText(/Le dividende sur dix ans/)).toBeInTheDocument();
  });

  it("bascule le PER historique en vue cours et bénéfices, prolongée par le consensus", async () => {
    render(<FicheFinanciere symbole="TTE.PA" devise="EUR" />);
    fireEvent.click(await screen.findByRole("button", { name: "Cours et bénéfices" }));
    expect(screen.getByText(/les bénéfices justifient un cours de/)).toBeInTheDocument();
    expect(screen.getByText(/Avec le bénéfice attendu par les analystes pour l'exercice 2026/)).toBeInTheDocument();
  });
});
