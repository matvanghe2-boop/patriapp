import { useEffect, useMemo, useState } from "react";
import { Treemap, ResponsiveContainer, Tooltip } from "recharts";
import { fetchQuotes, fetchScreen } from "../lib/api";
import { chargerUnivers } from "../lib/univers";
import { INDEX_CONSTITUENTS, COMPOSITION_CAC40_AU } from "../lib/indexConstituents";
import { secteurDe } from "../lib/sectors";
import { compact, pct, pctPlain } from "../lib/finance";

/**
 * Le CAC 40 en un coup d'œil : une case par société, sa taille celle de sa
 * capitalisation, sa couleur sa variation du jour, regroupées par secteur.
 * Les lignes détenues sont entourées.
 *
 * Capitalisations : instantané hebdomadaire du SBF 120 (le Screener le
 * télécharge déjà) ; une société absente de l'instantané est complétée par
 * une requête de ratios, plutôt que dessinée à une taille inventée.
 */

/** Au-delà de ±3 %, la couleur sature : c'est déjà une séance exceptionnelle. */
const SATURATION_PCT = 3;

const melange = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const NEUTRE = [51, 65, 85];
const HAUSSE = [5, 150, 105];
const BAISSE = [225, 29, 72];

export function couleurVariation(variationPct) {
  if (!Number.isFinite(variationPct)) return "rgb(30, 41, 59)";
  const t = Math.max(-1, Math.min(1, variationPct / SATURATION_PCT));
  const [r, g, b] = t >= 0 ? melange(NEUTRE, HAUSSE, t) : melange(NEUTRE, BAISSE, -t);
  return `rgb(${r}, ${g}, ${b})`;
}

