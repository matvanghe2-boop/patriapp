import { useId, useMemo, useState } from "react";
import {
  ShoppingCart, UtensilsCrossed, Car, House, Zap, Smartphone, Repeat, ShoppingBag, Ticket, Plane,
  Dumbbell, HeartPulse, Dices, Banknote, Landmark, FileText, ArrowUpRight, ArrowDownLeft, CircleDashed,
  Briefcase, Users, HandHeart, RotateCcw, CirclePlus, ArrowLeftRight, PiggyBank, Search, X,
} from "lucide-react";
import Montant from "./Montant";
import { CATEGORIES, categorie, LIBELLES_TYPE } from "../lib/compteCourant";

/**
 * Liste des opérations du compte courant, présentée comme dans une
 * application bancaire : regroupées par jour, le solde du soir en regard de
 * chaque date, le marchand ou la personne en titre, et le libellé brut de la
 * banque gardé pour le détail.
 */

export const ICONES_CATEGORIE = {
  courses: ShoppingCart,
  restauration: UtensilsCrossed,
  transport: Car,
  logement: House,
  factures: Zap,
  telecom: Smartphone,
  abonnements: Repeat,
  shopping: ShoppingBag,
  loisirs: Ticket,
  voyages: Plane,
  sport: Dumbbell,
  sante: HeartPulse,
  jeux: Dices,
  retraits: Banknote,
  frais: Landmark,
  impots: FileText,
  "virements-emis": ArrowUpRight,
  "autres-depenses": CircleDashed,
  salaire: Briefcase,
  "aide-familiale": Users,
  aides: HandHeart,
  remboursements: RotateCcw,
  "virements-recus": ArrowDownLeft,
  "autres-revenus": CirclePlus,
  "entre-mes-comptes": ArrowLeftRight,
  epargne: PiggyBank,
};

/**
 * Pastille de catégorie. La couleur dit la FAMILLE (dépense, revenu, simple
 * déplacement entre ses comptes), l'icône dit la catégorie : vingt-cinq
 * couleurs distinctes ne se distingueraient plus entre elles, et la couleur
 * ne porte jamais seule le sens — le nom de la catégorie est écrit à côté.
 */
export function PastilleCategorie({ id, taille = 18 }) {
  const Icone = ICONES_CATEGORIE[id] || CircleDashed;
  const famille = categorie(id).famille;
  const teinte =
    famille === "revenu"
      ? "bg-emerald-500/15 text-emerald-300"
      : famille === "interne"
        ? "bg-sky-500/15 text-sky-300"
        : "bg-slate-800 text-slate-300";
  return (
    <span className={`shrink-0 inline-flex items-center justify-center rounded-full w-9 h-9 ${teinte}`} aria-hidden="true">
      <Icone size={taille} />
    </span>
  );
}

/** Montant signé à la façon d'une banque : « +20,00 € » en vert, « −9,30 € » neutre. */
export function MontantSigne({ centimes, className = "" }) {
  const credit = centimes > 0;
  return (
    <span className={`whitespace-nowrap ${credit ? "text-emerald-300" : "text-slate-100"} ${className}`}>
      {credit ? "+" : ""}
      <Montant valeur={centimes / 100} decimales={2} />
    </span>
  );
}

function libelleJour(iso) {
  const texte = new Date(`${iso}T00:00:00`).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  return texte.charAt(0).toUpperCase() + texte.slice(1);
}

const dateCourte = (iso) => (iso ? iso.split("-").reverse().join("/") : "—");

const FILTRES = [
  { id: "tout", libelle: "Tout" },
  { id: "depense", libelle: "Dépenses" },
  { id: "revenu", libelle: "Revenus" },
  { id: "interne", libelle: "Entre mes comptes" },
];

