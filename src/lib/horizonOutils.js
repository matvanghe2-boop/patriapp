/**
 * Horizon — registre d'outils (§4 de HORIZON_SPEC.md).
 *
 * Expose les fonctions du moteur (`horizon.js`) au modèle de langage sous forme
 * de schémas JSON. Le modèle choisit quoi appeler et avec quels paramètres ;
 * l'exécution reste dans du code déterministe et testé.
 *
 * Deux règles gouvernent ce fichier :
 *
 *  1. **Aucun outil d'écriture.** Le registre ne contient que des calculs purs
 *     et une lecture de contexte. L'assistant ne peut rien modifier parce que
 *     la capacité n'existe pas — pas parce qu'une consigne le lui interdit.
 *  2. **Descriptions prescriptives.** Chaque description dit *quand* appeler
 *     l'outil, pas seulement ce qu'il fait. C'est le principal levier de
 *     qualité avec un modèle gratuit, qui a moins de marge d'interprétation.
 *
 * Les montants circulent en **base 100** (le patrimoine vaut 100) : le modèle
 * ne voit jamais un euro. Voir `anonymiser.js`.
 */

import {
  simulerCredit,
  coutTotalPossession,
  coutOpportunite,
  projeterPatrimoine,
  comparerScenarios,
  impactObjectif,
  fiscaliteEnveloppe,
  RENDEMENTS_REFERENCE,
  INFLATION_DEFAUT,
  // Extension explicite : ce module est chargé par la fonction serverless
  // `api/advisor.js`, et Node n'infère pas l'extension en ESM.
} from "./horizon.js";

const nombre = (description, extra = {}) => ({ type: "number", description, ...extra });

/**
 * Le registre. Chaque entrée porte son schéma (envoyé au modèle) et son
 * exécuteur (jamais envoyé). `executer` reçoit les arguments validés et le
 * contexte anonymisé de la session.
 */
