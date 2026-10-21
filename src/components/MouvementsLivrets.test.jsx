import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import MouvementsLivrets from "./MouvementsLivrets";

const LIVRET = {
  id: "la",
  name: "Livret A",
  balance: 7000,
  rate: 0.017,
  mouvements: [{ id: "m1", date: "2026-03-10", montant: 500, nature: "depot" }],
};

describe("MouvementsLivrets", () => {
  it("enregistre un dépôt daté", () => {
    const onMouvement = vi.fn();
    render(<MouvementsLivrets livrets={[LIVRET]} onMouvement={onMouvement} onRetirerMouvement={() => {}} />);
    fireEvent.change(screen.getByLabelText("Montant (€)"), { target: { value: "250" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    expect(onMouvement).toHaveBeenCalledWith("la", expect.objectContaining({ nature: "depot", montant: 250 }));
  });

  it("affiche les intérêts de l'année calculés à la quinzaine, et le mouvement enregistré", () => {
    render(<MouvementsLivrets livrets={[LIVRET]} onMouvement={() => {}} onRetirerMouvement={() => {}} />);
    expect(screen.getByText(/à la quinzaine/)).toBeInTheDocument();
    expect(screen.getByText(/taux officiels successifs/)).toBeInTheDocument();
    // « Dépôt » figure aussi dans la liste des natures : on regarde le journal.
    expect(within(screen.getByRole("list")).getByText("Dépôt")).toBeInTheDocument();
  });

  it("supprime un mouvement", () => {
    const onRetirerMouvement = vi.fn();
    render(<MouvementsLivrets livrets={[LIVRET]} onMouvement={() => {}} onRetirerMouvement={onRetirerMouvement} />);
    fireEvent.click(screen.getByRole("button", { name: /Supprimer ce mouvement/ }));
    expect(onRetirerMouvement).toHaveBeenCalledWith("la", "m1");
  });
});
