import { describe, it, expect } from "vitest";
import {
  dividendeModifiableAuto,
  majDividendeAuto,
  repartitionMensuelle,
  dividendesAVerifier,
} from "./dividendesAuto";

const AUJ = "2026-10-21";

describe("dividende par action automatique", () => {
  it("remplit une ligne vide", () => {
    expect(majDividendeAuto({ annual_dividend: 0 }, { dividendeParAction: 3.3 }, AUJ)).toEqual({
      annual_dividend: 3.3,
      dividendeSource: "auto",
      dividendeMajLe: AUJ,
    });
  });

  it("met à jour une saisie d'avant le remplissage automatique", () => {
    // Le défaut rapporté : un portefeuille déjà renseigné à la main ne se
    // mettait jamais à jour, ses valeurs étant prises pour des choix.
    expect(dividendeModifiableAuto({ annual_dividend: 2.5 })).toBe(true);
    expect(majDividendeAuto({ annual_dividend: 2.5 }, { dividendeParAction: 3.3 }, AUJ).annual_dividend).toBe(3.3);
  });

  it("n'écrase jamais une valeur corrigée à la main", () => {
    expect(majDividendeAuto({ annual_dividend: 3, dividendeSource: "manuel" }, { dividendeParAction: 3.3 }, AUJ)).toBeNull();
  });

  it("met à jour une valeur déjà automatique", () => {
    const maj = majDividendeAuto({ annual_dividend: 3, dividendeSource: "auto" }, { dividendeParAction: 3.3 }, AUJ);
    expect(maj.annual_dividend).toBe(3.3);
    // Inchangée : seule la date de vérification avance.
    expect(majDividendeAuto({ annual_dividend: 3.3, dividendeSource: "auto" }, { dividendeParAction: 3.3 }, AUJ)).toEqual({
      dividendeMajLe: AUJ,
    });
  });

  it("marque à 0 un titre qui ne verse rien, plutôt que de le laisser vide", () => {
    expect(majDividendeAuto({}, { dividendeParAction: null }, AUJ).annual_dividend).toBe(0);
  });

  it("ne touche à rien quand la source a échoué", () => {
    expect(majDividendeAuto({}, { ok: false }, AUJ)).toBeNull();
    expect(majDividendeAuto({}, null, AUJ)).toBeNull();
  });
});

describe("dividendesAVerifier", () => {
  it("vérifie une ligne jamais vérifiée, ou vérifiée il y a plus d'une semaine", () => {
    expect(dividendesAVerifier([{ quantity: 10 }], AUJ)).toBe(true);
    expect(dividendesAVerifier([{ quantity: 10, dividendeVerifieLe: "2026-10-10" }], AUJ)).toBe(true);
  });

  it("ne réinterroge pas la source chaque jour", () => {
    expect(dividendesAVerifier([{ quantity: 10, dividendeVerifieLe: "2026-10-18" }], AUJ)).toBe(false);
    // Une ligne soldée ne compte pas.
    expect(dividendesAVerifier([{ quantity: 0 }], AUJ)).toBe(false);
  });
});

describe("répartition mensuelle des détachements", () => {
  it("répartit selon les détachements des douze derniers mois", () => {
    const r = repartitionMensuelle(
      [
        { date: "2024-05-15", montant: 3 }, // trop ancien
        { date: "2025-11-20", montant: 1 },
        { date: "2026-05-12", montant: 3 },
      ],
      AUJ
    );
    expect(r).toEqual({ 11: 0.25, 5: 0.75 });
  });

  it("ne devine pas un calendrier jamais observé", () => {
    expect(repartitionMensuelle([], AUJ)).toBeNull();
    expect(repartitionMensuelle([{ date: "2023-05-01", montant: 2 }], AUJ)).toBeNull();
  });
});
