import { useMemo } from "react";
import { Receipt } from "lucide-react";
import { Card, CardLabel, CARD_THEMES } from "./ui";
import { eur, pctPlain } from "../lib/finance";
import { coutDesFrais } from "../lib/performanceComparee";

/**
 * Le vrai coût des frais : ce qu'ils auraient rapporté s'ils étaient restés
 * investis.
 *
 * Le ratio « frais / performance » disait combien les frais mordaient sur le
 * gain ; il ne disait pas ce qu'ils coûtent à long terme. Un euro de frais
 * aujourd'hui est un euro qui ne compose plus — et c'est ce manque, pas
 * l'euro, qui pèse sur vingt ans.
 */
export default function CoutDesFrais({ operations = [], rendementAnnuelPct = null }) {
  const cout = useMemo(() => coutDesFrais(operations, rendementAnnuelPct), [operations, rendementAnnuelPct]);
  if (cout.frais <= 0) return null;

  return (
    <Card accent={CARD_THEMES.violet}>
      <CardLabel icon={Receipt}>Le vrai coût de tes frais</CardLabel>
      <p className="text-sm text-slate-200 mt-1">
        <span className="font-data tabular-nums ghost-blur">{eur(cout.frais, 2)}</span> de frais de courtage
        depuis le début
        {cout.nbOrdres > 0 && (
          <>
            , sur {cout.nbOrdres} ordre{cout.nbOrdres > 1 ? "s" : ""}
            {cout.fraisMoyenParOrdre != null && <> — {eur(cout.fraisMoyenParOrdre, 2)} en moyenne</>}
          </>
        )}
        .
      </p>
      {cout.fraisSurVolumePct != null && (
        <p className="text-micro text-slate-500 mt-0.5">
          Soit {pctPlain(cout.fraisSurVolumePct, 2)} des montants achetés et vendus.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 mt-3">
        {cout.projections.map((p) => (
          <div key={p.ans} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
            <div className="text-micro text-slate-500 uppercase tracking-wide">Dans {p.ans} ans</div>
            <div className="font-data tabular-nums font-bold text-rose-300 ghost-blur">{eur(p.valeur)}</div>
          </div>
        ))}
      </div>
      <p className="text-micro text-slate-500 mt-2">
        Ce que vaudraient ces frais s&apos;ils étaient restés investis à{" "}
        {cout.tauxMesure ? (
          <>ton rendement annualisé mesuré ({pctPlain(cout.taux, 1)} par an)</>
        ) : (
          <>{pctPlain(cout.taux, 0)} par an — une hypothèse, faute d&apos;un rendement mesurable sur ton historique</>
        )}
        . Une projection, pas une perte certaine : elle dit le prix d&apos;un ordre de plus.
      </p>
    </Card>
  );
}
