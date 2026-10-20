import { describe, it, expect } from "vitest";
import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Disposition, Bloc, PersonnaliserDashboard } from "./DispositionDashboard";
import { DISPOSITION_DEFAUT } from "../lib/dispositionDashboard";

function Ecran({ initiale = DISPOSITION_DEFAUT }) {
  const [disposition, setDisposition] = useState(initiale);
  return (
    <>
      <main data-testid="ecran">
        <Disposition disposition={disposition}>
          <Bloc id="vedette">
            <section>Patrimoine net</section>
          </Bloc>
          <Bloc id="objectifs">
            <section>Objectifs</section>
          </Bloc>
          <Bloc id="passifs">
            <section>Passifs</section>
          </Bloc>
        </Disposition>
      </main>
      <PersonnaliserDashboard open onClose={() => {}} disposition={disposition} setDisposition={setDisposition} />
    </>
  );
}

const ordreAffiche = () =>
  within(screen.getByTestId("ecran"))
    .getAllByText(/Patrimoine net|Objectifs|Passifs/)
    .map((n) => n.textContent);

describe("Dashboard personnalisable", () => {
  it("affiche les blocs dans l'ordre d'origine", () => {
    render(<Ecran />);
    expect(ordreAffiche()).toEqual(["Patrimoine net", "Objectifs", "Passifs"]);
  });

  it("réordonne réellement le DOM quand on monte un bloc", async () => {
    // L'ordre du DOM, et non un simple `order` CSS : c'est lui que suivent la
    // touche Tab et les lecteurs d'écran.
    render(<Ecran />);
    // « Passifs » suit immédiatement « Objectifs » dans l'ordre d'origine.
    await userEvent.click(screen.getByRole("button", { name: "Monter « Passifs »" }));
    expect(ordreAffiche()).toEqual(["Patrimoine net", "Passifs", "Objectifs"]);
  });

  it("masque un bloc puis le réaffiche, sans rien perdre", async () => {
    render(<Ecran />);
    await userEvent.click(screen.getByRole("button", { name: "Masquer « Passifs »" }));
    expect(ordreAffiche()).not.toContain("Passifs");

    await userEvent.click(screen.getByRole("button", { name: "Afficher « Passifs »" }));
    expect(ordreAffiche()).toContain("Passifs");
  });

  it("revient à la disposition d'origine", async () => {
    render(<Ecran initiale={{ ordre: ["passifs", "objectifs"], masques: ["vedette"] }} />);
    expect(ordreAffiche()).toEqual(["Passifs", "Objectifs"]);

    await userEvent.click(screen.getByRole("button", { name: /Disposition d'origine/ }));
    expect(ordreAffiche()).toEqual(["Patrimoine net", "Objectifs", "Passifs"]);
  });
});
