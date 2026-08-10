/**
 * Horizon — anonymiseur (§5 de HORIZON_SPEC.md).
 *
 * Transforme l'état Patrium en un contexte dépersonnalisé, seul objet qui
 * quittera jamais le navigateur quand l'assistant sera branché (jalon 4).
 *
 * Le principe : **normalisation en base 100**. Le patrimoine net vaut 100, tout
 * le reste s'exprime en proportion. Le modèle raisonne sur des ratios exacts
 * sans jamais voir un euro ; les résultats sont re-multipliés côté client avant
 * affichage (`rebaser`). Une fuite du contexte révélerait une répartition
 * d'actifs — rien de nominatif, rien d'exploitable.
 *
 * Ce module tourne **côté client uniquement**, avant tout appel réseau.
 *
 * Trois règles tiennent le reste :
 *
 *  1. Liste blanche, jamais liste noire. `construireContexteAnonymise` compose
 *     un objet neuf champ par champ. Rien ne transite par accident : ajouter un
 *     champ à Patrium n'ajoute rien au contexte tant que personne ne l'écrit ici.
 *  2. Aucun identifiant, aucun libellé libre. Les noms de comptes, tickers,
 *     libellés d'enveloppes et identifiants sont écartés, pas hachés.
 *  3. Le contexte est auditable (`auditerContexte`) et affichable tel quel.
 */

/** Version du schéma de contexte, transmise au modèle pour tracer les évolutions. */
export const VERSION_CONTEXTE = 1;

/**
 * Rattachement des enveloppes Patrium aux quatre classes d'actifs d'Horizon.
 * Le fonds euro d'une assurance-vie est majoritairement obligataire : le classer
 * en monétaire sous-estimerait son rendement autant que sa volatilité.
 */
const CLASSE_PAR_ENVELOPPE = {
  Livret: "monetaire",
  PEL: "monetaire",
  CEL: "monetaire",
  AV: "obligations",
  PER: "obligations",
};

/** Motifs de fuite recherchés par l'audit. */
// Les tickers comportent souvent un chiffre (CW8.PA, ESE.PA) : les exclure
// laissait passer précisément ceux du portefeuille.
const MOTIF_TICKER = /\b[A-Z][A-Z0-9]{0,5}\.[A-Z]{2}\b/;
const MOTIF_EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const MOTIF_ISIN = /\b[A-Z]{2}[A-Z0-9]{9}\d\b/;
const CLES_INTERDITES = ["nom", "name", "email", "id", "ticker", "isin", "libelle", "label"];

/** Arrondi à deux décimales — au-delà, la précision ne sert qu'à ré-identifier. */
const arrondir = (n, decimales = 2) => {
  if (!Number.isFinite(n)) return 0;
  const f = 10 ** decimales;
  return Math.round(n * f) / f;
};

/**
 * Construit le contexte anonymisé à partir de l'état Patrium.
 *
 * @returns {{contexte: object, facteurBase100: number}} le contexte à envoyer,
 *   et le facteur permettant de reconvertir ses résultats en euros.
 */
