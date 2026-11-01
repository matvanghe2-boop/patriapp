/**
 * Lien retour d'un contrat d'Abonnements vers son papier rangé dans le coffre.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "../lib/ToastContext";
import { ConfirmProvider } from "../lib/ConfirmContext";

const demanderOuverture = vi.fn();
vi.mock("../lib/coffreNavigation", () => ({ demanderOuverture: (c) => demanderOuverture(c) }));

const { default: Abonnements } = await import("./Abonnements");

const contrat = { id: "c1", label: "Assurance habitation", category: "Assurance", date_fin: "2027-09-01", preavis_jours: 30 };

beforeEach(() => {
  localStorage.clear();
  demanderOuverture.mockClear();
  window.location.hash = "#/abonnements/contrats";
  localStorage.setItem(
    "patrimoine:coffre",
    JSON.stringify({
      version: 1,
      documents: [
        { id: "doc_h", type: "contrat_assurance", titre: "Contrat MAIF", contratId: "c1", fichiers: [], notes: "" },
        // Un passeport ne se lie pas à un contrat, même avec un identifiant égaré.
        { id: "doc_p", type: "passeport", titre: "Passeport", contratId: "c1", fichiers: [], notes: "" },
      ],
      objets: [],
      reglages: { delais: {}, titreAgendaNeutre: false },
    })
  );
});

describe("Abonnements — papiers du coffre", () => {
  it("affiche le papier lié au contrat et l'ouvre dans le coffre", async () => {
    const u = userEvent.setup();
    render(
      <ToastProvider>
        <ConfirmProvider>
          <Abonnements contracts={[contrat]} setContracts={() => {}} subs={[]} setSubs={() => {}} />
        </ConfirmProvider>
      </ToastProvider>
    );
    const lien = await screen.findByRole("button", { name: "Dans le coffre : Contrat MAIF" });
    expect(screen.queryByRole("button", { name: /Passeport/ })).not.toBeInTheDocument();

    await u.click(lien);
    expect(demanderOuverture).toHaveBeenCalledWith({ document: "doc_h" });
    expect(window.location.hash).toBe("#/coffre/documents");
  });
});
