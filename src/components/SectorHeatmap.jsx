import { useMemo } from "react";
import { LayoutGrid } from "lucide-react";
import { Treemap, ResponsiveContainer, Tooltip } from "recharts";
import { CarteRepliable, EmptyState } from "./ui";
import { eur, pctPlain, valeurPosition } from "../lib/finance";
import { SECTOR_HEX, NON_CLASSE, SECTEURS_APP, secteurParDefaut } from "../lib/sectors";
import { partsSectorielles } from "../lib/exposition";
import { compositionDe } from "../lib/compositionEtf";
import AssetLogo from "./AssetLogo";

/**
 * Heatmap sectorielle façon TradingView : un vrai treemap, cellules
 * jointives (aucun espacement), dimensionnées selon le poids réel de chaque
 * ligne dans le portefeuille. La couleur code le secteur (pas la
 * performance) — chaque case garde le nom du secteur affiché à l'intérieur.
 *
 * UN ETF AU CATALOGUE EST DÉCOUPÉ en autant de cases que son indice compte de
 * secteurs. Rangé d'un bloc, un ETF monde formait une seule case grise « Non
 * classé » de 84 % : la carte montrait l'inverse de la réalité, puisque c'est
 * la ligne la plus diversifiée du portefeuille. Découpées, ses parts rejoignent
 * les actions du même secteur, et la carte montre l'exposition réelle.
 */
export default function SectorHeatmap({ positions = [], secteursManuels = {}, setSecteursManuels, replie, onBasculer }) {
  const { data, total, legende } = useMemo(() => {
    const parts = partsSectorielles(positions, secteursManuels);
    const total = parts.reduce((s, p) => s + p.valeur, 0);

    const parSecteur = new Map();
    for (const p of parts) parSecteur.set(p.secteur, (parSecteur.get(p.secteur) || 0) + p.valeur);

    // Trié par secteur (les plus gros secteurs d'abord) puis par ligne, pour
    // que l'algorithme de treemap regroupe naturellement les cases d'un même
    // secteur les unes à côté des autres.
    const data = [...parts]
      .sort((a, b) => parSecteur.get(b.secteur) - parSecteur.get(a.secteur) || b.valeur - a.valeur)
      .map((p) => ({
        name: p.etf ? `${p.ticker} · ${p.secteur}` : p.ticker,
        value: p.valeur,
        ticker: p.ticker,
        sector: p.secteur,
        etf: p.etf,
        pct: total > 0 ? (p.valeur / total) * 100 : 0,
      }));

    // « Non classé » en dernier : ce n'est pas un secteur, c'est une absence.
    const legende = [...parSecteur.entries()]
      .sort(([a, va], [b, vb]) => (a === NON_CLASSE) - (b === NON_CLASSE) || vb - va)
      .map(([name, value]) => ({ name, value, pct: total > 0 ? (value / total) * 100 : 0 }));

    return { data, total, legende };
  }, [positions, secteursManuels]);

  const nbSecteurs = legende.filter((s) => s.name !== NON_CLASSE).length;

  return (
    <CarteRepliable
      titre="Répartition sectorielle"
      icon={LayoutGrid}
      replie={replie}
      onBasculer={onBasculer}
      resume={`${nbSecteurs} secteur(s)`}
    >
      {data.length === 0 ? (
        <EmptyState>Ajoute une position pour voir sa répartition sectorielle.</EmptyState>
      ) : (
        <div className="flex flex-col gap-3 mt-2">
          {/* Données de marché publiques : pas de montant personnel à masquer
              en mode Ghost. */}
          <div className="ghost-chart-public" style={{ width: "100%", height: 280 }}>
            <ResponsiveContainer>
              <Treemap
                data={data}
                dataKey="value"
                stroke="#0f172a"
                isAnimationActive={false}
                content={<TreemapTile />}
              >
                <Tooltip content={<TreemapTooltip total={total} />} />
              </Treemap>
            </ResponsiveContainer>
          </div>

          {/* Légende des secteurs */}
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {legende.map((s) => (
              <div key={s.name} className="flex items-center gap-1.5 text-xs">
                <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: SECTOR_HEX[s.name] || SECTOR_HEX[NON_CLASSE] }} />
                <span className="text-slate-400">{s.name}</span>
                <span className="text-slate-500 font-data">{pctPlain(s.pct, 1)}</span>
              </div>
            ))}
          </div>

          {setSecteursManuels && (
            <ChoixSecteurs
              positions={positions}
              secteursManuels={secteursManuels}
              setSecteursManuels={setSecteursManuels}
            />
          )}
        </div>
      )}
    </CarteRepliable>
  );
}

/**
 * Secteur de chaque ligne, modifiable.
 *
 * Le classement par défaut range une société d'après son activité principale,
 * et le justifie dans le code. Mais une société présente dans plusieurs
 * métiers se range de plusieurs façons défendables — Vinci est-il du BTP ou
 * des concessions ? — et c'est à son détenteur de trancher. Son choix prime
 * partout : santé, carte et suggestions du Screener.
 */
