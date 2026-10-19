import { describe, it, expect } from "vitest";
import {
  lireNombreTexte,
  chiffresDuTexte,
  verifierChiffres,
  comparerGuidance,
  tenueDesGuidances,
  construireResume,
} from "./resumePublication.js";

/**
 * Ces tests portent sur la seule chose qui compte vraiment ici : un résumé
 * financier faux se lit comme une information vérifiée. Les garde-fous
 * doivent donc tenir même quand le modèle est confiant et plausible.
 */

describe("lireNombreTexte", () => {
  it("lit l'écriture française", () => {
    expect(lireNombreTexte("4 732,5")).toBe(4732.5);
    expect(lireNombreTexte("1 234 567")).toBe(1234567);
  });

  it("lit l'écriture anglaise", () => {
    expect(lireNombreTexte("4,732.5")).toBe(4732.5);
    expect(lireNombreTexte("1,234,567")).toBe(1234567);
  });

  it("distingue virgule décimale et séparateur de milliers", () => {
    // « 4,7 » est quatre virgule sept ; « 4,732 » est quatre mille sept cent
    // trente-deux. La règle se joue sur le nombre de chiffres qui suit.
    expect(lireNombreTexte("4,7")).toBe(4.7);
    expect(lireNombreTexte("4,732")).toBe(4732);
  });

  it("supporte l'espace insécable des communiqués", () => {
    expect(lireNombreTexte("4 732")).toBe(4732);
    expect(lireNombreTexte("4 732,5")).toBe(4732.5);
  });

  it("renvoie null sur ce qui n'est pas un nombre", () => {
    expect(lireNombreTexte("non communiqué")).toBeNull();
    expect(lireNombreTexte(null)).toBeNull();
  });
});

describe("chiffresDuTexte", () => {
  it("relève les nombres d'un communiqué", () => {
    const t = "Chiffre d'affaires de 4 732 M€, en hausse de 5,4 % sur un an.";
    const s = chiffresDuTexte(t);
    expect(s.has(4732)).toBe(true);
    expect(s.has(5.4)).toBe(true);
  });
});

describe("verifierChiffres", () => {
  const source = "Le chiffre d'affaires atteint 4 732 M€, en progression de 5,4 %. Le BPA ressort à 2,15 €.";

  it("accepte un chiffre réellement présent", () => {
    const { verifies, fiable } = verifierChiffres(
      [{ libelle: "CA", valeur: 4732 }, { libelle: "BPA", valeur: 2.15 }],
      source
    );
    expect(verifies).toHaveLength(2);
    expect(fiable).toBe(true);
  });

  it("REJETTE un arrondi que le modèle a fabriqué", () => {
    // 4,7 Md€ est une lecture honnête de 4 732 M€, mais cette valeur
    // n'apparaît nulle part : c'est exactement le genre de glissement qu'on
    // veut attraper, parce qu'on ne peut pas le distinguer d'une invention.
    const { rejetes, fiable } = verifierChiffres([{ libelle: "CA", valeur: 4.7 }], source);
    expect(rejetes).toHaveLength(1);
    expect(rejetes[0].motif).toBe("absent du texte source");
    expect(fiable).toBe(false);
  });

  it("rejette un chiffre purement inventé", () => {
    const { fiable } = verifierChiffres([{ libelle: "EBITDA", valeur: 912 }], source);
    expect(fiable).toBe(false);
  });

  it("un seul rejet suffit à rendre l'ensemble non fiable", () => {
    const { verifies, rejetes, fiable } = verifierChiffres(
      [{ libelle: "CA", valeur: 4732 }, { libelle: "EBITDA", valeur: 912 }],
      source
    );
    expect(verifies).toHaveLength(1);
    expect(rejetes).toHaveLength(1);
    expect(fiable).toBe(false);
  });

  it("accepte une valeur écrite en texte plutôt qu'en nombre", () => {
    expect(verifierChiffres([{ libelle: "CA", valeur: "4 732" }], source).fiable).toBe(true);
  });

  it("rejette une valeur illisible", () => {
    const { rejetes } = verifierChiffres([{ libelle: "CA", valeur: "environ" }], source);
    expect(rejetes[0].motif).toBe("valeur illisible");
  });
});

