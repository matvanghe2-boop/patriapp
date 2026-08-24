import { useMemo, useState } from "react";
import { History, ShoppingCart, Banknote, Coins, Target, Split, ArrowDownLeft } from "lucide-react";
import { CarteFocalisable, CardLabel } from "./ui";
import EtatVide from "./EtatVide";
import Montant from "./Montant";
import { lireNombre } from "../lib/finance";

/**
 * Frise unifiée — onglet Stratégie & Logs.
 *
 * PLACÉ ICI ET PAS AILLEURS : cet onglet porte déjà la Timeline des jalons et
 * le journal d'opérations. Ce sont les deux moitiés d'une même chose, tenues
 * séparées, et la frise les réunit là où elles vivent déjà — plutôt que de
 * créer un quatrième endroit où regarder.
 *
 * Ce qu'aucun écran ne montrait : la SUCCESSION. Les achats et ventes vivent
 * dans le journal, les dividendes dans le suivi, les jalons dans la Timeline,
 * les objectifs atteints nulle part. Savoir qu'un achat a suivi de trois jours
 * un versement, ou qu'un objectif est tombé le mois d'une vente, ne se lit
 * dans aucun de ces écrans pris isolément.
 */

const TYPES = {
  ACHAT: { icone: ShoppingCart, couleur: "violet", libelle: "Achat" },
  VENTE: { icone: Banknote, couleur: "amber", libelle: "Vente" },
  DIVIDENDE: { icone: Coins, couleur: "emerald", libelle: "Dividende" },
  VERSEMENT: { icone: ArrowDownLeft, couleur: "indigo", libelle: "Versement" },
  RETRAIT: { icone: ArrowDownLeft, couleur: "rose", libelle: "Retrait" },
  SPLIT: { icone: Split, couleur: "cyan", libelle: "Division" },
  OBJECTIF: { icone: Target, couleur: "amber", libelle: "Objectif atteint" },
};

const CLASSES_POINT = {
  violet: "bg-violet-400",
  amber: "bg-amber-400",
  emerald: "bg-emerald-400",
  indigo: "bg-indigo-400",
  rose: "bg-rose-400",
  cyan: "bg-cyan-400",
};

function formatDate(iso) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Montant signé d'une opération, du point de vue du compte. */
function montantDe(op) {
  const q = lireNombre(op.quantity) ?? 0;
  const p = lireNombre(op.price) ?? 0;
  const f = lireNombre(op.fees) ?? 0;
  switch (op.type) {
    case "ACHAT": return -(q * p + f);
    case "VENTE": return q * p - f;
    case "DIVIDENDE": return Math.abs(lireNombre(op.amount ?? op.montantNet) ?? 0);
    case "VERSEMENT": return Math.abs(lireNombre(op.amount) ?? 0);
    case "RETRAIT": return -Math.abs(lireNombre(op.amount) ?? 0);
    default: return null;
  }
}

export default function FriseUnifiee({ operations = [], objectifs = [], patrimoineNet = 0, limite = 30 }) {
  const [tout, setTout] = useState(false);

  const evenements = useMemo(() => {
    const liste = [];

    for (const op of operations) {
      if (!op?.date) continue;
      const t = TYPES[op.type];
      if (!t) continue;
      liste.push({
        id: `op-${op.id}`,
        date: op.date,
        type: op.type,
        libelle: `${t.libelle}${op.asset ? ` · ${op.asset}` : ""}`,
        detail: op.quantity ? `${op.quantity} × ${lireNombre(op.price) ?? 0} €` : op.broker || "",
        montant: montantDe(op),
      });
    }

    /*
     * Un objectif atteint n'a pas de date propre : rien ne l'enregistre au
     * moment du franchissement. On le place donc à son ÉCHÉANCE, et seulement
     * s'il est effectivement atteint — inventer une date de franchissement
     * serait exactement le genre de chiffre plausible et faux que le reste de
     * l'application refuse.
     */
    for (const o of objectifs) {
      const cible = lireNombre(o?.cible) ?? 0;
      if (!o?.echeance || cible <= 0 || patrimoineNet < cible) continue;
      liste.push({
        id: `obj-${o.id}`,
        date: o.echeance,
        type: "OBJECTIF",
        libelle: `Objectif atteint · ${o.libelle || "sans nom"}`,
        detail: "à l'échéance",
        montant: cible,
      });
    }

    return liste.sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [operations, objectifs, patrimoineNet]);

  const visibles = tout ? evenements : evenements.slice(0, limite);

  return (
    <CarteFocalisable titre="Frise des événements" icon={History} accent="teinte-rose carte-domaine">
      <CardLabel icon={History}>Frise des événements</CardLabel>

      {evenements.length === 0 ? (
        <EtatVide picto="notes" titre="Aucun événement daté">
          Les achats, ventes, dividendes et objectifs atteints se rangeront ici dans l'ordre, dès
          qu'une opération sera saisie dans le journal.
        </EtatVide>
      ) : (
        <>
          <ol className="frise-unifiee mt-3">
            {visibles.map((e) => {
              const t = TYPES[e.type];
              const Icone = t.icone;
              return (
                <li key={e.id} className="frise-ev">
                  <span className={`frise-point ${CLASSES_POINT[t.couleur]}`} aria-hidden="true" />
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <span className="flex items-center gap-1.5 text-corps text-slate-200">
                        <Icone size={13} className="shrink-0 text-slate-500" aria-hidden="true" />
                        <span className="truncate">{e.libelle}</span>
                      </span>
                      <span className="block text-micro text-slate-500 mt-0.5">
                        {formatDate(e.date)}
                        {e.detail && ` · ${e.detail}`}
                      </span>
                    </div>
                    {Number.isFinite(e.montant) && (
                      <Montant
                        valeur={e.montant}
                        decimales={0}
                        className={`shrink-0 text-corps ${e.montant >= 0 ? "etat-ok" : "text-slate-300"}`}
                      />
                    )}
                  </div>
                </li>
              );
            })}
          </ol>

          {evenements.length > limite && (
            <button
              onClick={() => setTout((t) => !t)}
              className="btn-flash text-mini text-slate-500 hover:text-slate-200 mt-3"
            >
              {tout ? "Réduire" : `Voir les ${evenements.length - limite} événements plus anciens`}
            </button>
          )}
        </>
      )}
    </CarteFocalisable>
  );
}
