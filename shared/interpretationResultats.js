/**
 * Interprétation d'une publication de résultats — critères explicites,
 * remis dans l'historique de la société.
 *
 * POURQUOI UNE GRILLE CALCULÉE, ET PAS UN AVIS DE MODÈLE
 *
 * « Ces résultats sont-ils bons ? » n'a de sens que rapporté à quelque chose :
 * le rythme habituel de la société, ses marges passées, sa promesse du
 * trimestre précédent. Un modèle de langage répond à cette question avec
 * aplomb et sans repère — il trouve « solide » une croissance de 5 % chez une
 * société qui en faisait 25. La comparaison est donc faite ICI, par des règles
 * écrites, sur des chiffres vérifiés :
 *
 *   1. le modèle EXTRAIT quelques indicateurs normalisés du communiqué,
 *      recopiés tels quels — chacun est confronté au texte, comme le reste ;
 *   2. ce module les CONFRONTE à l'historique de la société (les comptes
 *      annuels que la fiche Marché affiche déjà) selon des seuils explicites,
 *      et rend un verdict par critère avec la phrase qui le justifie ;
 *   3. le modèle, ensuite seulement, RÉDIGE la lecture d'ensemble à partir de
 *      cette grille — sans pouvoir la contredire ni introduire un chiffre
 *      absent des données qu'on lui transmet.
 *
 * LA RÉFÉRENCE EST UNE MÉDIANE
 *
 * Les ratios d'une petite valeur sont heurtés : la conversion en trésorerie de
 * Vusion va de −1 393 % à 202 % selon l'exercice, parce que son résultat net
 * frôle zéro certaines années. Une moyenne de ces valeurs ne décrit rien ; la
 * médiane, elle, résiste à une année aberrante.
 *
 * Aucune recommandation d'achat ou de vente n'est produite : un verdict
 * « favorable » dit qu'un indicateur est meilleur que l'habitude de la
 * société, pas qu'il faut acheter le titre.
 *
 * Module pur : aucune requête, partagé par le serveur et l'interface.
 */

import { ratiosParExercice } from "./ratiosHistoriques.js";
import { chiffresDuTexte, lireNombreTexte } from "./resumePublication.js";

// ─── Outils ─────────────────────────────────────────────────────────────────

const fini = (v) => typeof v === "number" && Number.isFinite(v);

/** Arrondi à une décimale : c'est la précision qu'on affiche ET qu'on transmet au modèle. */
const r1 = (v) => (fini(v) ? Math.round(v * 10) / 10 : null);

export function mediane(valeurs = []) {
  const v = valeurs.filter(fini).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

/** « 9,8 » — format français, une décimale au plus. */
export function nombreFr(v, decimales = 1) {
  if (!fini(v)) return "—";
  return v.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: decimales });
}

const pctFr = (v) => `${nombreFr(v)} %`;
const pctSigneFr = (v) => `${v > 0 ? "+" : ""}${nombreFr(v)} %`;

// ─── 1. Contexte historique ─────────────────────────────────────────────────

/**
 * Ce que l'historique de la société dit d'elle, sous une forme compacte : par
 * exercice, puis une référence (médiane, plus bas, plus haut) par ratio.
 *
 * `fiche` est la fiche financière de Marché (`ficheComplete`) : comptes
 * annuels, ratios courants, consensus. Les valeurs sont arrondies à une
 * décimale ici, une fois pour toutes — ce sont exactement celles que le modèle
 * reçoit, ce qui permet de vérifier qu'il les recopie sans les inventer.
 */
