import { describe, it, expect, vi, beforeEach } from "vitest";
import { translateAuthError, assessPassword, MIN_PASSWORD_LENGTH } from "./authErrors";

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("translateAuthError", () => {
  it.each([
    ["Invalid login credentials", "E-mail ou mot de passe incorrect."],
    ["Email not confirmed", "Ton adresse e-mail n'a pas encore été confirmée. Vérifie ta boîte mail."],
    ["User already registered", "Un compte existe déjà avec cette adresse e-mail."],
    ["User not found", "Aucun compte ne correspond à cette adresse e-mail."],
  ])("traduit %s", (input, expected) => {
    expect(translateAuthError(new Error(input))).toBe(expected);
  });

  it("réinjecte la longueur minimale annoncée par le serveur", () => {
    expect(translateAuthError(new Error("Password should be at least 8 characters"))).toBe(
      "Mot de passe trop court : il faut au moins 8 caractères."
    );
  });

  it("accepte une chaîne aussi bien qu'un objet Error", () => {
    expect(translateAuthError("Invalid login credentials")).toBe("E-mail ou mot de passe incorrect.");
  });

  it("ne laisse jamais fuiter un message technique anglais inconnu", () => {
    const out = translateAuthError(new Error("AuthApiError: unexpected_failure at /token"));
    expect(out).toBe("Connexion impossible pour le moment. Réessaie dans un instant.");
    expect(out).not.toMatch(/AuthApiError/);
  });

  it("gère une erreur vide ou absente", () => {
    expect(translateAuthError(null)).toBe("Une erreur est survenue. Réessaie dans un instant.");
    expect(translateAuthError({})).toBe("Une erreur est survenue. Réessaie dans un instant.");
  });
});

describe("assessPassword", () => {
  it("note 0 un mot de passe vide", () => {
    const r = assessPassword("");
    expect(r.score).toBe(0);
    expect(r.hints.length).toBeGreaterThan(0);
  });

  it("refuse un mot de passe trop court même s'il est varié", () => {
    expect(assessPassword("Ab1!").hints).toContain(`au moins ${MIN_PASSWORD_LENGTH} caractères`);
  });

  it("note au maximum un mot de passe long et varié", () => {
    expect(assessPassword("Correct-Cheval-Batterie-7!").score).toBe(4);
  });

  it("plafonne les motifs évidents malgré leur longueur", () => {
    expect(assessPassword("aaaaaaaaaaaaaaaa").score).toBeLessThanOrEqual(1);
    expect(assessPassword("MotDePasse123!").score).toBeLessThanOrEqual(1);
  });

  it("liste précisément ce qui manque", () => {
    const r = assessPassword("motdepasselong");
    expect(r.hints).toContain("au moins un chiffre");
    expect(r.hints).toContain("au moins un caractère spécial");
    expect(r.hints).not.toContain(`au moins ${MIN_PASSWORD_LENGTH} caractères`);
  });
});
