import { describe, it, expect, vi, beforeEach } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";
import Abonnements from "./Abonnements";
import StrategieLogs from "./StrategieLogs";
import MenuActions from "./MenuActions";
import { ToastProvider } from "../lib/ToastContext";
import { enrichir } from "../lib/compteCourant";

vi.mock("../lib/api", async (original) => ({
  ...(await original()),
  fetchFundamentals: vi.fn(() => Promise.reject(new Error("hors ligne"))),
  fetchQuotes: vi.fn(() => Promise.resolve([])),
}));

beforeEach(() => localStorage.clear());

function BancAbonnements({ subs: initial = [], enrichies = [] }) {
  const [subs, setSubs] = useState(initial);
  return (
    <ToastProvider>
      <Abonnements subs={subs} setSubs={setSubs} contracts={[]} setContracts={() => {}} compteEnrichies={enrichies} />
    </ToastProvider>
  );
}

function BancStrategie({ notes: initial, positions }) {
  const [notes, setNotes] = useState(initial);
  return (
    <ToastProvider>
      <StrategieLogs strategyNotes={notes} setStrategyNotes={setNotes} bourse={{ positions, operations: [] }} />
      <output data-testid="notes">{JSON.stringify(notes)}</output>
    </ToastProvider>
  );
}

describe("Abonnements", () => {
  const releve = enrichir([
    { id: "1", date: "2026-09-12", libelle: "PRLV SEPA SPOTIFY", montant: -999 },
    { id: "2", date: "2026-10-12", libelle: "PRLV SEPA SPOTIFY", montant: -999 },
  ]);

  it("propose un prélèvement récurrent du relevé, et le suit en un geste", () => {
    render(<BancAbonnements enrichies={releve} />);
    const carte = screen.getByText("Détectés sur ton compte").closest(".carte-standard");
    expect(within(carte).getByText("Spotify")).toBeInTheDocument();

    fireEvent.click(within(carte).getByRole("button", { name: /Suivre/ }));

    expect(screen.queryByText("Détectés sur ton compte")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Actions sur Spotify" })).toBeInTheDocument();
  });

  it("signale un prix qui a changé sur le relevé", () => {
    render(<BancAbonnements enrichies={releve} subs={[{ id: "s", label: "Spotify", montant: 8.99, prochaine_date: "2026-09-12" }]} />);
    expect(screen.getByText("Spotify — montant changé")).toBeInTheDocument();
    expect(screen.getByText(/tu as déclaré 8,99/)).toBeInTheDocument();
  });

  it("ne compte pas un abonnement résilié dans les charges", () => {
    render(
      <BancAbonnements
        subs={[
          { id: "a", label: "Netflix", montant: 13.49, prochaine_date: "2026-01-03" },
          { id: "b", label: "Presse", montant: 9.99, prochaine_date: "2026-01-03", statut: "resilie", resilie_le: "2026-02-01" },
        ]}
      />
    );
    expect(screen.getByText(/1 abonnement payant/)).toBeInTheDocument();
    expect(screen.getByText("Abonnements résiliés")).toBeInTheDocument();
  });
});

describe("Stratégie & Logs", () => {
  const notes = [
    {
      id: "n", ticker: "MC.PA", titre: "LVMH", statut: "intacte", date: "2020-01-01T10:00:00.000Z",
      these: "Marques sans équivalent.", conditions_vente: "Chine en recul durable.", archivee: false, postmortem: null,
    },
  ];
  const positions = [{ ticker: "MC.PA", quantity: 2, pru: 700, current_price: 560 }];

  it("fait remonter la thèse d'une ligne en forte baisse, et consigne la relecture", () => {
    render(<BancStrategie notes={notes} positions={positions} />);
    expect(screen.getByText(/MC\.PA est 20/)).toBeInTheDocument();
    expect(screen.getByText("Chine en recul durable.", { selector: "blockquote" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Non, la thèse tient" }));

    expect(screen.queryByText(/MC\.PA est 20/)).not.toBeInTheDocument();
    const enregistrees = JSON.parse(screen.getByTestId("notes").textContent);
    expect(enregistrees[0].revues).toHaveLength(1);
    expect(enregistrees[0].revues[0]).toMatchObject({ statut: "intacte", contexte: { base: "pru" } });
    expect(enregistrees[0].revues[0].commentaire).toMatch(/sous le prix de revient : la thèse tient/);
  });

  it("garde les actions d'une thèse accessibles sans survol", () => {
    render(<BancStrategie notes={notes} positions={positions} />);
    fireEvent.click(screen.getByRole("button", { name: "Actions sur LVMH" }));
    expect(screen.getByRole("menuitem", { name: /Relire la thèse/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Clôturer/ })).toBeInTheDocument();
  });
});

describe("MenuActions", () => {
  it("se ferme à Échap et rend le focus au bouton", () => {
    const action = vi.fn();
    render(<MenuActions libelle="Actions" actions={[{ libelle: "Un", onClick: action }, false, { libelle: "Deux", onClick: () => {} }]} />);
    const bouton = screen.getByRole("button", { name: "Actions" });
    fireEvent.click(bouton);
    const entrees = screen.getAllByRole("menuitem");
    expect(entrees.map((e) => e.textContent)).toEqual(["Un", "Deux"]);

    fireEvent.keyDown(entrees[0], { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(bouton).toHaveFocus();

    fireEvent.click(bouton);
    fireEvent.click(screen.getByRole("menuitem", { name: "Un" }));
    expect(action).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});
