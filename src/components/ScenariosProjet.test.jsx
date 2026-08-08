import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import ScenariosProjet from "./ScenariosProjet";

const COURANT = {
  config: { libelle: "Voiture", prix: 28000, dureeDetention: 8, financement: "comptant" },
  resultats: { coutGlobal: 27896, effortMensuel: 205, retardMois: 23 },
};

const scenario = (nom, resultats = {}, config = {}) => ({
  id: nom,
  nom,
  date: "2026-08-08",
  config: { libelle: nom, prix: 28000, dureeDetention: 8, financement: "comptant", ...config },
  resultats: { coutGlobal: 27896, effortMensuel: 205, retardMois: 23, ...resultats },
});

describe("ScenariosProjet", () => {
  it("invite à enregistrer quand la liste est vide", () => {
    render(<ScenariosProjet scenarios={[]} onChange={() => {}} courant={COURANT} />);
    expect(screen.getByText(/Aucun projet mis de côté/)).toBeInTheDocument();
  });

  it("enregistre le scénario courant sous le nom saisi", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ScenariosProjet scenarios={[]} onChange={onChange} courant={COURANT} />);

    await user.type(screen.getByLabelText("Nom du scénario"), "Van aménagé");
    await user.click(screen.getByRole("button", { name: /enregistrer/i }));

    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ nom: "Van aménagé", config: COURANT.config, resultats: COURANT.resultats }),
    ]);
  });

  it("retombe sur le libellé du projet si aucun nom n'est saisi", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ScenariosProjet scenarios={[]} onChange={onChange} courant={COURANT} />);

    await user.click(screen.getByRole("button", { name: /enregistrer/i }));
    expect(onChange.mock.calls[0][0][0].nom).toBe("Voiture");
  });

  it("résume chaque scénario enregistré", () => {
    render(<ScenariosProjet scenarios={[scenario("Voiture")]} onChange={() => {}} courant={COURANT} />);
    expect(screen.getByText(/8 ans/)).toBeInTheDocument();
    expect(screen.getByText(/comptant/)).toBeInTheDocument();
  });

  it("supprime un scénario", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ScenariosProjet scenarios={[scenario("A"), scenario("B")]} onChange={onChange} courant={COURANT} />);

    await user.click(screen.getByRole("button", { name: "Supprimer A" }));
    expect(onChange).toHaveBeenCalledWith([expect.objectContaining({ nom: "B" })]);
  });

  it("n'affiche la comparaison qu'à partir de deux scénarios", async () => {
    const user = userEvent.setup();
    render(<ScenariosProjet scenarios={[scenario("A"), scenario("B")]} onChange={() => {}} courant={COURANT} />);

    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Comparer A" }));
    expect(screen.getByText(/Sélectionne un second scénario/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Comparer B" }));
    expect(screen.getByRole("table")).toBeInTheDocument();
  });

  it("aligne les scénarios comparés sur les mêmes colonnes", async () => {
    const user = userEvent.setup();
    render(
      <ScenariosProjet
        scenarios={[scenario("Neuve", { retardMois: 23 }), scenario("Occasion", { retardMois: 11 })]}
        onChange={() => {}}
        courant={COURANT}
      />
    );
    await user.click(screen.getByRole("button", { name: "Comparer Neuve" }));
    await user.click(screen.getByRole("button", { name: "Comparer Occasion" }));

    const table = screen.getByRole("table");
    expect(within(table).getByText("23 mois")).toBeInTheDocument();
    expect(within(table).getByText("11 mois")).toBeInTheDocument();
  });

  it("affiche « non atteint » quand l'objectif ne l'est pas", async () => {
    const user = userEvent.setup();
    render(
      <ScenariosProjet
        scenarios={[scenario("A", { retardMois: null }), scenario("B")]}
        onChange={() => {}}
        courant={COURANT}
      />
    );
    await user.click(screen.getByRole("button", { name: "Comparer A" }));
    await user.click(screen.getByRole("button", { name: "Comparer B" }));
    expect(within(screen.getByRole("table")).getByText("non atteint")).toBeInTheDocument();
  });

  it("plafonne la comparaison à trois scénarios", async () => {
    const user = userEvent.setup();
    const liste = ["A", "B", "C", "D"].map((n) => scenario(n));
    render(<ScenariosProjet scenarios={liste} onChange={() => {}} courant={COURANT} />);

    for (const n of ["A", "B", "C", "D"]) {
      await user.click(screen.getByRole("button", { name: `Comparer ${n}` }));
    }
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(4); // en-tête + 3
  });

  it("avertit que les scénarios reposent sur le patrimoine de leur date", async () => {
    const user = userEvent.setup();
    render(<ScenariosProjet scenarios={[scenario("A"), scenario("B")]} onChange={() => {}} courant={COURANT} />);
    await user.click(screen.getByRole("button", { name: "Comparer A" }));
    await user.click(screen.getByRole("button", { name: "Comparer B" }));
    expect(screen.getByText(/patrimoine du jour de leur enregistrement/)).toBeInTheDocument();
  });
});
