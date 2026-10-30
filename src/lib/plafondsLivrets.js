/**
 * Plafonds légaux des livrets réglementés, déduits du nom saisi.
 *
 * La table existait en double — dans Livrets et dans le Dashboard — et rien
 * ne garantissait qu'une revalorisation serait reportée aux deux endroits.
 */
export const PLAFONDS_LEGAUX = {
  "livret a": 22950, "ldds": 12000, "lep": 10000, "livret jeune": 1600,
  "pel": 61200, "cel": 15300,
};

/** Plafond légal d'un livret d'après son nom, ou `null` s'il n'est pas reconnu. */
export function plafondLegal(nom) {
  const cle = (nom || "").toLowerCase().trim();
  for (const [k, v] of Object.entries(PLAFONDS_LEGAUX)) {
    if (cle.includes(k)) return v;
  }
  return null;
}
