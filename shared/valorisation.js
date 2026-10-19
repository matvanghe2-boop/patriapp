/**
 * Fourchette de valorisation — arithmétique, pas opinion.
 *
 * POURQUOI LE CALCUL NE PASSE PAS PAR LE MODÈLE
 *
 * « Estimer un juste prix » est exactement le genre de question à laquelle un
 * modèle de langage répond avec aplomb et sans fondement : il produit un
 * nombre plausible, impossible à vérifier, et qui se lit comme le résultat
 * d'une analyse. Le prix est donc calculé ICI, par des règles explicites,
 * à partir de chiffres publiés. Le modèle n'intervient que pour EXPLIQUER la
 * trajectoire — jamais pour produire la valeur.
 *
 * TROIS MÉTHODES, ET CE QU'ELLES VALENT
 *
 *  1. **PER historique** — le titre revient-il à sa propre moyenne ? C'est la
 *     méthode la plus défendable pour une société mature : elle compare
 *     l'entreprise à elle-même, pas à un secteur hétérogène. Elle suppose que
 *     le marché finira par la payer comme il l'a payée, ce qui est faux si le
 *     métier a changé de nature.
 *  2. **PER attendu** — même logique sur le bénéfice prévu de l'exercice à
 *     venir. Dépend d'un consensus, donc d'une prévision.
 *  3. **Rendement historique** — pour les titres dont la thèse est le
 *     dividende : quel prix ramènerait le rendement à sa moyenne ?
 *
 * Le consensus d'analystes est affiché À PART. Ce n'est pas une méthode de
 * valorisation, c'est l'avis d'un groupe — utile à connaître, à ne pas
 * confondre avec un calcul.
 *
 * Aucune méthode n'est pondérée ni fusionnée en un chiffre unique : la
 * dispersion EST l'information. Un titre dont les trois méthodes donnent
 * 80, 120 et 200 € n'a pas de juste prix à 133 €, il a une incertitude.
 */

/** Arrondi d'affichage, à deux décimales. */
const arrondi = (n) => (Number.isFinite(n) ? Math.round(n * 100) / 100 : null);

/**
 * Prix impliqué par un multiple cible appliqué à un agrégat par action.
 * `prix = agrégat × multiple`
 */
export function prixImplique(agregatParAction, multipleCible) {
  if (!Number.isFinite(agregatParAction) || !Number.isFinite(multipleCible)) return null;
  // Un bénéfice négatif rend le PER inexploitable : un multiple appliqué à
  // une perte produit un prix négatif, qui n'a aucun sens.
  if (agregatParAction <= 0 || multipleCible <= 0) return null;
  return arrondi(agregatParAction * multipleCible);
}

/**
 * Prix qui ramènerait le rendement du dividende à une cible.
 * `prix = dividende / rendement`
 */
export function prixParRendement(dividendeParAction, rendementCiblePct) {
  if (!Number.isFinite(dividendeParAction) || !Number.isFinite(rendementCiblePct)) return null;
  if (dividendeParAction <= 0 || rendementCiblePct <= 0) return null;
  return arrondi(dividendeParAction / (rendementCiblePct / 100));
}

/**
 * Construit la fourchette.
 *
 * @param {object} p
 * @param {number} p.cours               Cours actuel.
 * @param {number} p.per                 PER courant (publié).
 * @param {number} p.perMoyenHistorique  PER moyen des exercices connus.
 * @param {number} p.perAttendu          PER sur bénéfice attendu (forward).
 * @param {number} p.rendementPct        Rendement courant, en %.
 * @param {number} p.rendementMoyenPct   Rendement moyen historique, en %.
 * @param {number} p.dividendeParAction  Dividende annuel par action.
 * @param {number} p.consensusAnalystes  Objectif moyen des analystes.
 */
