import { useMemo } from "react";
import { CreditCard, HeartPulse } from "lucide-react";
import { Card, CardLabel, PastilleEtat, CARD_THEMES } from "./ui";
import Montant from "./Montant";
import { MontantSigne } from "./OperationsCompte";
import { AnneauProgression } from "./graphiques";
import { serieSolde } from "../lib/compteCourant";
import { recurrences } from "../lib/analyseCompte";
import { scoreSante, joursADecouvert } from "../lib/santeFinanciere";

/**
 * Deux blocs du Dashboard nourris par le compte courant : un résumé du
 * compte, et le score de santé financière. Le Dashboard reste la porte
 * d'entrée — on y voit l'essentiel sans ouvrir l'onglet.
 */

const dateCourte = (iso) => (iso ? iso.split("-").reverse().join("/") : "—");

/** Solde estimé, reste à vivre et trois dernières opérations. */
export function ResumeCompteCourant({ compteSolde, compteEnrichies = [], budgetReel }) {
  const charges = useMemo(() => recurrences(compteEnrichies).charges, [compteEnrichies]);
  const dernieres = useMemo(
    () => [...compteEnrichies].sort((a, b) => b.date.localeCompare(a.date) || b.ordre - a.ordre).slice(0, 3),
    [compteEnrichies]
  );

  if (!compteSolde) {
    return (
      <Card accent={CARD_THEMES.lime}>
        <CardLabel icon={CreditCard}>Compte courant</CardLabel>
        <p className="text-sm text-slate-400">
          Importe tes relevés BoursoBank pour suivre ici ton solde, ton reste à vivre et tes dernières opérations.{" "}
          <a href="#/compte" className="text-lime-300 hover:underline">Ouvrir le compte courant</a>
        </p>
      </Card>
    );
  }

  const totalCharges = charges.reduce((s, c) => s + c.montant, 0);
  const resteAVivre = budgetReel ? budgetReel.revenus - totalCharges : null;

  return (
    <Card accent={CARD_THEMES.lime}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CardLabel icon={CreditCard}>Compte courant</CardLabel>
        <a href="#/compte" className="text-xs text-lime-300 hover:underline">Voir le détail</a>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <div className="text-micro text-slate-500">
            {compteSolde.ajustement ? "Solde estimé" : `Solde au ${dateCourte(compteSolde.date)}`}
          </div>
          <Montant valeur={compteSolde.solde / 100} decimales={2} className="font-display text-xl text-slate-100" />
        </div>
        <div>
          <div className="text-micro text-slate-500">Reste à vivre par mois</div>
          {resteAVivre == null ? (
            <span className="text-slate-500">—</span>
          ) : (
            <Montant
              valeur={resteAVivre / 100}
              decimales={0}
              className={`font-display text-xl ${resteAVivre >= 0 ? "text-emerald-300" : "text-rose-300"}`}
            />
          )}
        </div>
        <ul className="text-xs space-y-1 sm:col-span-1">
          {dernieres.map((op) => (
            <li key={op.id} className="flex justify-between gap-2">
              <span className="truncate text-slate-300">
                <span className="text-slate-500">{dateCourte(op.date).slice(0, 5)}</span> {op.analyse.titre}
              </span>
              <MontantSigne centimes={op.montant} />
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

/** Score de santé financière, critère par critère. */
export function SanteFinanciere({ matelasMois, tauxEpargne, profile, compteEnrichies = [], compteOperations = [], compteReleves = [], budgetReel }) {
  const sante = useMemo(() => {
    const charges = recurrences(compteEnrichies).charges.reduce((s, c) => s + c.montant, 0);
    const revenus = budgetReel?.revenus;
    const serie = compteReleves.length ? serieSolde(compteOperations, compteReleves) : [];
    return scoreSante({
      matelasMois,
      // Sans revenus connus, le taux d'épargne n'est pas mesuré : il est
      // écarté plutôt que noté zéro.
      tauxEpargnePct: profile?.monthly_income > 0 ? tauxEpargne : null,
      partChargesFixes: revenus > 0 ? charges / revenus : null,
      joursDecouvert: serie.length ? joursADecouvert(serie, 90) : null,
    });
  }, [matelasMois, tauxEpargne, profile, compteEnrichies, compteOperations, compteReleves, budgetReel]);

  if (!sante) return null;

  return (
    <Card>
      <CardLabel icon={HeartPulse}>Santé financière</CardLabel>
      <div className="flex flex-col sm:flex-row gap-5 sm:items-center">
        <div className="relative shrink-0 self-center">
          {/* Fragment vide en enfant : l'anneau n'affiche pas son « 100 % »
              par défaut, le score est écrit par-dessus en HTML. */}
          <AnneauProgression valeur={sante.score} taille={96} epaisseur={8} libelle="Score de santé financière" className="text-lime-400">
            <></>
          </AnneauProgression>
          <div className="absolute inset-0 flex flex-col items-center justify-center" aria-hidden="true">
            <span className="font-display text-2xl text-slate-50">{sante.score}</span>
            <span className="text-micro text-slate-500">sur 100</span>
          </div>
        </div>
        <ul className="flex-1 space-y-2">
          {sante.criteres.map((c) => (
            <li key={c.id} className="text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <PastilleEtat etat={c.etat}>{c.libelle}</PastilleEtat>
                <span className="text-slate-300">{c.valeur}</span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">{c.explication}</p>
            </li>
          ))}
        </ul>
      </div>
      <p className="text-micro text-slate-500 mt-3">
        Repères usuels, pas des normes. Un critère dont la donnée manque est écarté plutôt que noté zéro.
      </p>
    </Card>
  );
}
