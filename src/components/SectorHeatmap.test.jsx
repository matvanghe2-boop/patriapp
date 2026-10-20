import { describe, it, expect } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SectorHeatmap from "./SectorHeatmap";

const POSITIONS = [
  { id: "cw8", ticker: "CW8.PA", name: "Amundi MSCI World", quantity: 10, current_price: 500, type: "ETF" },
  { id: "dg", ticker: "DG.PA", name: "Vinci", quantity: 10, current_price: 100, type: "Action" },
];

function Carte({ initiaux = {} }) {
  const [manuels, setManuels] = useState(initiaux);
  return (
    <>
      <SectorHeatmap positions={POSITIONS} secteursManuels={manuels} setSecteursManuels={setManuels} />
      <output data-testid="manuels">{JSON.stringify(manuels)}</output>
    </>
  );
}

describe("SectorHeatmap", () => {
  it("décompose l'ETF dans la légende au lieu d'un « Non classé » dominant", () => {
    render(<Carte />);
    // Les secteurs figurent aussi dans les options du sélecteur : on cherche
    // l'entrée de LÉGENDE.
    const enLegende = (texte) => screen.queryAllByText(texte).some((n) => n.tagName === "SPAN");
    expect(enLegende("Technologie")).toBe(true);
    expect(enLegende("Utilities & infrastructures")).toBe(true);
    expect(enLegende("Non classé")).toBe(false);
  });

  it("dit que l'ETF est décomposé, sans lui proposer de secteur", () => {
    render(<Carte />);
    expect(screen.getByText(/Décomposé selon l'indice MSCI World/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Secteur de CW8.PA")).not.toBeInTheDocument();
  });

  it("enregistre un secteur choisi à la main, et le retire en revenant au défaut", async () => {
    render(<Carte />);
    const choix = screen.getByLabelText("Secteur de DG.PA");
    expect(choix).toHaveValue("");
    // Le défaut affiché est le classement justifié du code.
    expect(screen.getByRole("option", { name: "Par défaut : Utilities & infrastructures" })).toBeInTheDocument();

    await userEvent.selectOptions(choix, "Industrie");
    expect(screen.getByTestId("manuels")).toHaveTextContent('{"DG.PA":"Industrie"}');

    await userEvent.selectOptions(choix, "");
    expect(screen.getByTestId("manuels")).toHaveTextContent("{}");
  });
});
