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
  // Le calendrier garde sa dernière synchronisation d'une visite à l'autre :
  // sans remise à zéro, un test verrait les événements du précédent.
  localStorage.clear();
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

  it("affiche le dernier calendrier connu dès l'ouverture, sans attendre la synchronisation", async () => {
    // Au rechargement, on ne voyait que le catalogue et les saisies manuelles
    // (8 événements) jusqu'à la fin de la synchronisation (52).
    localStorage.setItem(
      "patrimoine:calendrierCacheApi",
      JSON.stringify({
        majLe: "2026-10-24T09:30:00.000Z",
        evenements: [{ ticker: "AI.PA", name: "Air Liquide", type: "Résultats", date: futureIso(5), label: "Résultats du T3" }],
      })
    );
    fetchCalendarEvents.mockReturnValue(new Promise(() => {})); // la synchro ne finit jamais
    rendre(<FinancialCalendar positions={POSITIONS} watchlist={[]} catalogueReference={{}} />);
    await user_clickTimeline();
    expect(await screen.findByRole("button", { name: /Résultats du T3/ })).toBeInTheDocument();
    expect(screen.getByText(/Affichage de la synchro du .*actualisation en cours/)).toBeInTheDocument();
  });

  it("n'efface pas la liste des rappels pendant la synchronisation", async () => {
    // Elle était réécrite à l'ouverture avec le seul catalogue : les rappels
    // perdaient tous les dividendes et résultats venus des API.
    const rappels = [{ ticker: "AI.PA", type: "Dividende", date: futureIso(1), label: "Date ex-dividende" }];
    localStorage.setItem("patrimoine:calendrierEvenements", JSON.stringify(rappels));
    fetchCalendarEvents.mockReturnValue(new Promise(() => {}));
    rendre(
      <FinancialCalendar
        positions={POSITIONS}
        watchlist={[]}
        catalogueReference={{ "AI.PA": { nom: "Air Liquide", source: "https://x", evenements: [{ date: futureIso(9), type: "Résultats", label: "Agenda" }] } }}
      />
    );
    await vi.waitFor(() => expect(fetchCalendarEvents).toHaveBeenCalled());
    expect(JSON.parse(localStorage.getItem("patrimoine:calendrierEvenements"))).toEqual(rappels);
  });

  it("garde le communiqué déposé quand la date du catalogue prime (Vinci, 22 octobre)", async () => {
    const user = userEvent.setup();
    const pdf = "https://fr.ftp.opendatasoft.com/datadila/INFOFI/ECO/2026/10/FCECO0VINCI_20261022.pdf";
    const jour = futureIso(3);
    mockEvents([
      { ticker: "DG.PA", name: "Vinci", type: "Chiffre d'affaires", date: jour, label: "VINCI - 9M 2026", fournisseur: "info-financiere", statut: "confirme", lien: pdf },
    ]);
    fetchCommunique.mockResolvedValue({ url: pdf, texte: "Chiffre d'affaires de 9 mois en hausse.", tronque: false });
    rendre(
      <FinancialCalendar
        positions={[{ ticker: "DG.PA", name: "Vinci" }]}
        watchlist={[]}
        catalogueReference={{
          "DG.PA": { nom: "Vinci", source: "https://www.vinci.com/agenda", evenements: [{ date: jour, type: "Chiffre d'affaires", label: "Chiffre d'affaires du 3e trimestre 2026" }] },
        }}
      />
    );
    await user_clickTimeline();
    await user.click(await screen.findByRole("button", { name: /Chiffre d'affaires du 3e trimestre 2026/ }));

    const dialog = await screen.findByRole("dialog");
    // Le libellé vient de l'agenda, le texte du dépôt réglementaire.
    expect(await within(dialog).findByText(/Chiffre d'affaires de 9 mois en hausse/)).toBeInTheDocument();
    expect(fetchCommunique).toHaveBeenCalledWith(pdf);
    expect(within(dialog).getByText("Agenda de la société + info-financiere.gouv.fr")).toBeInTheDocument();
  });

  it("cherche le communiqué d'une publication passée qui n'en porte pas (Vinci, S1)", async () => {
    // Date de résultats venue de Yahoo, sans document : le communiqué déposé
    // le même jour s'intitulait « Excellente performance économique au S1 ».
    const user = userEvent.setup();
    const jour = new Date(Date.now() - 20 * 86_400_000).toISOString().slice(0, 10);
    const pdf = "https://fr.ftp.opendatasoft.com/datadila/INFOFI/ECO/2026/07/FCECO0VINCI_20260729.pdf";
    mockEvents([{ ticker: "DG.PA", name: "Vinci", type: "Résultats", date: jour, label: "Résultats intermédiaires (estimé)", fournisseur: "yahoo" }]);
    fetchCommunique.mockResolvedValue({
      url: pdf,
      titre: "Excellente performance économique au S1 2026",
      date: jour,
      texte: "Chiffre d'affaires du premier semestre en hausse.",
      tronque: false,
    });
    rendre(<FinancialCalendar positions={[{ ticker: "DG.PA", name: "Vinci" }]} watchlist={[]} catalogueReference={{}} />);
    await user_clickTimeline();
    await user.click(await screen.findByRole("button", { name: /Résultats intermédiaires/ }));

    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText("Excellente performance économique au S1 2026")).toBeInTheDocument();
    expect(fetchCommunique).toHaveBeenCalledWith({ symbole: "DG.PA", date: jour, type: "Résultats" });
    // Le résumé part du document trouvé.
    expect(within(dialog).getByRole("button", { name: "Résumer ce communiqué" })).toBeInTheDocument();
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
