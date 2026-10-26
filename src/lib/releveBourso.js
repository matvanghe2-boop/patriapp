/**
 * Lecture d'un relevé de compte courant BoursoBank (« Extrait de votre compte
 * en EUR »), à partir du texte positionné d'un PDF.
 *
 * Fonctions pures : elles reçoivent les fragments de texte de chaque page —
 * `{ str, x, y, w }`, tels que pdf.js les donne — et renvoient le relevé
 * normalisé. Rien ici ne dépend de pdf.js, ce qui permet de tout tester sur
 * des fragments fabriqués à la main (voir `lirePdf.js` pour l'extraction).
 *
 * POURQUOI LES POSITIONS ET PAS LE TEXTE BRUT : le relevé range chaque montant
 * dans une colonne « Débit » ou « Crédit ». Le texte à plat perd cette
 * information — « 20,00 » ne dit pas dans quel sens l'argent a circulé. C'est
 * l'abscisse du montant, comparée à celle des deux en-têtes, qui le dit.
 *
 * Tous les montants renvoyés sont des CENTIMES entiers : des centaines
 * d'opérations s'additionnent alors sans erreur d'arrondi, et le contrôle
 * « solde initial + mouvements = nouveau solde » peut exiger l'égalité exacte.
 */

const DATE_LONGUE = /^(\d{2})\/(\d{2})\/(\d{4})$/;

// « 5.000,00 », « 162,25 », « -12,40 ». Le point sépare les milliers sur les
// relevés Bourso ; l'espace (insécable ou non) est accepté pour les autres.
const MONTANT_FR = /^-?\d{1,3}(?:[.\u0020\u00A0\u202F]?\d{3})*,\d{2}$/;

