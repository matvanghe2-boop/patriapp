import { forwardRef, useState } from "react";
import { RotateCcw, BookOpen, NotebookPen, Coins, CalendarClock } from "lucide-react";
import AssetLogo from "./AssetLogo";
import { Sparkline } from "./graphiques";
import { eur, pct, pctPlain, valeurPosition, todayIso } from "../lib/finance";
import { styleMarque } from "../lib/couleursMarques";

/**
 * Les positions en cartes à retourner — la vue « Cartes » du bloc Positions.
 *
 * Le tableau compare ; la carte raconte une ligne. Au recto, ce qu'elle vaut
 * et ce qu'elle a rapporté, à la couleur de son entreprise ; au verso, pourquoi
 * on la détient (la thèse notée dans Stratégie), ce qu'elle verse et son
 * prochain rendez-vous. Les chiffres sont ceux du tableau, rien n'est
 * recalculé à part.
 *
 * Accessibilité : chaque face est un ensemble à part. Le recto est un bouton
 * « Retourner » ; la face cachée est rendue inerte, pour qu'on ne tabule
 * jamais dans un texte invisible.
 */
const CartesPositions = forwardRef(function CartesPositions(
  { positions, total, strategyNotes = [], evenements = [], seriesCours = {}, onOuvrirFiche },
  ref
) {
  return (
    <div ref={ref} className="cartes-positions grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
      {positions.map((p, i) => (
        <CartePosition
          key={p.id}
          rang={i}
          position={p}
          total={total}
          these={derniereThese(strategyNotes, p.ticker)}
          prochain={prochainEvenement(evenements, p.ticker)}
          serie={(seriesCours?.[p.ticker] || []).map((pt) => pt.p).filter(Number.isFinite)}
          onOuvrirFiche={onOuvrirFiche}
        />
      ))}
    </div>
  );
});
export default CartesPositions;

function derniereThese(notes, ticker) {
  const t = String(ticker || "").toUpperCase();
  return (
    notes
      .filter((n) => String(n.ticker || "").toUpperCase() === t && !n.archivee && n.these)
      .sort((a, b) => String(b.date || b.createdAt || "").localeCompare(String(a.date || a.createdAt || "")))[0] || null
  );
}

function prochainEvenement(evenements, ticker) {
  const t = String(ticker || "").toUpperCase().replace(/\.[A-Z]{1,3}$/, "");
  const aujourdhui = todayIso();
  return (
    evenements
      .filter((e) => e?.date >= aujourdhui && String(e.ticker || "").toUpperCase().replace(/\.[A-Z]{1,3}$/, "") === t)
      .sort((a, b) => (a.date < b.date ? -1 : 1))[0] || null
  );
}

