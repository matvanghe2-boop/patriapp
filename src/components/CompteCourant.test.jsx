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

describe("CompteCourant — opérations ponctuelles", () => {
  // Mai vient du relevé factice ; juin contient un don de 10 000 €.
  function avecJuin() {
    const { compteOperations, compteReleves } = donneesImportees();
    const juin = { id: "juin", banque: "BoursoBank", compte: "5678", titulaire: "MARTIN PAUL", debut: "2026-06-01", fin: "2026-06-30", soldeDebut: -8298, soldeFin: 994702, nbOperations: 3, controleOk: true };
    const ops = [
      { id: "j1", releveId: "juin", ordre: 0, date: "2026-06-02", dateValeur: "2026-06-02", montant: 5000, libelle: "VIR SEPA MME CLAIRE PETIT", complements: [] },
      { id: "j2", releveId: "juin", ordre: 1, date: "2026-06-05", dateValeur: "2026-06-05", montant: 1000000, libelle: "VIR Virement de Jean MARTIN", complements: [] },
      { id: "j3", releveId: "juin", ordre: 2, date: "2026-06-08", dateValeur: "2026-06-08", montant: -2000, libelle: "CARTE 07/06/26 CARREFOUR CITY CB*1234", complements: [] },
    ];
    return { compteOperations: [...compteOperations, ...ops], compteReleves: [...compteReleves, juin] };
  }

  it("propose de mettre à part le gros virement du mois, et le fait sur demande", () => {
    const setCompteOperations = vi.fn();
    const donnees = avecJuin();
    monter({ ...donnees, setCompteOperations });
    expect(screen.getByText(/Une opération sort de l'ordinaire ce mois-ci/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Mettre à part du budget" }));
    const apres = setCompteOperations.mock.calls[0][0](donnees.compteOperations);
    expect(apres.find((o) => o.id === "j2").horsBudget).toBe(true);
    expect(apres.find((o) => o.id === "j1").horsBudget).toBeUndefined();
  });

  it("affiche à part une opération déjà mise à part", () => {
    const donnees = avecJuin();
    donnees.compteOperations = donnees.compteOperations.map((o) => (o.id === "j2" ? { ...o, horsBudget: true } : o));
    monter(donnees);
    expect(screen.queryByText(/sort de l'ordinaire/)).not.toBeInTheDocument();
    expect(screen.getByText(/Mis à part du budget : 1 opération ponctuelle/)).toBeInTheDocument();
    expect(screen.getByText(/À part du budget/)).toBeInTheDocument();
  });
});
