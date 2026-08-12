/**
 * Tests de `usePersistentState` — l'arbitrage cloud/local.
 *
 * Ce module n'avait aucun test alors qu'il porte toutes les données de
 * l'application. Un bug d'ordre d'exécution y rendait la version cloud
 * STRUCTURELLEMENT perdante au montage : l'effet de persistance repoussait
 * l'horodatage local à « maintenant » avant que la requête cloud n'ait eu le
 * temps de le lire. Conséquence, le dernier appareil à ouvrir l'application
 * écrasait la saisie faite sur l'autre.
 *
 * Rien dans l'interface ne signalait cette perte, et aucune erreur n'était
 * levée — d'où ces tests, qui vérifient les deux sens de l'arbitrage.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";

const CLE = "profile";
const HIER = "2026-08-11T09:00:00.000Z";
const AUJOURDHUI = "2026-08-12T09:00:00.000Z";

/** Lignes que la fausse base renvoie, réassignables par test. */
let lignesCloud = [];
/** Upserts reçus, pour vérifier ce qui est réellement poussé. */
let upserts = [];
/** Nombre de LECTURES cloud, pour vérifier qu'elles sont bien mutualisées. */
let lectures = 0;

vi.mock("./supabaseClient", () => ({
  isSupabaseConfigured: true,
  supabaseConfig: { url: "https://test.supabase.co", anonKey: "cle-anon" },
  supabase: {
    from: () => ({
      select: () => {
        lectures += 1;
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
      getSession: () =>
        Promise.resolve({ data: { session: { user: { id: "u1" }, access_token: "jeton" } } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
  },
}));

const { usePersistentState, _resetStorageCache } = await import("./storage");

function Sonde({ initial = "INITIAL" }) {
  const [valeur] = usePersistentState(CLE, initial);
  return <div data-testid="valeur">{String(valeur)}</div>;
}

describe("usePersistentState — arbitrage cloud/local au montage", () => {
  beforeEach(() => {
    localStorage.clear();
    lignesCloud = [];
    upserts = [];
    lectures = 0;
    // L'hydratation cloud est volontairement mise en cache au niveau du module
    // (c'est tout l'intérêt du correctif) : sans cette remise à zéro, chaque
    // test hériterait de la réponse du précédent.
    _resetStorageCache();
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: true })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("adopte la version cloud quand la copie locale est plus ancienne", async () => {
    localStorage.setItem(`patrimoine:${CLE}`, JSON.stringify("LOCALE"));
    localStorage.setItem(`patrimoine:__meta:${CLE}`, HIER);
    lignesCloud = [{ key: CLE, value: "CLOUD", updated_at: AUJOURDHUI }];

    render(<Sonde />);
    // Affichage immédiat depuis le cache local, avant toute requête.
    expect(screen.getByTestId("valeur").textContent).toBe("LOCALE");

    await waitFor(() => expect(screen.getByTestId("valeur").textContent).toBe("CLOUD"));
    // L'horodatage adopté est celui du cloud, et non l'instant du montage :
    // sans cela l'appareil se déclarerait plus récent qu'il ne l'est.
    expect(localStorage.getItem(`patrimoine:__meta:${CLE}`)).toBe(AUJOURDHUI);
  });

  it("conserve la version locale quand elle est plus récente, et la pousse", async () => {
    localStorage.setItem(`patrimoine:${CLE}`, JSON.stringify("LOCALE"));
    localStorage.setItem(`patrimoine:__meta:${CLE}`, AUJOURDHUI);
    lignesCloud = [{ key: CLE, value: "CLOUD", updated_at: HIER }];

    render(<Sonde />);
    await waitFor(() => expect(upserts.length).toBeGreaterThan(0));

    expect(screen.getByTestId("valeur").textContent).toBe("LOCALE");
    expect(upserts[0]).toMatchObject({ key: CLE, value: "LOCALE", updated_at: AUJOURDHUI });
  });

  it("adopte la version cloud sur un appareil vierge", async () => {
    lignesCloud = [{ key: CLE, value: "CLOUD", updated_at: HIER }];

    render(<Sonde />);
    await waitFor(() => expect(screen.getByTestId("valeur").textContent).toBe("CLOUD"));
  });

  it("ne réécrit pas l'horodatage local tant que rien n'a changé", async () => {
    localStorage.setItem(`patrimoine:${CLE}`, JSON.stringify("LOCALE"));
    localStorage.setItem(`patrimoine:__meta:${CLE}`, HIER);

    render(<Sonde />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    // C'est la garantie dont dépend tout l'arbitrage : un simple montage ne
    // doit pas faire passer cet appareil pour le plus récemment modifié.
    expect(localStorage.getItem(`patrimoine:__meta:${CLE}`)).toBe(HIER);
  });

  it("n'interroge Supabase qu'une seule fois pour plusieurs clés montées ensemble", async () => {
    function Plusieurs() {
      usePersistentState("livrets", []);
      usePersistentState("bourse", {});
      usePersistentState("cash", 0);
      return <div data-testid="pret">ok</div>;
    }

    render(<Plusieurs />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    // Une seule lecture mutualisée, là où l'ancienne version faisait une
    // requête — plus un appel réseau d'identité — par clé montée. Avec les
    // 31 clés du contexte patrimonial, cela faisait une soixantaine
    // d'aller-retours au seul démarrage de l'application.
    expect(lectures).toBe(1);
  });
});
