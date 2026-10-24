import { describe, it, expect } from "vitest";
import {
  mediane,
  contexteHistorique,
  verifierIndicateurs,
  evaluerCriteres,
  bilanCriteres,
  construireInterpretation,
  donneesInterpretation,
  precautionDePeriode,
} from "./interpretationResultats.js";

/** Exercice au format de la fiche Marché (`fundamentals-timeseries`). */
const exercice = (annee, ca, rn, ebitda, extra = {}) => ({
  exercice: `${annee}-12-31`,
  TotalRevenue: ca,
  NetIncome: rn,
  EBITDA: ebitda,
  ...extra,
});

// Ordres de grandeur de Thermador : croissance médiane autour de −0,4 %,
// marge d'EBITDA autour de 15 %.
const FICHE = {
  nom: "Thermador Groupe",
  secteur: "Industrials",
  industrie: "Industrial Distribution",
  devise: "EUR",
  per: 11.5,
  margeOperationnellePct: 11.4,
  historique: [
    exercice(2022, 560e6, 59e6, 89.6e6, { DilutedEPS: 6.4, coursCloture: 97 }),
    exercice(2023, 587e6, 58.7e6, 92.7e6, { DilutedEPS: 6.4, coursCloture: 91.5 }),
    exercice(2024, 509e6, 45.3e6, 73.8e6, { DilutedEPS: 4.9, coursCloture: 75 }),
    exercice(2025, 507e6, 44.6e6, 73.5e6, { DilutedEPS: 4.8, coursCloture: 83 }),
  ],
  consensus: { anneeEnCours: { exercice: "2026-12-31", bpaEstime: 5.40826, numAnalystes: 2 } },
  surprises: [],
};

describe("mediane", () => {
  it("résiste à une année aberrante, contrairement à la moyenne", () => {
    // Conversion en trésorerie de Vusion : la moyenne serait de −290 %.
    expect(mediane([-163, 202, -1393, 45])).toBe(-59);
    expect(mediane([3])).toBe(3);
    expect(mediane([])).toBeNull();
  });
});

describe("contexteHistorique", () => {
  it("résume l'historique par exercice et par médiane, à une décimale", () => {
    const c = contexteHistorique(FICHE);
    expect(c.periode).toBe("2022–2025");
    expect(c.nbExercices).toBe(4);
    expect(c.references.margeEbitdaPct.mediane).toBe(15.1);
    expect(c.references.croissanceCaPct.nb).toBe(3);
    expect(c.perMedian).toBe(15.2);
    expect(c.consensus).toEqual({ exercice: "2026", bpaEstime: 5.41, nbAnalystes: 2 });
    // Valeurs arrondies : ce sont exactement celles transmises au modèle.
    expect(c.exercices[1]).toMatchObject({ annee: "2023", croissanceCaPct: 4.8 });
  });

  it("ne lève pas sans fiche", () => {
    expect(contexteHistorique(null)).toBeNull();
  });
});

describe("verifierIndicateurs", () => {
  const texte =
    "Chiffre d'affaires en baisse de 3,2 % à périmètre constant. Marge d'EBITDA de 14,1 %. Objectifs confirmés.";

  it("garde un indicateur présent dans le texte, signe compris", () => {
    const { valides, rejetes } = verifierIndicateurs(
      {
        croissanceCaPct: { valeur: -3.2, base: "à périmètre constant" },
        margeEbitdaPct: "14,1",
        guidanceStatut: "Confirmée",
        periode: "T3 2026",
      },
      texte
    );
    expect(valides.croissanceCaPct).toEqual({ valeur: -3.2, base: "à périmètre constant" });
    expect(valides.margeEbitdaPct.valeur).toBe(14.1);
    expect(valides.guidanceStatut).toBe("confirmée");
    expect(valides.periode).toBe("T3 2026");
    expect(rejetes).toEqual([]);
  });

  it("écarte un indicateur que le modèle a calculé au lieu de le recopier", () => {
    // Marge nette « déduite » : 11,8 n'apparaît nulle part dans le texte.
    const { valides, rejetes } = verifierIndicateurs({ margeNettePct: 11.8 }, texte);
    expect(valides.margeNettePct).toBeUndefined();
    expect(rejetes).toEqual([{ cle: "margeNettePct", valeur: 11.8 }]);
  });

  it("ignore un statut de guidance inconnu", () => {
    expect(
      verifierIndicateurs({ guidanceStatut: "excellente" }, texte).valides.guidanceStatut
    ).toBeUndefined();
  });
});

