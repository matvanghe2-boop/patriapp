import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const fetchCalendarEvents = vi.fn();
const fetchCommunique = vi.fn();
// Les aides pures du module (estCommuniqueDepose) restent les vraies : seuls
// les appels réseau sont simulés.
vi.mock("../lib/api", async (importOriginal) => ({
  ...(await importOriginal()),
  fetchCalendarEvents: (...a) => fetchCalendarEvents(...a),
  fetchCommunique: (...a) => fetchCommunique(...a),
}));

import { ToastProvider } from "../lib/ToastContext";
import FinancialCalendar from "./FinancialCalendar";

/**
 * Rendu dans le même contexte que l'application : le détail d'un événement
 * propose de résumer la publication, et ce panneau utilise les toasts.
 */
const rendre = (ui) => render(<ToastProvider>{ui}</ToastProvider>);

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
  fetchCommunique.mockReset();
});

describe("FinancialCalendar", () => {
  it("interroge à la fois les positions du portefeuille et la watchlist", async () => {
    rendre(<FinancialCalendar positions={POSITIONS} watchlist={WATCHLIST} catalogueReference={{}} />);
    await vi.waitFor(() => expect(fetchCalendarEvents).toHaveBeenCalled());
    expect(fetchCalendarEvents.mock.calls[0][0].sort()).toEqual(["AI.PA", "MC.PA"]);
  });

  it("classe une valeur à la fois détenue et surveillée comme portefeuille", async () => {
    // Sinon une ligne réellement détenue s'afficherait en style « sobre ».
    mockEvents([
      { ticker: "AI.PA", name: "Air Liquide", type: "Dividende", date: futureIso(5), label: "Date ex-dividende" },
    ]);
    rendre(
      <FinancialCalendar
        positions={[{ ticker: "AI.PA", name: "Air Liquide" }]}
        watchlist={[{ ticker: "AI.PA", name: "Air Liquide" }]}
        catalogueReference={{}}
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
    rendre(<FinancialCalendar positions={POSITIONS} watchlist={WATCHLIST} catalogueReference={{}} />);
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
    rendre(<FinancialCalendar positions={POSITIONS} watchlist={WATCHLIST} catalogueReference={{}} />);
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
    rendre(<FinancialCalendar positions={POSITIONS} watchlist={[]} catalogueReference={{}} />);
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
    rendre(<FinancialCalendar positions={POSITIONS} watchlist={[]} catalogueReference={{}} />);
    await user_clickTimeline();
    await user.click(await screen.findByRole("button", { name: /Air Liquide/ }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("27,00 Md€")).toBeInTheDocument();
    expect(within(dialog).getByText(/Chiffre d'affaires/)).toBeInTheDocument();
  });

  it("charge le communiqué déposé dans la fiche, prêt à être résumé", async () => {
    const user = userEvent.setup();
    const lien = "https://fr.ftp.opendatasoft.com/datadila/INFOFI/ACT/2026/10/FCACT081907_20261020.pdf";
    mockEvents([
      {
        ticker: "VU.PA",
        name: "Vusion",
        type: "Communication",
        date: futureIso(25),
        label: "Capital Markets Day à Paris",
        fournisseur: "info-financiere",
        statut: "confirme",
        lien,
        annonceLe: "2026-10-20",
      },
    ]);
    fetchCommunique.mockResolvedValue({ url: lien, texte: "Chiffre d'affaires du 3ème trimestre 2026 : 312,4 M€.", tronque: false });

    rendre(<FinancialCalendar positions={[{ ticker: "VU.PA", name: "Vusion" }]} watchlist={[]} catalogueReference={{}} />);
    await user_clickTimeline();
    await user.click(await screen.findByRole("button", { name: /Capital Markets Day/ }));

    const dialog = await screen.findByRole("dialog");
    // Le texte arrive sans clic : il suffit d'ouvrir la fiche.
    expect(await within(dialog).findByText(/312,4 M€/)).toBeInTheDocument();
    expect(fetchCommunique).toHaveBeenCalledWith(lien);
    // Pour une date à venir, on lit le communiqué qui l'ANNONCE — et on le dit.
    expect(within(dialog).getByText(/qui annonce cette date/)).toBeInTheDocument();
    // Le résumé part de ce document, sans formulaire intermédiaire.
    expect(within(dialog).getByRole("button", { name: "Résumer ce communiqué" })).toBeInTheDocument();
  });

  it("ne propose pas de résumer par lien une page qu'aucun serveur ne lit", async () => {
    // Le lien d'agenda d'une société (catalogue de référence) est une page
    // web : le résumé par lien échouait à chaque fois.
    const user = userEvent.setup();
    mockEvents([
      { ticker: "AI.PA", name: "Air Liquide", type: "Résultats", date: futureIso(5), label: "Résultats annuels", lien: "https://www.airliquide.com/investors/events-calendar" },
    ]);
    rendre(<FinancialCalendar positions={POSITIONS} watchlist={[]} catalogueReference={{}} />);
    await user_clickTimeline();
    await user.click(await screen.findByRole("button", { name: /Air Liquide/ }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByRole("button", { name: "Résumer ce communiqué" })).not.toBeInTheDocument();
    expect(fetchCommunique).not.toHaveBeenCalled();
  });

  it("invite à remplir portefeuille ou watchlist quand les deux sont vides", async () => {
    rendre(<FinancialCalendar positions={[]} watchlist={[]} catalogueReference={{}} />);
    expect(await screen.findByText(/watchlist pour voir apparaître/i)).toBeInTheDocument();
    expect(fetchCalendarEvents).not.toHaveBeenCalled();
  });

  it("dit quand Yahoo n'a pas répondu, au lieu de paraître complet", async () => {
    // Le serveur rend alors les seuls communiqués français, ligne « ok » :
    // sans message, l'absence des dividendes passait inaperçue.
    fetchCalendarEvents.mockResolvedValue([
      { symbol: "AI.PA", ok: true, partiel: true, events: [] },
    ]);
    rendre(<FinancialCalendar positions={POSITIONS} watchlist={[]} catalogueReference={{}} />);
    expect(await screen.findByText(/Yahoo n'a pas répondu.*1 valeur/)).toBeInTheDocument();
  });

  it("nomme ses sources et dit qu'aucune date n'est inventée", async () => {
    rendre(<FinancialCalendar positions={POSITIONS} watchlist={[]} catalogueReference={{}} />);
    expect(await screen.findByText(/info-financiere\.gouv\.fr.*aucune n'est inventée/i)).toBeInTheDocument();
  });
});

/** La vue Timeline est plus simple à interroger que la grille mensuelle. */
async function user_clickTimeline() {
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: /Timeline/ }));
}