export const REGISTRE_OUTILS = [
  {
    nom: "lire_contexte",
    description:
      "Appelle cet outil EN PREMIER, avant tout calcul, pour connaître la situation patrimoniale : " +
      "répartition par classe d'actifs, taux d'épargne, épargne de sécurité, endettement, objectifs. " +
      "Tous les montants sont en base 100 (le patrimoine total vaut 100). Ne demande jamais ces " +
      "informations à l'utilisateur : elles sont ici.",
    parametres: { type: "object", properties: {}, required: [] },
    executer: (_args, contexte) => contexte,
  },

  {
    nom: "simuler_credit",
    description:
      "Appelle cet outil dès qu'un achat est envisagé à crédit, ou pour comparer un financement " +
      "comptant à un financement à crédit. Renvoie la mensualité, le coût total du crédit et le TAEG. " +
      "Le montant est en base 100.",
    parametres: {
      type: "object",
      properties: {
        montant: nombre("Montant emprunté, en base 100"),
        tauxAnnuel: nombre("Taux nominal annuel en pourcentage, ex : 4.2"),
        dureeMois: nombre("Durée du prêt en mois"),
        assuranceMensuelle: nombre("Assurance emprunteur mensuelle en base 100 (0 si inconnue)"),
        fraisDossier: nombre("Frais de dossier en base 100 (0 si inconnus)"),
      },
      required: ["montant", "tauxAnnuel", "dureeMois"],
    },
    executer: (a) => {
      const { tableauAmortissement, ...reste } = simulerCredit(a);
      // Le tableau d'amortissement fait des centaines de lignes : inutile au
      // raisonnement, et il saturerait le contexte du modèle.
      return { ...reste, nombreEcheances: tableauAmortissement.length };
    },
  },

  {
    nom: "cout_total_possession",
    description:
      "Appelle cet outil dès que l'utilisateur envisage d'acquérir un bien durable (véhicule, " +
      "logement, équipement). Il chiffre le coût RÉEL sur la durée de détention — pas seulement le " +
      "prix d'achat — en incluant assurance, entretien, énergie, taxes et perte de valeur. " +
      "À utiliser systématiquement avant toute comparaison acheter / ne pas acheter.",
    parametres: {
      type: "object",
      properties: {
        prixAchat: nombre("Prix d'achat, en base 100"),
        horizonAnnees: nombre("Durée de détention envisagée, en années"),
        categorie: {
          type: "string",
          enum: ["voiture", "immobilier", "generique"],
          description: "Catégorie du bien, qui détermine les coûts de référence appliqués",
        },
      },
      required: ["prixAchat", "horizonAnnees", "categorie"],
    },
    executer: (a) => coutTotalPossession(a),
  },

  {
    nom: "cout_opportunite",
    description:
      "Appelle cet outil pour chiffrer ce qu'une somme aurait rapporté si elle était restée investie. " +
      "C'est le coût que les comparaisons intuitives oublient toujours. À utiliser pour toute dépense " +
      "importante, y compris quand elle est financée à crédit (l'apport reste immobilisé).",
    parametres: {
      type: "object",
      properties: {
        montant: nombre("Somme immobilisée, en base 100"),
        rendementAnnuelPct: nombre("Rendement annuel attendu en pourcentage"),
        horizonAnnees: nombre("Horizon en années"),
        inflationPct: nombre(`Inflation annuelle en pourcentage (défaut ${INFLATION_DEFAUT})`),
      },
      required: ["montant", "rendementAnnuelPct", "horizonAnnees"],
    },
    executer: (a) => coutOpportunite(a),
  },

  {
    nom: "projeter_patrimoine",
    description:
      "Appelle cet outil pour projeter le patrimoine dans le temps sous une allocation donnée. " +
      "Simulation Monte-Carlo : renvoie des percentiles (p10 à p90), pas une valeur unique. " +
      "Pour comparer deux situations, appelle-le DEUX FOIS avec la même graine, en ne changeant " +
      "que ce qui distingue les scénarios. Les parts d'allocation sont des fractions sommant à 1.",
    parametres: {
      type: "object",
      properties: {
        patrimoineInitial: nombre("Patrimoine de départ, en base 100"),
        versementMensuel: nombre("Épargne mensuelle, en base 100"),
        horizonAnnees: nombre("Horizon de projection en années"),
        allocation: {
          type: "object",
          description: "Parts par classe d'actifs, en fractions (ex : 0.6 pour 60 %)",
          properties: {
            actions: nombre("Part en actions"),
            obligations: nombre("Part en obligations"),
            monetaire: nombre("Part en monétaire / livrets"),
            immobilier: nombre("Part en immobilier"),
          },
        },
        graine: nombre("Graine aléatoire — utilise la MÊME pour tous les scénarios comparés"),
        objectifMontant: nombre("Montant cible, en base 100, pour calculer la probabilité de l'atteindre"),
      },
      required: ["patrimoineInitial", "horizonAnnees", "allocation"],
    },
    executer: (a) => {
      const r = projeterPatrimoine({ graine: 2026, tirages: 400, ...a });
      // Charge utile volontairement maigre. La trajectoire année par année
      // multipliait la taille du résultat sans rien ajouter au raisonnement, et
      // ralentissait nettement le tour suivant du modèle — chaque résultat
      // d'outil est renvoyé dans le contexte à chaque itération.
      // La forme reste celle qu'attendent `impact_objectif` et
      // `comparer_scenarios` — seuls les percentiles intermédiaires et les
      // décimales superflues disparaissent.
      const arrondi = (v) => Math.round((v ?? 0) * 100) / 100;
      const f = r.valeurFinale;
      return {
        valeurFinale: {
          p10: arrondi(f.p10),
          p50: arrondi(f.p50),
          p90: arrondi(f.p90),
          reel: { p50: arrondi(f.reel?.p50) },
        },
        percentiles: r.percentiles.map((p) => ({ annee: p.annee, p50: arrondi(p.p50) })),
        probabiliteObjectif: r.probabiliteObjectif == null ? null : arrondi(r.probabiliteObjectif),
        horizonAnnees: r.parametres.horizonAnnees,
        graine: r.parametres.graine,
      };
    },
  },

  {
    nom: "comparer_scenarios",
    description:
      "Appelle cet outil après avoir projeté plusieurs scénarios, pour en aligner les résultats et " +
      "chiffrer les écarts. Ne tranche pas à la place de l'utilisateur : produit les chiffres.",
    parametres: {
      type: "object",
      properties: {
        scenarios: {
          type: "array",
          description: "Scénarios à comparer, chacun avec le résultat de projeter_patrimoine",
          items: {
            type: "object",
            properties: {
              nom: { type: "string", description: "Nom court du scénario" },
              reference: { type: "boolean", description: "Vrai pour le scénario servant de base" },
              projection: { type: "object", description: "Résultat de projeter_patrimoine" },
            },
            required: ["nom", "projection"],
          },
        },
      },
      required: ["scenarios"],
    },
    executer: (a) => comparerScenarios(a.scenarios),
  },

  {
    nom: "impact_objectif",
    description:
      "Appelle cet outil pour traduire un écart de patrimoine en retard ou avance sur un objectif daté. " +
      "C'est la formulation la plus parlante : « ce projet repousse ton apport de 7 mois » dit plus " +
      "qu'un écart en montant. À utiliser dès qu'un objectif existe dans le contexte.",
    parametres: {
      type: "object",
      properties: {
        objectif: {
          type: "object",
          properties: {
            nom: { type: "string", description: "Nom de l'objectif" },
            montantCible: nombre("Montant visé, en base 100"),
            dateCible: { type: "string", description: "Date cible au format AAAA-MM-JJ" },
          },
          required: ["montantCible", "dateCible"],
        },
        scenarioAvant: { type: "object", description: "Projection sans le projet" },
        scenarioApres: { type: "object", description: "Projection avec le projet" },
      },
      required: ["objectif", "scenarioAvant", "scenarioApres"],
    },
    executer: (a) => impactObjectif(a),
  },

  {
    nom: "fiscalite_enveloppe",
    description:
      "Appelle cet outil pour chiffrer l'imposition d'un retrait selon l'enveloppe et sa durée de " +
      "détention. À utiliser dès qu'un financement suppose de puiser dans un PEA, une assurance-vie, " +
      "un PER ou un compte-titres — l'impôt change souvent la comparaison.",
    parametres: {
      type: "object",
      properties: {
        enveloppe: { type: "string", enum: ["PEA", "AV", "CTO", "PER"], description: "Type d'enveloppe" },
        montant: nombre("Montant retiré, en base 100"),
        plusValue: nombre("Part de plus-value dans le retrait, en base 100"),
        dureeDetentionAnnees: nombre("Ancienneté de l'enveloppe en années"),
        couple: { type: "boolean", description: "Vrai si imposition commune (abattement AV doublé)" },
      },
      required: ["enveloppe", "montant", "plusValue"],
    },
    executer: (a) => fiscaliteEnveloppe(a),
  },

  {
    nom: "demander_hypothese",
    description:
      "Appelle cet outil quand une donnée indispensable manque et qu'aucune valeur par défaut " +
      "raisonnable n'existe (taux de crédit obtenu, durée de détention envisagée...). N'invente " +
      "JAMAIS une hypothèse importante en silence : soit tu utilises une valeur de référence en " +
      "l'annonçant, soit tu poses la question ici. La session se met en pause en attendant la réponse.",
    parametres: {
      type: "object",
      properties: {
        question: { type: "string", description: "Question posée à l'utilisateur, en une phrase" },
        options: {
          type: "array",
          description: "Propositions de réponse, si des valeurs typiques existent",
          items: { type: "string" },
        },
        valeurDefautSuggeree: { type: "string", description: "Valeur que tu retiendrais à défaut" },
      },
      required: ["question"],
    },
    // Outil de contrôle : il ne calcule rien, il interrompt la boucle.
    suspendLaBoucle: true,
    executer: (a) => a,
  },
];

