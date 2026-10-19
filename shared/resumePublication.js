/**
 * Résumé de publications d'entreprise — garde-fous.
 *
 * Ce module ne parle à aucun modèle. Il contient ce qui doit rester VRAI
 * quoi que le modèle réponde, et c'est pour cela qu'il est séparé : un
 * résumé financier faux est pire que pas de résumé du tout, parce qu'il se
 * lit comme une information vérifiée.
 *
 * Trois garanties :
 *
 *  1. **Aucun chiffre n'est pris au mot.** Tout nombre que le modèle avance
 *     doit se retrouver dans le texte source. Ceux qui ne s'y retrouvent pas
 *     ne sont pas corrigés — ils sont retirés et signalés. Un modèle qui
 *     « arrondit » 4,73 Md€ en 4,7 Md€ produit une valeur qui n'existe nulle
 *     part dans le communiqué, et c'est exactement ce qu'il faut attraper.
 *  2. **La guidance se compare, elle ne se devine pas.** Le sens (relevée,
 *     maintenue, abaissée) est déduit de deux valeurs numériques, pas d'une
 *     impression de lecture.
 *  3. **La parole passée se vérifie.** On conserve ce que l'entreprise avait
 *     annoncé et ce qu'elle a réalisé, pour dire si elle a tenu — ce qui vaut
 *     plus que n'importe quel commentaire sur sa prochaine promesse.
 *
 * Confidentialité : rien ici ne touche au portefeuille. Seul du texte public
 * d'entreprise circule, conformément au README.
 */

/**
 * Normalise un nombre écrit à la française ou à l'anglaise.
 * « 4 732,5 », « 4,732.5 », « 4732.5 » → 4732.5
 */
