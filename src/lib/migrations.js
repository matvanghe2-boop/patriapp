import { lireNombre } from "./finance";
import { FREQUENCES, STATUTS } from "./abonnements";
import { STATUTS_THESE } from "./theses";

/**
 * Migrations des données stockées.
 *
 * Chaque clé persistée est un blob JSON écrit par une version de l'app. Sa
 * FORME évolue — les abonnements ont gagné un statut, les thèses un fil de
 * relectures — et chaque composant compensait jusqu'ici à sa façon, avec des
 * `|| []` et des `?? "actif"` disséminés. Un oubli suffisait à casser un écran
 * sur des données écrites six mois plus tôt, ou arrivées d'un appareil resté
 * sur une ancienne version.
 *
 * Ici, chaque évolution de forme est une ÉTAPE numérotée, appliquée à toute
 * valeur qui entre dans l'application : lecture locale, réception du cloud,
 * restauration d'une sauvegarde. Deux règles :
 *
 *  · une étape est IDEMPOTENTE — appliquée à une donnée déjà à jour, elle la
 *    rend telle quelle (même référence). Les données n'ont donc pas besoin de
 *    porter leur numéro de version : on peut rejouer toutes les étapes à
 *    chaque lecture, sans rien réécrire ni repousser vers le cloud ;
 *  · une étape ne SUPPRIME jamais une information : elle complète, corrige un
 *    type ou renomme. Une ancienne version de l'app qui relit la donnée
 *    migrée y retrouve tous ses champs.
 *
 * `VERSION_DONNEES` est le numéro de la dernière étape. Il est écrit dans les
 * sauvegardes exportées : une sauvegarde faite par une version plus récente
 * est refusée à l'import, plutôt que restaurée dans une forme que cette
 * version ne comprend pas.
 */

/** Applique `f` à chaque élément ; rend le tableau d'origine si rien n'a changé. */
function chaqueElement(f) {
  return (liste) => {
    if (!Array.isArray(liste)) return liste;
    let change = false;
    const resultat = liste.map((x) => {
      if (!x || typeof x !== "object") return x;
      const y = f(x);
      if (y !== x) change = true;
      return y;
    });
    return change ? resultat : liste;
  };
}

/** Rend `objet` complété de `modifs` — ou `objet` lui-même si `modifs` est vide. */
const avec = (objet, modifs) => (Object.keys(modifs).length ? { ...objet, ...modifs } : objet);

const nombreOu = (v, defaut) => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = lireNombre(v);
  return n == null ? defaut : n;
};

export const ETAPES = {
  subs: [
    {
      version: 1,
      description: "Montant numérique, périodicité et statut valides",
      migrer: chaqueElement((s) => {
        const m = {};
        if (typeof s.montant !== "number") m.montant = nombreOu(s.montant, 0);
        if (!FREQUENCES[s.frequence]) m.frequence = "mensuelle";
        if (!STATUTS[s.statut]) m.statut = "actif";
        return avec(s, m);
      }),
    },
  ],
  contracts: [
    {
      version: 1,
      description: "Préavis numérique",
      migrer: chaqueElement((c) =>
        typeof c.preavis_jours === "number" ? c : avec(c, { preavis_jours: Math.max(0, Math.round(nombreOu(c.preavis_jours, 0))) })
      ),
    },
  ],
  strategyNotes: [
    {
      version: 2,
      description: "Statut valide, fil de relectures, objectif numérique",
      migrer: chaqueElement((n) => {
        const m = {};
        if (!STATUTS_THESE[n.statut]) m.statut = "intacte";
        if (!Array.isArray(n.revues)) m.revues = [];
        if (typeof n.archivee !== "boolean") m.archivee = Boolean(n.archivee);
        if (n.objectif_cours != null && typeof n.objectif_cours !== "number") {
          m.objectif_cours = nombreOu(n.objectif_cours, null);
        }
        return avec(n, m);
      }),
    },
  ],
  historyPast: [
    {
      version: 1,
      // `useDailySnapshot` écrit `{ date, value }`. Des relevés plus anciens,
      // saisis à la main ou importés, portaient `valeur`, `net` ou `total` :
      // `valeurReleve` les lisait tous, mais chaque nouveau lecteur devait le
      // savoir. On ramène tout à `value`, sans retirer l'ancien champ.
      description: "Valeur des relevés sous `value`",
      migrer: chaqueElement((p) => {
        if (typeof p.value === "number") return p;
        const v = Number(p.valeur ?? p.net ?? p.total);
        return Number.isFinite(v) ? { ...p, value: v } : p;
      }),
    },
  ],
};

export const VERSION_DONNEES = Math.max(...Object.values(ETAPES).flat().map((e) => e.version));

/**
 * Valeur d'une clé, mise à la forme courante. Une étape qui lève une erreur
 * (donnée trop abîmée pour être comprise) laisse la valeur telle quelle :
 * mieux vaut un écran qui se débrouille qu'une application qui ne démarre plus.
 */
export function migrer(cle, valeur) {
  const etapes = ETAPES[cle];
  if (!etapes || valeur == null) return valeur;
  return etapes.reduce((v, etape) => {
    try {
      return etape.migrer(v);
    } catch {
      return v;
    }
  }, valeur);
}

/** Une sauvegarde exportée par une version plus récente que celle-ci. */
export function sauvegardeTropRecente(dump) {
  const v = Number(dump?.__versionDonnees);
  return Number.isFinite(v) && v > VERSION_DONNEES;
}
