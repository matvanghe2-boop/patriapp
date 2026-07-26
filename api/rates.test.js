import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import handler from "./rates.js";
import { RATES_CATALOG } from "../src/lib/ratesCatalog.js";
import { _resetCache, _resetRateLimit } from "./_lib/http.js";

function mockRes() {
  const res = {
    statusCode: null,
    headers: {},
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader(k, v) {
      this.headers[k] = v;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    end() {
      return this;
    },
  };
  return res;
}

function mockReq() {
  return { method: "GET", query: {}, headers: {}, url: "/api/rates" };
}

beforeEach(() => {
  _resetRateLimit();
  _resetCache();
  delete process.env.WEBSTAT_CLIENT_ID;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GET /api/rates", () => {
  it("renvoie le catalogue complet marqué non-live sans clé Webstat", async () => {
    const res = mockRes();
    await handler(mockReq(), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.liveEnabled).toBe(false);
    expect(res.body.rates).toHaveLength(RATES_CATALOG.length);
    expect(res.body.rates.every((r) => r.live === false)).toBe(true);
  });

  it("inclut toujours le taux du Livret A avec sa source citée", async () => {
    const res = mockRes();
    await handler(mockReq(), res);
    const livretA = res.body.rates.find((r) => r.id === "livret-a");
    expect(livretA).toBeDefined();
    expect(livretA.source).toBeTruthy();
  });

  it("remplace la valeur de référence par la valeur live quand la clé Webstat est configurée et répond", async () => {
    process.env.WEBSTAT_CLIENT_ID = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ observations: [{ value: 9.99, date: "2026-09-01" }] }) })
    );

    const res = mockRes();
    await handler(mockReq(), res);

    const livretA = res.body.rates.find((r) => r.id === "livret-a");
    expect(livretA.live).toBe(true);
    expect(livretA.value).toBe(9.99);
    expect(res.body.liveEnabled).toBe(true);
  });

  it("garde la valeur de référence pour un taux sans série Webstat connue, même avec une clé configurée", async () => {
    process.env.WEBSTAT_CLIENT_ID = "test-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ observations: [{ value: 1, date: "2026-01-01" }] }) }));

    const res = mockRes();
    await handler(mockReq(), res);

    const bce = res.body.rates.find((r) => r.id === "bce-depot");
    expect(bce.live).toBe(false);
    expect(bce.value).toBe(2.25);
  });

  it("retombe sur la valeur de référence si le live échoue pour une série donnée, sans faire échouer les autres", async () => {
    process.env.WEBSTAT_CLIENT_ID = "test-key";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("boom")));

    const res = mockRes();
    await handler(mockReq(), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.rates).toHaveLength(RATES_CATALOG.length);
    expect(res.body.rates.every((r) => r.live === false)).toBe(true);
  });
});