describe("comparerGuidance", () => {
  it("détecte un relèvement sur le milieu de fourchette", () => {
    const r = comparerGuidance({ bas: 5, haut: 7 }, { bas: 4, haut: 6 });
    expect(r.sens).toBe("relevee");
    expect(r.ecart).toBeCloseTo(1, 6);
  });

  it("détecte un abaissement", () => {
    expect(comparerGuidance({ bas: 2, haut: 4 }, { bas: 4, haut: 6 }).sens).toBe("abaissee");
  });

  it("reconnaît une guidance maintenue au mot près", () => {
    expect(comparerGuidance({ bas: 4, haut: 6 }, { bas: 4, haut: 6 }).sens).toBe("maintenue");
  });

  it("qualifie d'initiale une première guidance", () => {
    expect(comparerGuidance({ bas: 4, haut: 6 }, null).sens).toBe("initiale");
  });

  it("ne tranche pas sans valeur exploitable", () => {
    expect(comparerGuidance(null, { bas: 4 }).sens).toBe("inconnue");
  });

  it("gère une guidance ponctuelle", () => {
    expect(comparerGuidance({ bas: 6 }, { bas: 5 }).sens).toBe("relevee");
  });
});

describe("tenueDesGuidances", () => {
  it("compte une fourchette tenue et une manquée", () => {
    const h = [
      { periode: "2024", guidance: { bas: 4, haut: 6 }, realise: 5 },
      { periode: "2025", guidance: { bas: 6, haut: 8 }, realise: 4.2 },
    ];
    const r = tenueDesGuidances(h);
    expect(r.total).toBe(2);
    expect(r.tenues).toBe(1);
    expect(r.taux).toBe(50);
  });

  it("ignore les exercices incomplets plutôt que de les compter", () => {
    // Sans le réalisé, on ne sait pas : l'inclure fausserait le taux dans un
    // sens ou dans l'autre.
    const r = tenueDesGuidances([
      { periode: "2024", guidance: { bas: 4, haut: 6 }, realise: 5 },
      { periode: "2025", guidance: { bas: 6, haut: 8 } },
      { periode: "2026", realise: 7 },
    ]);
    expect(r.total).toBe(1);
  });

  it("tient une guidance ponctuelle pour atteinte si elle est dépassée", () => {
    expect(tenueDesGuidances([{ guidance: { bas: 5 }, realise: 5.8 }]).tenues).toBe(1);
    expect(tenueDesGuidances([{ guidance: { bas: 5 }, realise: 4.1 }]).tenues).toBe(0);
  });

  it("renvoie un taux nul plutôt que zéro sur un historique vide", () => {
    // Zéro pour cent se lirait « n'a jamais tenu ses promesses ».
    expect(tenueDesGuidances([]).taux).toBeNull();
  });
});

describe("construireResume", () => {
  const source = "Chiffre d'affaires de 4 732 M€, en hausse de 5,4 %. Objectif de croissance de 5 à 7 % pour 2027.";

  it("conserve les chiffres vérifiés et écarte les autres", () => {
    const r = construireResume({
      reponseModele: {
        resume: "Croissance soutenue au troisième trimestre.",
        chiffres: [
          { libelle: "CA", valeur: 4732, unite: "M€" },
          { libelle: "EBITDA", valeur: 999, unite: "M€" },
        ],
        guidance: { texte: "5 à 7 %", bas: 5, haut: 7, unite: "%" },
        trajectoire: "Portée par les volumes.",
        risques: ["Effet de change"],
      },
      texteSource: source,
      lien: "https://exemple.fr/communique",
      guidancePrecedente: { bas: 4, haut: 6 },
    });

    expect(r.chiffres).toHaveLength(1);
    expect(r.chiffresRejetes).toHaveLength(1);
    expect(r.fiable).toBe(false);
    expect(r.evolutionGuidance.sens).toBe("relevee");
    expect(r.lien).toBe("https://exemple.fr/communique");
  });

  it("se déclare fiable quand tout concorde", () => {
    const r = construireResume({
      reponseModele: {
        resume: "ok",
        chiffres: [{ libelle: "CA", valeur: 4732 }],
        guidance: { texte: "5 à 7 %", bas: 5, haut: 7 },
      },
      texteSource: source,
    });
    expect(r.fiable).toBe(true);
  });

  it("ne lève pas sur une réponse de modèle malformée", () => {
    // Un modèle qui répond à côté ne doit pas faire tomber la route.
    const r = construireResume({ reponseModele: null, texteSource: source });
    expect(r.resume).toBe("");
    expect(r.chiffres).toEqual([]);
    expect(r.risques).toEqual([]);
  });

  it("n'invente pas d'évolution quand il n'y a pas de guidance", () => {
    const r = construireResume({
      reponseModele: { resume: "ok", chiffres: [], guidance: null },
      texteSource: source,
    });
    expect(r.evolutionGuidance.sens).toBe("inconnue");
  });
});