export function contexteHistorique(fiche) {
  if (!fiche) return null;

  const lignes = ratiosParExercice(fiche.historique || []).filter((l) =>
    [l.croissanceCaPct, l.margeNettePct, l.margeEbitdaPct].some(fini)
  );
  const annee = (l) => String(l.exercice).slice(0, 4);
  const reference = (cle) => {
    const v = lignes.map((l) => l[cle]).filter(fini);
    if (v.length === 0) return null;
    return {
      mediane: r1(mediane(v)),
      plusBas: r1(Math.min(...v)),
      plusHaut: r1(Math.max(...v)),
      nb: v.length,
    };
  };
  const pers = lignes.map((l) => l.per).filter((v) => fini(v) && v > 0);

  const surprises = Array.isArray(fiche.surprises) ? fiche.surprises.filter((s) => fini(s?.surprisePct)) : [];
  const enCours = fiche.consensus?.anneeEnCours;

  return {
    nom: fiche.nom || fiche.symbole || null,
    secteur: fiche.secteur || null,
    industrie: fiche.industrie || null,
    devise: fiche.deviseComptes || fiche.devise || null,
    nbExercices: lignes.length,
    periode: lignes.length ? `${annee(lignes[0])}–${annee(lignes[lignes.length - 1])}` : null,
    exercices: lignes.map((l) => ({
      annee: annee(l),
      croissanceCaPct: r1(l.croissanceCaPct),
      margeEbitdaPct: r1(l.margeEbitdaPct),
      margeNettePct: r1(l.margeNettePct),
      detteSurFondsPropresPct: r1(l.detteSurFondsPropresPct),
    })),
    references: {
      croissanceCaPct: reference("croissanceCaPct"),
      margeEbitdaPct: reference("margeEbitdaPct"),
      margeNettePct: reference("margeNettePct"),
    },
    // Ratio des douze derniers mois : l'historique annuel ne publie pas de
    // résultat opérationnel, c'est la seule référence pour cette marge-là.
    margeOperationnelle12MoisPct: r1(fiche.margeOperationnellePct),
    per: r1(fiche.per),
    // Trois exercices bénéficiaires au moins. Avec deux, Vusion aurait eu un
    // « PER habituel » de 64 — la moyenne de 97 et 31, années où le bénéfice
    // frôlait zéro — et le titre serait passé pour bradé à 8 fois.
    perMedian: pers.length >= 3 ? r1(mediane(pers)) : null,
    nbPer: pers.length,
    consensus:
      enCours && fini(enCours.bpaEstime)
        ? {
            exercice: String(enCours.exercice || "").slice(0, 4),
            bpaEstime: Math.round(enCours.bpaEstime * 100) / 100,
            nbAnalystes: enCours.numAnalystes ?? null,
          }
        : null,
    surprises: surprises.length
      ? { battues: surprises.filter((s) => s.surprisePct > 0).length, total: surprises.length }
      : null,
  };
}

// ─── 2. Indicateurs extraits du communiqué ──────────────────────────────────

/** Indicateurs que le modèle doit extraire, et ce qu'ils désignent. */
export const INDICATEURS = {
  croissanceCaPct: "variation du chiffre d'affaires, en %",
  margeEbitdaPct: "marge d'EBITDA, en % du chiffre d'affaires",
  margeOperationnellePct: "marge opérationnelle (EBIT, ROC, EBITA), en % du chiffre d'affaires",
  margeNettePct: "marge nette, en % du chiffre d'affaires",
  variationResultatNetPct: "variation du résultat net, en %",
  freeCashFlow: "free cash-flow (flux de trésorerie disponible), montant",
  levierDetteNetteEbitda: "dette nette rapportée à l'EBITDA, en nombre de fois",
};

const STATUTS_GUIDANCE = ["relevée", "confirmée", "abaissée", "suspendue", "non communiquée"];

/** Valeur numérique d'un indicateur, qu'il arrive nu ou sous la forme { valeur }. */
function valeurIndicateur(brut) {
  const v = brut && typeof brut === "object" ? brut.valeur : brut;
  if (v == null || v === "") return null;
  return typeof v === "number" ? (Number.isFinite(v) ? v : null) : lireNombreTexte(v);
}

/**
 * Garde les indicateurs dont la valeur figure dans le texte.
 *
 * Le signe est jugé à part : un communiqué écrit « en baisse de 3,2 % », le
 * modèle rend −3,2 — c'est bien le même chiffre. On vérifie donc la valeur
 * absolue, comme le reste du résumé vérifie les chiffres recopiés.
 */
