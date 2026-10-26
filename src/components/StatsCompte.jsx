import { useMemo } from "react";
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceArea,
  ReferenceLine,
} from "recharts";
import { PieChart, Store, LineChart, BarChart3 } from "lucide-react";
import { Card, CardLabel, CARD_THEMES } from "./ui";
import Montant from "./Montant";
import { PastilleCategorie } from "./OperationsCompte";
import { compact, pctPlain } from "../lib/finance";
import { COULEURS, GRILLE, AXE, MARGES, TRAITS } from "../lib/styleGraphique";

/**
 * Statistiques du compte courant : où part l'argent, chez qui, et comment le
 * solde a évolué.
 *
 * Les dépenses par catégorie sont des BARRES d'une seule teinte, pas un
 * camembert multicolore : la question est « combien, et dans quel ordre »,
 * une longueur se compare mieux qu'un angle, et chaque barre porte son nom
 * écrit — la couleur n'a rien à distinguer.
 */

const nomMois = (cle) => {
  const [a, m] = cle.split("-").map(Number);
  return new Date(a, m - 1, 1).toLocaleDateString("fr-FR", { month: "short" }).replace(".", "");
};

export function DepensesParCategorie({ depenses, filtreCategorie, onFiltrer }) {
  const total = depenses.reduce((s, d) => s + d.montant, 0);
  const max = depenses[0]?.montant || 1;
  return (
    <Card accent={CARD_THEMES.lime}>
      <CardLabel icon={PieChart}>Dépenses par catégorie</CardLabel>
      {depenses.length === 0 ? (
        <p className="text-sm text-slate-500">Aucune dépense ce mois-ci.</p>
      ) : (
        <ul className="space-y-1">
          {depenses.map((d) => {
            const actif = filtreCategorie === d.id;
            return (
              <li key={d.id}>
                <button
                  type="button"
                  aria-pressed={actif}
                  onClick={() => onFiltrer(actif ? null : d.id)}
                  title={actif ? "Retirer le filtre" : "Voir ces opérations"}
                  className={`w-full flex items-center gap-3 rounded-lg px-1.5 py-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-400/40 ${
                    actif ? "bg-lime-400/10" : "hover:bg-slate-800/40"
                  }`}
                >
                  <PastilleCategorie id={d.id} taille={16} />
                  <span className="flex-1 min-w-0">
                    <span className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="text-slate-200 truncate">{d.libelle}</span>
                      <Montant valeur={d.montant / 100} decimales={2} className="text-slate-100" />
                    </span>
                    <span className="mt-1 flex items-center gap-2">
                      <span className="h-1.5 flex-1 rounded-full bg-slate-800 overflow-hidden">
                        <span
                          className="block h-full rounded-full"
                          style={{ width: `${(d.montant / max) * 100}%`, background: COULEURS.domaine }}
                        />
                      </span>
                      <span className="text-micro text-slate-500 w-10 text-right">{pctPlain((d.montant / total) * 100, 0)}</span>
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

export function PrincipauxPostes({ postes }) {
  if (postes.length === 0) return null;
  return (
    <Card>
      <CardLabel icon={Store}>Là où tu dépenses le plus</CardLabel>
      <ol className="space-y-2">
        {postes.map((p, i) => (
          <li key={p.titre} className="flex items-center gap-3 text-sm">
            <span className="w-4 text-micro text-slate-500 tabular-nums">{i + 1}</span>
            <span className="flex-1 min-w-0 truncate text-slate-200">{p.titre}</span>
            <span className="text-micro text-slate-500 whitespace-nowrap">
              {p.nombre} fois
            </span>
            <Montant valeur={p.montant / 100} decimales={2} className="text-slate-100" />
          </li>
        ))}
      </ol>
    </Card>
  );
}

function InfobulleSolde({ active, payload }) {
  if (!active || !payload?.length) return null;
  const { date, solde } = payload[0].payload;
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900/95 px-3 py-2 text-xs shadow-lg">
      <div className="text-slate-400">{new Date(`${date}T00:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}</div>
      <div className="text-slate-100 mt-0.5">
        Solde <Montant valeur={solde / 100} decimales={2} />
      </div>
    </div>
  );
}

/**
 * Courbe du solde, jour par jour. Le mois affiché est surligné : la courbe
 * couvre tout l'historique importé, pour qu'on voie d'où le mois part.
 */
export function CourbeSolde({ serie, mois }) {
  const donnees = useMemo(
    () => serie.map((p) => ({ ...p, t: new Date(`${p.date}T00:00:00`).getTime() })),
    [serie]
  );
  if (donnees.length < 2) return null;
  const debutMois = mois ? new Date(`${mois}-01T00:00:00`).getTime() : null;
  const finMois = mois
    ? new Date(Number(mois.slice(0, 4)), Number(mois.slice(5, 7)), 0).getTime()
    : null;
  const negatif = donnees.some((p) => p.solde < 0);

  return (
    <Card>
      <CardLabel icon={LineChart}>Évolution du solde</CardLabel>
      <div className="h-44" role="img" aria-label="Évolution du solde du compte courant, jour par jour">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={donnees} margin={MARGES}>
            <defs>
              <linearGradient id="degrade-solde-compte" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={COULEURS.domaine} stopOpacity={0.3} />
                <stop offset="100%" stopColor={COULEURS.domaine} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid {...GRILLE} />
            {debutMois && (
              <ReferenceArea x1={Math.max(debutMois, donnees[0].t)} x2={Math.min(finMois, donnees[donnees.length - 1].t)} fill={COULEURS.domaine} fillOpacity={0.06} />
            )}
            {negatif && <ReferenceLine y={0} stroke={COULEURS.baisse} strokeDasharray="4 4" />}
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={["dataMin", "dataMax"]}
              tickFormatter={(t) => new Date(t).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
              {...AXE}
              minTickGap={24}
            />
            <YAxis tickFormatter={(v) => compact(v / 100)} {...AXE} width={48} />
            <Tooltip content={<InfobulleSolde />} cursor={{ stroke: COULEURS.axe, strokeDasharray: "3 3" }} />
            <Area
              type="stepAfter"
              dataKey="solde"
              stroke={COULEURS.domaine}
              strokeWidth={TRAITS.serie}
              fill="url(#degrade-solde-compte)"
              isAnimationActive={false}
              activeDot={{ r: 5 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function InfobulleMois({ active, payload }) {
  if (!active || !payload?.length) return null;
  const l = payload[0].payload;
  const [a, m] = l.mois.split("-").map(Number);
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900/95 px-3 py-2 text-xs shadow-lg space-y-0.5">
      <div className="text-slate-400">
        {new Date(a, m - 1, 1).toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}
      </div>
      <div className="text-slate-200">Entrées <Montant valeur={l.entrees / 100} decimales={2} /></div>
      <div className="text-slate-200">Sorties <Montant valeur={l.sorties / 100} decimales={2} /></div>
      <div className="text-slate-100">Reste <Montant valeur={l.net / 100} decimales={2} /></div>
    </div>
  );
}

/**
 * Entrées et sorties mois par mois, de part et d'autre de zéro. N'apparaît
 * qu'à partir de deux mois : une seule paire de barres ne compare rien.
 */
export function EntreesSorties({ mois }) {
  const donnees = useMemo(
    () => mois.map((l) => ({ ...l, court: nomMois(l.mois), entreesE: l.entrees / 100, sortiesE: -l.sorties / 100 })),
    [mois]
  );
  if (donnees.length < 2) return null;
  return (
    <Card>
      <CardLabel icon={BarChart3}>Entrées et sorties par mois</CardLabel>
      <div className="h-48" role="img" aria-label="Entrées et sorties du compte courant, mois par mois">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={donnees} margin={MARGES} stackOffset="sign">
            <CartesianGrid {...GRILLE} />
            <XAxis dataKey="court" {...AXE} />
            <YAxis tickFormatter={(v) => compact(v)} {...AXE} width={48} />
            <ReferenceLine y={0} stroke={COULEURS.axe} />
            <Tooltip content={<InfobulleMois />} cursor={{ fill: "rgba(148,163,184,0.08)" }} />
            <Bar dataKey="entreesE" stackId="flux" fill={COULEURS.hausse} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            <Bar dataKey="sortiesE" stackId="flux" fill={COULEURS.baisse} radius={[0, 0, 4, 4]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="flex gap-4 mt-1 text-micro text-slate-500">
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm" style={{ background: COULEURS.hausse }} />Entrées</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm" style={{ background: COULEURS.baisse }} />Sorties</span>
      </div>
    </Card>
  );
}
