/**
 * Archive du coffre : illisible sans la clé, et capable de rendre aussi bien
 * des documents supprimés que des fichiers disparus du stockage.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { creerConfiguration, remplacerPhrase, verifierPhrase } from "./chiffrement";
import { COFFRE_VIDE, nouveauDocument } from "./coffre";

const objets = new Map();

vi.mock("./supabaseClient", () => ({
  isSupabaseConfigured: true,
  supabase: {
    storage: {
      from: () => ({
        upload: async (chemin, blob) => {
          objets.set(chemin, new Uint8Array(await blob.arrayBuffer()));
          return { error: null };
        },
        download: async (chemin) =>
          objets.has(chemin)
            ? { data: new Blob([objets.get(chemin)]), error: null }
            : { data: null, error: { message: "Object not found" } },
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
  },
}));

const { rangerFichier, ouvrirFichier } = await import("./coffreFichiers");
const { creerArchive, lireArchive, restaurerArchive, fusionnerCoffres, FORMAT_ARCHIVE } = await import(
  "./coffreArchive"
);

let cle;
let config;

const ranger = async (titre, contenu) => {
  const fiche = await rangerFichier({
    userId: "u1",
    cleMaitresse: cle,
    fichier: new File([contenu], `${titre}.pdf`, { type: "application/pdf" }),
  });
  return nouveauDocument({ type: "autre", titre }, [fiche]);
};

beforeEach(async () => {
  objets.clear();
  ({ cle, config } = await creerConfiguration("phrase de l'archive"));
});

describe("archive du coffre", () => {
  it("ne contient rien de lisible", async () => {
    const coffre = { ...COFFRE_VIDE, documents: [await ranger("Passeport", "NUMERO 12AB34567")] };
    const texte = await creerArchive({ userId: "u1", cleMaitresse: cle, coffre });
    const archive = JSON.parse(texte);
    expect(archive.format).toBe(FORMAT_ARCHIVE);
    expect(Object.keys(archive.fichiers)).toHaveLength(1);
    expect(texte).not.toContain("Passeport");
    expect(texte).not.toContain("12AB");
  });

  it("rend les documents supprimés et les fichiers disparus, sans rien écraser", async () => {
    const passeport = await ranger("Passeport", "PASSEPORT");
    const facture = await ranger("Facture", "FACTURE");
    const texte = await creerArchive({
      userId: "u1",
      cleMaitresse: cle,
      coffre: { ...COFFRE_VIDE, documents: [passeport, facture] },
    });

    // Depuis : la facture a été supprimée, le fichier du passeport a disparu
    // du stockage, et le titre du passeport a changé.
    objets.clear();
    const actuel = { ...COFFRE_VIDE, documents: [{ ...passeport, titre: "Passeport (renommé)" }] };

    const resultat = await restaurerArchive({ userId: "u1", cleMaitresse: cle, texte, coffreActuel: actuel });
    expect(resultat).toMatchObject({ documentsRestaures: 1, fichiersRenvoyes: 2, fichiersIntrouvables: 0 });
    expect(resultat.coffre.documents.map((d) => d.titre)).toEqual(["Passeport (renommé)", "Facture"]);

    const rendu = await ouvrirFichier({ userId: "u1", cleMaitresse: cle, fichier: facture.fichiers[0] });
    expect(await rendu.text()).toBe("FACTURE");
  });

  it("reste lisible après un changement de phrase : la clé ne change pas", async () => {
    const texte = await creerArchive({
      userId: "u1",
      cleMaitresse: cle,
      coffre: { ...COFFRE_VIDE, documents: [await ranger("Bail", "BAIL")] },
    });
    const v2 = await remplacerPhrase(cle, "toute nouvelle phrase", config);
    const cleApres = await verifierPhrase("toute nouvelle phrase", v2);
    const { coffre } = await lireArchive(texte, cleApres);
    expect(coffre.documents[0].titre).toBe("Bail");
  });

  it("refuse une archive d'un autre compte, un fichier quelconque, ou une version future", async () => {
    const texte = await creerArchive({ userId: "u1", cleMaitresse: cle, coffre: COFFRE_VIDE });
    const { cle: autre } = await creerConfiguration("autre compte");
    await expect(lireArchive(texte, autre)).rejects.toThrow(/autre clé/);
    await expect(lireArchive("pas du json", cle)).rejects.toThrow(/pas une archive/);
    await expect(lireArchive(JSON.stringify({ format: "autre" }), cle)).rejects.toThrow(/pas une archive/);
    const future = JSON.stringify({ ...JSON.parse(texte), version: 99 });
    await expect(lireArchive(future, cle)).rejects.toThrow(/plus récente/);
  });

  it("signale un fichier manquant que l'archive ne contient pas", async () => {
    const doc = await ranger("Diplôme", "DIPLOME");
    const texte = await creerArchive({ userId: "u1", cleMaitresse: cle, coffre: COFFRE_VIDE });
    objets.clear();
    const resultat = await restaurerArchive({
      userId: "u1",
      cleMaitresse: cle,
      texte,
      coffreActuel: { ...COFFRE_VIDE, documents: [doc] },
    });
    expect(resultat).toMatchObject({ documentsRestaures: 0, fichiersRenvoyes: 0, fichiersIntrouvables: 1 });
  });
});

describe("fusionnerCoffres", () => {
  it("ajoute ce qui manque et garde la version actuelle de ce qui existe", () => {
    const actuel = { ...COFFRE_VIDE, documents: [{ id: "a", titre: "A récent" }] };
    const archive = { ...COFFRE_VIDE, documents: [{ id: "a", titre: "A ancien" }, { id: "b", titre: "B" }] };
    const { coffre, documentsRestaures } = fusionnerCoffres(actuel, archive);
    expect(coffre.documents).toEqual([
      { id: "a", titre: "A récent" },
      { id: "b", titre: "B" },
    ]);
    expect(documentsRestaures).toBe(1);
  });
});
