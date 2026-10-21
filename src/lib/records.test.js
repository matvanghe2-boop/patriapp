import { describe, it, expect } from "vitest";
import { plusHautHistorique, recordAAnnoncer, objectifsAAnnoncer } from "./records";

const AUJ = "2026-10-21";
const historique = [30000, 31000, 32500, 32000, 33000, 34000, 33500, 35000].map((value, i) => ({
  date: `2026-10-${String(10 + i).padStart(2, "0")}`,
  value,
}));

describe("records", () => {
  it("trouve le plus haut historique, hors relevé du jour", () => {
    expect(plusHautHistorique([...historique, { date: AUJ, value: 99999 }], AUJ)).toEqual({ valeur: 35000, date: "2026-10-17" });
  });

  it("annonce un nouveau record", () => {
    expect(recordAAnnoncer({ historique, patrimoineActuel: 35500, aujourdhui: AUJ })).toEqual({
      valeur: 35500,
      precedent: { valeur: 35000, date: "2026-10-17" },
    });
  });

  it("n'annonce rien sous le plus haut, ni sur un historique trop court", () => {
    expect(recordAAnnoncer({ historique, patrimoineActuel: 34900, aujourdhui: AUJ })).toBeNull();
    expect(recordAAnnoncer({ historique: historique.slice(0, 3), patrimoineActuel: 99999, aujourdhui: AUJ })).toBeNull();
  });

  it("ne répète pas un record chaque jour dans un marché qui monte", () => {
    const dernierAnnonce = { valeur: 35200, date: "2026-10-19" };
    // +0,9 % deux jours après : trop proche pour mériter un message.
    expect(recordAAnnoncer({ historique, patrimoineActuel: 35500, dernierAnnonce, aujourdhui: AUJ })).toBeNull();
    // +1,4 % : annoncé.
    expect(recordAAnnoncer({ historique, patrimoineActuel: 35700, dernierAnnonce, aujourdhui: AUJ })).not.toBeNull();
    // Déjà annoncé aujourd'hui : jamais deux fois le même jour.
    expect(recordAAnnoncer({ historique, patrimoineActuel: 40000, dernierAnnonce: { valeur: 35500, date: AUJ }, aujourdhui: AUJ })).toBeNull();
  });

  it("annonce un objectif atteint une seule fois", () => {
    const objectifs = [
      { id: "a", cible: 30000 },
      { id: "b", cible: 50000 },
    ];
    expect(objectifsAAnnoncer(objectifs, 35000, []).map((o) => o.id)).toEqual(["a"]);
    expect(objectifsAAnnoncer(objectifs, 35000, ["a"])).toEqual([]);
  });
});
