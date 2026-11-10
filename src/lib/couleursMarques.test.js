import { describe, it, expect } from "vitest";
import { couleurMarque, teinteMarque, styleMarque } from "./couleursMarques";
import { couleurDominante } from "../../scripts/couleurs-logos.mjs";

describe("couleur de marque", () => {
  it("lit la table relevée, sans tenir compte de la casse", () => {
    expect(couleurMarque("ai.pa")).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("ne garde que la teinte, avec une saturation lisible", () => {
    const t = teinteMarque("AI.PA");
    expect(t.h).toBeGreaterThanOrEqual(0);
    expect(t.h).toBeLessThan(360);
    expect(t.s).toBeGreaterThanOrEqual(48);
    expect(t.s).toBeLessThanOrEqual(92);
  });

  it("laisse la teinte de l'onglet quand la marque est inconnue", () => {
    expect(couleurMarque("INCONNU.PA")).toBeNull();
    expect(styleMarque("INCONNU.PA")).toEqual({});
  });
});

describe("relevé de la couleur d'un logo", () => {
  const pixels = (n, rgba) => Array.from({ length: n }, () => rgba);

  it("retient la couleur franche et ignore le blanc et le transparent", () => {
    const logo = [...pixels(60, [255, 255, 255, 255]), ...pixels(30, [0, 0, 0, 0]), ...pixels(40, [220, 30, 40, 255])];
    expect(couleurDominante(logo)).toBe("#dc1e28");
  });

  it("renonce devant un logo gris", () => {
    expect(couleurDominante([...pixels(80, [40, 40, 40, 255]), ...pixels(20, [200, 200, 200, 255])])).toBeNull();
  });
});
