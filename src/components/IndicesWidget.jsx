import { useEffect, useMemo, useState } from "react";
import { ArrowUp, ArrowDown } from "lucide-react";
import { fetchQuotes } from "../lib/api";
import { INDEX_TABS, INDEX_CONSTITUENTS, COMPOSITION_CAC40_AU } from "../lib/indexConstituents";
import { pctPlain } from "../lib/finance";
import AssetLogo from "./AssetLogo";

function pctChange(q) {
  if (!q?.ok || !q.previousClose || !q.price) return null;
  return ((q.price - q.previousClose) / q.previousClose) * 100;
}

function nomCourt(name, symbol) {
  if (!name) return symbol;
  return name.length > 22 ? `${name.slice(0, 20)}…` : name;
}

/** Secondes de défilement par valeur : assez lent pour lire en passant. */
const SECONDES_PAR_VALEUR = 2.6;

/**
 * Les trois indices de l'onglet Marché, et le bandeau de leurs valeurs.
 *
 * Trois boutons — CAC 40, S&P 500, Nasdaq — donnent la variation de chaque
 * indice ; celui qui est choisi alimente le bandeau qui défile dessous, une
 * pastille par valeur, colorée par sa variation du jour. Le bandeau remplace
 * la carte du CAC 40 et les listes « meilleures / pires » des deux indices
 * américains : les trois se présentent désormais de la même façon.
 *
 * Les lignes détenues sont mises en évidence (`tickersDetenus`), un clic sur
 * une valeur l'ouvre dans Marché (`onOuvrir`), et son survol en donne
 * l'aperçu. Le survol ou le focus arrête le défilement ; en mouvement réduit,
 * le bandeau est immobile et se parcourt à la main.
 */
export default function IndicesWidget({ onOuvrir, tickersDetenus = [] }) {
  const [actif, setActif] = useState("cac40");
  const [indexQuotes, setIndexQuotes] = useState({});
  const [valeursParIndice, setValeursParIndice] = useState({});

  useEffect(() => {
    let stop = false;
    const charger = async () => {
      try {
        const quotes = await fetchQuotes(INDEX_TABS.map((t) => t.symbol));
        if (stop) return;
        setIndexQuotes(Object.fromEntries(quotes.map((q) => [q.symbol, q])));
      } catch {}
    };
    charger();
    const id = setInterval(charger, 5 * 60 * 1000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, []);

  // Les valeurs de l'indice choisi, chargées une fois par indice puis
  // rafraîchies toutes les cinq minutes tant qu'il reste affiché.
  useEffect(() => {
    let stop = false;
    const charger = async () => {
      try {
        const quotes = await fetchQuotes(INDEX_CONSTITUENTS[actif] || []);
        if (stop) return;
        const lignes = quotes
          .map((q) => ({ symbol: q.symbol, nom: nomCourt(q.name, q.symbol), pct: pctChange(q) }))
          .filter((r) => r.pct != null);
        setValeursParIndice((m) => ({ ...m, [actif]: lignes }));
      } catch {
        if (!stop) setValeursParIndice((m) => ({ ...m, [actif]: m[actif] || [] }));
      }
    };
    charger();
    const id = setInterval(charger, 5 * 60 * 1000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [actif]);

  const detenus = useMemo(() => new Set(tickersDetenus.map((t) => String(t).toUpperCase())), [tickersDetenus]);
  const valeurs = valeursParIndice[actif];
  const libelle = INDEX_TABS.find((t) => t.key === actif)?.label;

  return (
    <div className="relative rounded-2xl border border-slate-800 bg-slate-900 p-3">
      <div className="grid grid-cols-3 gap-2" role="group" aria-label="Indice affiché dans le bandeau">
        {INDEX_TABS.map((t) => {
          const pct = pctChange(indexQuotes[t.symbol]);
          const up = pct != null && pct >= 0;
          const choisi = actif === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setActif(t.key)}
              aria-pressed={choisi}
              className={`flex flex-col items-center gap-0.5 rounded-xl border px-3 py-2 transition-colors ${
                choisi ? "border-violet-500/50 bg-violet-500/10" : "border-slate-800 hover:border-slate-700"
              }`}
            >
              <span className="text-xs font-medium text-slate-300">{t.label}</span>
              {pct == null ? (
                <span className="text-micro text-slate-500">—</span>
              ) : (
                <span className={`flex items-center gap-1 font-data text-sm font-bold ${up ? "text-emerald-400" : "text-rose-400"}`}>
                  {up ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
                  {up ? "+" : ""}
                  {pctPlain(pct, 2)}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-3 pt-3 border-t border-slate-800">
        {valeurs === undefined ? (
          <p className="text-micro text-slate-500 px-1">Chargement des valeurs du {libelle}…</p>
        ) : valeurs.length === 0 ? (
          <p className="text-micro text-slate-500 px-1">Cours des valeurs du {libelle} indisponibles pour le moment.</p>
        ) : (
          <Bandeau valeurs={valeurs} detenus={detenus} onOuvrir={onOuvrir} libelle={libelle} />
        )}
        <p className="text-micro text-slate-500 mt-2 px-1">
          {actif === "cac40"
            ? `Les 40 valeurs de l'indice (composition au ${new Date(`${COMPOSITION_CAC40_AU}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}), variation depuis la clôture de la veille.`
            : "Échantillon de grandes capitalisations de l'indice, pas la totalité des composants."}{" "}
          Survole pour arrêter le défilement ; tes lignes sont entourées.
        </p>
      </div>
    </div>
  );
}

function Bandeau({ valeurs, detenus, onOuvrir, libelle }) {
  // Le contenu est doublé : la piste glisse de la moitié de sa largeur et
  // retombe exactement sur son début. La copie est cachée aux lecteurs
  // d'écran et sortie de l'ordre de tabulation.
  const pastille = (v, copie) => {
    const hausse = v.pct >= 0;
    return (
      <button
        key={`${copie ? "b" : "a"}-${v.symbol}`}
        type="button"
        onClick={() => onOuvrir?.(v.symbol)}
        tabIndex={copie ? -1 : undefined}
        aria-hidden={copie || undefined}
        data-apercu={v.symbol}
        data-detenue={detenus.has(String(v.symbol).toUpperCase()) ? "" : undefined}
        className="bandeau-valeur"
        title={`Ouvrir ${v.nom} dans Marché`}
      >
        <AssetLogo ticker={v.symbol} name={v.nom} size="xs" />
        <span className="text-slate-200">{v.nom}</span>
        <span className={`font-data tabular-nums ${hausse ? "text-emerald-400" : "text-rose-400"}`}>
          {hausse ? "+" : ""}
          {pctPlain(v.pct, 2)}
        </span>
      </button>
    );
  };

  return (
    <div className="bandeau-indice" role="region" aria-label={`Valeurs du ${libelle}`}>
      <div className="bandeau-piste" style={{ "--duree-bandeau": `${Math.max(20, valeurs.length * SECONDES_PAR_VALEUR)}s` }}>
        {valeurs.map((v) => pastille(v, false))}
        {valeurs.map((v) => pastille(v, true))}
      </div>
    </div>
  );
}
