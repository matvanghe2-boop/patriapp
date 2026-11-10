import { describe, it, expect, afterEach } from "vitest";
import { render } from "@testing-library/react";
import { mouvementReduit, niveauEffets, effetsVivants } from "./mouvement";
import { surveillerRevelations } from "./revelation";
import Montant from "../components/Montant";

const html = document.documentElement;

afterEach(() => {
  html.removeAttribute("data-mouvement");
  html.removeAttribute("data-effets");
});

describe("niveau d'effets", () => {
  it("suit le réglage de l'application plutôt que le système", () => {
    html.setAttribute("data-mouvement", "reduit");
    expect(mouvementReduit()).toBe(true);
    expect(niveauEffets()).toBe("aucun");

    html.setAttribute("data-mouvement", "complet");
    expect(mouvementReduit()).toBe(false);
    expect(niveauEffets()).toBe("vivant");
  });

  it("« sobre » retire l'ambiance mais garde le mouvement", () => {
    html.setAttribute("data-mouvement", "complet");
    html.setAttribute("data-effets", "sobre");
    expect(niveauEffets()).toBe("sobre");
    expect(effetsVivants()).toBe(false);
  });
});

describe("révélation au défilement", () => {
  it("ne masque rien quand l'observateur d'intersection n'existe pas", () => {
    // jsdom n'a pas d'IntersectionObserver : c'est exactement le cas d'un
    // navigateur qui ne saurait pas révéler, et rien ne doit y être caché.
    const arreter = surveillerRevelations();
    const { container } = render(<div className="revelable">contenu</div>);
    expect(container.querySelector("[data-revele]")).toBeNull();
    expect(html.hasAttribute("data-revele-pret")).toBe(false);
    arreter();
  });
});

describe("Montant en rouleaux", () => {
  it("garde le montant lisible et copiable en texte entier", () => {
    const { container } = render(<Montant valeur={39093} decimales={2} rouleaux sensible={false} />);
    expect(container.querySelector(".sr-only").textContent).toBe("39 093,00 €");
  });

  it("annonce la valeur d'arrivée, pas celle du départ", () => {
    const { container } = render(<Montant valeur={39093} depart={38793} rouleaux sensible={false} />);
    expect(container.querySelector(".sr-only").textContent).toContain("39");
    expect(container.querySelector(".sr-only").textContent).toContain("093");
  });
});
