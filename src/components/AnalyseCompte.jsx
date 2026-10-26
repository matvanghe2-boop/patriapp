import { useMemo, useState, useId } from "react";
import {
  ResponsiveContainer, Sankey, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
import { Workflow, GitCompare, Activity, CalendarDays, Search, Coins, Dices } from "lucide-react";
import { Card, CardLabel } from "./ui";
import Montant from "./Montant";
import { compact, pctPlain } from "../lib/finance";
import { COULEURS, GRILLE, AXE, MARGES, TRAITS } from "../lib/styleGraphique";
import { CATEGORIES } from "../lib/compteCourant";
import {
  fluxDuMois, comparaisonCategories, rythmeMois, calendrierMois, depensesParJourSemaine, zoomCategorie,
  petitesDepenses, jeuxParMois, categoriesPeriode,
} from "../lib/analyseCompte";

/**
 * Sous-onglet « Analyse » du compte courant : comprendre le mois choisi —
 * d'où vient l'argent, où il part, comment il se compare aux autres mois, à
 * quel rythme il se dépense.
 */

const euros = (c) => c / 100;
const nomMois = (cle, format = "long") => {
  const [a, m] = cle.split("-").map(Number);
  return new Date(a, m - 1, 1).toLocaleDateString("fr-FR", { month: format });
};
// Une période est un mois (« 2026-09 ») ou une liste de mois (année, 12 mois).
const estPeriodeLongue = (mois) => Array.isArray(mois);
const nomPeriode = (mois) => (estPeriodeLongue(mois) ? "la période" : nomMois(mois));
const dansLaPeriode = (mois, cle) => (estPeriodeLongue(mois) ? mois.includes(cle) : cle === mois);

// ─── Flux du mois ────────────────────────────────────────────────────────────

function NoeudFlux({ x, y, width, height, payload }) {
  if (!payload || height <= 0) return null;
  // Étiquettes dans les marges, jamais sur les bandes : à gauche pour les
  // origines, à droite pour les destinations. Attention, recharts appelle
  // `sourceLinks` les liens qui ARRIVENT sur le nœud — une origine n'en a
  // aucun.
  const aDroite = payload.sourceLinks?.length > 0;
  const milieu = payload.name === "Compte courant";
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} rx={2} fill={milieu ? COULEURS.domaine : "rgb(var(--c-slate-500))"} />
      {!milieu && (
        <text
          x={aDroite ? x + width + 6 : x - 6}
          y={y + height / 2}
          textAnchor={aDroite ? "start" : "end"}
          dominantBaseline="middle"
          fontSize={11}
          fill={COULEURS.texte}
        >
          {payload.name}
        </text>
      )}
    </g>
  );
}

function InfobulleFlux({ active, payload }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  const libelle = p.source && p.target ? `${p.source.name} → ${p.target.name}` : p.name;
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900/95 px-3 py-2 text-xs shadow-lg">
      <div className="text-slate-400">{libelle}</div>
      <Montant valeur={p.value} decimales={2} className="text-slate-100" />
    </div>
  );
}

/**
 * D'où vient l'argent du mois et où il va, en un seul schéma. Les listes en
 * dessous donnent les mêmes chiffres en clair : le diagramme se lit d'un
 * coup d'œil, mais aucun montant ne doit dépendre de la largeur d'une bande.
 */
