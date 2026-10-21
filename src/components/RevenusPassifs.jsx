import { useEffect, useMemo, useState } from "react";
import { Sprout } from "lucide-react";
import { Card, CardLabel, CARD_THEMES } from "./ui";
import { AnneauProgression } from "./graphiques";
import { eur, pctPlain, nombre } from "../lib/finance";
import { revenusPassifsAnnuels, independanceFinanciere } from "../lib/revenusPassifs";

/**
 * Revenus passifs et indépendance financière.
 *
 * Deux lectures, sciemment séparées :
 *  - la COUVERTURE est un fait : la part de tes dépenses que paient déjà tes
 *    dividendes et tes intérêts ;
 *  - la RÈGLE DES 4 % est une convention, et l'écran le dit : elle vient
 *    d'études américaines sur des retraites de trente ans. Elle sert de
 *    repère, jamais de conseil.
 */

const reduitMouvement = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * Ce que les revenus passifs ont rapporté depuis l'ouverture de la page.
 * Rien d'autre qu'une division — mais voir le compteur avancer rend concret
 * un chiffre annuel qu'on ne se représente pas.
 */
function CompteurDepuisOuverture({ parSeconde }) {
  const [debut] = useState(() => Date.now());
  const [maintenant, setMaintenant] = useState(debut);
  const fige = reduitMouvement();

  useEffect(() => {
    if (fige || !(parSeconde > 0)) return undefined;
    const id = setInterval(() => setMaintenant(Date.now()), 1000);
    return () => clearInterval(id);
  }, [fige, parSeconde]);

  if (fige || !(parSeconde > 0)) return null;
  const gagne = ((maintenant - debut) / 1000) * parSeconde;
  // Assez de décimales pour que le compteur bouge à chaque seconde : avec
  // 500 € par an, quatre décimales restaient figées sur « 0,0000 € ».
  const decimales = Math.min(6, Math.max(2, Math.ceil(-Math.log10(parSeconde))));
  return (
    <p className="text-micro text-slate-500 mt-1">
      Depuis que cette page est ouverte :{" "}
      <span className="font-data tabular-nums text-emerald-300 ghost-blur">
        {gagne.toLocaleString("fr-FR", { minimumFractionDigits: decimales, maximumFractionDigits: decimales })} €
      </span>
    </p>
  );
}

export default function RevenusPassifs({
  bourse,
  livrets = [],
  profile = {},
  livretsTotal = 0,
  bourseTotal = 0,
  epargneMensuelle = 0,
  tauxAnnuelPct = 0,
}) {
  const revenus = useMemo(
    () => revenusPassifsAnnuels({ positions: bourse?.positions || [], enveloppe: bourse?.envelope || "PEA", livrets }),
    [bourse, livrets]
  );
  const independance = useMemo(
    () =>
      independanceFinanciere({
        revenusPassifs: revenus.total,
        depensesMensuelles: profile?.monthly_expenses,
        capitalFinancier: livretsTotal + bourseTotal,
        epargneMensuelle,
        tauxAnnuelPct,
      }),
    [revenus.total, profile?.monthly_expenses, livretsTotal, bourseTotal, epargneMensuelle, tauxAnnuelPct]
  );

  const parJour = revenus.total / 365;
  const revenuJournalier = ((Number(profile?.monthly_income) || 0) * 12) / 365;
  const joursDeRevenu = revenuJournalier > 0 ? revenus.total / revenuJournalier : null;

  const echeance = (mois) => {
    if (mois == null) return "au-delà de 50 ans au rythme actuel";
    if (mois === 0) return "déjà atteinte";
    const d = new Date();
    d.setMonth(d.getMonth() + mois);
    return `vers ${d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}, au rythme actuel`;
  };

  return (
    <Card accent={CARD_THEMES.emerald}>
      <CardLabel icon={Sprout}>Revenus passifs et indépendance</CardLabel>

      {revenus.total <= 0 ? (
        <p className="text-micro text-slate-500 mt-1">
          Aucun revenu passif connu pour l&apos;instant : ajoute le taux de tes livrets, ou actualise les
          cours pour récupérer le dividende de tes actions.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-5 mt-2">
          {independance && (
            <AnneauProgression
              valeur={Math.min(100, independance.couverturePct)}
              atteint={independance.couverturePct >= 100}
              taille={76}
              epaisseur={7}
              libelle="Part des dépenses couverte par les revenus passifs"
              className="shrink-0 text-emerald-400"
            />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm text-slate-200">
              Ton argent te rapporte{" "}
              <span className="font-data tabular-nums text-emerald-300 ghost-blur">{eur(parJour, 2)}</span> par jour
              ({eur(parJour / 24, 2)} par heure), soit{" "}
              <span className="font-data tabular-nums ghost-blur">{eur(revenus.total)}</span> par an.
            </p>
            <p className="text-micro text-slate-500 mt-0.5 ghost-blur">
              {eur(revenus.dividendes)} de dividendes nets et {eur(revenus.interets)} d&apos;intérêts de livrets
              {joursDeRevenu != null && (
                <>
                  {" "}— l&apos;équivalent de {nombre(joursDeRevenu, 1)} jours de ton revenu net
                </>
              )}
              .
            </p>
            <CompteurDepuisOuverture parSeconde={revenus.total / (365 * 24 * 3600)} />
          </div>
        </div>
      )}

      {independance ? (
        <div className="mt-3 pt-3 border-t border-slate-800 flex flex-col gap-1.5">
          <p className="text-micro text-slate-400">
            <span className="font-data tabular-nums text-slate-200">{pctPlain(independance.couverturePct, 0)}</span>{" "}
            de tes dépenses sont déjà payées par tes revenus passifs.
          </p>
          <p className="text-micro text-slate-400">
            Avec un retrait de 4 % par an, ton épargne financière financerait{" "}
            <span className="font-data tabular-nums text-slate-200">{pctPlain(independance.regleRetraitPct, 0)}</span>{" "}
            de tes dépenses. La cible de cette convention — 25 fois tes dépenses annuelles, soit{" "}
            <span className="font-data tabular-nums ghost-blur">{eur(independance.cible)}</span> — serait
            atteinte {echeance(independance.moisAvantCible)}.
          </p>
          <p className="text-micro text-slate-500">
            La règle des 4 % est une convention issue d&apos;études américaines sur des retraites de trente
            ans : un repère, pas une garantie ni un conseil.
          </p>
        </div>
      ) : (
        <p className="text-micro text-slate-500 mt-3 pt-3 border-t border-slate-800">
          Renseigne tes dépenses dans le profil mensuel pour voir la part qu&apos;en couvrent tes revenus
          passifs.
        </p>
      )}
    </Card>
  );
}
