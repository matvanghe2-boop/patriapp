import { describe, it, expect } from "vitest";
import {
  SENS,
  creerAlerte,
  alerteDeclenchee,
  alertesDeclenchees,
  rearmer,
  acquitter,
  versRappel,
  libelleSens,
} from "./alertes";

const sous = creerAlerte({ id: "a1", ticker: "CW8.PA", nom: "Amundi MSCI World", seuil: 440, sens: SENS.SOUS });
const audessus = creerAlerte({ id: "a2", ticker: "AI.PA", nom: "Air Liquide", seuil: 200, sens: SENS.AU_DESSUS });

describe("alerteDeclenchee", () => {
  it("se déclenche sous le seuil", () => {
    expect(alerteDeclenchee(sous, 435)).toBe(true);
    expect(alerteDeclenchee(sous, 440)).toBe(true);
    expect(alerteDeclenchee(sous, 445)).toBe(false);
  });

  it("se déclenche au-dessus du seuil", () => {
    expect(alerteDeclenchee(audessus, 210)).toBe(true);
    expect(alerteDeclenchee(audessus, 190)).toBe(false);
  });

  it("ne se déclenche pas si elle est acquittée", () => {
    // Sans cette règle, un cours qui stagne sous le seuil notifierait à chaque
    // ouverture de l'application.
    expect(alerteDeclenchee({ ...sous, acquittee: true }, 400)).toBe(false);
  });

  it("ne se déclenche pas si elle est désactivée", () => {
    expect(alerteDeclenchee({ ...sous, active: false }, 400)).toBe(false);
  });

  it("ignore un cours inconnu", () => {
    expect(alerteDeclenchee(sous, undefined)).toBe(false);
    expect(alerteDeclenchee(sous, NaN)).toBe(false);
  });
});

describe("rearmer", () => {
  it("réarme une alerte acquittée dont le cours est repassé au-dessus du seuil", () => {
    const acquittees = acquitter([sous], "a1");
    const out = rearmer(acquittees, { "CW8.PA": 460 });
    expect(out[0].acquittee).toBe(false);
  });

  it("laisse acquittée une alerte dont le cours stagne du mauvais côté", () => {
    const acquittees = acquitter([sous], "a1");
    const out = rearmer(acquittees, { "CW8.PA": 430 });
    expect(out[0].acquittee).toBe(true);
  });

  it("ne touche pas aux alertes non acquittées", () => {
    const out = rearmer([sous], { "CW8.PA": 460 });
    expect(out[0]).toBe(sous);
  });

  it("tolère un cours manquant", () => {
    const acquittees = acquitter([sous], "a1");
    expect(rearmer(acquittees, {})[0].acquittee).toBe(true);
  });
});

describe("alertesDeclenchees", () => {
  it("ne renvoie que celles dont le seuil est franchi, avec le cours", () => {
    const out = alertesDeclenchees([sous, audessus], { "CW8.PA": 430, "AI.PA": 190 });
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("a1");
    expect(out[0].cours).toBe(430);
  });
});

describe("versRappel", () => {
  it("produit un libellé lisible pour le panneau de notifications", () => {
    const r = versRappel({ ...sous, cours: 435 });
    expect(r.label).toBe("Amundi MSCI World descend sous 440 (cours : 435.00)");
    expect(r.type).toBe("alerte");
    expect(r.alerteId).toBe("a1");
  });

  it("omet le cours quand il est inconnu", () => {
    expect(versRappel(sous).label).toBe("Amundi MSCI World descend sous 440");
  });
});

describe("libelleSens", () => {
  it("se lit en français dans les deux sens", () => {
    expect(libelleSens(SENS.SOUS)).toBe("descend sous");
    expect(libelleSens(SENS.AU_DESSUS)).toBe("monte au-dessus de");
  });
});

describe("creerAlerte", () => {
  it("naît active et non acquittée", () => {
    expect(sous.active).toBe(true);
    expect(sous.acquittee).toBe(false);
  });

  it("refuse un seuil négatif", () => {
    expect(creerAlerte({ id: "x", ticker: "T", seuil: -5 }).seuil).toBe(0);
  });
});
