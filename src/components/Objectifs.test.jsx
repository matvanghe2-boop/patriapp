import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import Objectifs from "./Objectifs";
import { ToastProvider } from "../lib/ToastContext";

const OBJECTIF = {
  id: "o",
  libelle: "Apport",
  cible: 60000,
  departDate: "2026-01-01",
  departValeur: 20000,
  echeance: "2030-01-01",
};

function rendre() {
  return render(
    <ToastProvider>
      <Objectifs objectifs={[OBJECTIF]} setObjectifs={() => {}} patrimoineNet={30000} epargneMensuelle={300} tauxAnnuelPct={0} />
    </ToastProvider>
  );
}

describe("curseur « et si j'épargnais plus »", () => {
  it("fait bouger la date d'arrivée avec le montant choisi", () => {
    rendre();
    const curseur = screen.getByLabelText(/Et si j'épargnais/);
    fireEvent.change(curseur, { target: { value: "1000" } });
    // 30 000 € restants à 1 000 € par mois, sans rendement : 30 mois.
    // Le montant est dans un <span> : on lit le paragraphe entier.
    const ligne = screen.getByText(/par mois : atteint en/);
    expect(ligne.textContent).toMatch(/^Avec 1\s000\s€ par mois : atteint en/);
    expect(screen.getByRole("button", { name: /Revenir à mon rythme/ })).toBeInTheDocument();
  });

  it("revient au rythme réel d'un clic", () => {
    rendre();
    fireEvent.change(screen.getByLabelText(/Et si j'épargnais/), { target: { value: "1000" } });
    fireEvent.click(screen.getByRole("button", { name: /Revenir à mon rythme/ }));
    expect(screen.queryByText(/par mois : atteint en/)).not.toBeInTheDocument();
  });
});