function CartePosition({ rang, position: p, total, these, prochain, serie = [], onOuvrirFiche }) {
  const [retournee, setRetournee] = useState(false);
  const valeur = valeurPosition(p);
  const cout = (Number(p.pru) || 0) * (Number(p.quantity) || 0);
  const gain = valeur - cout;
  const gainPct = cout > 0 ? (gain / cout) * 100 : 0;
  const poids = total > 0 ? (valeur / total) * 100 : 0;
  const dividende = (Number(p.annual_dividend) || 0) * (Number(p.quantity) || 0);
  const nom = p.name || p.ticker;

  return (
    <div
      className="carte-position avec-marque"
      data-flip={p.id}
      data-relief=""
      data-retournee={retournee ? "" : undefined}
      style={{ ...styleMarque(p.ticker), "--i": Math.min(rang, 12) }}
    >
      <div className="carte-position-interieur">
        {/* ── Recto ── */}
        <button
          type="button"
          className="carte-position-face carte-position-recto"
          onClick={() => setRetournee(true)}
          inert={retournee}
          aria-label={`${nom} : retourner la carte pour voir la thèse, le dividende et la prochaine date`}
          data-ligne={p.id}
        >
          <span className="flex items-center gap-2.5 min-w-0">
            <span data-morph="logo" className="inline-flex shrink-0">
              <AssetLogo ticker={p.ticker} name={nom} size="md" className="logo-marque" />
            </span>
            <span className="min-w-0 text-left">
              <span data-morph="nom" className="block w-fit max-w-full truncate text-sm font-medium text-slate-100">
                {p.ticker}
              </span>
              <span className="block truncate text-micro text-slate-500">{nom}</span>
            </span>
          </span>

          <span className="flex items-end justify-between gap-3 text-left mt-4">
            <span className="min-w-0">
            <span className="block font-data tabular-nums text-chiffre text-slate-50 ghost-blur">{eur(valeur)}</span>
            <span className={`block text-mini font-data ${gain >= 0 ? "etat-ok" : "etat-critique"}`}>
              <span className="ghost-blur">
                {gain >= 0 ? "+" : "−"}
                {eur(Math.abs(gain))}
              </span>{" "}
              ({pct(gainPct, 1)})
            </span>
            </span>
            {serie.length > 2 && (
              <Sparkline
                valeurs={serie}
                className={`w-20 h-8 shrink-0 ${serie.at(-1) >= serie[0] ? "text-emerald-400/80" : "text-rose-400/80"}`}
              />
            )}
          </span>

          <span className="block mt-auto pt-3 text-left">
            <span className="flex items-center justify-between text-micro text-slate-500">
              <span>Poids</span>
              <span className="font-data text-slate-300">{pctPlain(poids, 1)}</span>
            </span>
            <span className="barre-poids" aria-hidden="true">
              <span style={{ "--poids": `${Math.min(100, poids).toFixed(1)}%` }} />
            </span>
          </span>
          <RotateCcw size={13} className="carte-position-indice" aria-hidden="true" />
        </button>

        {/* ── Verso ── */}
        <div className="carte-position-face carte-position-verso" inert={!retournee}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-200 truncate">{nom}</span>
            <button
              type="button"
              onClick={() => setRetournee(false)}
              className="text-slate-500 hover:text-slate-200 p-1 -m-1"
              aria-label="Revenir au recto"
            >
              <RotateCcw size={14} />
            </button>
          </div>

          <div className="mt-2.5 space-y-2.5 text-micro">
            <p className="flex gap-2">
              <NotebookPen size={13} className="shrink-0 mt-0.5 text-rose-300" aria-hidden="true" />
              <span className="text-slate-300 line-clamp-3">
                {these ? these.these : <span className="text-slate-500">Aucune thèse notée — l'onglet Stratégie permet d'écrire pourquoi tu la détiens.</span>}
              </span>
            </p>
            <p className="flex gap-2 items-center">
              <Coins size={13} className="shrink-0 text-emerald-300" aria-hidden="true" />
              {dividende > 0 ? (
                <span className="text-slate-300">
                  <span className="font-data ghost-blur">{eur(dividende)}</span> par an ·{" "}
                  <span className="font-data">{pctPlain(p.current_price > 0 ? (p.annual_dividend / p.current_price) * 100 : 0, 2)}</span> de rendement
                </span>
              ) : (
                <span className="text-slate-500">Pas de dividende connu</span>
              )}
            </p>
            <p className="flex gap-2 items-center">
              <CalendarClock size={13} className="shrink-0 text-amber-300" aria-hidden="true" />
              {prochain ? (
                <span className="text-slate-300">
                  {prochain.label || prochain.type} ·{" "}
                  {new Date(`${prochain.date}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}
                </span>
              ) : (
                <span className="text-slate-500">Pas de date connue dans l'agenda</span>
              )}
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              // La carte se remet au recto pendant que la fiche s'ouvre : à la
              // fermeture, le logo et le nom y reviennent (lib/morph.js), sur
              // une face visible.
              setRetournee(false);
              onOuvrirFiche?.(p.id);
            }}
            className="btn-flash mt-auto flex items-center justify-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:border-violet-400/50"
          >
            <BookOpen size={13} aria-hidden="true" /> Fiche complète
          </button>
        </div>
      </div>
    </div>
  );
}
