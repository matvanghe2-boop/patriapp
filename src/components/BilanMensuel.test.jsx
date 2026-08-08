import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import BilanMensuel, { bilanEstDu, construireBilan } from "./BilanMensuel";

const AUJOURDHUI = new Date("2026-08-08");

/** Historique avec un point daté de N jours avant aujourd'hui. */
const historique = (jours, valeur) => [
  { date: new Date(AUJOURDHUI.getTime() - jours * 86400000).toISOString().slice(0, 10), value: valeur },
];

describe("bilanEstDu", () => {
  it("est dû si jamais présenté", () => {
    expect(bilanEstDu(null, AUJOURDHUI)).toBe(true);
  });

  it("n'est pas dû dans les 30 jours", () => {
    expect(bilanEstDu("2026-08-01", AUJOURDHUI)).toBe(false);
  });

  it("redevient dû après 30 jours", () => {
    expect(bilanEstDu("2026-07-01", AUJOURDHUI)).toBe(true);
  });

  it("est dû si la date enregistrée est illisible", () => {
    expect(bilanEstDu("n'importe quoi", AUJOURDHUI)).toBe(true);
  });
});

describe("construireBilan", () => {
  it("chiffre la progression du patrimoine sur 30 jours", () => {
    const { constats } = construireBilan({
      patrimoineNet: 55000,
      historyPast: historique(40, 50000),
      aujourdhui: AUJOURDHUI,
    });
    const variation = constats.find((c) => c.cle === "variation");
    expect(variation.ton).toBe("positif");
    expect(variation.texte).toMatch(/progressé/);
    // `pctPlain` du dépôt formate avec un point décimal, contrairement à `eur`.
    expect(variation.texte).toMatch(/10\.0 %/);
  });

  it("chiffre aussi un recul", () => {
    const { constats } = construireBilan({
      patrimoineNet: 45000,
      historyPast: historique(40, 50000),
      aujourdhui: AUJOURDHUI,
    });
    const variation = constats.find((c) => c.cle === "variation");
    expect(variation.ton).toBe("negatif");
    expect(variation.texte).toMatch(/reculé/);
  });

  it("le dit franchement quand l'historique est trop court", () => {
    // Cas réel d'août 2026 : ~1 mois de relevés.
    const { constats } = construireBilan({
      patrimoineNet: 50000,
      historyPast: historique(5, 49000),
      aujourdhui: AUJOURDHUI,
    });
    const variation = constats.find((c) => c.cle === "variation");
    expect(variation.ton).toBe("neutre");
    expect(variation.texte).toMatch(/Pas encore 30 jours/);
  });

  it("alerte sur un matelas de sécurité insuffisant", () => {
    const { constats } = construireBilan({ epargneSecuriteMois: 1.4, aujourdhui: AUJOURDHUI });
    const matelas = constats.find((c) => c.cle === "matelas");
    expect(matelas.ton).toBe("negatif");
    expect(matelas.texte).toMatch(/en dessous des trois mois/);
  });

  it("valide un matelas suffisant", () => {
    const { constats } = construireBilan({ epargneSecuriteMois: 6.7, aujourdhui: AUJOURDHUI });
    expect(constats.find((c) => c.cle === "matelas").ton).toBe("positif");
  });

  it("omet le matelas quand les dépenses sont inconnues", () => {
    const { constats } = construireBilan({ epargneSecuriteMois: null, aujourdhui: AUJOURDHUI });
    expect(constats.find((c) => c.cle === "matelas")).toBeUndefined();
  });

  it("rapporte le taux d'épargne", () => {
    const { constats } = construireBilan({ tauxEpargnePct: 40, aujourdhui: AUJOURDHUI });
    expect(constats.find((c) => c.cle === "epargne").texte).toMatch(/40\.0 %/);
  });

  it("ne signale pas de revue de référence tant que l'échéance n'est pas atteinte", () => {
    const { revision } = construireBilan({ aujourdhui: new Date("2026-10-01") });
    expect(revision.echue).toBe(false);
  });

  it("signale la revue semestrielle une fois l'échéance passée", () => {
    const { revision } = construireBilan({ aujourdhui: new Date("2027-03-01") });
    expect(revision.echue).toBe(true);
    expect(revision.moisEcoules).toBeGreaterThanOrEqual(6);
  });
});

describe("BilanMensuel", () => {
  it("ne s'affiche pas s'il a déjà été vu ce mois-ci", () => {
    const { container } = render(<BilanMensuel dernierBilan="2026-08-01" aujourdhui={AUJOURDHUI} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("s'affiche au premier lancement", () => {
    render(<BilanMensuel dernierBilan={null} aujourdhui={AUJOURDHUI} epargneSecuriteMois={6.7} />);
    expect(screen.getByText("Bilan du mois")).toBeInTheDocument();
  });

  it("se masque et enregistre la date une fois vu", async () => {
    const user = userEvent.setup();
    const onVu = vi.fn();
    render(<BilanMensuel dernierBilan={null} aujourdhui={AUJOURDHUI} onVu={onVu} />);

    await user.click(screen.getByRole("button", { name: /masquer/i }));
    expect(onVu).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
  });

  it("précise qu'aucun modèle n'est appelé", () => {
    // Le bilan doit rester identique en mode dégradé : il ne consomme aucun quota.
    render(<BilanMensuel dernierBilan={null} aujourdhui={AUJOURDHUI} />);
    expect(screen.getByText(/sans appel à un modèle/)).toBeInTheDocument();
  });

  it("affiche le rappel de revue quand elle est échue", () => {
    render(<BilanMensuel dernierBilan={null} aujourdhui={new Date("2027-06-01")} />);
    expect(screen.getByText(/valeurs de référence/)).toBeInTheDocument();
  });
});
