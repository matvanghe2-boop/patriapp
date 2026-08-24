import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Sparkline, CourbeEvolution, AnneauProgression, AnneauRepartition, CalendrierAnnuel } from "./graphiques";
import Montant, { decouperMontant } from "./Montant";

describe("Sparkline", () => {
  it("ne dessine rien sous deux points", () => {
    // Une « tendance » sur un seul point n'existe pas : mieux vaut ne rien
    // afficher qu'un trait plat qui suggérerait une stabilité observée.
    const { container } = render(<Sparkline valeurs={[42]} />);
    expect(container.querySelector("svg")).toBeNull();
  });

  it("trace autant de sommets que de valeurs", () => {
    const { container } = render(<Sparkline valeurs={[1, 5, 3, 8]} />);
    const points = container.querySelector("polyline").getAttribute("points").trim().split(/\s+/);
    expect(points).toHaveLength(4);
  });

  it("place le point final sur la dernière valeur", () => {
    const { container } = render(<Sparkline valeurs={[0, 10]} hauteur={20} largeur={100} />);
    const cercle = container.querySelector("circle");
    expect(Number(cercle.getAttribute("cx"))).toBe(100);
  });

  it("survit à une série plate sans diviser par zéro", () => {
    const { container } = render(<Sparkline valeurs={[7, 7, 7]} />);
    const points = container.querySelector("polyline").getAttribute("points");
    expect(points).not.toContain("NaN");
  });

  it("garde un trait d'épaisseur constante quand le viewBox est étiré", () => {
    // Sans `non-scaling-stroke`, une courbe large et basse produit un trait
    // épais à l'horizontale et fin à la verticale.
    const { container } = render(<Sparkline valeurs={[1, 2]} />);
    expect(container.querySelector("polyline")).toHaveAttribute("vector-effect", "non-scaling-stroke");
  });
});

describe("CourbeEvolution", () => {
  it("donne à chaque instance son propre dégradé", () => {
    // Deux courbes partageant un identifiant : la seconde écraserait la
    // première. Bug invisible à la relecture, évident à l'écran.
    const { container } = render(
      <>
        <CourbeEvolution valeurs={[1, 2, 3]} />
        <CourbeEvolution valeurs={[3, 2, 1]} />
      </>
    );
    const ids = [...container.querySelectorAll("linearGradient")].map((g) => g.id);
    expect(new Set(ids).size).toBe(2);
  });

  it("place un jalon aux coordonnées demandées", () => {
    const { container } = render(
      <CourbeEvolution valeurs={[0, 5, 10, 15]} jalons={[{ id: "a", index: 2 }]} />
    );
    expect(container.querySelectorAll("line")).toHaveLength(1);
  });

  it("borne un index de jalon hors série au lieu de planter", () => {
    const { container } = render(
      <CourbeEvolution valeurs={[0, 5]} jalons={[{ id: "a", index: 99 }]} />
    );
    expect(container.querySelector("line")).not.toBeNull();
  });
});

describe("AnneauProgression", () => {
  it("borne la valeur entre 0 et 100", () => {
    const { getByRole } = render(<AnneauProgression valeur={250} libelle="Objectif" />);
    expect(getByRole("img")).toHaveAttribute("aria-label", "Objectif : 100 %");
  });

  it("annonce sa valeur aux lecteurs d'écran", () => {
    const { getByRole } = render(<AnneauProgression valeur={42} libelle="Matelas" />);
    expect(getByRole("img")).toHaveAttribute("aria-label", "Matelas : 42 %");
  });

  it("marque l'objectif atteint autrement que par la couleur", () => {
    const { container } = render(<AnneauProgression valeur={100} atteint />);
    expect(container.querySelector("svg").getAttribute("class")).toContain("anneau-atteint");
  });
});

describe("AnneauRepartition", () => {
  it("répartit les arcs proportionnellement", () => {
    const { container } = render(
      <AnneauRepartition
        parts={[
          { id: "a", valeur: 75, couleur: "#fff" },
          { id: "b", valeur: 25, couleur: "#000" },
        ]}
        libelle="Répartition"
      />
    );
    // Le premier cercle est la piste de fond ; les deux suivants sont les arcs.
    const arcs = [...container.querySelectorAll("circle")].slice(1);
    const [a, b] = arcs.map((c) => Number(c.getAttribute("stroke-dasharray").split(" ")[0]));
    expect(a / (a + b)).toBeCloseTo(0.75, 2);
  });

  it("ne divise pas par zéro sur un total nul", () => {
    const { container } = render(
      <AnneauRepartition parts={[{ id: "a", valeur: 0, couleur: "#fff" }]} libelle="Vide" />
    );
    expect(container.innerHTML).not.toContain("NaN");
  });
});

describe("CalendrierAnnuel", () => {
  it("laisse sans niveau les jours non relevés", () => {
    // La distinction « pas de relevé » / « variation nulle » est la raison
    // d'être de cette vue.
    const { container } = render(
      <CalendrierAnnuel
        jours={[
          { date: "2026-01-01", variation: 100 },
          { date: "2026-01-02", variation: null },
          { date: "2026-01-03", variation: 0 },
        ]}
      />
    );
    const cases = container.querySelectorAll("i");
    expect(cases[0].dataset.n).toBeTruthy();
    expect(cases[1].dataset.n).toBeUndefined();
    expect(cases[2].dataset.n).toBe("0");
  });

  it("gradue par rapport à la distribution, pas par seuils absolus", () => {
    // Un patrimoine de 5 000 € et un de 500 000 € ne bougent pas des mêmes
    // montants, mais la FORME de leur année est la même.
    const petits = render(
      <CalendrierAnnuel jours={[1, 2, 3, 40].map((v, i) => ({ date: `2026-01-0${i + 1}`, variation: v }))} />
    );
    const gros = render(
      <CalendrierAnnuel jours={[100, 200, 300, 4000].map((v, i) => ({ date: `2026-02-0${i + 1}`, variation: v }))} />
    );
    const niveaux = (r) => [...r.container.querySelectorAll("i")].map((e) => e.dataset.n);
    expect(niveaux(petits)).toEqual(niveaux(gros));
  });
});

describe("Montant", () => {
  it("sépare entier, centimes et devise", () => {
    const { entier, fraction, devise } = decouperMontant(48312.4, 2);
    expect(entier.replace(/\s/g, " ")).toContain("48");
    expect(fraction).toBe("40");
    expect(devise).toBe("€");
  });

  it("conserve le signe négatif dans la partie entière", () => {
    expect(decouperMontant(-125, 0).entier).toContain("-");
  });

  it("n'affiche les centimes que si on les demande", () => {
    const { container } = render(<Montant valeur={1234.56} decimales={0} />);
    expect(container.querySelector(".montant-centimes")).toBeNull();
    const avec = render(<Montant valeur={1234.56} decimales={2} />);
    expect(avec.container.querySelector(".montant-centimes").textContent).toBe(",56");
  });

  it("est masquable par le mode Ghost, sauf mention contraire", () => {
    const { container } = render(<Montant valeur={100} />);
    expect(container.firstChild.className).toContain("ghost-blur");
    const public_ = render(<Montant valeur={100} sensible={false} />);
    expect(public_.container.firstChild.className).not.toContain("ghost-blur");
  });

  it("ne pulse pas au premier rendu", () => {
    // Une valeur qui APPARAÎT n'a pas varié : la colorer induirait en erreur.
    const { container } = render(<Montant valeur={100} pulse />);
    expect(container.firstChild.dataset.sens).toBeUndefined();
  });
});