export function fourchetteValorisation({
  cours = null,
  per = null,
  perMoyenHistorique = null,
  perAttendu = null,
  rendementPct = null,
  rendementMoyenPct = null,
  dividendeParAction = null,
  consensusAnalystes = null,
} = {}) {
  const methodes = [];

  // Le bénéfice par action se déduit du cours et du PER : on n'a pas besoin
  // de le recevoir séparément, et il reste cohérent avec le PER publié.
  const bpa = Number.isFinite(cours) && Number.isFinite(per) && per > 0 ? cours / per : null;

  const parPerHistorique = prixImplique(bpa, perMoyenHistorique);
  if (parPerHistorique != null) {
    methodes.push({
      cle: "perHistorique",
      libelle: "PER moyen de ses 4 derniers exercices",
      prix: parPerHistorique,
      detail: `BPA ${arrondi(bpa)} × PER ${arrondi(perMoyenHistorique)}`,
      fiabilite: "mesuree",
    });
  }

  const bpaAttendu =
    Number.isFinite(cours) && Number.isFinite(perAttendu) && perAttendu > 0 ? cours / perAttendu : null;

  const parPerAttendu = prixImplique(bpaAttendu, perMoyenHistorique);
  if (parPerAttendu != null) {
    methodes.push({
      cle: "perAttendu",
      libelle: "Bénéfice attendu, au PER moyen historique",
      prix: parPerAttendu,
      detail: `BPA attendu ${arrondi(bpaAttendu)} × PER ${arrondi(perMoyenHistorique)}`,
      // Repose sur un consensus de bénéfice : une prévision, pas un fait.
      fiabilite: "prevision",
    });
  } else {
    /*
     * Repli quand aucune moyenne historique de PER n'est disponible — et
     * c'est le cas général : les ratios historiques de l'application portent
     * sur les comptes (marges, ROE, dette), pas sur le cours, donc aucun PER
     * passé n'y figure.
     *
     * On applique alors au bénéfice ATTENDU le multiple que le marché paie
     * AUJOURD'HUI. La question devient : « si le marché continue de payer ce
     * prix pour un euro de bénéfice, que vaut le titre quand le bénéfice aura
     * évolué comme prévu ? » C'est de l'arithmétique sur deux chiffres
     * publiés, et l'hypothèse est énoncée plutôt que dissimulée.
     */
    const parPerMaintenu = prixImplique(bpaAttendu, per);
    if (parPerMaintenu != null) {
      methodes.push({
        cle: "perMaintenu",
        libelle: "Bénéfice attendu, au multiple payé aujourd'hui",
        prix: parPerMaintenu,
        detail: `BPA attendu ${arrondi(bpaAttendu)} × PER ${arrondi(per)}`,
        fiabilite: "prevision",
      });
    }
  }

  const parRendement = prixParRendement(dividendeParAction, rendementMoyenPct);
  if (parRendement != null) {
    methodes.push({
      cle: "rendement",
      libelle: "Retour au rendement moyen",
      prix: parRendement,
      detail: `Dividende ${arrondi(dividendeParAction)} ÷ ${arrondi(rendementMoyenPct)} %`,
      fiabilite: "mesuree",
    });
  }

  const prix = methodes.map((m) => m.prix);
  const bas = prix.length ? Math.min(...prix) : null;
  const haut = prix.length ? Math.max(...prix) : null;

  // L'écart au cours se lit en pourcentage : « 12 % au-dessus » parle, « +8,40 € »
  // ne dit rien sans connaître le niveau du titre.
  const ecartPct = (p) =>
    Number.isFinite(cours) && cours > 0 && Number.isFinite(p) ? arrondi(((p - cours) / cours) * 100) : null;

  return {
    cours: arrondi(cours),
    methodes: methodes.map((m) => ({ ...m, ecartPct: ecartPct(m.prix) })),
    bas,
    haut,
    ecartBasPct: ecartPct(bas),
    ecartHautPct: ecartPct(haut),
    // La dispersion EST l'information : trois méthodes très écartées disent
    // que le titre n'a pas de valorisation consensuelle, et c'est utile à
    // savoir avant de lire un « juste prix ».
    dispersionPct: bas != null && haut != null && bas > 0 ? arrondi(((haut - bas) / bas) * 100) : null,
    consensus:
      consensusAnalystes != null
        ? { prix: arrondi(consensusAnalystes), ecartPct: ecartPct(consensusAnalystes) }
        : null,
    // Sans aucune méthode exploitable, on le dit plutôt que de laisser croire
    // à un calcul : c'est le cas des ETF, des sociétés en perte, et de tout
    // titre dont les fondamentaux ne sont pas publiés.
    exploitable: methodes.length > 0,
    rendementPct: arrondi(rendementPct),
  };
}

/**
 * Consigne du modèle pour l'analyse de trajectoire.
 *
 * Elle lui INTERDIT de produire un prix ou une recommandation. Le prix est
 * déjà calculé ; son rôle est d'expliquer ce que les chiffres racontent, en
 * langage simple, sans vendre quoi que ce soit.
 */
export const PROMPT_ANALYSE = `Tu expliques la trajectoire d'une entreprise cotée à un investisseur particulier, à partir des chiffres fournis.

RÈGLES ABSOLUES
- N'avance AUCUN prix cible, AUCUNE valorisation, AUCUN objectif de cours. Ils sont déjà calculés ailleurs et te sont fournis : tu peux les commenter, jamais en produire d'autres.
- Aucune recommandation d'achat, de vente ou de conservation. Pas de "il faut", pas de "opportunité", pas de "à éviter".
- Chaque chiffre que tu cites doit provenir des données fournies, recopié tel quel. Ne calcule rien, n'arrondis rien.
- Si une donnée manque, écris "non communiqué". N'invente jamais une valeur plausible.
- Ton neutre et factuel, en français courant.

RÉPONDS EN JSON STRICT, sans texte autour :
{
  "trajectoire": "3 à 5 phrases : d'où vient l'entreprise, ce que montrent la croissance et les marges",
  "positionnement": "2 à 4 phrases : comment le titre se situe aujourd'hui par rapport à son propre historique de valorisation",
  "forces": ["point solide 1", "point solide 2"],
  "vigilance": ["point d'attention 1", "point d'attention 2"],
  "incertitudes": "ce que les chiffres fournis ne permettent PAS de trancher"
}`;
