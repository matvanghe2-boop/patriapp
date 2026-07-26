import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { isWebstatConfigured, fetchLatestObservation } from "./webstat.js";

const ORIGINAL_ENV = process.env.WEBSTAT_CLIENT_ID;

afterEach(() => {
  if (ORIGINAL_ENV === undefined) delete process.env.WEBSTAT_CLIENT_ID;
  else process.env.WEBSTAT_CLIENT_ID = ORIGINAL_ENV;
  vi.unstubAllGlobals();
});

describe("isWebstatConfigured", () => {
  it("est faux sans variable d'environnement", () => {
    delete process.env.WEBSTAT_CLIENT_ID;
    expect(isWebstatConfigured()).toBe(false);
  });

  it("est vrai quand la clé est renseignée", () => {
    process.env.WEBSTAT_CLIENT_ID = "test-client-id";
    expect(isWebstatConfigured()).toBe(true);
  });
});

describe("fetchLatestObservation", () => {
  beforeEach(() => {
    delete process.env.WEBSTAT_CLIENT_ID;
  });

  it("renvoie null sans clé configurée, sans appeler le réseau", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await fetchLatestObservation("MIR1.M.FR.B.L23FRLA.D.R.A.2230U6.EUR.O")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("renvoie null sans clé de série", async () => {
    process.env.WEBSTAT_CLIENT_ID = "test-client-id";
    expect(await fetchLatestObservation(null)).toBeNull();
  });

  it("parse une observation au format { observations: [{ value, date }] }", async () => {
    process.env.WEBSTAT_CLIENT_ID = "test-client-id";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ observations: [{ value: 1.7, date: "2026-08-01" }] }) })
    );
    expect(await fetchLatestObservation("SERIES")).toEqual({ value: 1.7, date: "2026-08-01" });
  });

  it("parse aussi un format SDMX-like { data: [{ obsValue, period }] }", async () => {
    process.env.WEBSTAT_CLIENT_ID = "test-client-id";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [{ obsValue: "2.5", period: "2026-08-01T00:00:00" }] }) })
    );
    expect(await fetchLatestObservation("SERIES")).toEqual({ value: 2.5, date: "2026-08-01" });
  });

  it("renvoie null sur une réponse HTTP en erreur", async () => {
    process.env.WEBSTAT_CLIENT_ID = "test-client-id";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    expect(await fetchLatestObservation("SERIES")).toBeNull();
  });

  it("renvoie null sur une exception réseau", async () => {
    process.env.WEBSTAT_CLIENT_ID = "test-client-id";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    expect(await fetchLatestObservation("SERIES")).toBeNull();
  });

  it("renvoie null sur une forme de réponse inattendue", async () => {
    process.env.WEBSTAT_CLIENT_ID = "test-client-id";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ unexpected: true }) }));
    expect(await fetchLatestObservation("SERIES")).toBeNull();
  });

  it("envoie l'identifiant client dans l'en-tête X-IBM-Client-Id", async () => {
    process.env.WEBSTAT_CLIENT_ID = "my-secret-id";
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ observations: [{ value: 1, date: "2026-01-01" }] }) });
    vi.stubGlobal("fetch", fetchMock);
    await fetchLatestObservation("SERIES");
    const [, options] = fetchMock.mock.calls[0];
    expect(options.headers["X-IBM-Client-Id"]).toBe("my-secret-id");
  });
});
