import { describe, it, expect } from "vitest";
import {
  enregistrerPublication,
  publicationsDe,
  guidancePrecedente,
  historiqueGuidances,
  retirerPublication,
  libelleEvolution,
} from "./publications";

const pub = (ticker, date, extra = {}) => ({ ticker, date, ...extra });

describe("enregistrerPublication", () => {
  it("range de la plus récente à la plus ancienne", () => {
    let l = [];
    l = enregistrerPublication(l, pub("AI.PA", "2026-02-01", { cle: "a" }));
    l = enregistrerPublication(l, pub("AI.PA", "2026-07-28", { cle: "b" }));
    expect(l.map((p) => p.date)).toEqual(["2026-07-28", "2026-02-01"]);
  });

  it("remplace une publication déjà résumée au lieu de la doubler", () => {
    // Le résumé sert aussi de cache : relancer sur le même document ne doit
    // pas empiler deux entrées identiques.
    let l = [];
    l = enregistrerPublication(l, pub("AI.PA", "2026-07-28", { cle: "meme", resume: "v1" }));
    l = enregistrerPublication(l, pub("AI.PA", "2026-07-28", { cle: "meme", resume: "v2" }));
    expect(l).toHaveLength(1);
    expect(l[0].resume).toBe("v2");
  });

  it("refuse une entrée sans ticker ni date", () => {
    expect(enregistrerPublication([], { resume: "orpheline" })).toEqual([]);
  });
});

describe("publicationsDe", () => {
  const liste = [pub("AI.PA", "2026-07-28"), pub("MC.PA", "2026-07-27")];

  it("filtre par société, sans tenir compte de la casse", () => {
    expect(publicationsDe(liste, "ai.pa")).toHaveLength(1);
  });
});

describe("guidancePrecedente", () => {
  const liste = [
    pub("AI.PA", "2026-07-28", { guidance: { bas: 5, haut: 7 } }),
    pub("AI.PA", "2026-04-20", { guidance: { bas: 4, haut: 6 } }),
    pub("AI.PA", "2026-02-10", {}),
  ];

  it("renvoie la dernière guidance connue avant une date", () => {
    expect(guidancePrecedente(liste, "AI.PA", "2026-07-28")).toEqual({ bas: 4, haut: 6 });
  });

  it("saute les publications muettes sur les perspectives", () => {
    // Sans ce saut, un communiqué sans guidance ferait conclure « initiale »
    // à la publication suivante.
    expect(guidancePrecedente(liste, "AI.PA", "2026-04-20")).toBeNull();
  });

  it("renvoie null quand il n'y a rien avant", () => {
    expect(guidancePrecedente([], "AI.PA", "2026-01-01")).toBeNull();
  });
});

describe("historiqueGuidances", () => {
  it("ne retient que les publications porteuses d'une guidance", () => {
    const liste = [
      pub("AI.PA", "2026-07-28", { guidance: { bas: 5 }, realise: 5.4, periode: "2026" }),
      pub("AI.PA", "2026-02-10", {}),
    ];
    const h = historiqueGuidances(liste, "AI.PA");
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({ periode: "2026", realise: 5.4 });
  });

  it("laisse le réalisé à null quand il n'est pas renseigné", () => {
    const liste = [pub("AI.PA", "2026-07-28", { guidance: { bas: 5 } })];
    expect(historiqueGuidances(liste, "AI.PA")[0].realise).toBeNull();
  });
});

describe("retirerPublication", () => {
  it("ne retire que l'entrée visée", () => {
    expect(retirerPublication([{ id: "a" }, { id: "b" }], "a")).toEqual([{ id: "b" }]);
  });
});

describe("libelleEvolution", () => {
  it("nomme chaque sens en clair", () => {
    expect(libelleEvolution("relevee")).toBe("Guidance relevée");
    expect(libelleEvolution("abaissee")).toBe("Guidance abaissée");
    expect(libelleEvolution("maintenue")).toBe("Guidance maintenue");
  });

  it("retombe sur un libellé neutre pour un sens inconnu", () => {
    expect(libelleEvolution(undefined)).toBe("Pas de guidance");
  });
});