describe("evaluerCriteres", () => {
  const contexte = contexteHistorique(FICHE);
  const verdict = (criteres, cle) => criteres.find((c) => c.cle === cle)?.verdict;
  const constat = (criteres, cle) => criteres.find((c) => c.cle === cle)?.constat;

  it("lit une croissance au-dessus de l'habitude comme une accélération", () => {
    const g = evaluerCriteres({ indicateurs: { croissanceCaPct: { valeur: 8.8 } }, contexte });
    expect(verdict(g, "croissance")).toBe("favorable");
    expect(constat(g, "croissance")).toMatch(/\+8,8 %.*médiane sur 2022–2025 : accélération/);
  });

  it("distingue ralentissement et recul", () => {
    const histoire = {
      ...contexte,
      references: { ...contexte.references, croissanceCaPct: { mediane: 25, nb: 3 } },
    };
    expect(
      verdict(
        evaluerCriteres({ indicateurs: { croissanceCaPct: { valeur: 5 } }, contexte: histoire }),
        "croissance"
      )
    ).toBe("defavorable");
    const recul = evaluerCriteres({ indicateurs: { croissanceCaPct: { valeur: -3.2 } }, contexte });
    expect(constat(recul, "croissance")).toMatch(/recul de 3,2 %/);
  });

  it("compare une marge à la MÊME marge dans le passé", () => {
    const g = evaluerCriteres({
      indicateurs: { margeEbitdaPct: { valeur: 13.9 }, periode: "T3 2026" },
      contexte,
    });
    expect(verdict(g, "margeEbitdaPct")).toBe("defavorable");
    expect(constat(g, "margeEbitdaPct")).toBe(
      "Marge d'EBITDA de 13,9 %, contre 15,1 % en médiane sur 2022–2025 : dégradation."
    );
    // La marge opérationnelle n'a pas d'historique annuel : référence sur 12 mois.
    const op = evaluerCriteres({ indicateurs: { margeOperationnellePct: { valeur: 11.9 } }, contexte });
    expect(constat(op, "margeOperationnellePct")).toMatch(/douze derniers mois : stable/);
  });

  it("applique les repères d'endettement", () => {
    const lev = (v) =>
      verdict(
        evaluerCriteres({ indicateurs: { levierDetteNetteEbitda: { valeur: v } }, contexte }),
        "endettement"
      );
    expect(lev(0.6)).toBe("favorable");
    expect(lev(1.8)).toBe("neutre");
    expect(lev(3.4)).toBe("defavorable");
  });

  it("fait primer le sens mesuré de la guidance sur le mot du communiqué", () => {
    const g = evaluerCriteres({
      indicateurs: { guidanceStatut: "confirmée" },
      contexte,
      evolutionGuidance: { sens: "abaissee" },
    });
    expect(verdict(g, "guidance")).toBe("defavorable");
    const seul = evaluerCriteres({ indicateurs: { guidanceStatut: "relevée" }, contexte });
    expect(verdict(seul, "guidance")).toBe("favorable");
  });

  it("ne juge les promesses tenues qu'avec au moins deux précédents", () => {
    expect(verdict(evaluerCriteres({ contexte, tenue: { tenues: 1, total: 1 } }), "tenue")).toBe(
      "non_evaluable"
    );
    expect(verdict(evaluerCriteres({ contexte, tenue: { tenues: 3, total: 4 } }), "tenue")).toBe("favorable");
    expect(verdict(evaluerCriteres({ contexte, tenue: { tenues: 1, total: 4 } }), "tenue")).toBe(
      "defavorable"
    );
  });

  it("situe le PER par rapport à sa médiane historique", () => {
    const g = evaluerCriteres({ contexte });
    // 11,5 contre 15,2 : un quart sous l'habitude.
    expect(verdict(g, "valorisation")).toBe("favorable");
    expect(constat(g, "valorisation")).toMatch(/PER de 11,5 contre 15,2/);
  });

  it("n'établit pas de PER habituel sur moins de trois exercices bénéficiaires", () => {
    // Vusion : PER de 97 et 31 les deux seules années bénéficiaires — une
    // « médiane » de 64 aurait fait passer le titre pour bradé à 8 fois.
    const court = contexteHistorique({ ...FICHE, historique: FICHE.historique.slice(0, 2) });
    const g = evaluerCriteres({ contexte: court });
    expect(verdict(g, "valorisation")).toBe("non_evaluable");
    expect(constat(g, "valorisation")).toMatch(/trois exercices bénéficiaires.*\(2 disponibles\)/);
  });

  it("dit ce qui manque au lieu de juger sans données", () => {
    const g = evaluerCriteres({ indicateurs: {}, contexte: null });
    expect(verdict(g, "croissance")).toBe("non_evaluable");
    expect(verdict(g, "rentabilite")).toBe("non_evaluable");
    expect(verdict(g, "valorisation")).toBe("non_evaluable");
    expect(bilanCriteres(g).non_evaluable).toBe(g.length);
  });
});

describe("precautionDePeriode", () => {
  it("prévient une fois quand la publication ne couvre pas un exercice complet", () => {
    expect(precautionDePeriode("S1 2026")).toMatch(/Publication sur S1 2026.*saisonnalité/);
    expect(precautionDePeriode("exercice 2026")).toBeNull();
    expect(precautionDePeriode(null)).toBeNull();
  });
});

describe("construireInterpretation", () => {
  const texteSource = "Chiffre d'affaires de 433 M€, en hausse de 24 %.";
  const donnees = donneesInterpretation({
    symbole: "VU.PA",
    resume: { resume: "Forte croissance.", chiffres: [] },
    criteres: [{ libelle: "Croissance", verdict: "favorable", constat: "+24 % contre 19 % en médiane." }],
    contexte: null,
  });

  it("accepte une lecture qui ne cite que des chiffres fournis", () => {
    const l = construireInterpretation(
      {
        lecture: "La croissance de 24 % dépasse la médiane de 19 % sur 3 ans.",
        forces: ["433 M€ de ventes"],
        vigilance: [],
        aSurveiller: ["la marge en 2027"],
      },
      { texteSource, donnees }
    );
    expect(l.fiable).toBe(true);
    expect(l.forces).toEqual(["433 M€ de ventes"]);
  });

  it("marque incertaine une lecture qui invente un chiffre", () => {
    // 27 % : un calcul du modèle, absent du communiqué comme de l'historique.
    const l = construireInterpretation(
      { lecture: "La marge atteindrait 27 %.", forces: [], vigilance: [] },
      { texteSource, donnees }
    );
    expect(l.fiable).toBe(false);
    expect(l.chiffresDouteux).toBe(1);
  });

  it("ne rend rien d'une réponse vide ou illisible", () => {
    expect(construireInterpretation(null)).toBeNull();
    expect(construireInterpretation({ lecture: "", forces: [] })).toBeNull();
  });
});
