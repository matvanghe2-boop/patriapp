/**
 * Panneau du chiffrement : code de secours (montré une seule fois), changement
 * de phrase, et réouverture d'un appareil verrouillé par le code.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "../lib/ToastContext";
import { ConfirmProvider } from "../lib/ConfirmContext";

let etat = { actif: true, verrouille: false, codeSecours: null };
const creerCodeSecours = vi.fn(async () => "ABCDE-FGHJK-MNPQR-STUVW-XYZ23");
const changerPhraseSecrete = vi.fn(async () => {});
const deverrouillerAvecCodeSecours = vi.fn(async () => true);
const desactiverChiffrement = vi.fn(async () => 0);
/** Coffre enregistré sur l'appareil, lu par l'avertissement de désactivation. */
let coffreLocal = null;

vi.mock("../lib/AuthContext", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("../lib/supabaseClient", () => ({ isSupabaseConfigured: true }));
vi.mock("../lib/storage", () => ({
  useEtatChiffrement: () => etat,
  activerChiffrement: vi.fn(),
  deverrouillerChiffrement: vi.fn(),
  desactiverChiffrement: () => desactiverChiffrement(),
  lireValeurLocale: (cle) => (cle === "coffre" ? coffreLocal : null),
  creerCodeSecours: () => creerCodeSecours(),
  changerPhraseSecrete: (p) => changerPhraseSecrete(p),
  deverrouillerAvecCodeSecours: (c, p) => deverrouillerAvecCodeSecours(c, p),
}));

const { default: ReglagesChiffrement } = await import("./ReglagesChiffrement");

const monter = () =>
  render(
    <ToastProvider>
      <ConfirmProvider>
        <ReglagesChiffrement ouvert onFermer={() => {}} />
      </ConfirmProvider>
    </ToastProvider>
  );

beforeEach(() => {
  etat = { actif: true, verrouille: false, codeSecours: null };
  creerCodeSecours.mockClear();
  changerPhraseSecrete.mockClear();
  deverrouillerAvecCodeSecours.mockReset();
  deverrouillerAvecCodeSecours.mockResolvedValue(true);
});

describe("ReglagesChiffrement — code de secours", () => {
  it("montre le code une seule fois, et ne le referme qu'une fois noté", async () => {
    const u = userEvent.setup();
    monter();
    expect(screen.getByText(/Aucun pour l'instant/)).toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: "Créer un code de secours" }));

    expect(await screen.findByTestId("code-secours")).toHaveTextContent("ABCDE-FGHJK-MNPQR-STUVW-XYZ23");
    const termine = screen.getByRole("button", { name: "Terminé" });
    expect(termine).toBeDisabled();
    await u.click(screen.getByLabelText("Je l'ai noté sur papier."));
    await u.click(termine);
    expect(screen.queryByTestId("code-secours")).not.toBeInTheDocument();
  });

  it("demande confirmation avant de remplacer un code existant", async () => {
    const u = userEvent.setup();
    etat = { ...etat, codeSecours: "2026-10-31T10:00:00.000Z" };
    monter();
    expect(screen.getByText(/Créé le 31 octobre 2026/)).toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: "Remplacer le code de secours" }));
    const confirmation = await screen.findByRole("alertdialog");
    await u.click(within(confirmation).getByRole("button", { name: "Annuler" }));
    expect(creerCodeSecours).not.toHaveBeenCalled();
  });

  it("change de phrase après contrôle de la saisie", async () => {
    const u = userEvent.setup();
    monter();
    await u.click(screen.getByRole("button", { name: /Changer de phrase secrète/ }));
    await u.type(screen.getByLabelText("Nouvelle phrase secrète"), "une nouvelle phrase");
    await u.type(screen.getByLabelText("Confirmation"), "une autre phrase");
    await u.click(screen.getByRole("button", { name: "Changer de phrase" }));
    expect(screen.getByRole("alert")).toHaveTextContent("pas identiques");
    expect(changerPhraseSecrete).not.toHaveBeenCalled();

    await u.clear(screen.getByLabelText("Confirmation"));
    await u.type(screen.getByLabelText("Confirmation"), "une nouvelle phrase");
    await u.click(screen.getByRole("button", { name: "Changer de phrase" }));
    expect(changerPhraseSecrete).toHaveBeenCalledWith("une nouvelle phrase");
  });
});

describe("ReglagesChiffrement — phrase oubliée", () => {
  beforeEach(() => {
    etat = { actif: true, verrouille: true, codeSecours: "2026-10-31T10:00:00.000Z" };
  });

  it("rouvre l'appareil avec le code et une nouvelle phrase", async () => {
    const u = userEvent.setup();
    deverrouillerAvecCodeSecours.mockResolvedValueOnce(false);
    monter();
    await u.click(screen.getByRole("button", { name: /Phrase oubliée/ }));
    await u.type(screen.getByLabelText("Code de secours"), "abcde fghjk mnpqr stuvw xyz23");
    await u.type(screen.getByLabelText("Nouvelle phrase secrète"), "phrase de remplacement");
    await u.type(screen.getByLabelText("Confirmation"), "phrase de remplacement");

    await u.click(screen.getByRole("button", { name: "Rouvrir avec le code" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Code de secours incorrect.");

    await u.click(screen.getByRole("button", { name: "Rouvrir avec le code" }));
    expect(deverrouillerAvecCodeSecours).toHaveBeenLastCalledWith(
      "abcde fghjk mnpqr stuvw xyz23",
      "phrase de remplacement"
    );
  });

  it("prévient qu'une phrase oubliée est perdue s'il n'y a pas de code", () => {
    etat = { ...etat, codeSecours: null };
    monter();
    expect(screen.queryByRole("button", { name: /Phrase oubliée/ })).not.toBeInTheDocument();
    expect(screen.getByText(/une phrase oubliée ne se récupère pas/)).toBeInTheDocument();
  });
});

describe("ReglagesChiffrement — désactivation", () => {
  beforeEach(() => {
    coffreLocal = null;
    desactiverChiffrement.mockClear();
  });

  it("prévient que cet appareil fait foi et que le coffre se referme, avec ses fichiers", async () => {
    const u = userEvent.setup();
    coffreLocal = {
      documents: [
        { id: "d1", fichiers: [{ id: "f1" }, { id: "f2" }] },
        { id: "d2", fichiers: [{ id: "f3" }] },
        { id: "d3", fichiers: [] },
      ],
    };
    monter();
    await u.click(screen.getByRole("button", { name: "Désactiver le chiffrement" }));
    const confirmation = await screen.findByRole("alertdialog");
    expect(confirmation).toHaveTextContent("CET appareil font foi");
    expect(confirmation).toHaveTextContent("les 3 fichiers qu'il contient ne pourront plus être ouverts");

    await u.click(within(confirmation).getByRole("button", { name: "Annuler" }));
    expect(desactiverChiffrement).not.toHaveBeenCalled();
  });

  it("sans fichier rangé, dit seulement que le coffre se refermera, puis désactive", async () => {
    const u = userEvent.setup();
    coffreLocal = { documents: [{ id: "d1", fichiers: [] }] };
    monter();
    await u.click(screen.getByRole("button", { name: "Désactiver le chiffrement" }));
    const confirmation = await screen.findByRole("alertdialog");
    expect(confirmation).toHaveTextContent("Le coffre à papiers, qui a besoin du chiffrement, se refermera.");
    expect(confirmation).not.toHaveTextContent("ne pourront plus");

    await u.click(within(confirmation).getByRole("button", { name: "Désactiver" }));
    expect(desactiverChiffrement).toHaveBeenCalledTimes(1);
  });
});
