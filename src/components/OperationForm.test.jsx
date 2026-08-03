import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import OperationForm from "./OperationForm";
import { todayIso } from "../lib/finance";

/**
 * Régression : le fichier définissait un helper local
 *
 *   function todayIso() { return todayIso(); }
 *
 * qui s'appelait lui-même indéfiniment. Comme il est invoqué à la
 * construction de l'objet `blank`, avant tout retour anticipé, le composant
 * levait « Maximum call stack size exceeded » dès son premier rendu — ce qui
 * faisait tomber tout le sous-onglet « Opérations » sur l'ErrorBoundary,
 * qu'on ouvre le formulaire ou non.
 */
describe("OperationForm", () => {
  const positions = [{ id: "p1", ticker: "CW8.PA", quantity: 10, pru: 400, current_price: 460 }];

  it("se monte sans déborder la pile, formulaire fermé", () => {
    expect(() =>
      render(<OperationForm open={false} onClose={vi.fn()} onSubmit={vi.fn()} positions={positions} />)
    ).not.toThrow();
  });

  it("se monte sans déborder la pile, formulaire ouvert", () => {
    expect(() =>
      render(<OperationForm open onClose={vi.fn()} onSubmit={vi.fn()} positions={positions} />)
    ).not.toThrow();
  });

  it("préremplit la date du jour", () => {
    render(<OperationForm open onClose={vi.fn()} onSubmit={vi.fn()} positions={positions} />);
    const dateInput = document.querySelector('input[type="date"]');
    expect(dateInput).not.toBeNull();
    expect(dateInput.value).toBe(todayIso());
  });

  it("n'affiche rien quand il est fermé", () => {
    render(<OperationForm open={false} onClose={vi.fn()} onSubmit={vi.fn()} positions={positions} />);
    expect(screen.queryByRole("button", { name: /enregistrer/i })).not.toBeInTheDocument();
  });
});
