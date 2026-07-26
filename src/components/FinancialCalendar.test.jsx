import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const fetchCalendarEvents = vi.fn();
vi.mock("../lib/api", () => ({ fetchCalendarEvents: (...a) => fetchCalendarEvents(...a) }));

import FinancialCalendar from "./FinancialCalendar";

const POSITIONS = [{ ticker: "AI.PA", name: "Air Liquide" }];
const WATCHLIST = [{ ticker: "MC.PA", name: "LVMH" }];

const futureIso = (daysAhead) =>
  new Date(Date.now() + daysAhead * 86_400_000).toISOString().slice(0, 10);

function mockEvents(events) {
  const bySymbol = {};
  events.forEach((ev) => {
    (bySymbol[ev.ticker] ||= []).push(ev);
  });
  fetchCalendarEvents.mockResolvedValue(
    Object.entries(bySymbol).map(([symbol, evs]) => ({ symbol, ok: true, events: evs }))
  );
}

beforeEach(() => {
  fetchCalendarEvents.mockReset();
  fetchCalendarEvents.mockResolvedValue([]);
});

describe("FinancialCalendar", () => {
  it("interroge à la fois les positions du portefeuille et la watchlist", async () => {
    render(<FinancialCalendar positions={POSITIONS} watchlist={WATCHLIST} />);
    await vi.waitFor(() => expect(fetchCalendarEvents).toHaveBeenCalled());
    expect(fetchCalendarEvents.mock.calls[0][0].sort()).toEqual(["AI.PA", "MC.PA"]);
  });

  it("classe une valeur à la fois détenue et surveillée comme portefeuille", async () => {
    // Sinon une ligne réellement détenue s'afficherait en style « sobre ».
    mockEvents([
      { ticker: "AI.PA", name: "Air Liquide", type: "Dividende", date: futureIso(5), label: "Date ex-dividende" },
    ]);
    render(
      <FinancialCalendar
        positions={[{ ticker: "AI.PA", name: "Air Liquide" }]}
        watchlist={[{ ticker: "AI.PA", name: "Air Liquide" }]}
      />
    );

    await user_clickTimeline();
    const row = await screen.findByRole("button", { name: /Air Liquide/ });
    expect(within(row).getByText("Portefeuille")).toBeInTheDocument();
  });

  it("distingue visuellement portefeuille et watchlist dans la timeline", async () => {
    mockEvents([
      { ticker: "AI.PA", name: "Air Liquide", type: "Dividende", date: futureIso(3), label: "Date ex-dividende" },
      { ticker: "MC.PA", name: "LVMH", type: "Résultats", date: futureIso(6), label: "Résultats annuels (estimé)" },
    ]);
    render(<FinancialCalendar positions={POSITIONS} watchlist={WATCHLIST} />);
    await user_clickTimeline();

    const detenu = await screen.findByRole("button", { name: /Air Liquide/ });
    const surveille = await screen.findByRole("button", { name: /LVMH/ });

    expect(within(detenu).getByText("Portefeuille")).toBeInTheDocument();
    expect(within(surveille).getByText("Watchlist")).toBeInTheDocument();
    // La ligne détenue porte un halo coloré, la surveillée non.
    expect(detenu.style.boxShadow).not.toBe("none");
    expect(surveille.style.boxShadow).toBe("none");
  });

  it("permet de masquer les événements de la watchlist", async () => {
    const user = userEvent.setup();
    mockEvents([
      { ticker: "AI.PA", name: "Air Liquide", type: "Dividende", date: futureIso(3), label: "Date ex-dividende" },
      { ticker: "MC.PA", name: "LVMH", type: "Résultats", date: futureIso(6), label: "Résultats annuels (estimé)" },
    ]);
    render(<FinancialCalendar positions={POSITIONS} watchlist={WATCHLIST} />);
    await user_clickTimeline();
    await screen.findByRole("button", { name: /LVMH/ });

    await user.click(screen.getByRole("button", { name: /^Watchlist/ }));

    expect(screen.queryByRole("button", { name: /LVMH/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Air Liquide/ })).toBeInTheDocument();
  });

  it("permet de filtrer par type d'événement", async () => {
    const user = userEvent.setup();
    mockEvents([
      { ticker: "AI.PA", name: "Air Liquide", type: "Dividende", date: futureIso(3), label: "Date ex-dividende" },
      { ticker: "AI.PA", name: "Air Liquide", type: "Résultats", date: futureIso(6), label: "Résultats annuels (estimé)" },
    ]);
    render(<FinancialCalendar positions={POSITIONS} watchlist={[]} />);
    await user_clickTimeline();
    await vi.waitFor(() => expect(screen.getAllByRole("button", { name: /Air Liquide/ })).toHaveLength(2));

    await user.click(screen.getByRole("button", { name: /^Dividende/ }));

    expect(screen.getAllByRole("button", { name: /Air Liquide/ })).toHaveLength(1);
  });

  it("affiche les attentes du consensus dans le détail d'une publication", async () => {
    const user = userEvent.setup();
    mockEvents([
      {
        ticker: "AI.PA",
        name: "Air Liquide",
        type: "Résultats",
        date: futureIso(4),
        label: "Résultats annuels (estimé)",
        estimates: { chiffreAffairesAttendu: 27_000_000_000, beneficeAttendu: 3.1 },
      },
    ]);
    render(<FinancialCalendar positions={POSITIONS} watchlist={[]} />);
    await user_clickTimeline();
    await user.click(await screen.findByRole("button", { name: /Air Liquide/ }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("27.00 Md€")).toBeInTheDocument();
    expect(within(dialog).getByText(/Chiffre d'affaires/)).toBeInTheDocument();
  });

  it("invite à remplir portefeuille ou watchlist quand les deux sont vides", async () => {
    render(<FinancialCalendar positions={[]} watchlist={[]} />);
    expect(await screen.findByText(/watchlist pour voir apparaître/i)).toBeInTheDocument();
    expect(fetchCalendarEvents).not.toHaveBeenCalled();
  });

  it("indique clairement que les assemblées générales ne sont pas fournies par la source", async () => {
    render(<FinancialCalendar positions={POSITIONS} watchlist={[]} />);
    expect(
      await screen.findByText(/assemblée générale ne sont publiées par aucun endpoint/i)
    ).toBeInTheDocument();
  });
});

/** La vue Timeline est plus simple à interroger que la grille mensuelle. */
async function user_clickTimeline() {
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: /Timeline/ }));
}
