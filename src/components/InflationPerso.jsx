import { useMemo } from "react";
import { TrendingUp } from "lucide-react";
import { Card, CardLabel, PastilleEtat, CARD_THEMES } from "./ui";
import Montant from "./Montant";
import { pct, pctPlain } from "../lib/finance";
import { inflationCharges, inflationOfficielle } from "../lib/inflation";

/**
 * Ton inflation à toi — mesurée sur tes charges récurrentes, seul endroit
 * d'un relevé où une hausse de dépense est sûrement une hausse de PRIX (même
 * service, même fréquence). Mise en regard de l'inflation officielle, avec
 * ses périodes respectives : elles ne sont pas les mêmes, et le dire évite de
 * comparer trois mois à un an sans le savoir.
 */
export default function InflationPerso({ enrichies = [] }) {
  const mesure = useMemo(() => inflationCharges(enrichies), [enrichies]);
  const officielle = inflationOfficielle();
  if (!mesure) return null;

  const dateOfficielle = officielle.date
    ? new Date(`${officielle.date}T00:00:00`).toLocaleDateString("fr-FR", { month: "long", year: "numeric" })
    : null;
  const variees = mesure.lignes.filter((l) => Math.abs(l.variationPct) > 0.5);

  return (
    <Card accent={CARD_THEMES.lime}>
      <CardLabel icon={TrendingUp}>Ton inflation à toi</CardLabel>
      <div className="grid grid-cols-2 gap-4 mt-3">
        <div>
          <div className="text-micro text-slate-500 uppercase tracking-wide">Tes charges récurrentes</div>
          <div className={`font-display text-chiffre mt-1 ${mesure.variationPct > officielle.tauxPct ? "etat-attention" : "text-slate-50"}`}>
            {pct(mesure.variationPct)}
          </div>
          <div className="text-micro text-slate-500 mt-1">en {mesure.moisObserves} mois de relevés</div>
        </div>
        <div>
          <div className="text-micro text-slate-500 uppercase tracking-wide">Inflation officielle</div>
          <div className="font-display text-chiffre mt-1 text-slate-300">{pctPlain(officielle.tauxPct, 1)}</div>
          <div className="text-micro text-slate-500 mt-1">
            sur un an{officielle.source ? ` (${officielle.source}${dateOfficielle ? `, ${dateOfficielle}` : ""})` : ""}
          </div>
        </div>
      </div>

      {variees.length > 0 ? (
        <ul className="mt-4 divide-y divide-slate-800/70">
          {variees.slice(0, 6).map((l) => (
            <li key={`${l.titre}-${l.depuis}`} className="flex items-center justify-between gap-3 py-2">
              <span className="min-w-0">
                <span className="block text-corps text-slate-200 truncate">{l.titre}</span>
                <span className="block text-micro text-slate-500">
                  <Montant valeur={l.avant / 100} decimales={2} /> → <Montant valeur={l.apres / 100} decimales={2} />
                </span>
              </span>
              <PastilleEtat etat={l.variationPct > 0 ? "attention" : "ok"} className="shrink-0">
                {pct(l.variationPct)}
              </PastilleEtat>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-mini text-slate-400 mt-3">
          Aucun de tes {mesure.lignes.length} prélèvements récurrents n'a changé de prix sur la période.
        </p>
      )}

      <p className="text-micro text-slate-500 mt-3">
        Mesurée sur les seuls prélèvements récurrents : ailleurs, une dépense qui monte peut venir d'achats plus
        nombreux autant que de prix plus élevés. Les deux taux ne couvrent pas la même période.
      </p>
    </Card>
  );
}
