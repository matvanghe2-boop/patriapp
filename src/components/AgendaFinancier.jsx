import { useId, useMemo, useState } from "react";
import { CalendarRange, Landmark, PiggyBank, TrendingUp, FileText, Target } from "lucide-react";
import { Card, CardLabel, PastilleEtat, CARD_THEMES } from "./ui";
import EtatVide from "./EtatVide";
import { usePersistentState } from "../lib/storage";
import { evenementsAgenda, zoneDeclaration } from "../lib/agendaFinancier";

/**
 * Agenda financier de l'année : impôts, épargne, PEA, contrats et objectifs
 * sur douze mois, mois par mois. Les dates estimées sont signalées comme
 * telles (voir agendaFinancier.js).
 */
const ICONES = { impots: Landmark, epargne: PiggyBank, bourse: TrendingUp, contrats: FileText, objectifs: Target };
const VISIBLES = 6;
const DEPARTEMENTS = [
  ...Array.from({ length: 95 }, (_, i) => String(i + 1).padStart(2, "0")).filter((d) => d !== "20"),
  "2A", "2B", "971", "972", "973", "974", "976",
].sort();

export default function AgendaFinancier({ livrets, bourse, contracts, objectifs }) {
  const ids = useId();
  const [reglages, setReglages] = usePersistentState("agendaReglages", { departement: "" });
  const [tout, setTout] = useState(false);
  const departement = reglages?.departement || "";

  const evenements = useMemo(
    () => evenementsAgenda({ departement, livrets, bourse, contracts, objectifs }),
    [departement, livrets, bourse, contracts, objectifs]
  );
  const affiches = tout ? evenements : evenements.slice(0, VISIBLES);
  const parMois = useMemo(() => {
    const m = new Map();
    for (const e of affiches) {
      const cle = e.date.slice(0, 7);
      if (!m.has(cle)) m.set(cle, []);
      m.get(cle).push(e);
    }
    return [...m.entries()];
  }, [affiches]);

  return (
    <Card accent={CARD_THEMES.emerald}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <CardLabel icon={CalendarRange}>Agenda de l'année</CardLabel>
        <div className="flex items-center gap-2 text-micro text-slate-500">
          <label htmlFor={`${ids}-dep`}>Département</label>
          <select
            id={`${ids}-dep`}
            value={departement}
            onChange={(e) => setReglages((r) => ({ ...(r || {}), departement: e.target.value }))}
            className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-emerald-400/60"
          >
            <option value="">—</option>
            {DEPARTEMENTS.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
          {zoneDeclaration(departement) && <span>zone {zoneDeclaration(departement)}</span>}
        </div>
      </div>

      {evenements.length === 0 ? (
        <EtatVide picto="calendrier" titre="Rien à l'agenda">
          Les dates d'impôts, de livrets, de PEA et de contrats apparaîtront ici dès que tu les auras renseignés.
        </EtatVide>
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          {parMois.map(([mois, liste]) => (
            <section key={mois}>
              <h3 className="text-micro uppercase tracking-wide text-slate-500 mb-1">
                {new Date(`${mois}-01T00:00:00`).toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}
              </h3>
              <ul className="flex flex-col gap-1.5">
                {liste.map((e) => {
                  const Icone = ICONES[e.categorie] || CalendarRange;
                  return (
                    <li key={e.id} className="flex items-start gap-3 rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2">
                      <span className="shrink-0 w-10 text-center font-data text-sm text-slate-200">
                        {Number(e.date.slice(8, 10))}
                      </span>
                      <Icone size={14} className="mt-0.5 shrink-0 text-emerald-300/80" aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2 flex-wrap text-sm text-slate-200">
                          {e.titre}
                          {e.estimee && <PastilleEtat etat="neutre">date estimée</PastilleEtat>}
                        </span>
                        {e.detail && <span className="block text-micro text-slate-500 mt-0.5">{e.detail}</span>}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          {evenements.length > VISIBLES && (
            <button type="button" onClick={() => setTout((t) => !t)} className="btn-flash self-start text-mini text-slate-500 hover:text-slate-200">
              {tout ? "Réduire" : `Voir toute l'année (${evenements.length} dates)`}
            </button>
          )}
          <p className="text-micro text-slate-500">
            Les dates estimées reprennent le calendrier de l'année précédente, au même jour de la semaine, en
            attendant la publication officielle. Un rappel arrive la veille de chaque date.
          </p>
        </div>
      )}
    </Card>
  );
}
