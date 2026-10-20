import { describe, it, expect } from "vitest";
import {
  serieSparkline, marqueursOperations, decrireOperation, montantOperation, POINTS_MIN_SPARKLINE,
} from "./marqueursCourbe";

describe("serieSparkline", () => {
  it("ne renvoie rien sous trois points : un segment suggère une tendance qui n'existe pas", () => {
    expect(POINTS_MIN_SPARKLINE).toBe(3);
    expect(serieSparkline([])).toEqual([]);
    expect(serieSparkline([{ date: "2026-01-01", value: 1 }, { date: "2026-01-02", value: 2 }])).toEqual([]);
  });

  it("trie par date et lit la clé demandée", () => {
    const pts = [
      { date: "2026-01-03", valeur: 30 },
      { date: "2026-01-01", valeur: 10 },
      { date: "2026-01-02", valeur: 20 },
    ];
    expect(serieSparkline(pts, "valeur")).toEqual([10, 20, 30]);
  });

  it("écarte les relevés sans valeur au lieu de les compter à zéro", () => {
    const pts = [
      { date: "2026-01-01", value: 10 },
      { date: "2026-01-02", value: null },
      { date: "2026-01-03", value: 12 },
      { date: "2026-01-04", value: 14 },
    ];
    expect(serieSparkline(pts)).toEqual([10, 12, 14]);
    // Trois points dont un vide : il n'en reste que deux, donc rien.
    expect(serieSparkline(pts.slice(0, 3))).toEqual([]);
  });
});

const POINTS = [
  { date: "2026-03-02", label: "2 mars", value: 1000 },
  { date: "2026-03-05", label: "5 mars", value: 1100 },
  { date: "2026-03-09", label: "9 mars", value: 1200 },
  // Point de projection : pas de valeur mesurée, jamais une cible.
  { date: "2026-04-09", label: "avr.", projection: 1300 },
];

describe("marqueursOperations", () => {
  it("rattache une opération de week-end au dernier relevé connu avant elle", () => {
    const [m] = marqueursOperations([{ date: "2026-03-07", type: "ACHAT", asset: "AIR", quantity: 2, price: 100 }], POINTS);
    expect(m.date).toBe("2026-03-05");
    expect(m.point.label).toBe("5 mars");
    expect(m.valeur).toBe(1100);
  });

  it("empile plusieurs natures du même jour, versement en premier", () => {
    const [m] = marqueursOperations(
      [
        { date: "2026-03-05", type: "ACHAT", quantity: 1, price: 50 },
        { date: "2026-03-05", type: "VERSEMENT", amount: 500 },
        { date: "2026-03-06", type: "ACHAT", quantity: 1, price: 60 },
      ],
      POINTS
    );
    expect(m.natures.map((n) => n.nature)).toEqual(["VERSEMENT", "ACHAT"]);
    expect(m.natures[1].ops).toHaveLength(2);
  });

  it("ne marque JAMAIS un ajustement de poche cash comme un versement", () => {
    const res = marqueursOperations(
      [
        { date: "2026-03-05", type: "AJUSTEMENT", amount: 800 },
        // Ancienne correction de solde, de nature certaine, pas encore convertie.
        { date: "2026-03-05", type: "VERSEMENT", amount: 300, origine: "ajustement-cash" },
      ],
      POINTS
    );
    expect(res).toEqual([]);
  });

  it("garde versements et retraits explicites", () => {
    const res = marqueursOperations(
      [
        { date: "2026-03-02", type: "VERSEMENT", amount: 500, origine: "saisie" },
        { date: "2026-03-09", type: "RETRAIT", amount: 200 },
      ],
      POINTS
    );
    expect(res.map((m) => [m.date, m.natures[0].nature])).toEqual([
      ["2026-03-02", "VERSEMENT"],
      ["2026-03-09", "RETRAIT"],
    ]);
  });

  it("ignore ce qui sort de la période mesurée et les points de projection", () => {
    const res = marqueursOperations(
      [
        { date: "2026-03-01", type: "ACHAT", quantity: 1, price: 1 },
        { date: "2026-03-20", type: "DIVIDENDE", amount: 5 },
        { date: "2026-04-09", type: "DIVIDENDE", amount: 5 },
      ],
      POINTS
    );
    expect(res).toEqual([]);
  });

  it("identifie le point par son indice, même si deux libellés se répètent", () => {
    const pts = [
      { date: "2025-03-05", label: "5 mars", value: 1 },
      { date: "2026-03-05", label: "5 mars", value: 2 },
    ];
    const [m] = marqueursOperations([{ date: "2026-03-05", type: "DIVIDENDE", amount: 3 }], pts);
    expect(m.indice).toBe(1);
  });

  it("lit une autre clé de valeur (courbe du portefeuille)", () => {
    const [m] = marqueursOperations(
      [{ date: "2026-01-02", type: "VENTE", quantity: 1, price: 10 }],
      [{ date: "2026-01-01", valeur: 40 }, { date: "2026-01-03", valeur: 42 }],
      "valeur"
    );
    expect(m.valeur).toBe(40);
  });
});

describe("description des opérations", () => {
  it("donne un montant positif, frais compris pour un achat et déduits pour une vente", () => {
    expect(montantOperation({ type: "ACHAT", quantity: 10, price: 100, fees: 12 })).toBe(1012);
    expect(montantOperation({ type: "VENTE", quantity: 10, price: 100, fees: 12 })).toBe(988);
    expect(montantOperation({ type: "RETRAIT", amount: -250 })).toBe(250);
    expect(montantOperation({ type: "DIVIDENDE", montantNet: "4,5" })).toBe(4.5);
  });

  it("dit de quoi il s'agit et pour quel montant", () => {
    expect(decrireOperation({ type: "ACHAT", asset: "AIR", quantity: 10, price: 100, fees: 12 })).toMatch(
      /^Achat AIR ×10 — 1\s?012,00\s€$/
    );
    expect(decrireOperation({ type: "VERSEMENT", amount: 500 })).toMatch(/^Versement — 500,00\s€$/);
    expect(decrireOperation({ type: "AJUSTEMENT", amount: 500 })).toBe("");
  });
});
