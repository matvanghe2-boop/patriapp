/**
 * Chiffrement de bout en bout de la synchronisation : ce qui part vers le
 * cloud, ce qu'un appareil verrouillé peut lire et écrire, et le
 * déverrouillage par la phrase secrète.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import {
  creerConfiguration, chiffrer, estChiffre, ajouterCodeSecours, verifierCodeSecours, verifierPhrase,
  normaliserCodeSecours,
} from "./chiffrement";

let lignesCloud = [];
let upserts = [];

vi.mock("./supabaseClient", () => ({
  isSupabaseConfigured: true,
  supabaseConfig: { url: "https://test.supabase.co", anonKey: "cle-anon" },
  supabase: {
    from: () => ({
      select: () => {
        const resultat = Promise.resolve({ data: lignesCloud, error: null });
        return { eq: () => resultat, in: () => resultat };
      },
      upsert: (ligne) => {
        upserts.push(ligne);
        return Promise.resolve({ error: null });
      },
      delete: () => ({ in: () => Promise.resolve({ error: null }) }),
    }),
    auth: {
      getSession: () => Promise.resolve({ data: { session: { user: { id: "u1" }, access_token: "jeton" } } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
  },
}));

const {
  usePersistentState, useEtatChiffrement, activerChiffrement, deverrouillerChiffrement, desactiverChiffrement,
  creerCodeSecours, changerPhraseSecrete, deverrouillerAvecCodeSecours, _resetStorageCache,
} = await import("./storage");

function Sonde() {
  const [valeur, setValeur] = usePersistentState("profile", "INITIAL");
  const etat = useEtatChiffrement();
  return (
    <div>
      <div data-testid="valeur">{String(valeur)}</div>
      <div data-testid="etat">{etat.actif ? (etat.verrouille ? "verrouille" : "actif") : "inactif"}</div>
      <button onClick={() => setValeur("MODIFIEE")}>modifier</button>
    </div>
  );
}

const HIER = "2026-10-25T09:00:00.000Z";
const AUJOURDHUI = "2026-10-26T09:00:00.000Z";

describe("chiffrement de la synchronisation", () => {
  beforeEach(() => {
    localStorage.clear();
    lignesCloud = [];
    upserts = [];
    _resetStorageCache();
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: true })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("à l'activation, écrit la configuration puis réécrit chaque donnée chiffrée", async () => {
    localStorage.setItem("patrimoine:profile", JSON.stringify("DONNEE SECRETE"));
    localStorage.setItem("patrimoine:__meta:profile", HIER);
    render(<Sonde />);
    await waitFor(() => expect(upserts.length).toBeGreaterThan(0));
    upserts = [];

    await act(() => activerChiffrement("phrase secrète de test"));

    expect(upserts[0].key).toBe("__chiffrement");
    const donnee = upserts.find((u) => u.key === "profile");
    expect(estChiffre(donnee.value)).toBe(true);
    expect(donnee.updated_at).toBe(HIER);
    expect(JSON.stringify(upserts)).not.toContain("DONNEE SECRETE");
    expect(screen.getByTestId("etat")).toHaveTextContent("actif");
  });

  it("verrouille un appareil sans la phrase : il ne lit pas le cloud chiffré et n'y écrit rien", async () => {
    const { cle, config } = await creerConfiguration("bonne phrase");
    lignesCloud = [
      { key: "__chiffrement", value: config, updated_at: HIER },
      { key: "profile", value: await chiffrer(cle, "VALEUR DU CLOUD"), updated_at: AUJOURDHUI },
    ];
    render(<Sonde />);
    await waitFor(() => expect(screen.getByTestId("etat")).toHaveTextContent("verrouille"));
    expect(screen.getByTestId("valeur")).toHaveTextContent("INITIAL");

    upserts = [];
    await act(async () => screen.getByText("modifier").click());
    await new Promise((r) => setTimeout(r, 1200));
    expect(upserts).toEqual([]);
  });

  it("déverrouille avec la bonne phrase et adopte la valeur chiffrée du cloud", async () => {
    const { cle, config } = await creerConfiguration("bonne phrase");
    lignesCloud = [
      { key: "__chiffrement", value: config, updated_at: HIER },
      { key: "profile", value: await chiffrer(cle, "VALEUR DU CLOUD"), updated_at: AUJOURDHUI },
    ];
    render(<Sonde />);
    await waitFor(() => expect(screen.getByTestId("etat")).toHaveTextContent("verrouille"));

    expect(await deverrouillerChiffrement("mauvaise phrase")).toBe(false);
    await act(async () => {
      expect(await deverrouillerChiffrement("bonne phrase")).toBe(true);
    });
    await waitFor(() => expect(screen.getByTestId("valeur")).toHaveTextContent("VALEUR DU CLOUD"));
    expect(screen.getByTestId("etat")).toHaveTextContent("actif");
  });

  it("à la désactivation, réécrit tout en clair avant de supprimer la configuration", async () => {
    localStorage.setItem("patrimoine:profile", JSON.stringify("EN CLAIR"));
    localStorage.setItem("patrimoine:__meta:profile", HIER);
    render(<Sonde />);
    await waitFor(() => expect(upserts.length).toBeGreaterThan(0));
    await act(() => activerChiffrement("phrase"));
    upserts = [];

    await act(() => desactiverChiffrement());
    const donnee = upserts.find((u) => u.key === "profile");
    expect(donnee.value).toBe("EN CLAIR");
    expect(screen.getByTestId("etat")).toHaveTextContent("inactif");
  });
});

describe("code de secours et changement de phrase", () => {
  const derniereConfig = () => [...upserts].reverse().find((u) => u.key === "__chiffrement")?.value;

  beforeEach(() => {
    localStorage.clear();
    lignesCloud = [];
    upserts = [];
    _resetStorageCache();
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: true })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("crée le code de secours : seule son enveloppe part dans le cloud", async () => {
    render(<Sonde />);
    await act(() => activerChiffrement("phrase secrète de test"));
    upserts = [];
    let code;
    await act(async () => {
      code = await creerCodeSecours();
    });
    const config = derniereConfig();
    expect(config.version).toBe(2);
    expect(config.secours.creeLe).toBeTruthy();
    expect(JSON.stringify(upserts)).not.toContain(normaliserCodeSecours(code));
    expect(await verifierCodeSecours(code, config)).not.toBeNull();
    // Rien n'est rechiffré : seule la configuration a été réécrite.
    expect(upserts.filter((u) => u.key !== "__chiffrement")).toEqual([]);
  });

  it("change de phrase sur un appareil déverrouillé, sans rechiffrer les données", async () => {
    render(<Sonde />);
    await act(() => activerChiffrement("ancienne phrase"));
    upserts = [];
    await act(() => changerPhraseSecrete("nouvelle phrase"));
    const config = derniereConfig();
    expect(await verifierPhrase("nouvelle phrase", config)).not.toBeNull();
    expect(await verifierPhrase("ancienne phrase", config)).toBeNull();
    expect(upserts.filter((u) => u.key !== "__chiffrement")).toEqual([]);
    expect(screen.getByTestId("etat")).toHaveTextContent("actif");
  });

  it("refuse de créer un code sur un appareil verrouillé", async () => {
    const { config } = await creerConfiguration("bonne phrase");
    lignesCloud = [{ key: "__chiffrement", value: config, updated_at: HIER }];
    render(<Sonde />);
    await waitFor(() => expect(screen.getByTestId("etat")).toHaveTextContent("verrouille"));
    await expect(creerCodeSecours()).rejects.toThrow(/Déverrouille/);
  });

  it("phrase oubliée : le code rouvre l'appareil et une nouvelle phrase remplace l'ancienne", async () => {
    const { cle, config } = await creerConfiguration("phrase oubliée");
    const { code, config: avecCode } = await ajouterCodeSecours(cle, config);
    lignesCloud = [
      { key: "__chiffrement", value: avecCode, updated_at: HIER },
      { key: "profile", value: await chiffrer(cle, "VALEUR DU CLOUD"), updated_at: AUJOURDHUI },
    ];
    render(<Sonde />);
    await waitFor(() => expect(screen.getByTestId("etat")).toHaveTextContent("verrouille"));

    expect(await deverrouillerAvecCodeSecours("AAAAA-AAAAA-AAAAA-AAAAA-AAAAA", "nouvelle phrase")).toBe(false);
    await act(async () => {
      expect(await deverrouillerAvecCodeSecours(code, "nouvelle phrase")).toBe(true);
    });
    await waitFor(() => expect(screen.getByTestId("valeur")).toHaveTextContent("VALEUR DU CLOUD"));
    expect(screen.getByTestId("etat")).toHaveTextContent("actif");

    const nouvelle = derniereConfig();
    expect(await verifierPhrase("nouvelle phrase", nouvelle)).not.toBeNull();
    expect(await verifierPhrase("phrase oubliée", nouvelle)).toBeNull();
    // Le code reste valable pour une prochaine fois.
    expect(await verifierCodeSecours(code, nouvelle)).not.toBeNull();
  });
});
