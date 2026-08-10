import { describe, it, expect, vi } from "vitest";
import { exigerUtilisateur, estAuthRequise } from "./auth.js";

const ENV = { VITE_SUPABASE_URL: "https://projet.supabase.co", VITE_SUPABASE_ANON_KEY: "anon" };

const requete = (entetes = {}) => ({ headers: entetes });

describe("exigerUtilisateur", () => {
  it("laisse passer quand Supabase n'est pas configuré (mode local pur)", async () => {
    const fetchImpl = vi.fn();
    await expect(exigerUtilisateur(requete(), {}, fetchImpl)).resolves.toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("refuse une requête sans en-tête Authorization", async () => {
    // C'est précisément le cas d'un `curl` : le contrôle d'origine le laissait
    // passer, puisqu'une requête sans `Origin` est aussi le cas nominal du
    // navigateur en same-origin.
    await expect(exigerUtilisateur(requete(), ENV, vi.fn())).rejects.toMatchObject({ statusCode: 401 });
  });

  it("refuse un en-tête mal formé", async () => {
    await expect(
      exigerUtilisateur(requete({ authorization: "jeton-brut" }), ENV, vi.fn())
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it("refuse un jeton rejeté par Supabase", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 401 });
    await expect(
      exigerUtilisateur(requete({ authorization: "Bearer perime" }), ENV, fetchImpl)
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it("accepte un jeton valide et renvoie l'utilisateur", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "user-1", email: "a@b.c" }),
    });
    await expect(
      exigerUtilisateur(requete({ authorization: "Bearer valide" }), ENV, fetchImpl)
    ).resolves.toEqual({ id: "user-1", email: "a@b.c" });

    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://projet.supabase.co/auth/v1/user");
    expect(options.headers.Authorization).toBe("Bearer valide");
  });

  it("refuse plutôt que d'ouvrir la route si Supabase est injoignable", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("réseau"));
    await expect(
      exigerUtilisateur(requete({ authorization: "Bearer valide" }), ENV, fetchImpl)
    ).rejects.toMatchObject({ statusCode: 503 });
  });

  it("refuse une réponse valide mais sans identifiant", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    await expect(
      exigerUtilisateur(requete({ authorization: "Bearer valide" }), ENV, fetchImpl)
    ).rejects.toMatchObject({ statusCode: 401 });
  });
});

describe("estAuthRequise", () => {
  it("est vraie dès que Supabase est configuré", () => {
    expect(estAuthRequise(ENV)).toBe(true);
    expect(estAuthRequise({})).toBe(false);
  });
});
