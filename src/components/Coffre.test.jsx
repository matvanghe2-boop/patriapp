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
import { ajouterJours, ajouterAns } from "../lib/coffre";

const lignesCloud = new Map();
const objets = new Map();
let utilisateur = { id: "u1" };

vi.mock("../lib/AuthContext", () => ({ useAuth: () => ({ user: utilisateur }) }));

// Fichiers reçus par « Partager » (Cache Storage, absent de jsdom).
let partage = [];
const oublierPartage = vi.fn(async () => {
  partage = [];
});
vi.mock("../lib/partageCoffre", () => ({
  fichiersPartages: async () => partage,
  oublierPartage: () => oublierPartage(),
}));

// pdf.js ne tourne pas sous jsdom : le texte du PDF est fourni par le test.
let textePdf = "";
vi.mock("../lib/lirePdf", () => ({
  texteDuPdf: async () => textePdf,
  dessinerPagesPdf: async () => ({ canvases: [], total: 0 }),
}));

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
        list: async (dossier) => ({
          data: [...objets.keys()]
            .filter((c) => c.startsWith(`${dossier}/`))
            .map((c) => ({ name: c.slice(dossier.length + 1), metadata: { size: objets.get(c).length } })),
          error: null,
        }),
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
const { demanderOuverture } = await import("../lib/coffreNavigation");

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
  partage = [];
  textePdf = "";
  oublierPartage.mockClear();
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
      within(fenetre).getByLabelText("Fichiers à ranger"),
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
      within(fenetre).getByLabelText("Fichiers à ranger"),
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