function ChoixSecteurs({ positions, secteursManuels, setSecteursManuels }) {
  const lignes = useMemo(() => {
    const vues = new Map();
    for (const p of positions) {
      const ticker = String(p.ticker || "").toUpperCase();
      if (!ticker || vues.has(ticker) || !(valeurPosition(p) > 0)) continue;
      vues.set(ticker, { ticker, nom: p.name || p.ticker, composition: compositionDe(ticker) });
    }
    return [...vues.values()];
  }, [positions]);

  const choisir = (ticker, secteur) =>
    setSecteursManuels((m) => {
      const suivant = { ...(m || {}) };
      if (secteur) suivant[ticker] = secteur;
      else delete suivant[ticker];
      return suivant;
    });

  const nbModifies = lignes.filter((l) => secteursManuels?.[l.ticker]).length;

  return (
    <details className="group rounded-xl border border-slate-800 bg-slate-950/40">
      <summary className="cursor-pointer list-none px-3 py-2 text-micro text-slate-400 hover:text-slate-200 flex items-center justify-between gap-2">
        <span>Secteur de chaque ligne{nbModifies > 0 ? ` — ${nbModifies} choisi(s) à la main` : ""}</span>
        <span aria-hidden="true" className="transition-transform group-open:rotate-180">⌄</span>
      </summary>
      <ul className="divide-y divide-slate-800 border-t border-slate-800">
        {lignes.map((l) => {
          const manuel = secteursManuels?.[l.ticker] || "";
          return (
            <li key={l.ticker} className="flex items-center gap-3 px-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="block font-data text-xs text-slate-200">{l.ticker}</span>
                <span className="block text-micro text-slate-500 truncate">{l.nom}</span>
              </span>
              {l.composition ? (
                <span className="text-micro text-slate-500 text-right">
                  Décomposé selon l&apos;indice {l.composition.indice}
                </span>
              ) : (
                <select
                  value={manuel}
                  onChange={(e) => choisir(l.ticker, e.target.value)}
                  aria-label={`Secteur de ${l.ticker}`}
                  className={`max-w-[13rem] bg-slate-950 border rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-violet-400/60 ${
                    manuel ? "border-violet-400/50 text-violet-200" : "border-slate-700 text-slate-300"
                  }`}
                >
                  <option value="">Par défaut : {secteurParDefaut(l.ticker)}</option>
                  {SECTEURS_APP.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              )}
            </li>
          );
        })}
      </ul>
    </details>
  );
}

function TreemapTooltip({ active, payload, total }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900/95 px-3 py-2 text-xs shadow-xl">
      <p className="font-data font-semibold text-slate-100">{d.ticker}</p>
      <p className="text-slate-500">{d.sector}</p>
      {d.etf && (
        <p className="text-slate-500">
          {pctPlain(d.etf.part * 100, 1)} de l&apos;indice {d.etf.indice}
        </p>
      )}
      <p className="text-slate-300 mt-1 ghost-blur">{eur(d.value, 0)}</p>
      <p className="text-slate-500">{pctPlain((d.value / total) * 100, 1)} du portefeuille</p>
    </div>
  );
}

// Rendu custom d'une case du treemap : fond plein coloré par secteur (pas de
// séparation par espacement, uniquement par la couleur/le liseré), avec le
// logo, le ticker, le poids et le nom du secteur à l'intérieur de la case
// quand elle est assez grande pour l'accueillir.
function TreemapTile(props) {
  const { x, y, width, height, ticker, sector, pct, depth } = props;
  if (!width || !height || width <= 0 || height <= 0) return null;
  // recharts dessine aussi le nœud RACINE, qui couvre tout le treemap et ne
  // porte aucune ligne : il rendait un logo « ? » et un « 0,0 % » sous les
  // vraies cases, visibles dans les interstices et lus par les lecteurs
  // d'écran.
  if (depth === 0 || !ticker) return null;

  const fill = SECTOR_HEX[sector] || SECTOR_HEX[NON_CLASSE];
  const showFull = width > 70 && height > 55;
  const showCompact = !showFull && width > 34 && height > 24;

  return (
    <g>
      <rect x={x} y={y} width={width} height={height} fill={fill} stroke="#0f172a" strokeWidth={1.5} />
      {showFull && (
        <foreignObject x={x} y={y} width={width} height={height}>
          <div className="w-full h-full flex flex-col items-center justify-center gap-1 p-1 overflow-hidden">
            <AssetLogo ticker={ticker} size="sm" />
            <span className="font-data text-[12px] font-bold text-white truncate max-w-full">{ticker}</span>
            <span className="text-micro text-white/75 font-data">{pctPlain(pct, 1)}</span>
            <span className="text-[9px] text-white/50 truncate max-w-full leading-none">{sector}</span>
          </div>
        </foreignObject>
      )}
      {showCompact && (
        <foreignObject x={x} y={y} width={width} height={height}>
          <div className="w-full h-full flex flex-col items-center justify-center gap-0.5 p-0.5 overflow-hidden">
            <span className="font-data text-micro font-bold text-white truncate max-w-full">{ticker}</span>
            <span className="text-[9px] text-white/70 font-data">{pctPlain(pct, 1)}</span>
          </div>
        </foreignObject>
      )}
    </g>
  );
}
