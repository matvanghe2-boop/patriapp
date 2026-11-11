import { describe, it, expect, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { useHashRoute, useSousOnglet, useSousOngletActuel, allerVersMaintenant, lireHash } from "./useHashRoute";

const ONGLETS = ["dashboard", "simulation", "bourse"];

function Coquille() {
  const [onglet] = useHashRoute(ONGLETS, "dashboard");
  const sous = useSousOngletActuel();
  return (
    <>
      <output data-testid="onglet">{onglet}</output>
      <output data-testid="sous">{sous || "(défaut)"}</output>
      {onglet === "simulation" && <PageSimulation />}
    </>
  );
}

function PageSimulation() {
  const [sous, setSous] = useSousOnglet(["projection", "immobilier"], "projection");
  return (
    <button type="button" onClick={() => setSous(sous === "projection" ? "immobilier" : "projection")}>
      {sous}
    </button>
  );
}

describe("navigation synchrone et suivi du sous-onglet", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "#/dashboard");
  });

  it("allerVersMaintenant prévient les écouteurs avant de rendre la main", () => {
    render(<Coquille />);
    expect(screen.getByTestId("onglet")).toHaveTextContent("dashboard");

    const longueur = window.history.length;
    act(() => allerVersMaintenant("simulation", "immobilier"));

    expect(lireHash()).toEqual({ onglet: "simulation", sous: "immobilier" });
    expect(screen.getByTestId("onglet")).toHaveTextContent("simulation");
    expect(screen.getByTestId("sous")).toHaveTextContent("immobilier");
    // Une vraie entrée d'historique : « Précédent » ramène à l'onglet d'avant.
    expect(window.history.length).toBe(longueur + 1);
  });

  it("ne pousse rien quand on est déjà à destination", () => {
    render(<Coquille />);
    const longueur = window.history.length;
    act(() => allerVersMaintenant("dashboard"));
    expect(window.history.length).toBe(longueur);
  });

  it("useSousOngletActuel suit un changement de sous-onglet fait par la page", () => {
    window.history.replaceState(null, "", "#/simulation");
    render(<Coquille />);
    expect(screen.getByTestId("sous")).toHaveTextContent("(défaut)");

    // La page change de sous-onglet par `replaceState`, qui n'émet aucun
    // `hashchange` : la coquille doit quand même l'apprendre.
    act(() => screen.getByRole("button", { name: "projection" }).click());
    expect(screen.getByTestId("sous")).toHaveTextContent("immobilier");

    act(() => screen.getByRole("button", { name: "immobilier" }).click());
    expect(screen.getByTestId("sous")).toHaveTextContent("(défaut)");
  });
});