export function verifierIndicateurs(brut = {}, texteSource = "") {
  const reference = chiffresDuTexte(texteSource);
  const present = (v) => {
    const a = Math.abs(v);
    for (const c of reference) {
      if (Math.abs(Math.abs(c) - a) <= 1e-9 * Math.max(1, a)) return true;
    }
    return false;
  };

  const valides = {};
  const rejetes = [];
  for (const cle of Object.keys(INDICATEURS)) {
    const v = valeurIndicateur(brut?.[cle]);
    if (v == null) continue;
    if (!present(v)) {
      rejetes.push({ cle, valeur: v });
      continue;
    }
    const detail = brut[cle] && typeof brut[cle] === "object" ? brut[cle] : {};
    valides[cle] = {
      valeur: v,
      ...(typeof detail.base === "string" && detail.base ? { base: detail.base } : {}),
      ...(typeof detail.unite === "string" && detail.unite ? { unite: detail.unite } : {}),
    };
  }

  const statut = String(brut?.guidanceStatut || "")
    .toLowerCase()
    .trim();
  if (STATUTS_GUIDANCE.includes(statut)) valides.guidanceStatut = statut;
  if (typeof brut?.periode === "string" && brut.periode.trim()) valides.periode = brut.periode.trim();

  return { valides, rejetes };
}

// ─── 3. Grille de critères ──────────────────────────────────────────────────

/**
 * Seuils de jugement. Écrits ici, et non laissés à l'appréciation d'un
 * modèle, pour qu'un même chiffre donne toujours le même verdict.
 */
export const SEUILS = {
  // Écart de croissance, en points, au-delà duquel le rythme a changé.
  croissancePoints: 3,
  // Écart de marge, en points, au-delà duquel la rentabilité a bougé.
  margePoints: 1,
  // Dette nette / EBITDA : repères usuels des prêteurs.
  levierFaible: 1,
  levierEleve: 2.5,
  // PER : ±20 % autour de sa médiane historique.
  perEcartRelatif: 0.2,
  // Part des guidances tenues.
  tenueBonne: 0.75,
  tenueFaible: 0.4,
};

/** Un exercice complet se compare à des exercices ; un trimestre, avec précaution. */
const estPeriodeAnnuelle = (periode) => /exercice|annuel|année|full[- ]?year|FY|12 mois/i.test(periode || "");

/**
 * Précaution à afficher UNE fois en tête de grille quand la publication ne
 * couvre pas un exercice complet. Répétée sous chaque critère, elle noyait
 * les constats.
 */
export function precautionDePeriode(periode) {
  if (!periode || estPeriodeAnnuelle(periode)) return null;
  return `Publication sur ${periode}, comparée à des exercices complets : un trimestre ou un semestre peut s'en écarter par simple saisonnalité.`;
}

function critere(cle, libelle, verdict, constat, extra = {}) {
  return { cle, libelle, verdict, constat, ...extra };
}

const NON_EVALUABLE = (cle, libelle, raison) => critere(cle, libelle, "non_evaluable", raison);

/**
 * Confronte les indicateurs publiés à l'historique, critère par critère.
 *
 * @param {object} p
 * @param {object} p.indicateurs        sortie de `verifierIndicateurs`
 * @param {object} p.contexte           sortie de `contexteHistorique`
 * @param {object} p.evolutionGuidance  { sens } issu de `comparerGuidance`
 * @param {object} p.tenue              { tenues, total } des publications déjà résumées
 * @returns {Array<{cle, libelle, verdict, constat}>} verdict ∈ favorable,
 *   neutre, defavorable, non_evaluable
 */
