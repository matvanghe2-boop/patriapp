import { describe, it, expect } from "vitest";
import {
  creerConfiguration, verifierPhrase, chiffrer, dechiffrer, estChiffre, exporterCle, importerCle, cleCorrespond,
} from "./chiffrement";

describe("chiffrement", () => {
  it("chiffre et déchiffre une valeur avec la clé de la phrase secrète", async () => {
    const { cle, config } = await creerConfiguration("une phrase assez longue");
    const valeur = { operations: [{ libelle: "VIR SEPA MME CLAIRE PETIT", montant: 10000 }] };
    const enveloppe = await chiffrer(cle, valeur);
    expect(estChiffre(enveloppe)).toBe(true);
    expect(JSON.stringify(enveloppe)).not.toContain("CLAIRE");
    expect(await dechiffrer(cle, enveloppe)).toEqual(valeur);
    expect(config.sel).toBeTruthy();
  });

  it("reconnaît la bonne phrase et refuse les autres", async () => {
    const { config } = await creerConfiguration("bonne phrase");
    expect(await verifierPhrase("bonne phrase", config)).not.toBeNull();
    expect(await verifierPhrase("mauvaise phrase", config)).toBeNull();
  });

  it("ne déchiffre pas avec la clé d'une autre phrase", async () => {
    const a = await creerConfiguration("phrase A");
    const b = await creerConfiguration("phrase B");
    const enveloppe = await chiffrer(a.cle, "secret");
    await expect(dechiffrer(b.cle, enveloppe)).rejects.toThrow();
    expect(await cleCorrespond(b.cle, a.config)).toBe(false);
  });

  it("garde la clé sur l'appareil et la relit à l'identique", async () => {
    const { cle, config } = await creerConfiguration("phrase");
    const relue = await importerCle(await exporterCle(cle));
    expect(await cleCorrespond(relue, config)).toBe(true);
  });

  it("chiffre deux fois la même valeur différemment", async () => {
    const { cle } = await creerConfiguration("phrase");
    const [x, y] = [await chiffrer(cle, 1), await chiffrer(cle, 1)];
    expect(x.donnees).not.toBe(y.donnees);
  });

  it("supporte une valeur volumineuse", async () => {
    const { cle } = await creerConfiguration("phrase");
    const grosse = Array.from({ length: 5000 }, (_, i) => ({ id: i, libelle: "CARTE 05/05/26 CARREFOUR CITY CB*1234" }));
    expect(await dechiffrer(cle, await chiffrer(cle, grosse))).toEqual(grosse);
  });
});