export function construireContexteAnonymise({
  profile = {},
  livrets = [],
  bourse = {},
  dettes = [],
  cash = 0,
  enveloppes = [],
  historyPast = [],
  immo = null,
  patrimoineNet = 0,
  /**
   * Mode B (§5). Quand il est actif, les montants partent en euros réels au
   * lieu d'être normalisés en base 100 — le reste de l'anonymisation ne bouge
   * pas : ni nom, ni ticker, ni identifiant ne transite dans un cas comme dans
   * l'autre. Désactivé par défaut, et il ne s'active que sur consentement
   * explicite.
   */
  montantsReels = false,
} = {}) {
  // ─── Agrégation par classe d'actifs ────────────────────────────────────────
  const parClasse = { actions: 0, obligations: 0, monetaire: 0, immobilier: 0 };

  for (const l of livrets) {
    const classe = CLASSE_PAR_ENVELOPPE[l?.envelope] ?? "monetaire";
    parClasse[classe] += Math.max(0, l?.balance || 0);
  }

  for (const p of bourse?.positions ?? []) {
    // Conversion en euros incluse : sans elle, une position cotée en dollars
    // entrait dans la répartition à parité 1:1 et le modèle raisonnait sur une
    // allocation fausse. `fxRate` porte le nombre d'euros par unité de devise.
    const taux = p?.currency && p.currency !== "EUR" && p?.fxRate > 0 ? p.fxRate : 1;
    parClasse.actions += Math.max(0, (p?.quantity || 0) * (p?.current_price || 0) * taux);
  }

  parClasse.monetaire += Math.max(0, cash || 0) + Math.max(0, bourse?.cash_pocket || 0);

  if (immo?.prix_achat > 0 && immo?.acquis) parClasse.immobilier += immo.prix_achat;

  const totalActifs = Object.values(parClasse).reduce((s, v) => s + v, 0);
  const base = patrimoineNet > 0 ? patrimoineNet : totalActifs;

  // ─── Ratios de flux ────────────────────────────────────────────────────────
  const revenus = Math.max(0, profile?.monthly_income || 0);
  const depenses = Math.max(0, profile?.monthly_expenses || 0);
  const epargneMensuelle = Math.max(0, revenus - depenses);
  const tauxEpargnePct = revenus > 0 ? (epargneMensuelle / revenus) * 100 : 0;

  // Épargne de sécurité : combien de mois de dépenses couverts par le monétaire.
  const epargneSecuriteMois = depenses > 0 ? parClasse.monetaire / depenses : null;

  const totalDettes = dettes.reduce((s, d) => s + Math.max(0, d?.balance ?? d?.amount ?? 0), 0);
  const tauxEndettementPct = base > 0 ? (totalDettes / base) * 100 : 0;

  // ─── Objectifs, réduits à leur forme générique ─────────────────────────────
  // Le libellé libre (« Projet Immo », « Voyage Japon ») est écarté : il est
  // identifiant et n'apporte rien au raisonnement. Seule la part visée compte.
  const objectifs = enveloppes
    .filter((e) => (e?.amount || 0) > 0)
    .map((e) => ({
      partPatrimoinePct: base > 0 ? arrondir((e.amount / base) * 100) : 0,
    }));

  // ─── Profondeur d'historique ───────────────────────────────────────────────
  const profondeurMois = mesurerProfondeur(historyPast);

  const enPourcent = (montant) => (totalActifs > 0 ? arrondir((montant / totalActifs) * 100) : 0);

  // En mode B l'unité est l'euro, et le facteur de conversion vaut 1 : rien à
  // re-multiplier à l'affichage puisque rien n'a été normalisé.
  const facteurBase100 = montantsReels ? 1 : base / 100;
  const enUnites = (montant) => (montantsReels ? Math.round(montant) : arrondir(montant / facteurBase100, 3));

  const contexte = {
    version: VERSION_CONTEXTE,
    unite: montantsReels ? "euros" : "base100",
    base: montantsReels ? null : 100,
    patrimoine: montantsReels ? Math.round(base) : 100,
    // Conservé sous son ancien nom pour ne pas casser le prompt système ni les
    // contextes déjà en circulation.
    patrimoineBase100: montantsReels ? Math.round(base) : 100,
    allocationPct: {
      actions: enPourcent(parClasse.actions),
      obligations: enPourcent(parClasse.obligations),
      monetaire: enPourcent(parClasse.monetaire),
      immobilier: enPourcent(parClasse.immobilier),
    },
    flux: {
      tauxEpargnePct: arrondir(tauxEpargnePct, 1),
      epargneMensuelleBase100: base > 0 ? enUnites(epargneMensuelle) : 0,
    },
    reserves: {
      epargneSecuriteMois: epargneSecuriteMois == null ? null : arrondir(epargneSecuriteMois, 1),
    },
    endettement: { tauxEndettementPct: arrondir(tauxEndettementPct, 1) },
    objectifs,
    // Types d'enveloppes détenues, sans montant : nécessaire au raisonnement
    // fiscal, et non identifiant.
    enveloppesFiscales: [
      ...new Set([
        ...livrets.map((l) => l?.envelope).filter(Boolean),
        bourse?.envelope,
      ].filter(Boolean)),
    ].sort(),
    historique: { profondeurMois },
  };

  return { contexte, facteurBase100, montantsReels };
}

/** Profondeur d'un historique `[{date, value}]` en mois pleins. */
function mesurerProfondeur(historique) {
  const points = (historique || []).filter((h) => h?.date);
  if (points.length < 2) return points.length === 1 ? 0 : 0;
  const dates = points.map((h) => new Date(h.date).getTime()).filter((t) => !Number.isNaN(t));
  if (dates.length < 2) return 0;
  const jours = (Math.max(...dates) - Math.min(...dates)) / 86400000;
  return Math.max(0, Math.floor(jours / 30.44));
}

