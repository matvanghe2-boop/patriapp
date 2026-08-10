import { todayIso } from "./finance";

/**
 * Export CSV du journal d'opérations.
 *
 * Les opérations n'étaient consultables qu'à l'écran. Or c'est précisément la
 * pièce qu'on doit ressortir une fois par an : pour la déclaration (plus-values
 * réalisées sur CTO, dividendes perçus), pour un changement de courtier, ou
 * simplement pour vérifier un calcul dans un tableur.
 *
 * Format retenu : séparateur point-virgule et décimale à la virgule, celui
 * qu'Excel en configuration française ouvre sans passer par l'assistant
 * d'importation.
 */

const COLONNES = [
  { cle: "date", entete: "Date" },
  { cle: "type", entete: "Type" },
  { cle: "asset", entete: "Actif" },
  { cle: "quantity", entete: "Quantité", nombre: true },
  { cle: "price", entete: "Cours unitaire", nombre: true },
  { cle: "fees", entete: "Frais", nombre: true },
  { cle: "montantNet", entete: "Montant net", nombre: true },
  { cle: "plusValueRealisee", entete: "Plus-value réalisée", nombre: true },
  { cle: "transactionId", entete: "Référence" },
];

/** Décimale française, et rien plutôt que « NaN » ou « null ». */
export function formaterNombre(v) {
  if (v == null || v === "" || !Number.isFinite(Number(v))) return "";
  return String(Number(v)).replace(".", ",");
}

/**
 * Échappement CSV : guillemets doublés, et champ encadré dès qu'il contient un
 * séparateur, un guillemet ou un saut de ligne. Sans cela, un nom d'actif
 * contenant un point-virgule décalerait toutes les colonnes suivantes.
 */
export function echapperCsv(valeur) {
  const s = String(valeur ?? "");
  if (/[";\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function construireCsvOperations(operations = []) {
  const lignes = [COLONNES.map((c) => echapperCsv(c.entete)).join(";")];

  const triees = [...operations].sort((a, b) => ((a?.date || "") < (b?.date || "") ? -1 : 1));

  for (const op of triees) {
    lignes.push(
      COLONNES.map((c) => echapperCsv(c.nombre ? formaterNombre(op?.[c.cle]) : op?.[c.cle] ?? "")).join(";")
    );
  }

  return lignes.join("\r\n");
}

/**
 * Déclenche le téléchargement du CSV.
 *
 * Le BOM UTF-8 en tête n'est pas décoratif : sans lui, Excel lit le fichier en
 * ANSI et affiche « PlusÂ­value rÃ©alisÃ©e » à la place des accents.
 */
export function exporterOperationsCsv(operations = []) {
  const csv = construireCsvOperations(operations);
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `operations-${todayIso()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