export function evaluerCriteres({
  indicateurs = {},
  contexte = null,
  evolutionGuidance = null,
  tenue = null,
} = {}) {
  const criteres = [];
  const periode = contexte?.periode;
  const surPeriode = periode ? ` sur ${periode}` : "";

  // Croissance du chiffre d'affaires
  {
    const ind = indicateurs.croissanceCaPct;
    const ref = contexte?.references?.croissanceCaPct;
    const libelle = "Croissance du chiffre d'affaires";
    if (!ind) {
      criteres.push(
        NON_EVALUABLE("croissance", libelle, "Le communiqué ne donne pas de variation du chiffre d'affaires.")
      );
    } else {
      const v = ind.valeur;
      const base = ind.base ? ` (${ind.base})` : "";
      if (v < 0) {
        criteres.push(
          critere(
            "croissance",
            libelle,
            "defavorable",
            `Chiffre d'affaires en recul de ${pctFr(Math.abs(v))}${base}.`
          )
        );
      } else if (!ref || ref.nb < 2) {
        criteres.push(
          critere(
            "croissance",
            libelle,
            "neutre",
            `Chiffre d'affaires ${pctSigneFr(v)}${base} ; historique trop court pour situer ce rythme.`
          )
        );
      } else {
        const ecart = v - ref.mediane;
        const verdict =
          ecart >= SEUILS.croissancePoints
            ? "favorable"
            : ecart <= -SEUILS.croissancePoints
              ? "defavorable"
              : "neutre";
        const lecture = {
          favorable: "accélération",
          defavorable: "ralentissement",
          neutre: "dans la tendance",
        }[verdict];
        criteres.push(
          critere(
            "croissance",
            libelle,
            verdict,
            `Chiffre d'affaires ${pctSigneFr(v)}${base}, contre ${pctFr(ref.mediane)} par an en médiane${surPeriode} : ${lecture}.`
          )
        );
      }
    }
  }

  // Rentabilité : chaque marge publiée face à la même marge, dans le passé
  {
    const marges = [
      [
        "margeEbitdaPct",
        "Marge d'EBITDA",
        contexte?.references?.margeEbitdaPct?.mediane,
        contexte?.references?.margeEbitdaPct?.nb,
        `en médiane${surPeriode}`,
      ],
      [
        "margeOperationnellePct",
        "Marge opérationnelle",
        contexte?.margeOperationnelle12MoisPct,
        2,
        "sur les douze derniers mois",
      ],
      [
        "margeNettePct",
        "Marge nette",
        contexte?.references?.margeNettePct?.mediane,
        contexte?.references?.margeNettePct?.nb,
        `en médiane${surPeriode}`,
      ],
    ];
    let aucune = true;
    for (const [cle, libelle, reference, nb, sur] of marges) {
      const ind = indicateurs[cle];
      if (!ind) continue;
      aucune = false;
      if (!fini(reference) || (nb ?? 0) < 2) {
        criteres.push(
          critere(
            cle,
            libelle,
            "neutre",
            `${libelle} de ${pctFr(ind.valeur)} ; pas de référence historique comparable.`
          )
        );
        continue;
      }
      const ecart = ind.valeur - reference;
      const verdict =
        ecart >= SEUILS.margePoints ? "favorable" : ecart <= -SEUILS.margePoints ? "defavorable" : "neutre";
      const lecture = { favorable: "amélioration", defavorable: "dégradation", neutre: "stable" }[verdict];
      criteres.push(
        critere(
          cle,
          libelle,
          verdict,
          `${libelle} de ${pctFr(ind.valeur)}, contre ${pctFr(reference)} ${sur} : ${lecture}.`
        )
      );
    }
    if (aucune) {
      criteres.push(
        NON_EVALUABLE("rentabilite", "Rentabilité", "Le communiqué ne donne aucune marge en pourcentage.")
      );
    }
  }

  // Résultat net
  if (indicateurs.variationResultatNetPct) {
    const v = indicateurs.variationResultatNetPct.valeur;
    criteres.push(
      critere(
        "resultatNet",
        "Résultat net",
        v > 0 ? "favorable" : v < 0 ? "defavorable" : "neutre",
        v >= 0 ? `Résultat net en hausse de ${pctFr(v)}.` : `Résultat net en baisse de ${pctFr(Math.abs(v))}.`
      )
    );
  }

  // Trésorerie
  if (indicateurs.freeCashFlow) {
    const { valeur, unite } = indicateurs.freeCashFlow;
    const montant = `${nombreFr(Math.abs(valeur), 2)}${unite ? ` ${unite}` : ""}`;
    criteres.push(
      critere(
        "tresorerie",
        "Génération de trésorerie",
        valeur > 0 ? "favorable" : valeur < 0 ? "defavorable" : "neutre",
        valeur >= 0
          ? `Free cash-flow positif de ${montant} : l'activité finance ses investissements.`
          : `Free cash-flow négatif de ${montant} : l'activité consomme de la trésorerie.`
      )
    );
  }

  // Endettement
  if (indicateurs.levierDetteNetteEbitda) {
    const v = indicateurs.levierDetteNetteEbitda.valeur;
    const verdict =
      v <= SEUILS.levierFaible ? "favorable" : v > SEUILS.levierEleve ? "defavorable" : "neutre";
    const lecture = {
      favorable: "endettement faible",
      neutre: "endettement modéré",
      defavorable: "endettement élevé",
    }[verdict];
    criteres.push(
      critere(
        "endettement",
        "Endettement",
        verdict,
        v < 0
          ? "Trésorerie nette positive : la société n'a pas de dette nette."
          : `Dette nette de ${nombreFr(v)} fois l'EBITDA : ${lecture} (repères usuels : ${nombreFr(SEUILS.levierFaible)} et ${nombreFr(SEUILS.levierEleve)} fois).`
      )
    );
  }

  // Perspectives : le sens mesuré prime sur le mot du communiqué
  {
    const sens = evolutionGuidance?.sens;
    const statut = indicateurs.guidanceStatut;
    const libelle = "Perspectives";
    if (sens === "relevee")
      criteres.push(
        critere(
          "guidance",
          libelle,
          "favorable",
          "Objectifs relevés par rapport à la publication précédente."
        )
      );
    else if (sens === "abaissee")
      criteres.push(
        critere(
          "guidance",
          libelle,
          "defavorable",
          "Objectifs abaissés par rapport à la publication précédente."
        )
      );
    else if (sens === "maintenue")
      criteres.push(critere("guidance", libelle, "neutre", "Objectifs maintenus à l'identique."));
    else if (statut === "relevée")
      criteres.push(critere("guidance", libelle, "favorable", "La société annonce relever ses objectifs."));
    else if (statut === "abaissée" || statut === "suspendue")
      criteres.push(
        critere(
          "guidance",
          libelle,
          "defavorable",
          `La société annonce des objectifs ${statut === "abaissée" ? "abaissés" : "suspendus"}.`
        )
      );
    else if (statut === "confirmée")
      criteres.push(critere("guidance", libelle, "neutre", "La société confirme ses objectifs."));
    else
      criteres.push(
        NON_EVALUABLE("guidance", libelle, "Aucun objectif chiffré ni confirmé dans le communiqué.")
      );
  }

  // Crédibilité : la société a-t-elle tenu ce qu'elle annonçait ?
  {
    const libelle = "Promesses tenues";
    if (!tenue || !fini(tenue.total) || tenue.total < 2) {
      criteres.push(
        NON_EVALUABLE(
          "tenue",
          libelle,
          "Pas assez de publications résumées pour juger les promesses passées."
        )
      );
    } else {
      const taux = tenue.tenues / tenue.total;
      const verdict =
        taux >= SEUILS.tenueBonne ? "favorable" : taux <= SEUILS.tenueFaible ? "defavorable" : "neutre";
      criteres.push(
        critere(
          "tenue",
          libelle,
          verdict,
          `Objectifs atteints ${tenue.tenues} fois sur ${tenue.total} dans les publications déjà résumées.`
        )
      );
    }
  }

  // Valorisation : le titre se paie-t-il plus ou moins que d'habitude ?
  {
    const libelle = "Valorisation";
    const per = contexte?.per;
    const med = contexte?.perMedian;
    if (!fini(per) || !fini(med) || per <= 0) {
      criteres.push(
        NON_EVALUABLE(
          "valorisation",
          libelle,
          `PER actuel ou historique indisponible : il faut trois exercices bénéficiaires pour une référence fiable${
            fini(contexte?.nbPer) ? ` (${contexte.nbPer} disponible${contexte.nbPer > 1 ? "s" : ""})` : ""
          }.`
        )
      );
    } else {
      const ecart = (per - med) / med;
      const verdict =
        ecart >= SEUILS.perEcartRelatif
          ? "defavorable"
          : ecart <= -SEUILS.perEcartRelatif
            ? "favorable"
            : "neutre";
      const lecture = {
        defavorable: "plus cher que d'habitude",
        favorable: "moins cher que d'habitude",
        neutre: "dans sa moyenne",
      }[verdict];
      criteres.push(
        critere(
          "valorisation",
          libelle,
          verdict,
          `PER de ${nombreFr(per)} contre ${nombreFr(med)} en médiane${surPeriode} : ${lecture}.`
        )
      );
    }
  }

  return criteres;
}