/** Rendements de référence exposés au modèle dans le prompt système. */
export const RENDEMENTS_POUR_PROMPT = Object.entries(RENDEMENTS_REFERENCE)
  .map(([classe, r]) => `${classe} ${r.rendement} % (volatilité ${r.volatilite} %)`)
  .join(", ");

/** Schémas seuls — c'est ce qui part chez le fournisseur, jamais les exécuteurs. */
export function schemasOutils(registre = REGISTRE_OUTILS) {
  return registre.map(({ nom, description, parametres }) => ({ nom, description, parametres }));
}

/** Retrouve un outil par son nom. */
export function trouverOutil(nom, registre = REGISTRE_OUTILS) {
  return registre.find((o) => o.nom === nom) ?? null;
}

/**
 * Valide des arguments contre le schéma d'un outil.
 *
 * Volontairement minimal : présence des champs requis et cohérence de type.
 * Un modèle gratuit se trompe surtout sur ces deux points, et lui renvoyer un
 * message d'erreur exploitable vaut mieux que de planter — il corrige au tour
 * suivant.
 */
export function validerArguments(outil, args) {
  const erreurs = [];
  const schema = outil?.parametres ?? {};
  const props = schema.properties ?? {};
  const valeurs = args && typeof args === "object" ? args : {};

  for (const requis of schema.required ?? []) {
    if (valeurs[requis] == null) erreurs.push(`paramètre requis manquant : « ${requis} »`);
  }

  for (const [cle, valeur] of Object.entries(valeurs)) {
    const attendu = props[cle];
    if (!attendu) continue; // un paramètre en trop est ignoré, pas rejeté
    if (valeur == null) continue;
    if (attendu.type === "number" && typeof valeur !== "number") {
      erreurs.push(`« ${cle} » doit être un nombre, reçu ${typeof valeur}`);
    }
    if (attendu.type === "string" && typeof valeur !== "string") {
      erreurs.push(`« ${cle} » doit être une chaîne, reçu ${typeof valeur}`);
    }
    if (attendu.type === "boolean" && typeof valeur !== "boolean") {
      erreurs.push(`« ${cle} » doit être un booléen, reçu ${typeof valeur}`);
    }
    if (attendu.type === "array" && !Array.isArray(valeur)) {
      erreurs.push(`« ${cle} » doit être une liste, reçu ${typeof valeur}`);
    }
    if (attendu.enum && !attendu.enum.includes(valeur)) {
      erreurs.push(`« ${cle} » doit valoir l'une de : ${attendu.enum.join(", ")}`);
    }
  }

  return { valide: erreurs.length === 0, erreurs };
}