export function lireNombreTexte(brut) {
  if (brut == null) return null;
  let s = String(brut)
    .replace(/\u00a0|\u202f|\s/g, "") // espaces, y compris insécables
    .replace(/[^\d,.-]/g, "");
  if (!s) return null;

  const dernierePoint = s.lastIndexOf(".");
  const derniereVirgule = s.lastIndexOf(",");

  if (dernierePoint >= 0 && derniereVirgule >= 0) {
    // Le séparateur décimal est le DERNIER des deux ; l'autre groupe les
    // milliers. C'est ce qui distingue « 4,732.5 » de « 4.732,5 ».
    if (derniereVirgule > dernierePoint) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (derniereVirgule >= 0) {
    // Une virgule seule : décimale si elle précède 1 ou 2 chiffres (4,7),
    // séparateur de milliers si elle en précède exactement 3 (4,732).
    const apres = s.length - derniereVirgule - 1;
    s = apres === 3 ? s.replace(/,/g, "") : s.replace(",", ".");
  }

  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Tous les nombres présents dans un texte, normalisés.
 * Sert de référentiel : un chiffre du résumé doit appartenir à cet ensemble.
 */
export function chiffresDuTexte(texte = "") {
  const trouves = new Set();
  // Nombres avec séparateurs éventuels, décimales éventuelles.
  const motif = /-?\d[\d\u00a0\u202f .,]*\d|-?\d/g;
  for (const m of String(texte).matchAll(motif)) {
    const n = lireNombreTexte(m[0]);
    if (n != null) trouves.add(n);
  }
  return trouves;
}

/**
 * Tolérance de correspondance.
 *
 * Strictement zéro serait intenable : un communiqué écrit « 4 732 millions »
 * et le résumé « 4 732 M€ » — même nombre. Mais une tolérance large laisserait
 * passer une invention plausible. On exige donc l'égalité exacte, ou un écart
 * relatif infime imputable à l'arrondi d'affichage, jamais à une reformulation.
 */
const TOLERANCE_RELATIVE = 1e-9;

function presentDans(valeur, ensemble) {
  if (ensemble.has(valeur)) return true;
  for (const candidat of ensemble) {
    if (candidat === 0) continue;
    if (Math.abs(candidat - valeur) / Math.abs(candidat) <= TOLERANCE_RELATIVE) return true;
  }
  return false;
}

/**
 * Vérifie chaque chiffre annoncé par le modèle contre le texte source.
 *
 * @returns {{verifies: object[], rejetes: object[], fiable: boolean}}
 *   `fiable` est faux dès qu'un seul chiffre a été rejeté : le résumé doit
 *   alors être présenté comme incertain, pas réparé en silence.
 */
export function verifierChiffres(chiffresAnnonces = [], texteSource = "") {
  const reference = chiffresDuTexte(texteSource);
  const verifies = [];
  const rejetes = [];

  for (const c of chiffresAnnonces) {
    const valeur = typeof c?.valeur === "number" ? c.valeur : lireNombreTexte(c?.valeur);
    if (valeur == null) {
      rejetes.push({ ...c, motif: "valeur illisible" });
      continue;
    }
    if (!presentDans(valeur, reference)) {
      rejetes.push({ ...c, valeur, motif: "absent du texte source" });
      continue;
    }
    verifies.push({ ...c, valeur });
  }

  return { verifies, rejetes, fiable: rejetes.length === 0 };
}

/**
 * Sens d'évolution d'une guidance.
 *
 * Compare deux fourchettes (ou deux points) sur leur MILIEU : une guidance
 * « 4 à 6 % » relevée en « 5 à 7 % » est bien un relèvement, alors qu'une
 * comparaison borne à borne donnerait un résultat ambigu.
 */
export function comparerGuidance(nouvelle, precedente) {
  const milieu = (g) => {
    if (g == null) return null;
    const bas = typeof g.bas === "number" ? g.bas : lireNombreTexte(g.bas);
    const haut = typeof g.haut === "number" ? g.haut : lireNombreTexte(g.haut);
    if (bas != null && haut != null) return (bas + haut) / 2;
    return bas ?? haut ?? null;
  };

  const a = milieu(nouvelle);
  const b = milieu(precedente);
  if (a == null) return { sens: "inconnue", ecart: null };
  if (b == null) return { sens: "initiale", ecart: null };

  const ecart = a - b;
  // Un écart nul au centième près est une guidance MAINTENUE : les entreprises
  // reconduisent souvent le même texte au mot près.
  if (Math.abs(ecart) < 0.005) return { sens: "maintenue", ecart: 0 };
  return { sens: ecart > 0 ? "relevee" : "abaissee", ecart };
}

/**
 * L'entreprise a-t-elle tenu ses promesses passées ?
 *
 * On ne retient que les exercices où l'on dispose À LA FOIS de ce qui avait
 * été annoncé et de ce qui a été réalisé. Un historique incomplet produirait
 * un taux flatteur ou accablant sans rapport avec la réalité.
 *
 * @returns {{tenues: number, total: number, taux: number|null, detail: object[]}}
 */
export function tenueDesGuidances(historique = []) {
  const detail = [];

  for (const h of historique) {
    const annonce = h?.guidance == null ? null : (typeof h.guidance === "object" ? h.guidance : { bas: h.guidance });
    const realise = typeof h?.realise === "number" ? h.realise : lireNombreTexte(h?.realise);
    if (!annonce || realise == null) continue;

    const bas = typeof annonce.bas === "number" ? annonce.bas : lireNombreTexte(annonce.bas);
    const haut = typeof annonce.haut === "number" ? annonce.haut : lireNombreTexte(annonce.haut);
    if (bas == null && haut == null) continue;

    // Une fourchette est tenue si le réalisé y tombe ; un point l'est s'il
    // est atteint ou dépassé — c'est ainsi qu'une guidance ponctuelle se lit.
    const tenue = bas != null && haut != null ? realise >= bas && realise <= haut : realise >= (bas ?? haut);

    detail.push({ periode: h.periode ?? null, annonce: { bas, haut }, realise, tenue });
  }

  const tenues = detail.filter((d) => d.tenue).length;
  return {
    tenues,
    total: detail.length,
    taux: detail.length > 0 ? (tenues / detail.length) * 100 : null,
    detail,
  };
}

/**
 * Consigne donnée au modèle.
 *
 * Elle lui interdit explicitement de calculer ou d'arrondir : tout chiffre
 * doit être RECOPIÉ du texte. C'est ce qui rend la vérification possible —
 * sans cette contrainte, un arrondi légitime serait indiscernable d'une
 * invention, et tous les résumés finiraient marqués incertains.
 */
export const PROMPT_RESUME = `Tu résumes une publication d'entreprise pour un investisseur particulier.

RÈGLES ABSOLUES
- Chaque chiffre que tu cites doit être RECOPIÉ TEL QUEL du texte fourni. Ne calcule rien, n'arrondis rien, ne convertis aucune unité.
- Si une information n'est pas dans le texte, écris "non communiqué". N'invente jamais une valeur plausible.
- Ton neutre et factuel. Aucune recommandation d'achat, de vente ou de conservation, aucune cible de cours.
- Français courant, sans jargon inutile.

RÉPONDS EN JSON STRICT, sans texte autour :
{
  "resume": "trois à cinq phrases sur ce que dit la publication",
  "chiffres": [{"libelle":"Chiffre d'affaires","valeur":0,"unite":"M€","periode":"T3 2026"}],
  "guidance": {"texte":"ce que l'entreprise annonce pour la suite","bas":null,"haut":null,"unite":"%"},
  "trajectoire": "ce qui explique l'évolution, en langage simple",
  "risques": ["point d'attention 1", "point d'attention 2"]
}
Mets "chiffres" à [] si le texte n'en contient aucun, et "guidance" à null si l'entreprise n'en donne pas.`;

/**
 * Assemble le résultat final : le résumé du modèle, amputé des chiffres qui
 * ne résistent pas à la vérification, et accompagné de son niveau de
 * confiance.
 */
export function construireResume({ reponseModele, texteSource, lien, guidancePrecedente = null }) {
  const chiffres = Array.isArray(reponseModele?.chiffres) ? reponseModele.chiffres : [];
  const { verifies, rejetes, fiable } = verifierChiffres(chiffres, texteSource);
  const guidance = reponseModele?.guidance ?? null;

  // La guidance porte elle aussi des nombres : ils passent au même contrôle.
  const bornesGuidance = guidance
    ? verifierChiffres(
        [guidance.bas, guidance.haut].filter((v) => v != null).map((v) => ({ libelle: "guidance", valeur: v })),
        texteSource
      )
    : { fiable: true, rejetes: [] };

  return {
    resume: typeof reponseModele?.resume === "string" ? reponseModele.resume : "",
    chiffres: verifies,
    chiffresRejetes: rejetes,
    guidance,
    evolutionGuidance: guidance ? comparerGuidance(guidance, guidancePrecedente) : { sens: "inconnue", ecart: null },
    trajectoire: typeof reponseModele?.trajectoire === "string" ? reponseModele.trajectoire : "",
    risques: Array.isArray(reponseModele?.risques) ? reponseModele.risques.filter((r) => typeof r === "string") : [],
    // Un seul chiffre rejeté suffit à marquer l'ensemble comme incertain :
    // on ne sait pas si c'est le seul endroit où le modèle a dérapé.
    fiable: fiable && bornesGuidance.fiable,
    lien: lien || null,
  };
}
