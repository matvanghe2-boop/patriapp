import { todayIso } from "./finance";
import { dateFr } from "./coffre";
import { categorieObjet, valeurObjet, garantieObjet, factureDe, totauxInventaire } from "./inventaire";

/**
 * Dossier sinistre : la liste des biens à remettre à l'assureur après un vol
 * ou un dégât des eaux, tirée de l'inventaire du coffre.
 *
 * C'est une page HTML autonome, ouverte dans une fenêtre à part puis imprimée
 * (ou « enregistrée en PDF » depuis la boîte d'impression), comme l'export PDF
 * du Dashboard. Elle ne contient AUCUN script : la fenêtre hérite de la
 * politique de contenu de Patrium, qui n'autorise que les scripts du site ;
 * c'est la page appelante qui lance l'impression.
 *
 * Les aperçus de facture arrivent déjà déchiffrés, en URL `data:` (images, ou
 * première page d'un PDF dessinée par pdf.js) : `img-src` les autorise.
 */

const echapper = (v) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const euros = (n) =>
  Number.isFinite(n)
    ? n.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 2 })
    : "—";

const SOURCES_GARANTIE = {
  facture: "d'après la facture",
  saisie: "date saisie",
  legale: "garantie légale de deux ans",
};

/**
 * @param {object}   p
 * @param {object[]} p.objets     Objets retenus pour le dossier.
 * @param {object[]} p.documents  Documents du coffre (pour les factures liées).
 * @param {Object<string,string>} [p.apercus] Identifiant de facture → URL `data:` de son aperçu.
 * @returns {string} La page complète.
 */
export function htmlDossierSinistre({ objets, documents = [], apercus = {}, aujourdhui = todayIso() }) {
  const totaux = totauxInventaire(objets, aujourdhui);

  const lignes = objets
    .map((o) => {
      const { valeur, estimee } = valeurObjet(o, aujourdhui);
      return `<tr>
        <td>${echapper(o.nom)}</td>
        <td>${echapper(categorieObjet(o.categorie).libelle)}</td>
        <td>${o.dateAchat ? dateFr(o.dateAchat) : "—"}</td>
        <td class="n">${euros(o.prix)}</td>
        <td class="n">${euros(valeur)}${Number.isFinite(valeur) ? (estimee ? " *" : "") : ""}</td>
      </tr>`;
    })
    .join("");

  const fiches = objets
    .map((o) => {
      const garantie = garantieObjet(o, documents, aujourdhui);
      const facture = factureDe(o, documents);
      const details = [
        ["Catégorie", categorieObjet(o.categorie).libelle],
        ["Date d'achat", o.dateAchat ? dateFr(o.dateAchat) : "—"],
        ["Prix d'achat", euros(o.prix)],
        ["Numéro de série", o.numeroSerie || "—"],
        [
          "Garantie",
          garantie.fin
            ? `${garantie.active ? "jusqu'au" : "terminée le"} ${dateFr(garantie.fin)} (${SOURCES_GARANTIE[garantie.source]})`
            : "—",
        ],
        [
          "Facture",
          facture
            ? `${facture.titre}${facture.dateDocument ? `, du ${dateFr(facture.dateDocument)}` : ""}`
            : "—",
        ],
        ["Notes", o.notes || "—"],
      ]
        .map(([terme, valeur]) => `<tr><th>${echapper(terme)}</th><td>${echapper(valeur)}</td></tr>`)
        .join("");
      const apercu =
        facture && apercus[facture.id]
          ? `<img src="${echapper(apercus[facture.id])}" alt="Facture : ${echapper(facture.titre)}" />`
          : "";
      return `<section class="fiche"><h2>${echapper(o.nom)}</h2><table class="details">${details}</table>${apercu}</section>`;
    })
    .join("");

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<title>Dossier sinistre — liste des biens</title>
<style>
  body { font-family: -apple-system, "Segoe UI", Arial, sans-serif; color: #111; margin: 32px; font-size: 12px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  h2 { font-size: 15px; margin: 0 0 8px; }
  .meta { color: #555; margin-bottom: 16px; }
  .champs { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 24px; margin: 16px 0 24px; }
  .champs div { border-bottom: 1px solid #999; padding: 14px 0 2px; color: #555; }
  table { width: 100%; border-collapse: collapse; }
  .liste th, .liste td { padding: 6px 8px; border-bottom: 1px solid #ddd; text-align: left; }
  .liste .n { text-align: right; white-space: nowrap; }
  .liste tfoot td { font-weight: 600; border-top: 2px solid #111; }
  .fiche { page-break-inside: avoid; border-top: 1px solid #ccc; padding-top: 16px; margin-top: 24px; }
  .details th { width: 160px; text-align: left; color: #555; font-weight: normal; padding: 3px 8px 3px 0; vertical-align: top; }
  .details td { padding: 3px 0; }
  .fiche img { display: block; max-width: 100%; max-height: 520px; margin-top: 12px; border: 1px solid #ddd; }
  .note { color: #555; margin-top: 12px; }
  @media print { body { margin: 12mm; } }
</style>
</head>
<body>
  <h1>Dossier sinistre — liste des biens</h1>
  <div class="meta">Établi le ${dateFr(aujourdhui)} à partir de l'inventaire de Patrium · ${totaux.nombre} bien${totaux.nombre > 1 ? "s" : ""}</div>
  <div class="champs">
    <div>Nom de l'assuré :</div>
    <div>N° de contrat :</div>
    <div>Date du sinistre :</div>
    <div>Nature (vol, dégât des eaux, incendie…) :</div>
  </div>
  <table class="liste">
    <thead><tr><th>Bien</th><th>Catégorie</th><th>Achat</th><th class="n">Prix d'achat</th><th class="n">Valeur</th></tr></thead>
    <tbody>${lignes}</tbody>
    <tfoot><tr><td colspan="3">Total</td><td class="n">${euros(totaux.achat)}</td><td class="n">${euros(totaux.valeur)}</td></tr></tfoot>
  </table>
  <p class="note">* Valeur estimée : vétusté indicative selon la catégorie, appliquée au prix d'achat. Ni une cote de revente ni la grille de l'assureur : à confirmer avec lui. Les factures jointes ci-dessous font foi.</p>
  ${fiches}
</body>
</html>`;
}
