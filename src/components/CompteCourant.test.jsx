import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import CompteCourant from "./CompteCourant";
import { ToastProvider } from "../lib/ToastContext";
import { ConfirmProvider } from "../lib/ConfirmContext";
import { lireReleveBourso } from "../lib/releveBourso";
import { preparerImport, appliquerImport } from "../lib/compteCourant";
import { pagesReleveFactice } from "../test/releveFactice";

function monter(props = {}) {
  return render(
    <ToastProvider>
      <ConfirmProvider>
        <CompteCourant
          setCompteOperations={vi.fn()}
          setCompteReleves={vi.fn()}
          setCompteRegles={vi.fn()}
          setCash={vi.fn()}
          cash={0}
          {...props}
        />
      </ConfirmProvider>
    </ToastProvider>
  );
}

function donneesImportees() {
  const etat = appliquerImport(preparerImport(lireReleveBourso(pagesReleveFactice()), {}), {});
  return { compteOperations: etat.operations, compteReleves: etat.releves };
}

describe("CompteCourant", () => {
  it("propose l'import des relevés tant que rien n'est importé", () => {
    monter();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Compte courant");
    expect(screen.getByRole("button", { name: /Choisir mes relevés PDF/ })).toBeInTheDocument();
    expect(screen.getByText(/n'est envoyé à aucun serveur/)).toBeInTheDocument();
  });

  it("affiche le mois, les opérations par jour et le solde vérifié", () => {
    monter(donneesImportees());
    expect(screen.getByRole("heading", { name: "Mai 2026" })).toBeInTheDocument();
    expect(screen.getByText("Vérifié sur le relevé")).toBeInTheDocument();
    const liste = screen.getByRole("region", { name: "Opérations du mois" });
    expect(within(liste).getByText("Carrefour City")).toBeInTheDocument();
    expect(within(liste).getByText("Basic Fit France")).toBeInTheDocument();
    expect(within(liste).getByText("Mercredi 27 mai")).toBeInTheDocument();
    // Le virement vers son autre compte n'est ni une dépense ni un revenu.
    expect(screen.getByText(/Hors mouvements entre tes comptes/)).toBeInTheDocument();
  });

  it("ouvre le détail d'une opération avec le libellé de la banque", () => {
    monter(donneesImportees());
    fireEvent.click(screen.getByRole("button", { name: /Carrefour City/ }));
    expect(screen.getByText("CARTE 05/05/26 CARREFOUR CITY CB*1234")).toBeInTheDocument();
    expect(screen.getByText("05/05/2026")).toBeInTheDocument();
  });

  it("change la catégorie d'une opération à la main", () => {
    const setCompteOperations = vi.fn();
    monter({ ...donneesImportees(), setCompteOperations });
    fireEvent.click(screen.getByRole("button", { name: /Carrefour City/ }));
    fireEvent.change(screen.getByLabelText("Catégorie"), { target: { value: "restauration" } });
    const maj = setCompteOperations.mock.calls[0][0];
    const apres = maj(donneesImportees().compteOperations);
    expect(apres.find((o) => o.libelle.includes("CARREFOUR")).categorieManuelle).toBe("restauration");
  });

  it("filtre la liste en cliquant sur une catégorie de dépenses", () => {
    monter(donneesImportees());
    fireEvent.click(screen.getByRole("button", { name: /^Sport/ }));
    const liste = screen.getByRole("region", { name: "Opérations du mois" });
    expect(within(liste).getByText("Basic Fit France")).toBeInTheDocument();
    expect(within(liste).queryByText("Carrefour City")).not.toBeInTheDocument();
  });

  it("propose de reporter le solde du relevé dans le patrimoine", () => {
    const setCash = vi.fn();
    monter({ ...donneesImportees(), setCash, cash: 500 });
    fireEvent.click(screen.getByRole("button", { name: "Reporter ce solde dans le patrimoine" }));
    expect(setCash).toHaveBeenCalledWith(-82.98);
  });
});
