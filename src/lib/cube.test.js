import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { cubePossible, tournerEnCube } from "./cube";

/**
 * Le cube repose sur une API que jsdom n'a pas : par défaut il ne doit RIEN
 * faire, et laisser l'appelant naviguer comme avant.
 */
describe("changement d'onglet en cube", () => {
  let zone;

  beforeEach(() => {
    zone = document.createElement("main");
    zone.id = "contenu-principal";
    document.body.appendChild(zone);
    document.documentElement.setAttribute("data-mouvement", "complet");
    document.documentElement.setAttribute("data-effets", "vivant");
    // Un poste de test à deux cœurs passerait pour un « appareil économe »,
    // qui renonce au cube : on fixe la réponse.
    Object.defineProperty(navigator, "hardwareConcurrency", { value: 8, configurable: true });
  });
  afterEach(() => {
    zone.remove();
    delete document.startViewTransition;
    for (const attribut of ["data-mouvement", "data-effets", "data-cube"]) document.documentElement.removeAttribute(attribut);
  });

  it("répond non sans View Transitions, et ne touche à rien", () => {
    const changer = vi.fn();
    expect(cubePossible()).toBe(false);
    expect(tournerEnCube({ sens: "droite", changer })).toBe(false);
    expect(changer).not.toHaveBeenCalled();
    expect(document.documentElement.hasAttribute("data-cube")).toBe(false);
  });

  it("répond non en effets sobres ou animations coupées, même si le navigateur sait faire", () => {
    document.startViewTransition = vi.fn();
    document.documentElement.setAttribute("data-effets", "sobre");
    expect(cubePossible()).toBe(false);
    document.documentElement.setAttribute("data-effets", "vivant");
    document.documentElement.setAttribute("data-mouvement", "reduit");
    expect(tournerEnCube({ sens: "gauche", changer: vi.fn() })).toBe(false);
    expect(document.startViewTransition).not.toHaveBeenCalled();
  });

  it("tourne, change d'écran pendant la transition, puis nettoie derrière lui", async () => {
    let finir;
    document.startViewTransition = vi.fn((miseAJour) => {
      miseAJour();
      return { finished: new Promise((resoudre) => (finir = resoudre)) };
    });
    const changer = vi.fn();

    expect(tournerEnCube({ sens: "droite", changer })).toBe(true);
    expect(changer).toHaveBeenCalledTimes(1);
    const racine = document.documentElement;
    expect(racine.getAttribute("data-cube")).toBe("droite");
    expect(racine.style.getPropertyValue("--cube-prof")).toMatch(/px$/);
    expect(racine.style.getPropertyValue("--cube-y-apres")).toMatch(/px$/);

    finir();
    await Promise.resolve();
    await Promise.resolve();
    expect(racine.hasAttribute("data-cube")).toBe(false);
    expect(racine.style.getPropertyValue("--cube-prof")).toBe("");
  });

  it("une rotation interrompue ne nettoie pas celle qui la remplace", async () => {
    const fins = [];
    document.startViewTransition = vi.fn((miseAJour) => {
      miseAJour();
      return { finished: new Promise((resoudre) => fins.push(resoudre)) };
    });
    tournerEnCube({ sens: "droite", changer: () => {} });
    tournerEnCube({ sens: "gauche", changer: () => {} });

    fins[0]();
    await Promise.resolve();
    await Promise.resolve();
    expect(document.documentElement.getAttribute("data-cube")).toBe("gauche");

    fins[1]();
    await Promise.resolve();
    await Promise.resolve();
    expect(document.documentElement.hasAttribute("data-cube")).toBe(false);
  });

  it("change d'écran quand même si le navigateur refuse la transition", () => {
    document.startViewTransition = vi.fn(() => {
      throw new Error("refusée");
    });
    const changer = vi.fn();
    expect(tournerEnCube({ sens: "droite", changer })).toBe(true);
    expect(changer).toHaveBeenCalledTimes(1);
    expect(document.documentElement.hasAttribute("data-cube")).toBe(false);
  });
});