/** « 04/05/2026 » → « 2026-05-04 », ou `null` si ce n'est pas une date. */
export function dateIso(texte) {
  const m = String(texte ?? "").trim().match(DATE_LONGUE);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

/**
 * Montant au format français, en centimes : « 5.000,00 » → 500000.
 *
 * Strict : une chaîne qui n'est pas exactement un montant à deux décimales
 * renvoie `null`. Le `toNumber` de l'import de courtage lit « 5.000,00 »
 * comme 5 (il remplace la virgule par un point, puis `parseFloat` s'arrête
 * au second point) — sur un compte courant, c'est un virement de 5 000 €
 * compté 5 €.
 */
export function centimesDepuisTexte(texte) {
  const t = String(texte ?? "").trim();
  if (!MONTANT_FR.test(t)) return null;
  const negatif = t.startsWith("-");
  const [entiers, decimales] = t.replace(/^-/, "").replace(/[.\u0020\u00A0\u202F]/g, "").split(",");
  const centimes = Number(entiers) * 100 + Number(decimales);
  return negatif ? -centimes : centimes;
}

/**
 * Découpe un fragment en mots, chacun avec son abscisse estimée.
 *
 * pdf.js regroupe parfois plusieurs mots — voire deux colonnes proches — en un
 * seul fragment. La position de chaque mot est interpolée sur la largeur du
 * fragment, au prorata des caractères : approximatif à quelques points près,
 * ce qui suffit largement à distinguer des colonnes espacées de 60.
 */
function motsDuFragment({ str, x, w }) {
  const texte = String(str ?? "");
  const largeurCar = texte.length > 0 ? (w || 0) / texte.length : 0;
  const mots = [];
  for (const m of texte.matchAll(/\S+/g)) {
    const debut = x + m.index * largeurCar;
    mots.push({ texte: m[0], x: debut, fin: debut + m[0].length * largeurCar });
  }
  return mots;
}

/**
 * Regroupe les fragments d'une page en lignes visuelles, de haut en bas.
 *
 * La tolérance verticale absorbe les petits décalages de ligne de base : sur
 * le relevé réel, « Nouveau solde en EUR : » et son montant sont à un point
 * d'écart, et doivent rester sur la même ligne.
 */
export function regrouperLignes(fragments, tolerance = 2.5) {
  const lignes = [];
  const tries = [...(fragments || [])]
    .filter((f) => f && typeof f.str === "string" && f.str.trim())
    .sort((a, b) => b.y - a.y || a.x - b.x);
  for (const f of tries) {
    let ligne = lignes.find((l) => Math.abs(l.y - f.y) <= tolerance);
    if (!ligne) {
      ligne = { y: f.y, mots: [] };
      lignes.push(ligne);
    }
    ligne.mots.push(...motsDuFragment(f));
  }
  for (const l of lignes) {
    l.mots.sort((a, b) => a.x - b.x);
    l.texte = l.mots.map((m) => m.texte).join(" ");
  }
  return lignes.sort((a, b) => b.y - a.y);
}

const centre = (mot) => (mot.x + mot.fin) / 2;

/** En-tête du tableau des mouvements : « Date | Libellé | Valeur | Débit | Crédit ». */
function trouverColonnes(lignes) {
  for (let i = 0; i < lignes.length; i += 1) {
    const mots = lignes[i].mots;
    const libelle = mots.find((m) => /^libell/i.test(m.texte));
    const valeur = mots.find((m) => /^valeur$/i.test(m.texte));
    const debit = mots.find((m) => /^d.bit$/i.test(m.texte));
    const credit = mots.find((m) => /^cr.dit$/i.test(m.texte));
    if (libelle && valeur && debit && credit) {
      return {
        index: i,
        libelle: libelle.x,
        valeur: valeur.x,
        // Les montants sont alignés à droite sous leur en-tête : c'est la
        // frontière entre les DEUX colonnes qui tranche, pas l'en-tête le plus
        // proche — un petit débit (« 7,00 ») commence plus à droite qu'un gros.
        frontiere: (centre(debit) + centre(credit)) / 2,
      };
    }
  }
  return null;
}

/** Montant porté par une ligne, signé selon sa colonne (débit négatif). */
function montantDeLigne(mots, colonnes) {
  const candidats = mots.filter((m) => m.x > colonnes.valeur + 30 && centimesDepuisTexte(m.texte) != null);
  if (candidats.length === 0) return null;
  const mot = candidats[candidats.length - 1];
  const valeur = centimesDepuisTexte(mot.texte);
  return centre(mot) < colonnes.frontiere ? -Math.abs(valeur) : Math.abs(valeur);
}

const CIVILITE = /^(M|MR|MME|MLLE|MLE|MONSIEUR|MADAME)$/i;

/**
 * Titulaire du compte, lu dans le bloc d'adresse au-dessus du tableau.
 *
 * Il sert à reconnaître les virements entre ses propres comptes. On ne garde
 * que le nom — jamais l'adresse, l'IBAN ou le numéro complet du compte, que
 * l'application n'a aucune raison de conserver.
 */
function trouverTitulaire(lignes) {
  for (const l of lignes) {
    if (/n.\s*de\s*rib/i.test(l.texte)) break;
    const mots = l.texte.split(/\s+/);
    if (mots.length >= 2 && CIVILITE.test(mots[0]) && /^[A-ZÀ-Ý' -]+$/.test(l.texte)) {
      const nom = mots.filter((m, i) => !(i === 0 || (CIVILITE.test(m) && i <= 2) || /^OU$/i.test(m)));
      if (nom.length > 0) return nom.join(" ");
    }
  }
  return null;
}

/**
 * Recolle un mot coupé en fin de libellé.
 *
 * Le relevé coupe certains libellés trop longs au milieu d'un mot :
 * « VIR Virement train Jean DUPONTEL » puis « LIER » seul sur la ligne
 * suivante, puis le nom complet « DUPONTELLIER ». Quand la ligne suivante est
 * un fragment isolé qui, accolé au dernier mot, reforme un mot présent plus
 * bas, c'est une césure et non un complément.
 */
function recollerCesure(operation) {
  const [suite, ...reste] = operation.complements;
  if (!suite || /\s/.test(suite)) return;
  const mots = operation.libelle.split(" ");
  const recolle = mots[mots.length - 1] + suite;
  if (reste.some((l) => l.split(/\s+/).includes(recolle))) {
    mots[mots.length - 1] = recolle;
    operation.libelle = mots.join(" ");
    operation.complements = reste;
  }
}

/** Erreur explicite quand le PDF n'est pas un relevé Bourso lisible. */
export class ReleveIllisible extends Error {
  constructor(message) {
    super(message);
    this.name = "ReleveIllisible";
  }
}

/**
 * Lit un relevé complet.
 *
 * @param {Array<Array<{str:string,x:number,y:number,w:number}>>} pages
 * @returns {{
 *   banque: string, compte: string|null, titulaire: string|null,
 *   debut: string|null, fin: string|null,
 *   soldeDebut: number|null, soldeFin: number|null,
 *   operations: Array<{date, dateValeur, montant, libelle, complements, ordre}>,
 *   controle: { ok: boolean, ecart: number|null },
 * }}
 */
export function lireReleveBourso(pages) {
  const lignesParPage = (pages || []).map((p) => regrouperLignes(p));
  const toutLeTexte = lignesParPage.flat().map((l) => l.texte).join("\n");

  if (!/boursobank|boursorama/i.test(toutLeTexte) || !/mouvements\s+en\s+eur/i.test(toutLeTexte)) {
    throw new ReleveIllisible(
      "Ce PDF ne ressemble pas à un relevé de compte BoursoBank (« Extrait de votre compte »)."
    );
  }

  const periode = toutLeTexte.match(/du\s+(\d{2}\/\d{2}\/\d{4})\s+au\s+(\d{2}\/\d{2}\/\d{4})/i);
  // Banque, guichet, compte, clé : seuls les quatre derniers chiffres du
  // compte sont gardés, pour distinguer deux comptes sans stocker le numéro.
  const rib = toutLeTexte.match(/\b\d{5}\s+\d{5}\s+(\d{11})\s+\d{2}\b/);

  const operations = [];
  let soldeDebut = null;
  let soldeFin = null;
  let courante = null;

  for (const lignes of lignesParPage) {
    const colonnes = trouverColonnes(lignes);
    if (!colonnes) continue;

    for (const ligne of lignes.slice(colonnes.index + 1)) {
      const { mots, texte } = ligne;
      if (/^date$|^op.ration$/i.test(texte)) continue;

      if (/nouveau\s+solde/i.test(texte)) {
        soldeFin = montantDeLigne(mots, colonnes);
        courante = null;
        break;
      }
      const solde = texte.match(/solde\s+au\s*:?\s*(\d{2}\/\d{2}\/\d{4})/i);
      if (solde) {
        if (soldeDebut == null) soldeDebut = montantDeLigne(mots, colonnes);
        continue;
      }

      const premier = mots[0];
      const date = premier.x < colonnes.libelle - 4 ? dateIso(premier.texte) : null;

      if (date) {
        const libelle = mots
          .filter((m) => m.x >= colonnes.libelle - 4 && m.x < colonnes.valeur - 8)
          .map((m) => m.texte)
          .join(" ");
        const motValeur = mots.find((m) => m.x >= colonnes.valeur - 8 && dateIso(m.texte));
        const montant = montantDeLigne(mots, colonnes);
        if (montant == null) continue;
        courante = {
          date,
          dateValeur: motValeur ? dateIso(motValeur.texte) : date,
          montant,
          libelle,
          complements: [],
          ordre: operations.length,
        };
        operations.push(courante);
      } else if (premier.x >= colonnes.libelle - 4 && premier.x < colonnes.valeur - 8) {
        // Ligne de complément : motif, référence, nom complet du donneur
        // d'ordre… Elle appartient à l'opération qui la précède.
        if (courante) courante.complements.push(texte);
      } else {
        // Texte qui commence à gauche sans date : on est sorti du tableau
        // (mentions légales en pied de page).
        courante = null;
        break;
      }
    }
  }

  if (operations.length === 0 && soldeFin == null) {
    throw new ReleveIllisible("Aucun mouvement n'a pu être lu dans ce relevé.");
  }

  for (const op of operations) recollerCesure(op);

  const total = operations.reduce((s, o) => s + o.montant, 0);
  const ecart = soldeDebut != null && soldeFin != null ? soldeDebut + total - soldeFin : null;

  return {
    banque: "BoursoBank",
    compte: rib ? rib[1].slice(-4) : null,
    titulaire: trouverTitulaire(lignesParPage[0] || []),
    debut: periode ? dateIso(periode[1]) : null,
    fin: periode ? dateIso(periode[2]) : null,
    soldeDebut,
    soldeFin,
    operations,
    controle: { ok: ecart === 0, ecart },
  };
}
