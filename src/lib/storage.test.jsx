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

/**
 * Lignes de la fausse base, réassignables par test. Les écritures acceptées
 * les MODIFIENT, comme le ferait Postgres : c'est ce qui permet de vérifier
 * ce que le cloud contient après coup, et pas seulement ce qui a été envoyé.
 */
let lignesCloud = [];
/** Écritures ACCEPTÉES par la fausse base, pour vérifier ce qui est réellement poussé. */
let upserts = [];
/** Nombre de LECTURES cloud, pour vérifier qu'elles sont bien mutualisées. */
let lectures = 0;
/**
 * Comportement de la PROCHAINE lecture, pour simuler un réseau lent ou en
 * échec : `(repondre) => Promise<{ data, error }>`. Remis à `null` une fois
 * consommé.
 */
let lectureSuivante = null;

const cleDeLigne = (id) => String(id).split(":").slice(1).join(":");

vi.mock("./supabaseClient", () => ({
  isSupabaseConfigured: true,
  supabaseConfig: { url: "https://test.supabase.co", anonKey: "cle-anon" },
  supabase: {
    from: () => ({
      select: () => {
        const lire = () => {
          lectures += 1;
          const repondre = () => ({ data: lignesCloud.map((l) => ({ ...l })), error: null });
          if (lectureSuivante) {
            const f = lectureSuivante;
            lectureSuivante = null;
            return f(repondre);
          }
          return Promise.resolve(repondre());
        };
        return { eq: lire, in: lire };
      },
      // Même règle que la vraie requête : la ligne n'est remplacée que si
      // elle n'est pas plus récente que la version envoyée.
      update: (champs) => {
        const requete = { cle: null, max: null };
        const constructeur = {
          eq: (_colonne, id) => {
            requete.cle = cleDeLigne(id);
            return constructeur;
          },
          or: (filtre) => {
            requete.max = /updated_at\.lte\."([^"]+)"/.exec(filtre)?.[1] ?? null;
            return constructeur;
          },
          select: () => {
            const ligne = lignesCloud.find((l) => l.key === requete.cle);
            if (!ligne || (ligne.updated_at && Date.parse(ligne.updated_at) > Date.parse(requete.max))) {
              return Promise.resolve({ data: [], error: null });
            }
            Object.assign(ligne, champs);
            upserts.push({ key: requete.cle, ...champs });
            return Promise.resolve({ data: [{ id: `u1:${requete.cle}` }], error: null });
          },
        };
        return constructeur;
      },
      insert: (ligne) => {
        if (lignesCloud.some((l) => l.key === ligne.key)) {
          return Promise.resolve({ error: { code: "23505", message: "duplicate key value" } });
        }
        lignesCloud.push({ key: ligne.key, value: ligne.value, updated_at: ligne.updated_at });
        upserts.push(ligne);
        return Promise.resolve({ error: null });
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

const { usePersistentState, useManualRefresh, useRetrySync, _resetStorageCache } = await import("./storage");

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

/**
 * Plusieurs composants peuvent lire la MÊME clé. C'est le cas réel de
 * `watchlistDailyData` : `useAlertesWatchlist` la lit depuis App.jsx, monté en
 * permanence, pendant que `Watchlist.jsx` l'écrit depuis l'onglet Bourse,
 * monté à la demande.
 *
 * Tant que le module ne retenait qu'un `setState` par clé, le second montage
 * écrasait le premier : les cours rafraîchis n'atteignaient jamais le hook
 * d'alertes, qui continuait d'évaluer ses seuils sur la valeur lue à son
 * propre montage. L'alerte de seuil était donc neutralisée par sa source.
 */
describe("usePersistentState — plusieurs consommateurs d'une même clé", () => {
  const CLE_PARTAGEE = "watchlistDailyData";
  let ecrire;

  beforeEach(() => {
    localStorage.clear();
    lignesCloud = [];
    upserts = [];
    lectures = 0;
    _resetStorageCache();
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: true })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function Ecrivain() {
    const [data, setData] = usePersistentState(CLE_PARTAGEE, {});
    ecrire = setData;
    return <div data-testid="ecrivain">{JSON.stringify(data)}</div>;
  }

  let relire;

  function Lecteur() {
    const [data] = usePersistentState(CLE_PARTAGEE, {});
    // Le bouton « Actualiser » de l'interface passe par ce même hook : s'en
    // servir ici teste le vrai chemin de relecture cloud.
    relire = useManualRefresh();
    return <div data-testid="lecteur">{JSON.stringify(data)}</div>;
  }

  it("propage une écriture à tous les lecteurs de la clé", async () => {
    render(
      <>
        <Lecteur />
        <Ecrivain />
      </>
    );

    await act(async () => {
      ecrire({ "AI.PA": { price: 95 } });
    });

    const attendu = JSON.stringify({ "AI.PA": { price: 95 } });
    expect(screen.getByTestId("ecrivain").textContent).toBe(attendu);
    // Le cœur du correctif : le lecteur voit le nouveau cours, et non celui
    // qu'il avait lu à son montage.
    expect(screen.getByTestId("lecteur").textContent).toBe(attendu);
    expect(localStorage.getItem(`patrimoine:${CLE_PARTAGEE}`)).toBe(attendu);
  });

  it("n'écrit qu'une seule fois en cloud malgré la propagation", async () => {
    render(
      <>
        <Lecteur />
        <Ecrivain />
      </>
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    upserts.length = 0;

    // L'écriture et l'attente sont dans deux `act` distincts : groupées, la
    // temporisation s'écoulerait avant que React n'ait appliqué l'effet qui
    // programme la poussée, et l'on mesurerait un silence qui n'existe pas.
    await act(async () => {
      ecrire({ "AI.PA": { price: 95 } });
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 1200));
    });

    // La valeur reçue par propagation ne doit pas être ré-horodatée puis
    // repoussée : sans le témoin `skipNextPush`, chaque lecteur renverrait au
    // serveur ce qu'il vient d'en recevoir, en se déclarant plus récent.
    const pousseesDeLaCle = upserts.filter((u) => u.key === CLE_PARTAGEE);
    expect(pousseesDeLaCle).toHaveLength(1);
  });

  it("garde la clé interrogeable tant qu'un lecteur reste monté", async () => {
    const vue = render(
      <>
        <Lecteur />
        <Ecrivain />
      </>
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    // L'onglet Bourse se referme : seul l'écrivain est démonté.
    vue.rerender(<Lecteur />);

    // Une valeur cloud plus récente doit toujours atteindre le lecteur. Avant
    // le correctif, le démontage de l'écrivain supprimait l'entrée de la clé,
    // qui sortait du même coup de la liste interrogée par le polling.
    //
    // « Plus récente » au sens strict : écrite APRÈS le montage, qui vient
    // de pousser la valeur de cet appareil. Une date fixe passée serait plus
    // ancienne que cette poussée, et c'est à bon droit qu'elle serait ignorée.
    lignesCloud = [
      {
        key: CLE_PARTAGEE,
        value: { "AI.PA": { price: 120 } },
        updated_at: new Date(Date.now() + 60_000).toISOString(),
      },
    ];
    await act(async () => {
      await relire();
    });

    expect(screen.getByTestId("lecteur").textContent).toBe(
      JSON.stringify({ "AI.PA": { price: 120 } })
    );
  });
});

/**
 * Deux appareils, une ligne de portefeuille ajoutée sur l'un d'eux : l'autre
 * doit finir par la recevoir, et rien de ce qu'il fait en retard — actualiser
 * ses cours, presser « synchroniser », se refermer — ne doit l'effacer du
 * cloud.
 *
 * Toutes les écritures cloud étaient des écrasements sans condition. Un
 * appareil en retard qui écrivait sa copie la mettait à la place de la version
 * à jour, avec son vieil horodatage ; l'appareil à jour, plus récent que ce
 * qu'il relisait, ne réagissait plus. La divergence devenait définitive,
 * quelle que soit la synchronisation demandée — c'est le défaut rapporté :
 * l'ETF ajouté sur l'ordinateur n'apparaissait jamais sur le téléphone.
 */
describe("usePersistentState — un appareil en retard n'efface pas la version d'un autre", () => {
  const PERIME = { positions: ["CW8"] };
  const A_JOUR = { positions: ["CW8", "ETF"] };
  let ecrire;
  let ecrireAuto;
  let relire;
  let reessayer;

  function Portefeuille() {
    const [valeur, setValeur, setAuto] = usePersistentState(CLE, null);
    ecrire = setValeur;
    ecrireAuto = setAuto;
    relire = useManualRefresh();
    reessayer = useRetrySync();
    return <div data-testid="valeur">{JSON.stringify(valeur)}</div>;
  }

  const affiche = () => JSON.parse(screen.getByTestId("valeur").textContent);
  const ligneCloud = () => lignesCloud.find((l) => l.key === CLE);
  const attendre = (ms) =>
    act(async () => {
      await new Promise((r) => setTimeout(r, ms));
    });

  function copieLocale(valeur, horodatage) {
    localStorage.setItem(`patrimoine:${CLE}`, JSON.stringify(valeur));
    localStorage.setItem(`patrimoine:__meta:${CLE}`, horodatage);
  }

  beforeEach(() => {
    localStorage.clear();
    lignesCloud = [];
    upserts = [];
    lectures = 0;
    lectureSuivante = null;
    _resetStorageCache();
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: true })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("une écriture automatique sur une copie périmée est refusée, et la version du cloud adoptée", async () => {
    copieLocale(PERIME, HIER);
    lignesCloud = [{ key: CLE, value: PERIME, updated_at: HIER }];
    render(<Portefeuille />);
    await attendre(50);

    // L'ordinateur ajoute l'ETF pendant que le téléphone reste ouvert.
    Object.assign(ligneCloud(), { value: A_JOUR, updated_at: AUJOURDHUI });
    upserts.length = 0;

    // Le téléphone actualise les cours de SA copie : c'était une écriture
    // horodatée « maintenant », qui l'emportait sur l'ajout de l'ETF.
    await act(async () => {
      ecrireAuto((v) => ({ ...v, cours: { CW8: 512 } }));
    });
    await attendre(1200);

    expect(ligneCloud()).toMatchObject({ value: A_JOUR, updated_at: AUJOURDHUI });
    expect(upserts).toEqual([]);
    expect(affiche()).toEqual(A_JOUR);
  });

  it("une modification voulue reste la plus récente et part dans le cloud", async () => {
    copieLocale(PERIME, HIER);
    lignesCloud = [{ key: CLE, value: PERIME, updated_at: HIER }];
    render(<Portefeuille />);
    await attendre(50);

    await act(async () => {
      ecrire({ positions: ["CW8", "PAEEM"] });
    });
    await attendre(1200);

    expect(ligneCloud().value).toEqual({ positions: ["CW8", "PAEEM"] });
    expect(Date.parse(ligneCloud().updated_at)).toBeGreaterThan(Date.parse(AUJOURDHUI));
  });

  it("une écriture partie pendant la première lecture n'envoie pas la copie périmée", async () => {
    copieLocale(PERIME, HIER);
    lignesCloud = [{ key: CLE, value: A_JOUR, updated_at: AUJOURDHUI }];
    // Réseau lent : la première lecture du cloud se fait attendre.
    let liberer;
    lectureSuivante = (repondre) =>
      new Promise((r) => {
        liberer = () => r(repondre());
      });

    render(<Portefeuille />);
    // Les cours de la copie locale sont actualisés avant que le cloud n'ait
    // répondu, et la poussée part (débounce écoulé) en attendant la lecture.
    await act(async () => {
      ecrire((v) => ({ ...v, cours: { CW8: 512 } }));
    });
    await attendre(1000);
    await act(async () => {
      liberer();
    });
    await attendre(100);

    expect(affiche()).toEqual(A_JOUR);
    expect(ligneCloud()).toMatchObject({ value: A_JOUR, updated_at: AUJOURDHUI });
    expect(JSON.stringify(upserts)).not.toContain("512");
  });

  it("une lecture échouée au démarrage ne pousse pas la copie locale par-dessus le cloud", async () => {
    copieLocale(PERIME, HIER);
    lignesCloud = [{ key: CLE, value: A_JOUR, updated_at: AUJOURDHUI }];
    lectureSuivante = () => Promise.resolve({ data: null, error: { message: "Failed to fetch" } });

    render(<Portefeuille />);
    await attendre(100);
    expect(upserts).toEqual([]);
    expect(ligneCloud()).toMatchObject({ value: A_JOUR });

    // La relecture suivante — retour au premier plan, bouton — rattrape.
    await act(async () => {
      await relire();
    });
    expect(affiche()).toEqual(A_JOUR);
  });

  it("le bouton de synchronisation ne repousse que ce qui est en attente", async () => {
    copieLocale(A_JOUR, AUJOURDHUI);
    lignesCloud = [{ key: CLE, value: A_JOUR, updated_at: AUJOURDHUI }];
    render(<Portefeuille />);
    await attendre(50);
    upserts.length = 0;

    await act(async () => {
      await relire();
      await reessayer();
    });

    // Rien n'a changé ici : rien ne part. L'ancienne version renvoyait
    // TOUTES les clés de l'appareil, telles quelles, par écrasement.
    expect(upserts).toEqual([]);
  });

  it("répare une divergence : la version plus récente de cet appareil repart vers le cloud", async () => {
    copieLocale(A_JOUR, AUJOURDHUI);
    lignesCloud = [{ key: CLE, value: A_JOUR, updated_at: AUJOURDHUI }];
    render(<Portefeuille />);
    await attendre(50);

    // Un appareil resté sur une ancienne version de l'application écrase le
    // cloud avec sa copie, sous son vieil horodatage.
    Object.assign(ligneCloud(), { value: PERIME, updated_at: HIER });

    await act(async () => {
      await relire();
    });
    await attendre(50);

    // L'ordinateur ne gardait plus sa version pour lui seul : elle repart, et
    // le téléphone la recevra à sa prochaine relecture.
    expect(ligneCloud()).toMatchObject({ value: A_JOUR });
    expect(Date.parse(ligneCloud().updated_at)).toBe(Date.parse(AUJOURDHUI));
    expect(affiche()).toEqual(A_JOUR);
  });

  it("à la fermeture, l'écriture d'urgence est conditionnelle", async () => {
    copieLocale(PERIME, HIER);
    lignesCloud = [{ key: CLE, value: PERIME, updated_at: HIER }];
    render(<Portefeuille />);
    await attendre(50);

    await act(async () => {
      ecrire({ positions: ["CW8", "PAEEM"] });
    });
    // Fermeture avant la fin du débounce.
    window.dispatchEvent(new Event("pagehide"));

    const appel = fetch.mock.calls.find(([, options]) => options?.keepalive);
    expect(appel).toBeTruthy();
    const [url, options] = appel;
    expect(options.method).toBe("PATCH");
    const filtre = new URL(url).searchParams;
    expect(filtre.get("id")).toBe(`eq.u1:${CLE}`);
    expect(filtre.get("or")).toMatch(/^\(updated_at\.is\.null,updated_at\.lte\."[^"]+"\)$/);
  });
});
