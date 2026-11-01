/**
 * Chiffrement des fichiers du coffre et dialogue avec le stockage : ce qui
 * part vers Supabase ne doit jamais contenir le fichier en clair, et un
 * fichier altéré ou une mauvaise clé doit échouer franchement.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { creerConfiguration, estChiffre } from "./chiffrement";

const objets = new Map();
let erreurEnvoi = null;

vi.mock("./supabaseClient", () => ({
  isSupabaseConfigured: true,
  supabase: {
    storage: {
      from: () => ({
        upload: async (chemin, blob) => {
          if (erreurEnvoi) return { error: erreurEnvoi };
          objets.set(chemin, new Uint8Array(await blob.arrayBuffer()));
          return { error: null };
        },
        download: async (chemin) =>
          objets.has(chemin) ? { data: new Blob([objets.get(chemin)]), error: null } : { data: null, error: { message: "Object not found" } },
        remove: async (chemins) => {
          chemins.forEach((c) => objets.delete(c));
          return { error: null };
        },
        list: async (dossier) => ({
          data: [...objets.keys()].filter((c) => c.startsWith(`${dossier}/`)).map((c) => ({ name: c.slice(dossier.length + 1) })),
          error: null,
        }),
      }),
    },
  },
}));

const {
  chiffrerFichier, dechiffrerFichier, rangerFichier, ouvrirFichier, supprimerFichiers, viderCoffreCloud,
  messageErreurStockage, cheminFichier, ErreurCoffre,
} = await import("./coffreFichiers");

const encodeur = new TextEncoder();
const TEXTE = "PASSEPORT N° 12AB34567 — RÉPUBLIQUE FRANÇAISE";
const contient = (octets, texte) => new TextDecoder("latin1").decode(octets).includes(texte);

let cle;
let autreCle;

beforeEach(async () => {
  objets.clear();
  erreurEnvoi = null;
  ({ cle } = await creerConfiguration("bonne phrase secrète"));
  ({ cle: autreCle } = await creerConfiguration("autre phrase secrète"));
});

describe("chiffrement d'un fichier", () => {
  it("fait l'aller-retour, sans laisser le clair dans le chiffré", async () => {
    const clair = encodeur.encode(TEXTE);
    const { octets, cle: cleFichier } = await chiffrerFichier(cle, clair);
    expect(octets[0]).toBe(1);
    expect(octets.length).toBe(clair.length + 1 + 12 + 16);
    expect(contient(octets, "PASSEPORT")).toBe(false);
    expect(estChiffre(cleFichier)).toBe(true);
    expect(new TextDecoder().decode(await dechiffrerFichier(cle, cleFichier, octets))).toBe(TEXTE);
  });

  it("tire une clé et un vecteur neufs à chaque fichier", async () => {
    const clair = encodeur.encode(TEXTE);
    const a = await chiffrerFichier(cle, clair);
    const b = await chiffrerFichier(cle, clair);
    expect(a.cle.donnees).not.toBe(b.cle.donnees);
    expect(Buffer.from(a.octets).equals(Buffer.from(b.octets))).toBe(false);
  });

  it("refuse une autre clé maîtresse", async () => {
    const { octets, cle: cleFichier } = await chiffrerFichier(cle, encodeur.encode(TEXTE));
    await expect(dechiffrerFichier(autreCle, cleFichier, octets)).rejects.toBeInstanceOf(ErreurCoffre);
  });

  it("refuse un fichier dont un seul octet a été modifié", async () => {
    const { octets, cle: cleFichier } = await chiffrerFichier(cle, encodeur.encode(TEXTE));
    const altere = octets.slice();
    altere[altere.length - 20] ^= 1;
    await expect(dechiffrerFichier(cle, cleFichier, altere)).rejects.toThrow(/illisible/);
  });

  it("refuse un format inconnu ou tronqué", async () => {
    const { octets, cle: cleFichier } = await chiffrerFichier(cle, encodeur.encode(TEXTE));
    const version2 = octets.slice();
    version2[0] = 2;
    await expect(dechiffrerFichier(cle, cleFichier, version2)).rejects.toBeInstanceOf(ErreurCoffre);
    await expect(dechiffrerFichier(cle, cleFichier, octets.slice(0, 10))).rejects.toBeInstanceOf(ErreurCoffre);
  });
});

describe("stockage", () => {
  const fichier = () => new File([encodeur.encode(TEXTE)], "passeport.pdf", { type: "application/pdf" });

  it("n'envoie que du chiffré, sous un nom sans rapport avec le document, dans le dossier de l'utilisateur", async () => {
    const fiche = await rangerFichier({ userId: "u1", cleMaitresse: cle, fichier: fichier() });
    expect(fiche).toMatchObject({ nom: "passeport.pdf", mime: "application/pdf", taille: encodeur.encode(TEXTE).length });
    const [chemin] = objets.keys();
    expect(chemin).toBe(cheminFichier("u1", fiche.id));
    expect(chemin).toMatch(/^u1\/f_[0-9a-f-]+\.bin$/);
    expect(contient(objets.get(chemin), "PASSEPORT")).toBe(false);

    const blob = await ouvrirFichier({ userId: "u1", cleMaitresse: cle, fichier: fiche });
    expect(blob.type).toBe("application/pdf");
    expect(await blob.text()).toBe(TEXTE);
  });

  it("traduit un refus du stockage en consigne", async () => {
    erreurEnvoi = { message: "Bucket not found", statusCode: "404" };
    await expect(rangerFichier({ userId: "u1", cleMaitresse: cle, fichier: fichier() })).rejects.toThrow(/sql\/schema\.sql/);
  });

  it("supprime les fichiers demandés, et vide tout le dossier à la réinitialisation", async () => {
    const a = await rangerFichier({ userId: "u1", cleMaitresse: cle, fichier: fichier() });
    await rangerFichier({ userId: "u1", cleMaitresse: cle, fichier: fichier() });
    await rangerFichier({ userId: "u2", cleMaitresse: cle, fichier: fichier() });

    await supprimerFichiers("u1", [a.id]);
    expect([...objets.keys()].filter((c) => c.startsWith("u1/"))).toHaveLength(1);

    await viderCoffreCloud("u1");
    expect([...objets.keys()].every((c) => c.startsWith("u2/"))).toBe(true);
    expect(objets.size).toBe(1);
  });
});

describe("messageErreurStockage", () => {
  it("dit quoi faire selon l'erreur", () => {
    expect(messageErreurStockage({ message: "new row violates row-level security policy" })).toMatch(/refuse/);
    expect(messageErreurStockage({ message: "The object exceeded the maximum allowed size" })).toMatch(/20 Mo/);
    expect(messageErreurStockage({ message: "Failed to fetch" })).toMatch(/réseau/);
    expect(messageErreurStockage({ message: "Teapot" })).toMatch(/Teapot/);
  });
});