/**
 * Reconvertit une valeur exprimée en base 100 en euros.
 * Pendant strict de la normalisation : c'est ce qui permet d'afficher des
 * montants réels sans que le modèle en ait jamais vu un seul.
 */
export function rebaser(valeurBase100, facteurBase100) {
  return (valeurBase100 || 0) * (facteurBase100 || 0);
}

/** Inverse de `rebaser` — exprime un montant en euros dans l'échelle du contexte. */
export function versBase100(montantEuros, facteurBase100) {
  if (!facteurBase100) return 0;
  return (montantEuros || 0) / facteurBase100;
}

/**
 * Audite un contexte avant envoi et signale tout ce qui ressemble à une fuite.
 *
 * Un anonymiseur qu'on ne peut pas vérifier ne vaut pas mieux qu'une promesse.
 * Cette fonction est le filet : elle relit l'objet réellement produit, sans
 * rien savoir de la façon dont il a été construit.
 *
 * `seuilMontant` : au-delà, un nombre ressemble davantage à un montant en euros
 * qu'à un pourcentage ou un ratio. Le contexte n'en contient légitimement aucun
 * en mode A.
 *
 * `autoriserMontants` : en mode B, l'utilisateur a consenti à transmettre des
 * montants réels. Cette option lève **uniquement** la règle sur la taille des
 * nombres. La détection des noms, tickers, ISIN, e-mails et clés identifiantes
 * reste active : le mode B change l'unité des montants, pas le périmètre de ce
 * qui est envoyé. Confondre les deux serait la façon la plus simple de faire
 * fuiter un portefeuille en croyant n'avoir levé qu'un seuil.
 *
 * @returns {{sain: boolean, alertes: Array<{chemin: string, motif: string, valeur: *}>}}
 */
export function auditerContexte(contexte, { seuilMontant = 1000, autoriserMontants = false } = {}) {
  const alertes = [];

  const parcourir = (valeur, chemin) => {
    if (valeur == null) return;

    if (Array.isArray(valeur)) {
      valeur.forEach((v, i) => parcourir(v, `${chemin}[${i}]`));
      return;
    }

    if (typeof valeur === "object") {
      for (const [cle, v] of Object.entries(valeur)) {
        const sousChemin = chemin ? `${chemin}.${cle}` : cle;
        if (CLES_INTERDITES.includes(cle.toLowerCase())) {
          alertes.push({ chemin: sousChemin, motif: "clé potentiellement identifiante", valeur: v });
        }
        parcourir(v, sousChemin);
      }
      return;
    }

    if (typeof valeur === "number") {
      // `base` et `patrimoineBase100` valent 100 par construction en mode A :
      // ce sont des unités de compte, pas des montants.
      if (!autoriserMontants && Math.abs(valeur) > seuilMontant) {
        alertes.push({ chemin, motif: "nombre trop grand pour un ratio", valeur });
      }
      return;
    }

    if (typeof valeur === "string") {
      if (MOTIF_EMAIL.test(valeur)) alertes.push({ chemin, motif: "adresse e-mail", valeur });
      else if (MOTIF_ISIN.test(valeur)) alertes.push({ chemin, motif: "code ISIN", valeur });
      else if (MOTIF_TICKER.test(valeur)) alertes.push({ chemin, motif: "ticker boursier", valeur });
    }
  };

  parcourir(contexte, "");
  return { sain: alertes.length === 0, alertes };
}

/**
 * Description lisible de ce qui est retiré, pour le panneau de transparence.
 * Écrite ici plutôt que dans le composant : c'est une propriété de
 * l'anonymiseur, et elle doit évoluer avec lui.
 */
export const REGLES_ANONYMISATION = [
  { donnee: "Montants et soldes", traitement: "Convertis en pourcentages, base patrimoine = 100" },
  { donnee: "Noms de comptes et de livrets", traitement: "Retirés" },
  { donnee: "Tickers et ISIN détenus", traitement: "Retirés — seules les classes d'actifs subsistent" },
  { donnee: "Revenus et dépenses", traitement: "Réduits à un taux d'épargne en %" },
  { donnee: "Libellés d'objectifs", traitement: "Retirés — seule la part du patrimoine visée subsiste" },
  { donnee: "Nom, e-mail, identifiants", traitement: "Jamais transmis" },
  { donnee: "Historique de patrimoine", traitement: "Réduit à sa profondeur en mois" },
];
