import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import LecturePublication from "./LecturePublication";

const CRITERES = [
  {
    cle: "croissance",
    libelle: "Croissance du chiffre d'affaires",
    verdict: "favorable",
    constat: "Chiffre d'affaires +24 %, contre 19 % par an en médiane sur 2022–2025 : accélération.",
  },
  {
    cle: "margeEbitdaPct",
    libelle: "Marge d'EBITDA",
    verdict: "defavorable",
    constat: "Marge d'EBITDA de 13,9 %, contre 15,1 % en médiane : dégradation.",
  },
  {
    cle: "tenue",
    libelle: "Promesses tenues",
    verdict: "non_evaluable",
    constat: "Pas assez de publications résumées pour juger les promesses passées.",
  },
];

describe("LecturePublication", () => {
  it("montre chaque verdict avec la phrase qui le justifie", () => {
    render(<LecturePublication criteres={CRITERES} contexte={{ nbExercices: 4, periode: "2022–2025" }} />);
    expect(screen.getByText("Favorable")).toBeInTheDocument();
    expect(screen.getByText("Défavorable")).toBeInTheDocument();
    expect(screen.getByText(/contre 19 % par an en médiane/)).toBeInTheDocument();
    expect(screen.getByText(/Comparé à 4 exercice\(s\) publiés \(2022–2025\)/)).toBeInTheDocument();
  });

  it("dit ce qui n'a pas pu être jugé, au lieu de le compter comme neutre", () => {
    render(<LecturePublication criteres={CRITERES} />);
    expect(screen.getByText(/Non évaluables : Promesses tenues/)).toBeInTheDocument();
    expect(screen.queryByText("Neutre")).not.toBeInTheDocument();
  });

  it("affiche l'interprétation et la signale incertaine quand un chiffre n'a pas été retrouvé", () => {
    render(
      <LecturePublication
        criteres={[]}
        interpretation={{
          lecture: "La croissance accélère.",
          forces: ["Prises de commandes"],
          vigilance: ["Marge en recul"],
          aSurveiller: [],
          fiable: false,
        }}
      />
    );
    expect(screen.getByText("La croissance accélère.")).toBeInTheDocument();
    expect(screen.getByText(/Marge en recul/)).toBeInTheDocument();
    expect(screen.getByText("incertaine")).toBeInTheDocument();
  });

  it("ne rend rien pour un résumé ancien, sans grille ni interprétation", () => {
    const { container } = render(<LecturePublication />);
    expect(container).toBeEmptyDOMElement();
  });
});
