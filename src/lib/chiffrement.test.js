import { describe, it, expect } from "vitest";
import {
  creerConfiguration, verifierPhrase, chiffrer, dechiffrer, estChiffre, exporterCle, importerCle, cleCorrespond,
  genererCodeSecours, normaliserCodeSecours, ajouterCodeSecours, verifierCodeSecours, remplacerPhrase,
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

describe("version 2 : code de secours et changement de phrase", () => {
  const memeCle = async (a, b) => (await exporterCle(a)) === (await exporterCle(b));

  it("génère des codes lisibles, sans caractères ambigus, tous différents", () => {
    const a = genererCodeSecours();
    expect(a).toMatch(/^[A-HJKMNP-Z2-9]{5}(-[A-HJKMNP-Z2-9]{5}){4}$/);
    expect(genererCodeSecours()).not.toBe(a);
    expect(normaliserCodeSecours(" abcde-fghjk ")).toBe("ABCDEFGHJK");
  });

  it("rouvre la même clé avec le code, quelle que soit la façon de le taper", async () => {
    const { cle, config } = await creerConfiguration("phrase d'origine");
    const avant = await chiffrer(cle, "donnée chiffrée avant le code");
    const { code, config: v2 } = await ajouterCodeSecours(cle, config);

    expect(v2.version).toBe(2);
    expect(v2.temoin).toEqual(config.temoin);
    expect(JSON.stringify(v2)).not.toContain(normaliserCodeSecours(code));

    const parCode = await verifierCodeSecours(code.toLowerCase().replaceAll("-", " "), v2);
    expect(await memeCle(parCode, cle)).toBe(true);
    expect(await dechiffrer(parCode, avant)).toBe("donnée chiffrée avant le code");
    // La phrase d'origine fonctionne toujours : le code s'ajoute, il ne remplace rien.
    expect(await verifierPhrase("phrase d'origine", v2)).not.toBeNull();
  });

  it("refuse un mauvais code, et ne trouve aucun code dans une configuration v1", async () => {
    const { cle, config } = await creerConfiguration("phrase");
    const { code, config: v2 } = await ajouterCodeSecours(cle, config);
    expect(await verifierCodeSecours("AAAAA-AAAAA-AAAAA-AAAAA-AAAAA", v2)).toBeNull();
    expect(await verifierCodeSecours(code, config)).toBeNull();
  });

  it("change de phrase sans changer de clé : l'ancienne phrase ne sert plus", async () => {
    const { cle, config } = await creerConfiguration("ancienne phrase");
    const v2 = await remplacerPhrase(cle, "nouvelle phrase", config);
    expect(await verifierPhrase("ancienne phrase", v2)).toBeNull();
    expect(await memeCle(await verifierPhrase("nouvelle phrase", v2), cle)).toBe(true);
    expect(await cleCorrespond(cle, v2)).toBe(true);
  });

  it("garde le code valable après un changement de phrase, et inversement", async () => {
    const { cle, config } = await creerConfiguration("phrase 1");
    const { code, config: avecCode } = await ajouterCodeSecours(cle, config);
    const changee = await remplacerPhrase(cle, "phrase 2", avecCode);
    expect(await memeCle(await verifierCodeSecours(code, changee), cle)).toBe(true);

    const { code: code2, config: nouveauCode } = await ajouterCodeSecours(cle, changee);
    expect(await verifierCodeSecours(code, nouveauCode)).toBeNull();
    expect(await verifierCodeSecours(code2, nouveauCode)).not.toBeNull();
    expect(await verifierPhrase("phrase 2", nouveauCode)).not.toBeNull();
  });

  it("refuse d'envelopper une clé étrangère à la configuration", async () => {
    const a = await creerConfiguration("phrase A");
    const b = await creerConfiguration("phrase B");
    await expect(remplacerPhrase(b.cle, "nouvelle", a.config)).rejects.toThrow(/ne correspond pas/);
  });
});
