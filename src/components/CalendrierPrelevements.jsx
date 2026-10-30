import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, ArrowDownLeft } from "lucide-react";
import { Card, CardLabel, CARD_THEMES } from "./ui";
import EtatVide from "./EtatVide";
import Montant from "./Montant";
import { todayIso } from "../lib/finance";
import { prelevementsDuMois } from "../lib/abonnements";

/**
 * Calendrier des prélèvements du mois.
 *
 * Un total mensuel ne dit pas QUAND l'argent part. Or c'est le moment qui
 * compte pour un compte courant serré : 120 € de prélèvements le 2 et un
 * salaire le 5 ne posent pas le même problème que les mêmes 120 € le 10. Les
 * revenus récurrents du relevé sont donc posés sur la même grille.
 */

const JOURS = ["L", "M", "M", "J", "V", "S", "D"];

function decaler(mois, n) {
  const [a, m] = mois.split("-").map(Number);
  const d = new Date(a, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const intensite = (part) =>
  part > 0.66 ? "bg-cyan-500/30" : part > 0.33 ? "bg-cyan-500/20" : "bg-cyan-500/10";

export default function CalendrierPrelevements({ subs = [], revenus = [] }) {
  const aujourdhui = todayIso();
  const [mois, setMois] = useState(aujourdhui.slice(0, 7));
  const cal = useMemo(() => prelevementsDuMois(subs, mois), [subs, mois]);

  const [a, m] = mois.split("-").map(Number);
  const libelleMois = new Date(a, m - 1, 1).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  // Lundi en première colonne, comme un calendrier français.
  const decalage = (new Date(a, m - 1, 1).getDay() + 6) % 7;
  const parJour = new Map(cal.jours.map((j) => [j.jour, j]));
  const max = Math.max(0, ...cal.jours.map((j) => j.total));
  const plusCharge = [...cal.jours].sort((x, y) => y.total - x.total)[0];

  const arrivees = new Map();
  for (const r of revenus) {
    if (!arrivees.has(r.jour)) arrivees.set(r.jour, []);
    arrivees.get(r.jour).push(r);
  }

  const cases = [...Array(decalage).fill(null), ...Array.from({ length: cal.nbJours }, (_, i) => i + 1)];

  return (
    <Card accent={CARD_THEMES.cyan}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <CardLabel icon={CalendarDays}>Calendrier des prélèvements</CardLabel>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setMois((x) => decaler(x, -1))}
            aria-label="Mois précédent"
            className="btn-flash w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800/70"
          >
            <ChevronLeft size={16} aria-hidden="true" />
          </button>
          <span className="min-w-[8.5rem] text-center text-corps text-slate-200 capitalize" aria-live="polite">
            {libelleMois}
          </span>
          <button
            type="button"
            onClick={() => setMois((x) => decaler(x, 1))}
            aria-label="Mois suivant"
            className="btn-flash w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800/70"
          >
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        </div>
      </div>

      {subs.length === 0 ? (
        <EtatVide picto="calendrier" titre="Rien à placer sur le calendrier">
          Ajoute un abonnement, ou suis ceux détectés sur ton compte, pour voir quand ils tombent.
        </EtatVide>
      ) : (
        <>
          <p className="text-mini text-slate-400 mt-2">
            <Montant valeur={cal.total} decimales={2} className="text-slate-100" /> prélevés ce mois-ci
            {plusCharge && (
              <>
                {" "}· jour le plus chargé : le {plusCharge.jour} (<Montant valeur={plusCharge.total} decimales={0} />)
              </>
            )}
          </p>

          {/* La grille est un repère visuel ; la liste jour par jour, plus bas,
              porte la même information pour un lecteur d'écran. */}
          <div className="grid grid-cols-7 gap-1 mt-3" aria-hidden="true">
            {JOURS.map((j, i) => (
              <div key={i} className="text-center text-micro text-slate-500 pb-1">
                {j}
              </div>
            ))}
            {cases.map((jour, i) => {
              if (jour == null) return <div key={`vide-${i}`} />;
              const p = parJour.get(jour);
              const r = arrivees.get(jour);
              const date = `${mois}-${String(jour).padStart(2, "0")}`;
              const estAujourdhui = date === aujourdhui;
              const description = [
                p && `${p.items.map((x) => x.sub.label).join(", ")}`,
                r && `arrivée : ${r.map((x) => x.titre).join(", ")}`,
              ]
                .filter(Boolean)
                .join(" · ");
              return (
                <div
                  key={jour}
                  title={description || undefined}
                  className={`relative min-h-[3.25rem] rounded-lg border px-1 py-1 flex flex-col justify-between ${
                    p ? `${intensite(max > 0 ? p.total / max : 0)} border-cyan-500/30` : "border-slate-800/70"
                  } ${estAujourdhui ? "ring-2 ring-cyan-400/60" : ""}`}
                >
                  <span className="flex items-center justify-between text-micro text-slate-500">
                    {jour}
                    {r && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
                  </span>
                  {p && <Montant valeur={p.total} decimales={0} className="text-micro text-slate-100 leading-none" />}
                </div>
              );
            })}
          </div>

          {revenus.length > 0 && (
            <p className="flex items-start gap-1.5 text-micro text-slate-500 mt-2">
              <ArrowDownLeft size={12} className="mt-0.5 shrink-0 etat-ok" aria-hidden="true" />
              <span>
                Point vert : l'argent arrive —{" "}
                {revenus
                  .slice(0, 3)
                  .map((r) => `${r.titre} vers le ${r.jour}`)
                  .join(", ")}
                , d'après tes relevés.
              </span>
            </p>
          )}

          {cal.jours.length > 0 && (
            <ol className="mt-4 divide-y divide-slate-800/70">
              {cal.jours.map((j) => (
                <li key={j.jour} className="flex items-start justify-between gap-3 py-2">
                  <span className="min-w-0">
                    <span className="block text-corps text-slate-200">
                      {new Date(`${j.date}T00:00:00`).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })}
                    </span>
                    <span className="block text-micro text-slate-500 truncate">
                      {j.items.map((x) => `${x.sub.label}${x.essai ? " (fin d'essai)" : ""}`).join(", ")}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <Montant valeur={j.total} decimales={2} className="block text-corps text-slate-100" />
                    <span className="block text-micro text-slate-500">
                      cumul <Montant valeur={j.cumul} decimales={0} />
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </Card>
  );
}