export function FluxMois({ enrichies, mois }) {
  const flux = useMemo(() => fluxDuMois(enrichies, mois), [enrichies, mois]);
  const donnees = useMemo(() => {
    const nodes = [
      ...flux.sources.map((s) => ({ name: s.libelle })),
      { name: "Compte courant" },
      ...flux.destinations.map((d) => ({ name: d.libelle })),
    ];
    const centre = flux.sources.length;
    const links = [
      ...flux.sources.map((s, i) => ({ source: i, target: centre, value: euros(s.montant) })),
      ...flux.destinations.map((d, i) => ({ source: centre, target: centre + 1 + i, value: euros(d.montant) })),
    ];
    return { nodes, links };
  }, [flux]);

  if (flux.total === 0) return null;
  const hauteur = Math.max(200, 34 * Math.max(flux.sources.length, flux.destinations.length));

  return (
    <Card>
      <CardLabel icon={Workflow}>D'où vient l'argent, où il va</CardLabel>
      {/* Sous 640 px, les marges des étiquettes ne laissent plus que quelques
          pixels aux bandes : les deux listes, en dessous, disent la même chose
          plus lisiblement. */}
      <div className="hidden sm:block" style={{ height: hauteur }} role="img" aria-label={`Flux d'argent sur ${nomPeriode(mois)}`}>
        <ResponsiveContainer width="100%" height="100%">
          <Sankey
            data={donnees}
            node={<NoeudFlux />}
            nodePadding={18}
            nodeWidth={8}
            iterations={32}
            margin={{ top: 8, right: 130, bottom: 8, left: 130 }}
            link={{ stroke: COULEURS.domaine, strokeOpacity: 0.25 }}
          >
            <Tooltip content={<InfobulleFlux />} />
          </Sankey>
        </ResponsiveContainer>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 mt-3 text-xs">
        {[
          ["Entrées", flux.sources],
          ["Sorties", flux.destinations],
        ].map(([titre, lignes]) => (
          <div key={titre}>
            <div className="text-micro uppercase tracking-wider text-slate-500 mb-1">{titre}</div>
            <ul className="space-y-0.5">
              {lignes.map((l) => (
                <li key={l.id} className="flex justify-between gap-3">
                  <span className="text-slate-300 truncate">{l.libelle}</span>
                  <Montant valeur={euros(l.montant)} decimales={2} className="text-slate-100" />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ─── Comparaison par catégorie ───────────────────────────────────────────────

export function ComparaisonMois({ enrichies, mois }) {
  const lignes = useMemo(() => comparaisonCategories(enrichies, mois).slice(0, 8), [enrichies, mois]);
  if (lignes.length === 0 || lignes.every((l) => l.moyenne3 == null)) return null;
  return (
    <Card>
      <CardLabel icon={GitCompare}>Ce mois face aux précédents</CardLabel>
      <div className="overflow-x-auto -mx-1">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-slate-500 text-left">
              <th scope="col" className="font-normal py-1 px-1">Catégorie</th>
              <th scope="col" className="font-normal py-1 px-1 text-right">{nomMois(mois)}</th>
              <th scope="col" className="font-normal py-1 px-1 text-right hidden sm:table-cell">Mois précédent</th>
              <th scope="col" className="font-normal py-1 px-1 text-right">Moyenne 3 mois</th>
              <th scope="col" className="font-normal py-1 px-1 text-right">Écart</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/70">
            {lignes.map((l) => (
              <tr key={l.id}>
                <th scope="row" className="font-normal text-left text-slate-200 py-1.5 px-1">{l.libelle}</th>
                <td className="text-right px-1"><Montant valeur={euros(l.montant)} decimales={0} /></td>
                <td className="text-right px-1 hidden sm:table-cell text-slate-400">
                  {l.precedent == null ? "—" : <Montant valeur={euros(l.precedent)} decimales={0} />}
                </td>
                <td className="text-right px-1 text-slate-400">
                  {l.moyenne3 == null ? "—" : <Montant valeur={euros(l.moyenne3)} decimales={0} />}
                </td>
                <td className={`text-right px-1 ${l.ecart > 0 ? "text-rose-300" : l.ecart < 0 ? "text-emerald-300" : "text-slate-400"}`}>
                  {l.ecart == null ? "—" : (
                    <>
                      {l.ecart > 0 ? "+" : ""}
                      <Montant valeur={euros(l.ecart)} decimales={0} />
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-micro text-slate-500 mt-2">
        En rouge, ce qui coûte plus que d'habitude ; en vert, ce qui coûte moins. Un mois sans dépense dans une catégorie
        compte pour zéro dans la moyenne.
      </p>
    </Card>
  );
}

// ─── Rythme du mois ──────────────────────────────────────────────────────────

function InfobulleRythme({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900/95 px-3 py-2 text-xs shadow-lg space-y-0.5">
      <div className="text-slate-400">Au {label}</div>
      <div className="text-slate-100">Ce mois-ci <Montant valeur={euros(p.mois)} decimales={2} /></div>
      {p.moyenne != null && (
        <div className="text-slate-300">D'habitude <Montant valeur={euros(p.moyenne)} decimales={2} /></div>
      )}
    </div>
  );
}

export function RythmeMois({ enrichies, mois }) {
  const points = useMemo(() => rythmeMois(enrichies, mois), [enrichies, mois]);
  const comparable = points.some((p) => p.moyenne != null);
  const mi = points[Math.min(14, points.length - 1)];
  const fin = points[points.length - 1];
  return (
    <Card>
      <CardLabel icon={Activity}>Rythme des dépenses</CardLabel>
      {comparable ? (
        <p className="text-sm text-slate-300 mb-2">
          Au 15, <Montant valeur={euros(mi.mois)} decimales={0} /> dépensés, contre{" "}
          <Montant valeur={euros(mi.moyenne)} decimales={0} /> d'habitude à la même date ; en fin de mois,{" "}
          <Montant valeur={euros(fin.mois)} decimales={0} /> contre <Montant valeur={euros(fin.moyenne)} decimales={0} />.
        </p>
      ) : (
        <p className="text-sm text-slate-500 mb-2">Il faut au moins deux mois de relevés pour comparer le rythme.</p>
      )}
      <div className="h-44" role="img" aria-label="Dépenses cumulées du mois, comparées aux autres mois">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={MARGES}>
            <CartesianGrid {...GRILLE} />
            <XAxis dataKey="jour" {...AXE} interval={4} />
            <YAxis tickFormatter={(v) => compact(v / 100)} {...AXE} width={48} />
            <Tooltip content={<InfobulleRythme />} cursor={{ stroke: COULEURS.axe, strokeDasharray: "3 3" }} />
            {comparable && (
              <Line
                dataKey="moyenne"
                stroke={COULEURS.axe}
                strokeWidth={TRAITS.comparaison}
                strokeDasharray="4 4"
                dot={false}
                isAnimationActive={false}
                type="stepAfter"
              />
            )}
            <Line dataKey="mois" stroke={COULEURS.domaine} strokeWidth={TRAITS.serie} dot={false} isAnimationActive={false} type="stepAfter" />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="flex gap-4 mt-1 text-micro text-slate-500">
        <span className="flex items-center gap-1.5"><span className="w-3 h-0.5" style={{ background: COULEURS.domaine }} />{nomMois(mois)}</span>
        {comparable && <span className="flex items-center gap-1.5"><span className="w-3 border-t border-dashed border-slate-500" />Moyenne des autres mois</span>}
      </div>
    </Card>
  );
}

// ─── Calendrier ──────────────────────────────────────────────────────────────

const ENTETES_JOURS = ["L", "M", "M", "J", "V", "S", "D"];

/**
 * Le mois en calendrier, chaque jour teinté selon ce qui a été dépensé. Une
 * seule teinte, de plus en plus soutenue : la question est « combien », pas
 * « quel genre ». Le montant est écrit dans l'infobulle et lu par les
 * lecteurs d'écran.
 */
export function CalendrierDepenses({ enrichies, mois }) {
  const jours = useMemo(() => calendrierMois(enrichies, mois), [enrichies, mois]);
  const semaine = useMemo(() => depensesParJourSemaine(enrichies), [enrichies]);
  const max = Math.max(1, ...jours.map((j) => j.montant));
  const [a, m] = mois.split("-").map(Number);
  const decalage = (new Date(a, m - 1, 1).getDay() + 6) % 7;
  const maxSemaine = Math.max(1, ...semaine.map((s) => s.moyenne));
  const plusCher = [...semaine].sort((x, y) => y.moyenne - x.moyenne)[0];

  return (
    <Card>
      <CardLabel icon={CalendarDays}>Calendrier des dépenses</CardLabel>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="w-full max-w-sm">
          <div className="grid grid-cols-7 gap-1 text-center">
            {ENTETES_JOURS.map((j, i) => (
              <div key={i} className="text-micro text-slate-500">{j}</div>
            ))}
            {Array.from({ length: decalage }, (_, i) => <div key={`vide-${i}`} />)}
            {jours.map((j) => {
              const intensite = j.montant > 0 ? 0.15 + 0.75 * (j.montant / max) : 0;
              const libelle = `${Number(j.date.slice(8))} ${nomMois(mois)} : ${
                j.montant > 0 ? `${(j.montant / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" })} dépensés` : "aucune dépense"
              }`;
              return (
                <div
                  key={j.date}
                  title={libelle}
                  aria-label={libelle}
                  role="img"
                  className="aspect-square rounded-md border border-slate-800 text-[10px] leading-none flex items-start justify-start p-1 text-slate-400"
                  style={intensite ? { background: `rgb(var(--c-lime-400) / ${intensite.toFixed(2)})`, color: intensite > 0.55 ? "rgb(var(--c-slate-950))" : undefined } : undefined}
                >
                  {Number(j.date.slice(8))}
                </div>
              );
            })}
          </div>
        </div>
        <div>
          <div className="text-micro uppercase tracking-wider text-slate-500 mb-2">Dépense moyenne par jour de la semaine</div>
          <ul className="space-y-1.5">
            {semaine.map((s) => (
              <li key={s.jour} className="flex items-center gap-2 text-xs">
                <span className="w-16 text-slate-400">{s.jour}</span>
                <span className="flex-1 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                  <span className="block h-full rounded-full" style={{ width: `${(s.moyenne / maxSemaine) * 100}%`, background: COULEURS.domaine }} />
                </span>
                <Montant valeur={euros(s.moyenne)} decimales={2} className="w-16 text-right text-slate-200" />
              </li>
            ))}
          </ul>
          {plusCher?.moyenne > 0 && (
            <p className="text-micro text-slate-500 mt-2">
              Sur toute la période, le {plusCher.jour.toLowerCase()} est le jour qui coûte le plus. Les jours sans
              dépense comptent dans la moyenne.
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}

// ─── Zoom sur une catégorie ──────────────────────────────────────────────────

export function ZoomCategorie({ enrichies, mois, categorieInitiale }) {
  const idChamp = useId();
  const presentes = useMemo(() => {
    const ids = new Set(enrichies.filter((o) => o.famille === "depense" && !o.horsBudget).map((o) => o.categorie));
    return CATEGORIES.filter((c) => ids.has(c.id));
  }, [enrichies]);
  // Par défaut : la catégorie filtrée dans la liste, sinon la plus grosse
  // dépense du mois — ouvrir le zoom sur une catégorie vide n'apprend rien.
  const principale = useMemo(
    () =>
      (estPeriodeLongue(mois) ? categoriesPeriode(enrichies, mois) : comparaisonCategories(enrichies, mois)).sort(
        (a, b) => b.montant - a.montant
      )[0]?.id,
    [enrichies, mois]
  );
  const [choix, setChoix] = useState(null);
  const id =
    choix && presentes.some((c) => c.id === choix) ? choix : categorieInitiale || principale || presentes[0]?.id;
  const zoom = useMemo(() => (id ? zoomCategorie(enrichies, id, mois) : null), [enrichies, id, mois]);
  if (!zoom) return null;
  const maxMois = Math.max(1, ...zoom.parMois.map((l) => l.total));

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <CardLabel icon={Search}>Zoom sur une catégorie</CardLabel>
        <label htmlFor={idChamp} className="sr-only">Catégorie</label>
        <select
          id={idChamp}
          value={id}
          onChange={(e) => setChoix(e.target.value)}
          className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-lime-400/40"
        >
          {presentes.map((c) => (
            <option key={c.id} value={c.id}>{c.libelle}</option>
          ))}
        </select>
      </div>
      <dl className="grid grid-cols-3 gap-3 mb-4">
        <div>
          <dt className="text-micro text-slate-500">Achats sur {nomPeriode(mois)}</dt>
          <dd className="font-display text-lg text-slate-100">{zoom.nombre}</dd>
        </div>
        <div>
          <dt className="text-micro text-slate-500">Total</dt>
          <dd><Montant valeur={euros(zoom.total)} decimales={2} className="font-display text-lg text-slate-100" /></dd>
        </div>
        <div>
          <dt className="text-micro text-slate-500">Panier moyen</dt>
          <dd>
            {zoom.panierMoyen == null ? <span className="text-slate-500">—</span> : (
              <Montant valeur={euros(zoom.panierMoyen)} decimales={2} className="font-display text-lg text-slate-100" />
            )}
          </dd>
        </div>
      </dl>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-xs">
        <div>
          <div className="text-micro uppercase tracking-wider text-slate-500 mb-1.5">Mois par mois</div>
          <ul className="space-y-1.5">
            {zoom.parMois.map((l) => (
              <li key={l.mois} className="flex items-center gap-2">
                <span className={`w-12 ${dansLaPeriode(mois, l.mois) ? "text-slate-100" : "text-slate-400"}`}>{nomMois(l.mois, "short")}</span>
                <span className="flex-1 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                  <span className="block h-full rounded-full" style={{ width: `${(Math.max(0, l.total) / maxMois) * 100}%`, background: COULEURS.domaine }} />
                </span>
                <Montant valeur={euros(l.total)} decimales={0} className="w-14 text-right text-slate-200" />
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div className="text-micro uppercase tracking-wider text-slate-500 mb-1.5">Principaux marchands {estPeriodeLongue(mois) ? "de la période" : "du mois"}</div>
          {zoom.marchands.length === 0 ? (
            <p className="text-slate-500">Aucun achat sur {nomPeriode(mois)}.</p>
          ) : (
            <ul className="space-y-1">
              {zoom.marchands.map((t) => (
                <li key={t.titre} className="flex justify-between gap-3">
                  <span className="truncate text-slate-300">{t.titre} <span className="text-slate-500">· {t.nombre} fois</span></span>
                  <Montant valeur={euros(t.total)} decimales={2} className="text-slate-100" />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Card>
  );
}

// ─── Petites dépenses ────────────────────────────────────────────────────────

export function PetitesDepenses({ enrichies, mois }) {
  const p = useMemo(() => petitesDepenses(enrichies, mois), [enrichies, mois]);
  return (
    <Card>
      <CardLabel icon={Coins}>Les petites dépenses</CardLabel>
      {p.nombre === 0 ? (
        <p className="text-sm text-slate-500">Aucun achat de moins de 10 € sur {nomPeriode(mois)}.</p>
      ) : (
        <p className="text-sm text-slate-300">
          {p.nombre} achat{p.nombre > 1 ? "s" : ""} de moins de 10 € sur {nomPeriode(mois)}, pour{" "}
          <Montant valeur={euros(p.total)} decimales={2} className="text-slate-100" /> au total
          {p.part != null && <> — {pctPlain(p.part * 100, 0)} des dépenses</>}.
        </p>
      )}
      <p className="text-xs text-slate-500 mt-1">
        En moyenne, <Montant valeur={euros(p.moyenneMensuelle)} decimales={2} /> par mois en petites dépenses.
      </p>
    </Card>
  );
}

// ─── Jeux d'argent ───────────────────────────────────────────────────────────

/** N'apparaît que s'il y a des opérations classées « Jeux d'argent ». */
export function JeuxArgent({ enrichies }) {
  const lignes = useMemo(() => jeuxParMois(enrichies), [enrichies]);
  if (lignes.length === 0) return null;
  const totalNet = lignes.reduce((s, l) => s + l.net, 0);
  return (
    <Card>
      <CardLabel icon={Dices}>Jeux d'argent</CardLabel>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-slate-500 text-left">
            <th scope="col" className="font-normal py-1">Mois</th>
            <th scope="col" className="font-normal py-1 text-right">Envoyé</th>
            <th scope="col" className="font-normal py-1 text-right">Revenu</th>
            <th scope="col" className="font-normal py-1 text-right">Net</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/70">
          {lignes.map((l) => (
            <tr key={l.mois}>
              <th scope="row" className="font-normal text-left text-slate-300 py-1.5">{nomMois(l.mois)}</th>
              <td className="text-right"><Montant valeur={euros(l.mises)} decimales={2} /></td>
              <td className="text-right"><Montant valeur={euros(l.gains)} decimales={2} /></td>
              <td className="text-right text-slate-100"><Montant valeur={euros(-l.net)} decimales={2} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-slate-500 mt-2">
        Sur la période : <Montant valeur={euros(-totalNet)} decimales={2} className="text-slate-300" /> au total, entre
        ce qui est parti vers les sites de jeu et ce qui en est revenu.
      </p>
    </Card>
  );
}

// ─── Catégories sur une période longue ───────────────────────────────────────

export function CategoriesPeriode({ enrichies, periode }) {
  const lignes = useMemo(() => categoriesPeriode(enrichies, periode), [enrichies, periode]);
  if (lignes.length === 0) return null;
  const comparable = lignes.some((l) => l.anPasse != null);
  return (
    <Card>
      <CardLabel icon={GitCompare}>Dépenses par catégorie sur la période</CardLabel>
      <div className="overflow-x-auto -mx-1">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-slate-500 text-left">
              <th scope="col" className="font-normal py-1 px-1">Catégorie</th>
              <th scope="col" className="font-normal py-1 px-1 text-right">Total</th>
              <th scope="col" className="font-normal py-1 px-1 text-right">Par mois</th>
              <th scope="col" className="font-normal py-1 px-1 text-right">Part</th>
              {comparable && <th scope="col" className="font-normal py-1 px-1 text-right">Un an plus tôt</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/70">
            {lignes.map((l) => (
              <tr key={l.id}>
                <th scope="row" className="font-normal text-left text-slate-200 py-1.5 px-1">{l.libelle}</th>
                <td className="text-right px-1"><Montant valeur={euros(l.montant)} decimales={0} /></td>
                <td className="text-right px-1 text-slate-400"><Montant valeur={euros(l.moyenneMensuelle)} decimales={0} /></td>
                <td className="text-right px-1 text-slate-400">{pctPlain(l.part * 100, 0)}</td>
                {comparable && (
                  <td className="text-right px-1 text-slate-400">
                    {l.anPasse == null ? "—" : <Montant valeur={euros(l.anPasse)} decimales={0} />}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!comparable && (
        <p className="text-micro text-slate-500 mt-2">
          La comparaison avec la même période un an plus tôt apparaîtra dès que tes relevés couvriront plus d'un an.
        </p>
      )}
    </Card>
  );
}

export default function AnalyseCompte({ enrichies, periode = [], vue = "mois", filtreCategorie }) {
  if (vue !== "mois") {
    return (
      <div className="space-y-6">
        <FluxMois enrichies={enrichies} mois={periode} />
        <CategoriesPeriode enrichies={enrichies} periode={periode} />
        <ZoomCategorie enrichies={enrichies} mois={periode} categorieInitiale={filtreCategorie} />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
          <PetitesDepenses enrichies={enrichies} mois={periode} />
          <JeuxArgent enrichies={enrichies} />
        </div>
      </div>
    );
  }
  const mois = periode[0];
  return (
    <div className="space-y-6">
      <FluxMois enrichies={enrichies} mois={mois} />
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
        <ComparaisonMois enrichies={enrichies} mois={mois} />
        <RythmeMois enrichies={enrichies} mois={mois} />
      </div>
      <CalendrierDepenses enrichies={enrichies} mois={mois} />
      <ZoomCategorie enrichies={enrichies} mois={mois} categorieInitiale={filtreCategorie} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
        <PetitesDepenses enrichies={enrichies} mois={mois} />
        <JeuxArgent enrichies={enrichies} />
      </div>
    </div>
  );
}