describe("Coffre — plusieurs fichiers, partage et dates du PDF", () => {
  beforeEach(async () => {
    await act(() => activerChiffrement("phrase secrète du test"));
  });

  it("range recto et verso dans un même document, puis retire l'un des deux", async () => {
    const utilisateurEvt = userEvent.setup();
    monter();
    await utilisateurEvt.click(await screen.findByRole("button", { name: /Ranger un premier papier/ }));
    const fenetre = await screen.findByRole("dialog");
    await utilisateurEvt.upload(within(fenetre).getByLabelText("Fichiers à ranger"), [
      new File(["RECTO"], "recto.png", { type: "image/png" }),
      new File(["VERSO"], "verso.png", { type: "image/png" }),
    ]);
    const choisis = within(fenetre).getByRole("list", { name: "Fichiers choisis" });
    expect(within(choisis).getAllByRole("listitem")).toHaveLength(2);
    await utilisateurEvt.click(within(fenetre).getByRole("button", { name: "Chiffrer et ranger" }));

    await waitFor(() => expect(objets.size).toBe(2));
    await utilisateurEvt.click(await screen.findByRole("button", { name: /Carte d'identité/ }));
    const fichiers = await screen.findByRole("group", { name: "Fichiers du document" });
    expect(within(fichiers).getByRole("button", { name: "verso.png" })).toBeInTheDocument();

    await utilisateurEvt.click(within(fichiers).getByRole("button", { name: "Retirer ce fichier" }));
    const confirmation = await screen.findByRole("alertdialog");
    await utilisateurEvt.click(within(confirmation).getByRole("button", { name: "Retirer" }));
    await waitFor(() => expect(objets.size).toBe(1));
    expect(screen.queryByRole("group", { name: "Fichiers du document" })).not.toBeInTheDocument();
  });

  it("ouvre le formulaire sur un fichier partagé, propose ses dates, puis vide la file", async () => {
    const utilisateurEvt = userEvent.setup();
    partage = [new File(["%PDF"], "attestation.pdf", { type: "application/pdf" })];
    textePdf = "Attestation d'assurance habitation, établie le 01/10/2026, valable jusqu'au 30/09/2027.";
    monter();

    const fenetre = await screen.findByRole("dialog");
    expect(within(fenetre).getByText("attestation.pdf")).toBeInTheDocument();
    await utilisateurEvt.selectOptions(within(fenetre).getByLabelText("Type"), "attestation_assurance");
    await utilisateurEvt.click(await within(fenetre).findByRole("button", { name: "30/09/2027" }));
    await utilisateurEvt.click(within(fenetre).getByRole("button", { name: "01/10/2026" }));
    expect(within(fenetre).getByLabelText("Valable jusqu'au")).toHaveValue("2027-09-30");
    expect(within(fenetre).getByLabelText("Date du document")).toHaveValue("2026-10-01");

    await utilisateurEvt.click(within(fenetre).getByRole("button", { name: "Chiffrer et ranger" }));
    await waitFor(() => expect(objets.size).toBe(1));
    expect(oublierPartage).toHaveBeenCalled();
    expect(await screen.findByText("Attestation d'assurance")).toBeInTheDocument();
  });

  it("vide aussi la file quand on renonce au partage", async () => {
    const utilisateurEvt = userEvent.setup();
    partage = [new File(["x"], "photo.jpg", { type: "image/jpeg" })];
    monter();
    const fenetre = await screen.findByRole("dialog");
    await utilisateurEvt.click(within(fenetre).getByRole("button", { name: "Annuler" }));
    expect(oublierPartage).toHaveBeenCalled();
    expect(objets.size).toBe(0);
  });
});

describe("Coffre — archive de sauvegarde", () => {
  beforeEach(async () => {
    await act(() => activerChiffrement("phrase secrète du test"));
  });

  it("exporte une archive, puis la restaure après la suppression d'un papier", async () => {
    const u = userEvent.setup();
    const telecharger = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    monter();

    await u.click(await screen.findByRole("button", { name: /Ranger un premier papier/ }));
    const fenetre = await screen.findByRole("dialog");
    await u.upload(within(fenetre).getByLabelText("Fichiers à ranger"), new File([CONTENU], "carte.png", { type: "image/png" }));
    await u.click(within(fenetre).getByRole("button", { name: "Chiffrer et ranger" }));
    await waitFor(() => expect(objets.size).toBe(1));

    await u.click(screen.getByRole("tab", { name: /Réglages/ }));
    await u.click(screen.getByRole("button", { name: /Exporter l'archive/ }));
    await screen.findByText(/Archive enregistrée/);
    const archive = await URL.createObjectURL.mock.calls.at(-1)[0].text();
    expect(archive).not.toContain("carte.png");

    await u.click(screen.getByRole("tab", { name: /Documents/ }));
    await u.click(await screen.findByRole("button", { name: /Carte d'identité/ }));
    await u.click(await screen.findByRole("button", { name: "Supprimer" }));
    await u.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Supprimer" }));
    await waitFor(() => expect(objets.size).toBe(0));

    await u.click(screen.getByRole("tab", { name: /Réglages/ }));
    await u.upload(
      screen.getByLabelText("Archive à restaurer"),
      new File([archive], "coffre.patrium-coffre.json", { type: "application/json" })
    );
    await u.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Restaurer" }));
    expect(await screen.findByText("1 document restauré, 1 fichier renvoyé.")).toBeInTheDocument();
    expect(objets.size).toBe(1);

    await u.click(screen.getByRole("tab", { name: /Documents/ }));
    expect(await screen.findByRole("button", { name: /Carte d'identité/ })).toBeInTheDocument();
    telecharger.mockRestore();
  });
});

describe("Coffre — inventaire des objets", () => {
  const achat = ajouterJours(todayIso(), -100);

  beforeEach(async () => {
    localStorage.setItem(
      "patrimoine:coffre",
      JSON.stringify({
        version: 1,
        documents: [
          {
            id: "doc_f",
            type: "facture",
            titre: "Lave-linge Bosch",
            dateDocument: achat,
            echeance: ajouterAns(achat, 2),
            recurrence: null,
            notes: "",
            fichiers: [],
          },
        ],
        objets: [],
        reglages: { delais: {}, titreAgendaNeutre: false },
      })
    );
    await act(() => activerChiffrement("phrase secrète du test"));
  });

  it("crée un objet depuis sa facture, l'affiche avec sa garantie, puis le retire", async () => {
    const u = userEvent.setup();
    monter();

    await u.click(await screen.findByRole("button", { name: /Lave-linge Bosch/ }));
    await u.click(await screen.findByRole("button", { name: "Ajouter à l'inventaire" }));
    const fenetre = await screen.findByRole("dialog", { name: "Ajouter un objet" });
    expect(within(fenetre).getByLabelText("Objet")).toHaveValue("Lave-linge Bosch");
    expect(within(fenetre).getByLabelText("Date d'achat")).toHaveValue(achat);
    expect(within(fenetre).getByLabelText("Facture dans le coffre")).toHaveValue("doc_f");
    await u.selectOptions(within(fenetre).getByLabelText("Catégorie"), "electromenager");
    await u.type(within(fenetre).getByLabelText("Prix d'achat (€)"), "600");
    expect(within(fenetre).getByText(/d'après la facture liée/)).toBeInTheDocument();
    await u.click(within(fenetre).getByRole("button", { name: "Enregistrer" }));

    await u.click(screen.getByRole("tab", { name: /Objets/ }));
    const liste = await screen.findByRole("list", { name: "Objets de l'inventaire" });
    expect(within(liste).getByText("Lave-linge Bosch")).toBeInTheDocument();
    expect(within(liste).getByText(/^Garantie →/)).toBeInTheDocument();
    expect(within(liste).getByText("estimée")).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("patrimoine:coffre")).objets[0]).toMatchObject({
      nom: "Lave-linge Bosch",
      categorie: "electromenager",
      prix: 600,
      factureId: "doc_f",
    });

    await u.click(within(liste).getByRole("button", { name: /^Lave-linge Bosch/ }));
    await u.click(await screen.findByRole("button", { name: "Retirer de l'inventaire" }));
    await u.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Retirer" }));
    expect(await screen.findByText("Aucun objet dans l'inventaire")).toBeInTheDocument();
  });
});

describe("Coffre — ouverture demandée depuis ailleurs", () => {
  beforeEach(async () => {
    localStorage.setItem(
      "patrimoine:coffre",
      JSON.stringify({
        version: 1,
        documents: [
          { id: "doc_a", type: "cni", titre: "Carte d'identité", recurrence: null, notes: "", fichiers: [] },
          { id: "doc_b", type: "diplome", titre: "Baccalauréat", recurrence: null, notes: "", fichiers: [] },
        ],
        objets: [{ id: "obj_v", nom: "Vélo", categorie: "mobilite", prix: 800, notes: "" }],
        reglages: { delais: {}, titreAgendaNeutre: false },
      })
    );
    await act(() => activerChiffrement("phrase secrète du test"));
  });

  it("ouvre à l'arrivée le papier demandé avant l'ouverture de l'onglet", async () => {
    demanderOuverture({ document: "doc_b" });
    monter();
    expect(await screen.findByRole("dialog", { name: "Baccalauréat" })).toBeInTheDocument();
  });

  it("ouvre un papier ou un objet demandé pendant que l'onglet est affiché", async () => {
    monter();
    await screen.findByRole("button", { name: /Carte d'identité/ });
    act(() => demanderOuverture({ document: "doc_a" }));
    const fiche = await screen.findByRole("dialog", { name: "Carte d'identité" });
    expect(fiche).toBeInTheDocument();
    await userEvent.setup().click(within(fiche).getByRole("button", { name: "Fermer" }));
    act(() => demanderOuverture({ objet: "obj_v" }));
    expect(await screen.findByRole("dialog", { name: "Modifier l'objet" })).toBeInTheDocument();
  });
});

describe("Coffre — durées de conservation", () => {
  beforeEach(async () => {
    localStorage.setItem(
      "patrimoine:coffre",
      JSON.stringify({
        version: 1,
        documents: [
          { id: "r", type: "releve_bancaire", titre: "Relevé 2019", dateDocument: "2019-01-31", recurrence: null, notes: "", fichiers: [] },
          { id: "d", type: "diplome", titre: "Licence", recurrence: null, notes: "", fichiers: [] },
        ],
        objets: [],
        reglages: { delais: {}, titreAgendaNeutre: false },
      })
    );
    await act(() => activerChiffrement("phrase secrète du test"));
  });

  it("signale les papiers à jeter, les filtre, et l'explique dans la fiche", async () => {
    const u = userEvent.setup();
    monter();
    expect(await screen.findByText(/1 papier a dépassé sa durée de conservation conseillée/)).toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: "Le voir" }));
    expect(screen.queryByRole("button", { name: /Licence/ })).not.toBeInTheDocument();

    await u.click(screen.getByRole("button", { name: /Relevé 2019/ }));
    const fiche = await screen.findByRole("dialog", { name: "Relevé 2019" });
    expect(within(fiche).getByText(/écoulée depuis le 31\/01\/2024/)).toBeInTheDocument();
    expect(within(fiche).getByRole("link", { name: /service-public/ })).toHaveAttribute(
      "href",
      "https://www.service-public.gouv.fr/particuliers/vosdroits/F19134"
    );
    await u.click(within(fiche).getByRole("button", { name: "Fermer" }));
    await u.click(screen.getByRole("button", { name: "Tout afficher" }));
    expect(await screen.findByRole("button", { name: /Licence/ })).toBeInTheDocument();
  });
});

describe("Coffre — dossier sinistre", () => {
  beforeEach(async () => {
    localStorage.setItem(
      "patrimoine:coffre",
      JSON.stringify({
        version: 1,
        documents: [],
        objets: [
          { id: "o1", nom: "Ordinateur portable", categorie: "informatique", prix: 1200, notes: "" },
          { id: "o2", nom: "Vélo", categorie: "mobilite", prix: 800, notes: "" },
        ],
        reglages: { delais: {}, titreAgendaNeutre: false },
      })
    );
    await act(() => activerChiffrement("phrase secrète du test"));
  });

  it("ouvre une page imprimable avec les seuls biens cochés", async () => {
    const u = userEvent.setup();
    const ecrit = [];
    const fenetre = {
      document: { write: (h) => ecrit.push(h), open: vi.fn(), close: vi.fn() },
      focus: vi.fn(),
      print: vi.fn(),
    };
    vi.stubGlobal("open", vi.fn(() => fenetre));
    monter();

    await u.click(await screen.findByRole("tab", { name: /Objets/ }));
    await u.click(screen.getByRole("button", { name: "Dossier sinistre" }));
    const modale = await screen.findByRole("dialog", { name: "Dossier sinistre" });
    const preparer = within(modale).getByRole("button", { name: "Préparer le dossier" });
    expect(preparer).toBeDisabled();
    await u.click(within(modale).getByLabelText("Vélo"));
    await u.click(preparer);

    await waitFor(() => expect(fenetre.print).toHaveBeenCalled());
    const page = ecrit.at(-1);
    expect(page).toContain("Dossier sinistre — liste des biens");
    expect(page).toContain("Vélo");
    expect(page).not.toContain("Ordinateur portable");
  });

  it("prévient si le navigateur bloque la fenêtre", async () => {
    const u = userEvent.setup();
    vi.stubGlobal("open", vi.fn(() => null));
    monter();
    await u.click(await screen.findByRole("tab", { name: /Objets/ }));
    await u.click(screen.getByRole("button", { name: "Dossier sinistre" }));
    const modale = await screen.findByRole("dialog", { name: "Dossier sinistre" });
    await u.click(within(modale).getByRole("button", { name: "Tout cocher" }));
    await u.click(within(modale).getByRole("button", { name: "Préparer le dossier" }));
    expect(await screen.findByText(/bloqué la fenêtre d'impression/)).toBeInTheDocument();
  });
});
