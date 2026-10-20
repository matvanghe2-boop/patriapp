import { describe, it, expect } from "vitest";
import { useEffect, useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";

import Operations from "./Operations";
import { ToastProvider } from "../lib/ToastContext";

/**
 * Régression : un versement saisi depuis « Nouvelle opération » ne faisait
 * RIEN. Le formulaire l'envoie sans titre (`asset: null`), et la
 * comptabilisation appelait `order.asset.toUpperCase()` : l'exception partait
 * dans le gestionnaire d'événement, sans message ni écriture.
 *
 * Le test passe par le vrai formulaire et le vrai journal, parce que c'est
 * leur rencontre qui cassait — chacun pris isolément fonctionnait.
 */
let dernierEtat = null;
function Banc({ initial }) {
  const [bourse, setBourse] = useState(initial);
  // Relevé dans un effet, pas pendant le rendu : le rendu doit rester pur.
  useEffect(() => {
    dernierEtat = bourse;
  }, [bourse]);
  return <Operations bourse={bourse} setBourse={setBourse} />;
}

const BOURSE = { positions: [], operations: [], cash_pocket: 100 };

function saisirMouvement(type, montant) {
  fireEvent.click(screen.getByRole("button", { name: /Nouvelle Opération/i }));
  fireEvent.click(screen.getByRole("button", { name: new RegExp(type, "i") }));
  fireEvent.change(screen.getByLabelText(/Montant \(€\)/), { target: { value: montant } });
  fireEvent.click(screen.getByRole("button", { name: /Valider l'opération/i }));
}

describe("Operations — versement et retrait", () => {
  it("enregistre un versement de 2 000 € et crédite la poche cash", () => {
    render(<ToastProvider><Banc initial={BOURSE} /></ToastProvider>);
    saisirMouvement("^Versement$", "2000");

    expect(dernierEtat.operations).toHaveLength(1);
    expect(dernierEtat.operations[0]).toMatchObject({ type: "VERSEMENT", amount: 2000, asset: null, origine: "saisie" });
    expect(dernierEtat.cash_pocket).toBe(2100);
    expect(screen.getByText(/Versement enregistré/)).toBeTruthy();
    // Le formulaire se referme : c'est le signe visible que l'écriture a pris.
    expect(screen.queryByRole("button", { name: /Valider l'opération/i })).toBeNull();
  });

  it("dit pourquoi « 2 000 » est refusé au lieu de ne rien faire", () => {
    render(<ToastProvider><Banc initial={BOURSE} /></ToastProvider>);
    saisirMouvement("^Versement$", "2 000");
    expect(dernierEtat.operations).toHaveLength(0);
    expect(screen.getByRole("alert").textContent).toMatch(/sans espace/);
  });

  it("enregistre un retrait et débite la poche cash", () => {
    render(<ToastProvider><Banc initial={{ ...BOURSE, cash_pocket: 500 }} /></ToastProvider>);
    saisirMouvement("^Retrait$", "200");

    expect(dernierEtat.operations[0]).toMatchObject({ type: "RETRAIT", amount: 200 });
    expect(dernierEtat.cash_pocket).toBe(300);
  });
});