/** Décompte des verdicts, pour l'en-tête de la grille. */
export function bilanCriteres(criteres = []) {
  const bilan = { favorable: 0, neutre: 0, defavorable: 0, non_evaluable: 0 };
  for (const c of criteres) if (c?.verdict in bilan) bilan[c.verdict] += 1;
  return bilan;
}

// ─── 4. Lecture rédigée par le modèle ───────────────────────────────────────

export const PROMPT_INTERPRETATION = `Tu interprètes une publication de résultats pour un investisseur particulier, en la replaçant dans l'historique de la société.

TU REÇOIS
- le résumé de la publication et ses chiffres clés ;
- une GRILLE de critères déjà évalués par des règles explicites (croissance, marges, trésorerie, endettement, perspectives, promesses tenues, valorisation), chacun avec son verdict et sa justification ;
- l'historique de la société (exercices passés, médianes, consensus d'analystes).

RÈGLES ABSOLUES
- Ne contredis JAMAIS un verdict de la grille. Tu l'expliques, tu le relies aux autres, tu ne le rejuges pas.
- Chaque chiffre que tu cites doit figurer dans les données fournies, recopié tel quel. Ne calcule rien, n'arrondis rien.
- Si un critère est "non_evaluable", dis ce qui manque au lieu de combler le vide.
- Aucune recommandation d'achat, de vente ou de conservation, aucune cible de cours. Pas de "il faut", pas de "opportunité".
- Ton neutre et factuel, français courant.

RÉPONDS EN JSON STRICT, sans texte autour :
{
  "lecture": "3 à 5 phrases : ce que cette publication change dans la trajectoire de la société, au regard de son historique",
  "forces": ["point solide appuyé sur un critère favorable"],
  "vigilance": ["point d'attention appuyé sur un critère défavorable ou non évaluable"],
  "aSurveiller": ["ce qu'il faudra regarder à la prochaine publication"]
}`;

