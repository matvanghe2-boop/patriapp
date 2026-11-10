import { describe, it, expect } from "vitest";
import { annoncerMoment, ecouterMoments, palierAtteint } from "./moments";

describe("moments patrimoniaux", () => {
  it("rend la main à l'appelant quand aucune scène n'écoute", () => {
    expect(annoncerMoment({ type: "record", message: "x" })).toBe(false);
  });

  it("transmet le moment à la scène qui écoute", () => {
    const recus = [];
    const arreter = ecouterMoments((m) => recus.push(m.type));
    expect(annoncerMoment({ type: "palier", message: "x" })).toBe(true);
    arreter();
    expect(recus).toEqual(["palier"]);
  });

  it("donne le plus haut palier rond atteint", () => {
    expect(palierAtteint(9_999)).toBe(0);
    expect(palierAtteint(39_093)).toBe(25_000);
    expect(palierAtteint(100_000)).toBe(100_000);
    expect(palierAtteint(1_234_567)).toBe(1_000_000);
  });
});
