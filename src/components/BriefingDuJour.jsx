import { useMemo } from "react";
import { Sunrise, TrendingUp, TrendingDown, CalendarDays, Minus } from "lucide-react";
import { Card, CARD_THEMES } from "./ui";
import { todayIso } from "../lib/finance";
import { construireBriefing } from "../lib/briefing";

/**
 * Briefing du jour, en tête du Dashboard.
 *
 * Quelques phrases — la séance et la ligne qui l'a faite, le rendez-vous de
 * la semaine, les dividendes du mois, l'objectif le plus proche — pour
 * savoir où l'on en est avant de dérouler le reste. Rien n'est écrit sans
 * donnée fiable derrière : sans cours ni agenda, le bloc ne s'affiche pas.
 */

const ICONES = {
  hausse: { Icone: TrendingUp, classe: "text-emerald-400" },
  baisse: { Icone: TrendingDown, classe: "text-rose-400" },
  neutre: { Icone: Minus, classe: "text-slate-400" },
  info: { Icone: CalendarDays, classe: "text-sky-400" },
};

export default function BriefingDuJour({
  bourse,
  objectifs = [],
  patrimoineNet = 0,
  epargneMensuelle = 0,
  tauxAnnuelPct = 0,
  recordDuJour = null,
}) {
  const aujourdhui = todayIso();
  const phrases = useMemo(
    () =>
      construireBriefing({
        positions: bourse?.positions || [],
        envelope: bourse?.envelope || "PEA",
        objectifs,
        patrimoineNet,
        epargneMensuelle,
        tauxAnnuelPct,
        coursDuJour: String(bourse?.pricesUpdatedAt || "").slice(0, 10) === aujourdhui,
        recordDuJour,
        aujourdhui,
      }),
    [bourse, objectifs, patrimoineNet, epargneMensuelle, tauxAnnuelPct, recordDuJour, aujourdhui]
  );

  if (phrases.length === 0) return null;

  const jour = new Date(`${aujourdhui}T12:00:00Z`).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });

  return (
    <Card accent={CARD_THEMES.emerald}>
      <div className="flex items-center gap-2 text-micro uppercase tracking-wider text-slate-500">
        <Sunrise size={13} aria-hidden="true" />
        <span>Briefing · {jour}</span>
      </div>
      <ul className="mt-2 flex flex-col gap-1.5">
        {phrases.map((p) => {
          const { Icone, classe } = ICONES[p.ton] || ICONES.info;
          return (
            <li key={p.cle} className="flex items-start gap-2 text-sm text-slate-200">
              <Icone size={14} className={`shrink-0 mt-0.5 ${classe}`} aria-hidden="true" />
              <span className="ghost-blur">{p.texte}</span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
