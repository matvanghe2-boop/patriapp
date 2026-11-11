import { describe, it, expect } from "vitest";
import { annoncerVoyage, ecouterVoyages, nombreDePiecesEnVol } from "./voyage";

describe("argent qui voyage", () => {
  it("rend la main quand aucune scène n'écoute", () => {
    expect(annoncerVoyage({ de: "Compte courant", vers: "PEA", montant: 2000 })).toBe(false);
  });

  it("transmet le versement à la scène qui écoute", () => {
    const recus = [];
    const arreter = ecouterVoyages((v) => recus.push(`${v.de} → ${v.vers} : ${v.montant}`));
    expect(annoncerVoyage({ de: "Compte courant", vers: "PEL", montant: 500, genre: "livret" })).toBe(true);
    arreter();
    expect(recus).toEqual(["Compte courant → PEL : 500"]);
    expect(annoncerVoyage({ de: "Compte courant", vers: "PEL", montant: 500 })).toBe(false);
  });

  it("n'annonce pas un versement nul ou négatif", () => {
    const recus = [];
    const arreter = ecouterVoyages((v) => recus.push(v));
    expect(annoncerVoyage({ de: "Compte courant", vers: "PEA", montant: 0 })).toBe(false);
    expect(annoncerVoyage({ de: "Compte courant", vers: "PEA", montant: -50 })).toBe(false);
    arreter();
    expect(recus).toEqual([]);
  });

  it("fait voler plus de pièces pour un gros versement, sans jamais déborder", () => {
    expect(nombreDePiecesEnVol(0)).toBe(0);
    expect(nombreDePiecesEnVol(5)).toBe(4);
    expect(nombreDePiecesEnVol(2000)).toBe(10);
    expect(nombreDePiecesEnVol(20_000)).toBe(12);
    expect(nombreDePiecesEnVol(5_000_000)).toBe(12);
    expect(nombreDePiecesEnVol(100)).toBeLessThan(nombreDePiecesEnVol(10_000));
  });
});
