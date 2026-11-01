/**
 * Onglet Coffre : les prérequis (compte, chiffrement, déverrouillage), puis le
 * parcours complet d'un papier — rangé chiffré, affiché, supprimé.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within, act, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "../lib/ToastContext";
import { ConfirmProvider } from "../lib/ConfirmContext";
import { todayIso } from "../lib/finance";
import { ajouterJours } from "../lib/coffre";

const lignesCloud = new Map();
const objets = new Map();
let utilisateur = { id: "u1" };

vi.mock("../lib/AuthContext", () => ({ useAuth: () => ({ user: utilisateur }) }));

vi.mock("../lib/supabaseClient", () => ({
  isSupabaseConfigured: true,
  supabaseConfig: { url: "https://test.supabase.co", anonKey: "cle-anon" },
  supabase: {
    from: () => ({
      select: () => {
        const resultat = Promise.resolve({ data: [...lignesCloud.values()], error: null });
        return { eq: () => resultat, in: () => resultat };
      },
      upsert: (ligne) => {
        lignesCloud.set(ligne.key, ligne);
        return Promise.resolve({ error: null });
      },
      delete: () => ({ in: () => Promise.resolve({ error: null }) }),
    }),
    storage: {
      from: () => ({
        upload: async (chemin, blob) => {
          objets.set(chemin, new Uint8Array(await blob.arrayBuffer()));
          return { error: null };
        },
        download: async (chemin) => ({ data: new Blob([objets.get(chemin)]), error: null }),
        remove: async (chemins) => {
          chemins.forEach((c) => objets.delete(c));
          return { error: null };
        },
      }),
    },
    auth: {
      getSession: () => Promise.resolve({ data: { session: { user: { id: "u1" }, access_token: "jeton" } } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
  },
}));

const { _resetStorageCache, activerChiffrement } = await import("../lib/storage");
const { default: Coffre } = await import("./Coffre");

const monter = () =>
  render(
    <ToastProvider>
      <ConfirmProvider>
        <Coffre />
      </ConfirmProvider>
    </ToastProvider>
  );

const CONTENU = "CARTE IDENTITE SCANNEE";

beforeEach(() => {
  localStorage.clear();
  lignesCloud.clear();
  objets.clear();
  utilisateur = { id: "u1" };
  _resetStorageCache();
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: true })));
  URL.createObjectURL = vi.fn(() => "blob:apercu");
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Coffre — prérequis", () => {
  it("demande de se connecter sans compte", () => {
    utilisateur = null;
    monter();
    expect(screen.getByText("Connecte-toi pour ouvrir le coffre")).toBeInTheDocument();
  });

  it("propose d'activer le chiffrement, dans le réglage existant", async () => {
    monter();
    await userEvent.click(screen.getByRole("button", { name: /Activer le chiffrement/ }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });
});

describe("Coffre — un papier de bout en bout", () => {
  beforeEach(async () => {
    await act(() => activerChiffrement("phrase secrète du test"));
  });

  it("range le papier chiffré, l'affiche, puis le supprime avec son fichier", async () => {
    const utilisateurEvt = userEvent.setup();
    monter();

    await utilisateurEvt.click(await screen.findByRole("button", { name: /Ranger un premier papier/ }));
    const fenetre = await screen.findByRole("dialog");
    await utilisateurEvt.upload(
      within(fenetre).getByLabelText("Fichier à ranger"),
      new File([CONTENU], "carte.png", { type: "image/png" })
    );
    await utilisateurEvt.selectOptions(within(fenetre).getByLabelText("Type"), "passeport");
    fireEvent.change(within(fenetre).getByLabelText("Expire le"), { target: { value: ajouterJours(todayIso(), 30) } });
    await utilisateurEvt.click(within(fenetre).getByRole("button", { name: "Chiffrer et ranger" }));

    // Rangé dans « À traiter » : il expire dans un mois, le délai d'un passeport est de quatre.
    const aTraiter = await screen.findByRole("region", { name: "À traiter" });
    expect(within(aTraiter).getByText("Passeport")).toBeInTheDocument();
    expect(within(aTraiter).getByText("À prévoir")).toBeInTheDocument();

    // Le stockage n'a reçu que du chiffré ; le cloud, que des métadonnées chiffrées.
    expect(objets.size).toBe(1);
    const [envoye] = objets.values();
    expect(new TextDecoder("latin1").decode(envoye)).not.toContain("CARTE");
    await waitFor(() => expect(lignesCloud.has("coffre")).toBe(true));
    expect(JSON.stringify(lignesCloud.get("coffre"))).not.toContain("carte.png");

    // La fiche déchiffre le fichier et l'affiche.
    await utilisateurEvt.click(within(aTraiter).getByRole("button", { name: /Passeport/ }));
    expect(await screen.findByAltText("Aperçu de carte.png")).toHaveAttribute("src", "blob:apercu");
    const blob = URL.createObjectURL.mock.calls[0][0];
    expect(await blob.text()).toBe(CONTENU);

    // Suppression : le document et son fichier disparaissent.
    await utilisateurEvt.click(screen.getByRole("button", { name: "Supprimer" }));
    const confirmation = await screen.findByRole("alertdialog");
    await utilisateurEvt.click(within(confirmation).getByRole("button", { name: "Supprimer" }));
    expect(await screen.findByText("Ton coffre est vide")).toBeInTheDocument();
    await waitFor(() => expect(objets.size).toBe(0));
  });

  it("refuse un format qu'il ne sait pas ranger, sans rien envoyer", async () => {
    const utilisateurEvt = userEvent.setup({ applyAccept: false });
    monter();
    await utilisateurEvt.click(await screen.findByRole("button", { name: /Ranger un premier papier/ }));
    const fenetre = await screen.findByRole("dialog");
    await utilisateurEvt.upload(
      within(fenetre).getByLabelText("Fichier à ranger"),
      new File(["x"], "archive.zip", { type: "application/zip" })
    );
    expect(within(fenetre).getByRole("alert")).toHaveTextContent(/Format non pris en charge/);
    await utilisateurEvt.click(within(fenetre).getByRole("button", { name: "Chiffrer et ranger" }));
    expect(objets.size).toBe(0);
  });

  it("se verrouille à la demande : la phrase est redemandée", async () => {
    const utilisateurEvt = userEvent.setup();
    monter();
    await utilisateurEvt.click(await screen.findByRole("button", { name: /Verrouiller/ }));
    const confirmation = await screen.findByRole("alertdialog");
    await utilisateurEvt.click(within(confirmation).getByRole("button", { name: "Verrouiller" }));
    expect(await screen.findByText("Coffre verrouillé sur cet appareil")).toBeInTheDocument();
    expect(localStorage.getItem("patrimoine:__cleChiffrement")).toBeNull();
  });
});

describe("Coffre — échéances et réglages", () => {
  const coffreDeDepart = () => ({
    version: 1,
    documents: [
      {
        id: "doc_p",
        type: "passeport",
        titre: "Passeport",
        echeance: ajouterJours(todayIso(), 30),
        recurrence: null,
        notes: "n° 12AB",
        fichiers: [],
      },
      { id: "doc_d", type: "diplome", titre: "Baccalauréat", recurrence: null, notes: "", fichiers: [] },
    ],
    reglages: { delais: {}, titreAgendaNeutre: false },
  });

  beforeEach(async () => {
    localStorage.setItem("patrimoine:coffre", JSON.stringify(coffreDeDepart()));
    await act(() => activerChiffrement("phrase secrète du test"));
  });

  it("pose le rappel dans Google Agenda, puis le signale comme posé", async () => {
    const utilisateurEvt = userEvent.setup();
    const ouvrir = vi.fn();
    vi.stubGlobal("open", ouvrir);
    monter();

    await utilisateurEvt.click(await screen.findByRole("tab", { name: /Échéances/ }));
    expect(screen.getByText("1 rappel à poser ou à mettre à jour.")).toBeInTheDocument();
    const liste = screen.getByRole("list", { name: "Échéances des papiers" });
    expect(within(liste).queryByText("Baccalauréat")).not.toBeInTheDocument();

    await utilisateurEvt.click(within(liste).getByRole("button", { name: "Ajouter à l'agenda : Passeport" }));
    const url = new URL(ouvrir.mock.calls[0][0]);
    expect(url.hostname).toBe("calendar.google.com");
    expect(url.searchParams.get("text")).toMatch(/^Passeport — lancer le renouvellement/);
    expect(ouvrir.mock.calls[0][0]).not.toContain("12AB");

    expect(await within(liste).findByRole("button", { name: "Rouvrir dans l'agenda : Passeport" })).toBeInTheDocument();
    expect(screen.queryByText(/à poser ou à mettre à jour/)).not.toBeInTheDocument();
  });

  it("exporte tous les rappels dans un fichier .ics", async () => {
    const utilisateurEvt = userEvent.setup();
    // jsdom ne sait pas « télécharger » : le clic sur le lien est neutralisé.
    const telecharger = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    monter();
    await utilisateurEvt.click(await screen.findByRole("tab", { name: /Échéances/ }));
    await utilisateurEvt.click(screen.getByRole("button", { name: /Exporter en \.ics/ }));

    const blob = URL.createObjectURL.mock.calls.at(-1)[0];
    const ics = await blob.text();
    expect(ics).toMatch(/^BEGIN:VCALENDAR/);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    expect(ics).toContain("SUMMARY:Passeport — lancer le renouvellement");
    expect(await screen.findByText(/1 rappel exporté/)).toBeInTheDocument();
    expect(telecharger).toHaveBeenCalledTimes(1);
    telecharger.mockRestore();
  });

  it("applique un délai réglé par type, et le titre neutre", async () => {
    const utilisateurEvt = userEvent.setup();
    monter();
    // Le passeport expire dans un mois : avec le délai proposé (quatre mois), il est à traiter.
    expect(await screen.findByRole("region", { name: "À traiter" })).toBeInTheDocument();

    await utilisateurEvt.click(screen.getByRole("tab", { name: /Réglages/ }));
    await utilisateurEvt.type(screen.getByLabelText(/^Passeport/), "10");
    await utilisateurEvt.click(screen.getByLabelText(/Titre neutre dans l'agenda/));
    await waitFor(() => {
      const enregistre = JSON.parse(localStorage.getItem("patrimoine:coffre"));
      expect(enregistre.reglages).toEqual({ delais: { passeport: 10 }, titreAgendaNeutre: true });
    });

    await utilisateurEvt.click(screen.getByRole("tab", { name: /Documents/ }));
    expect(screen.queryByRole("region", { name: "À traiter" })).not.toBeInTheDocument();
  });
});
