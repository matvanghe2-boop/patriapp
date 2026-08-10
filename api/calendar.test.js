import { describe, it, expect } from "vitest";
import { eventsFromRow, eventsFromDetail } from "./_lib/routes/calendar.js";

// Yahoo renvoie ses dates en epoch secondes ; ces helpers construisent des
// jeux de données au même format que la réponse réelle.
const epoch = (iso) => Math.floor(new Date(`${iso}T00:00:00Z`).getTime() / 1000);
const wrapped = (iso) => ({ raw: epoch(iso), fmt: iso });

describe("eventsFromRow", () => {
  it("extrait les deux dates de dividende", () => {
    const events = eventsFromRow({
      symbol: "AI.PA",
      shortName: "Air Liquide",
      exDividendDate: epoch("2026-05-18"),
      dividendDate: epoch("2026-05-22"),
    });
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ type: "Dividende", date: "2026-05-18", label: "Date ex-dividende" });
    expect(events[1]).toMatchObject({ type: "Dividende", date: "2026-05-22", label: "Mise en paiement" });
  });

  it("annonce une fourchette quand Yahoo n'a pas de date de résultats ferme", () => {
    const [ev] = eventsFromRow({
      symbol: "AI.PA",
      shortName: "Air Liquide",
      earningsTimestampStart: epoch("2026-02-10"),
      earningsTimestampEnd: epoch("2026-02-14"),
    });
    expect(ev.type).toBe("Résultats");
    expect(ev.label).toMatch(/entre le 2026-02-10 et le 2026-02-14/);
  });

  it("ne fabrique aucune date quand la source n'en fournit pas", () => {
    // Un dividende versé est connu, mais sans date : rien ne doit être inventé.
    expect(eventsFromRow({ symbol: "X", trailingAnnualDividendRate: 3.2 })).toEqual([]);
  });

  it("se rabat sur le symbole quand aucun nom n'est fourni", () => {
    const [ev] = eventsFromRow({ symbol: "XYZ.PA", exDividendDate: epoch("2026-03-01") });
    expect(ev.name).toBe("XYZ.PA");
  });
});

describe("eventsFromDetail", () => {
  const detail = (earnings, fiscalYearEndIso) => ({
    calendarEvents: { earnings },
    defaultKeyStatistics: fiscalYearEndIso ? { lastFiscalYearEnd: epoch(fiscalYearEndIso) } : {},
  });

  it("remonte TOUTES les dates de résultats connues, pas seulement la prochaine", () => {
    const events = eventsFromDetail(
      detail({ earningsDate: [wrapped("2026-02-12"), wrapped("2026-04-23"), wrapped("2026-07-30")] }),
      "AI.PA",
      "Air Liquide"
    );
    expect(events.filter((e) => e.type === "Résultats")).toHaveLength(3);
  });

  it("déduplique deux dates identiques", () => {
    const events = eventsFromDetail(
      detail({ earningsDate: [wrapped("2026-02-12"), wrapped("2026-02-12")] }),
      "AI.PA",
      "Air Liquide"
    );
    expect(events).toHaveLength(1);
  });

  it("qualifie d'annuelle une publication proche de la clôture d'exercice", () => {
    const [ev] = eventsFromDetail(
      detail({ earningsDate: [wrapped("2026-02-12")] }, "2025-12-31"),
      "AI.PA",
      "Air Liquide"
    );
    expect(ev.label).toBe("Résultats annuels (estimé)");
  });

  it("qualifie d'intermédiaire une publication en milieu d'exercice", () => {
    const [ev] = eventsFromDetail(
      detail({ earningsDate: [wrapped("2026-07-30")] }, "2025-12-31"),
      "AI.PA",
      "Air Liquide"
    );
    expect(ev.label).toBe("Résultats intermédiaires (estimé)");
  });

  it("reste générique quand la clôture d'exercice est inconnue", () => {
    const [ev] = eventsFromDetail(detail({ earningsDate: [wrapped("2026-07-30")] }), "X", "X");
    expect(ev.label).toBe("Publication des résultats");
  });

  it("rattache le chiffre d'affaires et le bénéfice attendus à la publication", () => {
    const [ev] = eventsFromDetail(
      detail({
        earningsDate: [wrapped("2026-02-12")],
        revenueAverage: { raw: 27_000_000_000 },
        earningsAverage: { raw: 3.1 },
      }),
      "AI.PA",
      "Air Liquide"
    );
    expect(ev.estimates).toEqual({ chiffreAffairesAttendu: 27_000_000_000, beneficeAttendu: 3.1 });
  });

  it("n'attache pas d'estimations vides", () => {
    const [ev] = eventsFromDetail(detail({ earningsDate: [wrapped("2026-02-12")] }), "X", "X");
    expect(ev.estimates).toBeUndefined();
  });

  it("remonte la conférence de résultats comme communication", () => {
    const events = eventsFromDetail(
      detail({ earningsDate: [], earningsCallDate: [wrapped("2026-02-12")] }),
      "AI.PA",
      "Air Liquide"
    );
    expect(events).toEqual([
      expect.objectContaining({ type: "Communication", label: "Conférence de résultats", date: "2026-02-12" }),
    ]);
  });

  it("tolère une absence totale de détail", () => {
    expect(eventsFromDetail(null, "X", "X")).toEqual([]);
    expect(eventsFromDetail({}, "X", "X")).toEqual([]);
  });
});
