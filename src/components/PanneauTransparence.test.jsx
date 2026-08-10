import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import PanneauTransparence from "./PanneauTransparence";
import { construireContexteAnonymise } from "../../shared/anonymiser";

/**
 * jsdom expose `navigator.clipboard` en lecture seule : une simple affectation
 * lève une TypeError. Il faut redéfinir la propriété.
 */
function stubPressePapiers(writeText) {
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
    writable: true,
  });
}

const { contexte } = construireContexteAnonymise({
  profile: { monthly_income: 3000, monthly_expenses: 1800 },
  livrets: [{ id: "la", name: "Livret A", balance: 9000, envelope: "Livret" }],
  bourse: { envelope: "PEA", positions: [{ ticker: "CW8.PA", quantity: 100, current_price: 400 }] },
  patrimoineNet: 49000,
});

describe("PanneauTransparence", () => {
  it("affiche le contexte et son intitulé", () => {
    render(<PanneauTransparence contexte={contexte} onClose={() => {}} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Ce qui est envoyé")).toBeInTheDocument();
  });

  it("montre la charge utile réellement transmise, pas une paraphrase", () => {
    render(<PanneauTransparence contexte={contexte} onClose={() => {}} />);
    // Le JSON affiché doit être sérialisable à l'identique depuis la prop.
    const attendu = JSON.stringify(contexte, null, 2);
    expect(screen.getByText((_, el) => el?.tagName === "PRE" && el.textContent === attendu)).toBeTruthy();
  });

  it("valide un contexte anonymisé", () => {
    render(<PanneauTransparence contexte={contexte} onClose={() => {}} />);
    expect(screen.getByText(/aucun montant, ticker, ISIN, e-mail ni identifiant détecté/i)).toBeInTheDocument();
  });

  it("alerte et déconseille l'envoi si une donnée a fuité", () => {
    render(<PanneauTransparence contexte={{ solde: 42000 }} onClose={() => {}} />);
    expect(screen.getByText(/ne pas envoyer/i)).toBeInTheDocument();
    expect(screen.getByText(/nombre trop grand pour un ratio/i)).toBeInTheDocument();
  });

  it("détaille chaque anomalie avec son chemin", () => {
    render(<PanneauTransparence contexte={{ portefeuille: { ligne: "CW8.PA" } }} onClose={() => {}} />);
    expect(screen.getByText("portefeuille.ligne")).toBeInTheDocument();
    expect(screen.getByText(/ticker boursier/i)).toBeInTheDocument();
  });

  it("accorde le pluriel au nombre d'anomalies", () => {
    render(<PanneauTransparence contexte={{ a: 99999, b: "x@y.fr" }} onClose={() => {}} />);
    expect(screen.getByText(/2 anomalies détectées/i)).toBeInTheDocument();
  });

  it("liste les traitements appliqués", () => {
    render(<PanneauTransparence contexte={contexte} onClose={() => {}} />);
    const tableau = screen.getByRole("table");
    expect(within(tableau).getByText(/Tickers et ISIN détenus/)).toBeInTheDocument();
    expect(within(tableau).getByText(/Nom, e-mail, identifiants/)).toBeInTheDocument();
  });

  it("se ferme au bouton de fermeture", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<PanneauTransparence contexte={contexte} onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: /fermer/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it("copie la charge utile dans le presse-papiers", async () => {
    const writeText = vi.fn().mockResolvedValue();
    // `userEvent.setup()` installe son propre presse-papiers : poser le stub
    // avant lui reviendrait à le voir écrasé aussitôt.
    const user = userEvent.setup();
    stubPressePapiers(writeText);

    render(<PanneauTransparence contexte={contexte} onClose={() => {}} />);
    await user.click(screen.getByRole("button", { name: /copier/i }));

    expect(writeText).toHaveBeenCalledWith(JSON.stringify(contexte, null, 2));
    expect(await screen.findByText("Copié")).toBeInTheDocument();
  });

  it("ne casse pas si le presse-papiers est refusé", async () => {
    const user = userEvent.setup();
    stubPressePapiers(vi.fn().mockRejectedValue(new Error("refusé")));

    render(<PanneauTransparence contexte={contexte} onClose={() => {}} />);
    await user.click(screen.getByRole("button", { name: /copier/i }));

    // Le JSON reste affiché et sélectionnable : rien n'est perdu.
    expect(screen.getByText("Ce qui est envoyé")).toBeInTheDocument();
  });
});