/** Données transmises au modèle pour la lecture : tout ce qu'il a le droit de citer. */
export function donneesInterpretation({ symbole, resume, criteres, contexte }) {
  return JSON.stringify(
    {
      societe: { symbole, nom: contexte?.nom, secteur: contexte?.secteur, industrie: contexte?.industrie },
      publication: {
        periode: resume?.indicateurs?.periode ?? null,
        precaution: precautionDePeriode(resume?.indicateurs?.periode),
        resume: resume?.resume ?? "",
        chiffres: (resume?.chiffres || []).map((c) => ({
          libelle: c.libelle,
          valeur: c.valeur,
          unite: c.unite,
          periode: c.periode,
        })),
        guidance: resume?.guidance?.texte ?? null,
      },
      grille: criteres.map(({ libelle, verdict, constat }) => ({ libelle, verdict, constat })),
      historique: contexte
        ? {
            periode: contexte.periode,
            exercices: contexte.exercices,
            references: contexte.references,
            consensus: contexte.consensus,
            surprises: contexte.surprises,
          }
        : "indisponible",
    },
    null,
    1
  );
}

const listeTextes = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()) : []);

/**
 * Lecture finale : les textes du modèle, et leur fiabilité.
 *
 * Tout nombre cité doit appartenir aux données transmises (le communiqué ou
 * le contexte). Un seul nombre introuvable marque la lecture « incertaine » :
 * on ne sait pas si c'est le seul endroit où le modèle a brodé.
 */
export function construireInterpretation(reponse, { texteSource = "", donnees = "" } = {}) {
  if (!reponse || typeof reponse !== "object") return null;
  const lecture = typeof reponse.lecture === "string" ? reponse.lecture.trim() : "";
  const forces = listeTextes(reponse.forces);
  const vigilance = listeTextes(reponse.vigilance);
  const aSurveiller = listeTextes(reponse.aSurveiller);
  if (!lecture && forces.length === 0 && vigilance.length === 0) return null;

  const reference = new Set([...chiffresDuTexte(texteSource), ...chiffresDuTexte(donnees)]);
  const cites = chiffresDuTexte([lecture, ...forces, ...vigilance, ...aSurveiller].join(" "));
  const douteux = [...cites].filter((n) => {
    // Les petits entiers (« 3 fois », « 2 trimestres », une année) se
    // retrouvent partout et ne trahissent aucune invention.
    if (Number.isInteger(n) && Math.abs(n) <= 12) return false;
    if (Number.isInteger(n) && n >= 1990 && n <= 2100) return false;
    for (const c of reference)
      if (Math.abs(Math.abs(c) - Math.abs(n)) <= 1e-9 * Math.max(1, Math.abs(n))) return false;
    return true;
  });

  return {
    lecture,
    forces,
    vigilance,
    aSurveiller,
    fiable: douteux.length === 0,
    chiffresDouteux: douteux.length,
  };
}
