import { describe, it, expect } from "vitest";
import { extraireDividendes } from "./_lib/routes/history.js";

describe("extraireDividendes", () => {
  it("lit les détachements de Yahoo, triés par date", () => {
    const result = {
      events: {
        dividends: {
          1747000000: { amount: 3.3, date: 1747000000 }, // mai 2025
          1715000000: { amount: 3.2, date: 1715000000 }, // mai 2024
        },
      },
    };
    expect(extraireDividendes(result)).toEqual([
      { date: "2024-05-06", montant: 3.2 },
      { date: "2025-05-11", montant: 3.3 },
    ]);
  });

  it("renvoie une liste vide sans événement exploitable", () => {
    expect(extraireDividendes({})).toEqual([]);
    expect(extraireDividendes({ events: { dividends: { a: { amount: 0, date: 1 } } } })).toEqual([]);
  });
});