export default function OperationsCompte({
  operations,
  soldes,
  // Nombre d'opérations par marchand ou contrepartie, sur TOUT l'historique :
  // une règle de classement s'applique à tous les mois, pas seulement au mois
  // affiché.
  nbParCle,
  filtreCategorie,
  onEffacerFiltreCategorie,
  onClasser,
}) {
  const [recherche, setRecherche] = useState("");
  const [famille, setFamille] = useState("tout");
  const [ouverte, setOuverte] = useState(null);
  const idRecherche = useId();

  const visibles = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return operations.filter((op) => {
      if (famille !== "tout" && op.famille !== famille) return false;
      if (filtreCategorie && op.categorie !== filtreCategorie) return false;
      if (!q) return true;
      return [op.analyse.titre, op.libelle, op.analyse.motif, ...(op.complements || [])]
        .filter(Boolean)
        .some((t) => t.toLowerCase().includes(q));
    });
  }, [operations, recherche, famille, filtreCategorie]);

  // Du plus récent au plus ancien, comme une appli bancaire ; à l'intérieur
  // d'une journée, l'ordre inverse du relevé, pour que le solde affiché en tête
  // du jour soit bien celui de la dernière opération.
  const jours = useMemo(() => {
    const triees = [...visibles].sort((a, b) => b.date.localeCompare(a.date) || b.ordre - a.ordre);
    const groupes = [];
    for (const op of triees) {
      const dernier = groupes[groupes.length - 1];
      if (dernier && dernier.date === op.date) dernier.operations.push(op);
      else groupes.push({ date: op.date, operations: [op] });
    }
    return groupes;
  }, [visibles]);

  return (
    <section aria-label="Opérations du mois" className="space-y-3">
      {/* Recherche et filtres sur deux lignes : dans la colonne de gauche du
          bureau, les quatre filtres laissaient à peine 200 px au champ. */}
      <div className="flex flex-col gap-2">
        <div className="relative flex-1">
          <label htmlFor={idRecherche} className="sr-only">Rechercher une opération</label>
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" aria-hidden="true" />
          <input
            id={idRecherche}
            type="search"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Marchand, personne, motif…"
            className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-lime-400/40"
          />
        </div>
        <div role="group" aria-label="Filtrer par famille" className="flex gap-1 overflow-x-auto">
          {FILTRES.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={famille === f.id}
              onClick={() => setFamille(f.id)}
              className={`whitespace-nowrap text-xs px-3 py-2 rounded-xl border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-400/40 ${
                famille === f.id
                  ? "border-lime-400/40 bg-lime-400/10 text-lime-200"
                  : "border-slate-800 text-slate-400 hover:text-slate-200"
              }`}
            >
              {f.libelle}
            </button>
          ))}
        </div>
      </div>

      {filtreCategorie && (
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span>Catégorie : <span className="text-slate-200">{categorie(filtreCategorie).libelle}</span></span>
          <button
            type="button"
            onClick={onEffacerFiltreCategorie}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-2 py-0.5 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-400/40"
          >
            <X size={12} aria-hidden="true" /> Retirer le filtre
          </button>
        </div>
      )}

      {jours.length === 0 ? (
        <p className="text-sm text-slate-500 py-6 text-center">Aucune opération ne correspond.</p>
      ) : (
        <div className="space-y-4">
          {jours.map((jour) => {
            const soldeSoir = soldes.get(jour.operations[0].id);
            return (
              <div key={jour.date}>
                <h3 className="flex items-baseline justify-between text-xs text-slate-500 px-1 pb-1.5 border-b border-slate-800/80">
                  <span className="font-medium text-slate-400">{libelleJour(jour.date)}</span>
                  {soldeSoir != null && (
                    <span>
                      Solde <Montant valeur={soldeSoir / 100} decimales={2} className="text-slate-400" />
                    </span>
                  )}
                </h3>
                <ul className="divide-y divide-slate-800/60">
                  {jour.operations.map((op) => (
                    <LigneOperation
                      key={op.id}
                      op={op}
                      solde={soldes.get(op.id)}
                      ouverte={ouverte === op.id}
                      onBasculer={() => setOuverte((id) => (id === op.id ? null : op.id))}
                      autresMemeCle={Math.max(0, (nbParCle.get(op.analyse.cle) || 1) - 1)}
                      onClasser={onClasser}
                    />
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function LigneOperation({ op, solde, ouverte, onBasculer, autresMemeCle, onClasser }) {
  const idDetail = useId();
  const cat = categorie(op.categorie);
  const sousTitre = [
    cat.libelle,
    LIBELLES_TYPE[op.analyse.type],
    op.analyse.motif ? `« ${op.analyse.motif} »` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <li>
      <button
        type="button"
        onClick={onBasculer}
        aria-expanded={ouverte}
        aria-controls={idDetail}
        className="w-full flex items-center gap-3 px-1 py-2.5 text-left rounded-lg hover:bg-slate-800/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-400/40"
      >
        <PastilleCategorie id={op.categorie} />
        <span className="flex-1 min-w-0">
          <span className="block text-sm text-slate-100 truncate">{op.analyse.titre}</span>
          <span className="block text-xs text-slate-500 truncate">{sousTitre}</span>
        </span>
        <MontantSigne centimes={op.montant} className="text-sm font-medium" />
      </button>
      {ouverte && (
        <DetailOperation id={idDetail} op={op} solde={solde} autresMemeCle={autresMemeCle} onClasser={onClasser} />
      )}
    </li>
  );
}

function DetailOperation({ id, op, solde, autresMemeCle, onClasser }) {
  const idSelect = useId();
  const idCase = useId();
  const [pourToutes, setPourToutes] = useState(autresMemeCle > 0);
  const { analyse } = op;

  const lignes = [
    ["Libellé bancaire", op.libelle],
    ...(op.complements?.length ? [["Compléments", op.complements.join(" · ")]] : []),
    ["Date d'opération", dateCourte(op.date)],
    ["Date de valeur", dateCourte(op.dateValeur)],
    ...(analyse.dateAchat ? [["Date d'achat", dateCourte(analyse.dateAchat)]] : []),
    ...(analyse.reference ? [["Référence", analyse.reference]] : []),
  ];

  return (
    <div id={id} className="mx-1 mb-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3 space-y-3 text-xs">
      <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1.5">
        {lignes.map(([terme, valeur]) => (
          <div key={terme} className="contents">
            <dt className="text-slate-500">{terme}</dt>
            <dd className="text-slate-300 break-words">{valeur}</dd>
          </div>
        ))}
        {solde != null && (
          <div className="contents">
            <dt className="text-slate-500">Solde après</dt>
            <dd className="text-slate-300">
              <Montant valeur={solde / 100} decimales={2} />
            </dd>
          </div>
        )}
      </dl>

      <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-2 border-t border-slate-800">
        <label htmlFor={idSelect} className="text-slate-500">Catégorie</label>
        <select
          id={idSelect}
          value={op.categorie}
          onChange={(e) => onClasser(op, e.target.value, { pourToutes })}
          className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-slate-100 focus:outline-none focus:ring-2 focus:ring-lime-400/40"
        >
          {["depense", "revenu", "interne"].map((f) => (
            <optgroup key={f} label={f === "depense" ? "Dépenses" : f === "revenu" ? "Revenus" : "Mouvements internes"}>
              {CATEGORIES.filter((c) => c.famille === f).map((c) => (
                <option key={c.id} value={c.id}>{c.libelle}</option>
              ))}
            </optgroup>
          ))}
        </select>
        {autresMemeCle > 0 && (
          <span className="flex items-center gap-1.5 text-slate-400">
            <input
              id={idCase}
              type="checkbox"
              checked={pourToutes}
              onChange={(e) => setPourToutes(e.target.checked)}
              className="accent-lime-400"
            />
            <label htmlFor={idCase}>
              {autresMemeCle === 1
                ? `Aussi pour l'autre opération « ${analyse.titre} »`
                : `Aussi pour les ${autresMemeCle} autres opérations « ${analyse.titre} »`}
            </label>
          </span>
        )}
      </div>
    </div>
  );
}