const nomCourt = (nom = "") =>
  nom
    .replace(/\s+(S\.?A\.?|SE|SA|N\.?V\.?|Société Anonyme|Societe Anonyme)\.?$/i, "")
    .replace(/^L'/, "")
    .trim();

export default function CarteCac40({ onOuvrir, tickersDetenus = [], hauteur = 320 }) {
  const [cotations, setCotations] = useState(null);
  const [capitalisations, setCapitalisations] = useState({});
  const [instantane, setInstantane] = useState(null);
  const [erreur, setErreur] = useState("");

  useEffect(() => {
    let annule = false;
    const symboles = INDEX_CONSTITUENTS.cac40;
    Promise.all([fetchQuotes(symboles), chargerUnivers("sbf120").catch(() => null)])
      .then(async ([quotes, univers]) => {
        const caps = {};
        const secteurs = {};
        for (const t of univers?.titres || []) {
          if (symboles.includes(t.symbole) && t.capitalisation > 0) caps[t.symbole] = t.capitalisation;
          if (symboles.includes(t.symbole)) secteurs[t.symbole] = t.secteur;
        }
        const manquants = symboles.filter((s) => !caps[s]);
        if (manquants.length > 0) {
          const complements = await fetchScreen(manquants).catch(() => []);
          for (const c of complements) {
            if (c?.capitalisation > 0) caps[c.symbole] = c.capitalisation;
            if (c?.secteur) secteurs[c.symbole] = c.secteur;
          }
        }
        if (annule) return;
        setCotations(quotes);
        setCapitalisations({ caps, secteurs });
        setInstantane(univers?.genereLe ?? null);
      })
      .catch(() => {
        if (!annule) setErreur("Cours du CAC 40 indisponibles pour le moment.");
      });
    return () => {
      annule = true;
    };
  }, []);

  const detenus = useMemo(() => new Set(tickersDetenus.map((t) => String(t).toUpperCase())), [tickersDetenus]);

  const { donnees, sansTaille } = useMemo(() => {
    if (!cotations) return { donnees: [], sansTaille: [] };
    const { caps = {}, secteurs = {} } = capitalisations;
    const parSecteur = new Map();
    const sansTaille = [];
    for (const q of cotations) {
      if (!q?.ok) continue;
      const cap = caps[q.symbol];
      if (!(cap > 0)) {
        sansTaille.push(q.symbol);
        continue;
      }
      const secteur = secteurDe({ ticker: q.symbol, secteurYahoo: secteurs[q.symbol] });
      const variation = q.previousClose > 0 ? (q.price / q.previousClose - 1) * 100 : null;
      if (!parSecteur.has(secteur)) parSecteur.set(secteur, []);
      parSecteur.get(secteur).push({ name: nomCourt(q.name) || q.symbol, ticker: q.symbol, value: cap, variation, secteur, detenu: detenus.has(q.symbol) });
    }
    const donnees = [...parSecteur.entries()]
      .map(([name, children]) => ({ name, children: children.sort((a, b) => b.value - a.value), total: children.reduce((s, c) => s + c.value, 0) }))
      .sort((a, b) => b.total - a.total);
    return { donnees, sansTaille };
  }, [cotations, capitalisations, detenus]);

  if (erreur) return <p className="text-micro text-amber-300/90">{erreur}</p>;
  if (!cotations) return <div className="skeleton rounded-xl" style={{ height: hauteur }} />;

  const hausses = cotations.filter((q) => q?.ok && q.price > q.previousClose).length;
  const valides = cotations.filter((q) => q?.ok && q.previousClose > 0).length;

  return (
    <div className="flex flex-col gap-2">
      <div className="text-micro text-slate-400">
        {hausses} valeur{hausses > 1 ? "s" : ""} en hausse sur {valides} aujourd&apos;hui
        {detenus.size > 0 && <span className="text-slate-500"> · tes lignes sont entourées</span>}
      </div>
      {/* Données de marché publiques : rien à masquer en mode discret. */}
      <div className="ghost-chart-public" style={{ width: "100%", height: hauteur }}>
        <ResponsiveContainer>
          <Treemap data={donnees} dataKey="value" stroke="#020617" isAnimationActive={false} content={<Case onOuvrir={onOuvrir} />}>
            <Tooltip content={<Infobulle />} />
          </Treemap>
        </ResponsiveContainer>
      </div>
      <p className="text-micro text-slate-500">
        Composition au {new Date(`${COMPOSITION_CAC40_AU}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}.
        Taille = capitalisation
        {instantane ? ` (instantané du ${new Date(instantane).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })})` : ""} ; couleur =
        variation du jour, saturée à ±{SATURATION_PCT} %. Clic sur une case pour ouvrir la valeur.
        {sansTaille.length > 0 && ` Sans capitalisation connue, donc absentes : ${sansTaille.join(", ")}.`}
      </p>
    </div>
  );
}

function Infobulle({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d?.ticker) return null;
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900/95 px-3 py-2 text-xs shadow-xl">
      <p className="font-semibold text-slate-100">{d.name}</p>
      <p className="text-slate-500">
        {d.ticker} · {d.secteur}
      </p>
      <p className={`font-data mt-1 ${d.variation >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{d.variation != null ? pct(d.variation, 2) : "—"}</p>
      <p className="text-slate-500">Capitalisation {compact(d.value)} €</p>
    </div>
  );
}

// Une case du treemap. recharts dessine aussi la racine (profondeur 0) et les
// secteurs (profondeur 1) : la racine n'est pas dessinée, les secteurs le sont
// en simple liseré, pour que les familles se lisent sans légende.
function Case(props) {
  const { x, y, width, height, depth, ticker, name, variation, detenu, onOuvrir } = props;
  if (!width || !height || width <= 0 || height <= 0 || depth === 0) return null;
  if (depth === 1) {
    return <rect x={x} y={y} width={width} height={height} fill="none" stroke="#020617" strokeWidth={3} pointerEvents="none" />;
  }
  if (!ticker) return null;
  const grand = width > 64 && height > 38;
  const moyen = !grand && width > 34 && height > 22;
  return (
    <g
      onClick={() => onOuvrir?.(ticker)}
      style={{ cursor: onOuvrir ? "pointer" : "default" }}
      role="button"
      aria-label={`${name}, ${variation != null ? pctPlain(variation, 2) : "variation inconnue"}`}
    >
      <rect x={x} y={y} width={width} height={height} fill={couleurVariation(variation)} stroke="#020617" strokeWidth={1} />
      {detenu && <rect x={x + 2} y={y + 2} width={Math.max(0, width - 4)} height={Math.max(0, height - 4)} fill="none" stroke="#fbbf24" strokeWidth={2} rx={2} />}
      {(grand || moyen) && (
        <foreignObject x={x} y={y} width={width} height={height} pointerEvents="none">
          <div className="w-full h-full flex flex-col items-center justify-center p-0.5 overflow-hidden text-center leading-tight">
            <span className={`text-white font-semibold truncate max-w-full ${grand ? "text-[11px]" : "text-[9px]"}`}>{grand ? name : ticker.replace(/\.(PA|AS)$/, "")}</span>
            {variation != null && <span className={`text-white/80 font-data ${grand ? "text-[10px]" : "text-[9px]"}`}>{pct(variation, 1)}</span>}
          </div>
        </foreignObject>
      )}
    </g>
  );
}