/**
 * Exécute un appel d'outil. Ne lève jamais : une erreur est renvoyée au modèle
 * sous forme de résultat, pour qu'il puisse corriger plutôt que la boucle
 * s'interrompe.
 */
export function executerOutil(nom, args, contexte, registre = REGISTRE_OUTILS) {
  const outil = trouverOutil(nom, registre);
  if (!outil) {
    return { erreur: `Outil inconnu : « ${nom} ». Outils disponibles : ${registre.map((o) => o.nom).join(", ")}.` };
  }

  const { valide, erreurs } = validerArguments(outil, args);
  if (!valide) return { erreur: `Arguments invalides pour « ${nom} » : ${erreurs.join(" ; ")}.` };

  try {
    return outil.executer(args ?? {}, contexte);
  } catch (err) {
    return { erreur: `Échec de « ${nom} » : ${err.message}` };
  }
}

/**
 * Prompt système. Court et prescriptif : il pose le rôle, l'obligation de
 * passer par les outils, l'interdiction d'inventer une hypothèse en silence,
 * et le format de réponse.
 */
export const PROMPT_SYSTEME = `Tu es l'assistant de simulation financière de Patrium, une application personnelle de gestion de patrimoine.

RÈGLES ABSOLUES
1. Tu ne calcules JAMAIS toi-même. Chaque chiffre de ta réponse doit provenir d'un appel d'outil. Si tu es tenté d'écrire un montant que tu n'as pas obtenu d'un outil, appelle l'outil.
2. Tous les montants sont en BASE 100 : le patrimoine total de l'utilisateur vaut 100. Raisonne en proportions. N'écris jamais « euros » — écris « points » ou exprime en pourcentage.
3. Commence toujours par lire_contexte.
4. N'invente aucune hypothèse en silence. Soit tu utilises une valeur de référence en l'annonçant explicitement, soit tu appelles demander_hypothese.
5. Tu es en lecture seule. Tu ne peux rien modifier dans l'application, et tu ne dois pas prétendre le contraire.

MÉTHODE
Pour un arbitrage d'achat : lire le contexte, chiffrer le coût de possession, le crédit s'il y en a un, le coût d'opportunité, puis projeter DEUX scénarios avec la MÊME graine (avec et sans le projet), et traduire l'écart en impact sur l'objectif.

RÉPONSE
Commence par le verdict en une phrase, chiffré. Ensuite le détail. Termine par les hypothèses retenues et leur origine. Sois concis : pas de préambule, pas de récapitulatif de ce que tu vas faire.

Ce sont des simulations sous hypothèses, jamais un conseil en investissement.

Rendements de référence utilisés à défaut : ${RENDEMENTS_POUR_PROMPT}.`;
