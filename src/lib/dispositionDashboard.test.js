import { describe, it, expect } from "vitest";
import {
  BLOCS_DASHBOARD,
  DISPOSITION_DEFAUT,
  ordreEffectif,
  blocsVisibles,
  deplacer,
  basculerMasque,
  estParDefaut,
} from "./dispositionDashboard";

const IDS = BLOCS_DASHBOARD.map((b) => b.id);

describe("disposition du Dashboard", () => {
  it("affiche tout, dans l'ordre d'origine, sans préférence", () => {
    expect(blocsVisibles(undefined)).toEqual(IDS);
    expect(blocsVisibles(DISPOSITION_DEFAUT)).toEqual(IDS);
    expect(estParDefaut({})).toBe(true);
  });

  it("monte et descend un bloc d'un cran, sans sortir des bornes", () => {
    const monte = deplacer(DISPOSITION_DEFAUT, "objectifs", -1);
    expect(ordreEffectif(monte).indexOf("objectifs")).toBe(IDS.indexOf("objectifs") - 1);
    // Le premier ne monte pas plus haut, le dernier ne descend pas plus bas.
    expect(deplacer(DISPOSITION_DEFAUT, IDS[0], -1)).toBe(DISPOSITION_DEFAUT);
    expect(deplacer(DISPOSITION_DEFAUT, IDS.at(-1), +1)).toBe(DISPOSITION_DEFAUT);
  });

  it("masque un bloc sans l'oublier, et le réaffiche à sa place", () => {
    const masque = basculerMasque(DISPOSITION_DEFAUT, "passifs");
    expect(blocsVisibles(masque)).not.toContain("passifs");
    expect(ordreEffectif(masque)).toContain("passifs");
    expect(blocsVisibles(basculerMasque(masque, "passifs"))).toEqual(IDS);
  });

  it("fait apparaître un bloc ajouté après coup à sa place par défaut", () => {
    // Une préférence enregistrée avant l'arrivée de « cascade » : le bloc
    // ne doit pas rester invisible pour qui avait personnalisé son écran.
    const ancienne = { ordre: IDS.filter((id) => id !== "cascade"), masques: [] };
    const ordre = ordreEffectif(ancienne);
    expect(ordre).toContain("cascade");
    expect(ordre.indexOf("cascade")).toBe(ordre.indexOf("allocation") + 1);
  });

  it("ignore un identifiant inconnu ou dupliqué", () => {
    const abimee = { ordre: ["inconnu", "vedette", "vedette", ...IDS], masques: ["inconnu"] };
    expect(blocsVisibles(abimee)).toEqual(["vedette", ...IDS.filter((id) => id !== "vedette")]);
  });

  it("respecte l'ordre choisi entre les blocs qu'il connaît", () => {
    // « objectifs » placé AVANT « vedette » : l'inverse de l'ordre d'origine.
    const choisi = { ordre: ["objectifs", "vedette"], masques: [] };
    const ordre = ordreEffectif(choisi);
    expect(ordre.indexOf("objectifs")).toBeLessThan(ordre.indexOf("vedette"));
    expect([...ordre].sort()).toEqual([...IDS].sort());
  });
});
