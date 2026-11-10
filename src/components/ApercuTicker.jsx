import { useEffect, useRef, useState } from "react";
import AssetLogo from "./AssetLogo";
import { Sparkline } from "./graphiques";
import { usePatrimoine } from "../lib/PatrimoineContext";
import { fetchHistory, fetchQuotes } from "../lib/api";
import { eur, pctPlain, valeurPosition } from "../lib/finance";
import { styleMarque } from "../lib/couleursMarques";
import { pointeurFin } from "../lib/mouvement";

/**
 * Aperçu d'une valeur au survol de son ticker, n'importe où dans l'application.
 *
 * Pour savoir où en est une ligne citée dans le journal, l'agenda ou la
 * watchlist, il fallait ouvrir sa fiche puis la refermer. Un survol suffit
 * désormais : cours, variation du jour, un mois de courbe et, pour une ligne
 * détenue, sa valeur et son poids.
 *
 * Tout élément portant `data-apercu="TICKER"` le déclenche — par délégation,
 * sans rien à brancher composant par composant. À la souris, après un court
 * temps de survol ; au doigt, par un appui long (le clic qui suit est alors
 * avalé, pour ne pas ouvrir la fiche en même temps). Au clavier, au focus.
 *
 * Les données de marché sont mises en cache le temps de la visite (une
 * minute pour le cours, dix pour la courbe) : survoler dix fois la même ligne
 * ne coûte qu'un appel.
 */
const DELAI_SURVOL_MS = 380;
const DELAI_APPUI_MS = 480;
const cacheCours = new Map();
const cacheCourbe = new Map();

function enCache(cache, cle, duree, charger) {
  const e = cache.get(cle);
  if (e && Date.now() - e.t < duree) return e.p;
  const p = charger().catch(() => null);
  cache.set(cle, { t: Date.now(), p });
  return p;
}

export default function ApercuTicker() {
  const { bourse, watchlist = [] } = usePatrimoine();
  const [ouvert, setOuvert] = useState(null); // { ticker, rect }
  const [cours, setCours] = useState(null);
  const [courbe, setCourbe] = useState(null);
  const minuterie = useRef(0);
  const fermeture = useRef(0);
  const avalerClic = useRef(false);

  // ── Déclencheurs, par délégation ─────────────────────────────────────────
  useEffect(() => {
    const cibleDe = (e) => e.target?.closest?.("[data-apercu]");
    const montrer = (el) => {
      clearTimeout(fermeture.current);
      const ticker = el.getAttribute("data-apercu");
      if (!ticker) return;
      setCours(null);
      setCourbe(null);
      setOuvert({ ticker: ticker.toUpperCase(), rect: el.getBoundingClientRect() });
    };
    const cacherBientot = () => {
      clearTimeout(minuterie.current);
      clearTimeout(fermeture.current);
      fermeture.current = setTimeout(() => setOuvert(null), 140);
    };

    const surSurvol = (e) => {
      if (e.pointerType !== "mouse" || !pointeurFin()) return;
      const el = cibleDe(e);
      if (!el) return;
      clearTimeout(minuterie.current);
      clearTimeout(fermeture.current);
      minuterie.current = setTimeout(() => montrer(el), DELAI_SURVOL_MS);
    };
    const surSortie = (e) => {
      if (e.pointerType !== "mouse") return;
      const el = cibleDe(e);
      if (!el || el.contains(e.relatedTarget)) return;
      cacherBientot();
    };
    const surAppui = (e) => {
      if (e.pointerType === "mouse") return;
      const el = cibleDe(e);
      if (!el) {
        if (!e.target?.closest?.(".apercu-ticker")) setOuvert(null);
        return;
      }
      const x = e.clientX;
      const y = e.clientY;
      clearTimeout(minuterie.current);
      minuterie.current = setTimeout(() => {
        avalerClic.current = true;
        montrer(el);
      }, DELAI_APPUI_MS);
      const annuler = (ev) => {
        if (ev.type === "pointermove" && Math.hypot(ev.clientX - x, ev.clientY - y) < 10) return;
        clearTimeout(minuterie.current);
        document.removeEventListener("pointermove", annuler);
        document.removeEventListener("pointerup", annuler);
        document.removeEventListener("pointercancel", annuler);
      };
      document.addEventListener("pointermove", annuler, { passive: true });
      document.addEventListener("pointerup", annuler, { passive: true });
      document.addEventListener("pointercancel", annuler, { passive: true });
    };
    const surClic = (e) => {
      if (!avalerClic.current) return;
      avalerClic.current = false;
      e.preventDefault();
      e.stopPropagation();
    };
    const surFocus = (e) => {
      const el = cibleDe(e);
      if (el && el.matches(":focus-visible")) montrer(el);
    };
    const surPerteFocus = (e) => {
      if (cibleDe(e)) cacherBientot();
    };
    const surTouche = (e) => {
      if (e.key === "Escape") setOuvert(null);
    };
    const surDefilement = () => setOuvert(null);

    document.addEventListener("pointerover", surSurvol, { passive: true });
    document.addEventListener("pointerout", surSortie, { passive: true });
    document.addEventListener("pointerdown", surAppui, { passive: true });
    document.addEventListener("click", surClic, true);
    document.addEventListener("focusin", surFocus);
    document.addEventListener("focusout", surPerteFocus);
    document.addEventListener("keydown", surTouche);
    window.addEventListener("scroll", surDefilement, { passive: true });
    return () => {
      clearTimeout(minuterie.current);
      clearTimeout(fermeture.current);
      document.removeEventListener("pointerover", surSurvol);
      document.removeEventListener("pointerout", surSortie);
      document.removeEventListener("pointerdown", surAppui);
      document.removeEventListener("click", surClic, true);
      document.removeEventListener("focusin", surFocus);
      document.removeEventListener("focusout", surPerteFocus);
      document.removeEventListener("keydown", surTouche);
      window.removeEventListener("scroll", surDefilement);
    };
  }, []);

  // ── Données de marché ────────────────────────────────────────────────────
  const ticker = ouvert?.ticker;
  useEffect(() => {
    if (!ticker) return undefined;
    let actif = true;
    enCache(cacheCours, ticker, 60_000, () => fetchQuotes([ticker])).then((r) => {
      if (actif) setCours(r?.find?.((q) => q?.ok) || null);
    });
    enCache(cacheCourbe, ticker, 600_000, () => fetchHistory([ticker], "1mo", "1d")).then((r) => {
      const serie = r?.find?.((x) => x?.ok)?.series;
      if (actif) setCourbe(serie ? serie.map((p) => p.close).filter(Number.isFinite) : null);
    });
    return () => {
      actif = false;
    };
  }, [ticker]);

  if (!ouvert) return null;

  const positions = bourse?.positions || [];
  const position = positions.find((p) => String(p.ticker).toUpperCase() === ticker);
  const suivi = watchlist.find((w) => String(w.ticker).toUpperCase() === ticker);
  const total = positions.reduce((s, p) => s + valeurPosition(p), 0);
  const prix = cours?.price ?? position?.current_price ?? null;
  const veille = cours?.previousClose ?? position?.previousClose ?? null;
  const variation = prix && veille ? ((prix - veille) / veille) * 100 : null;
  const valeur = position ? valeurPosition(position) : null;
  const nom = cours?.name || position?.name || suivi?.name || ticker;

  // Sous l'élément s'il y a la place, au-dessus sinon ; jamais hors de l'écran.
  const LARGEUR = 260;
  const { rect } = ouvert;
  const enDessous = rect.bottom + 190 < window.innerHeight;
  const gauche = Math.max(8, Math.min(rect.left, window.innerWidth - LARGEUR - 8));
  const style = {
    ...styleMarque(ticker),
    left: gauche,
    width: LARGEUR,
    ...(enDessous ? { top: rect.bottom + 8 } : { bottom: window.innerHeight - rect.top + 8 }),
  };

  return (
    <div
      role="tooltip"
      className={`apercu-ticker avec-marque ${enDessous ? "apercu-dessous" : "apercu-dessus"}`}
      style={style}
      onPointerEnter={() => clearTimeout(fermeture.current)}
      onPointerLeave={() => setOuvert(null)}
    >
      <div className="flex items-center gap-2.5">
        <AssetLogo ticker={ticker} name={nom} size="sm" className="logo-marque" />
        <div className="min-w-0">
          <p className="text-sm text-slate-100 font-medium truncate">{nom}</p>
          <p className="text-micro text-slate-500 font-data">{ticker}</p>
        </div>
      </div>

      <div className="flex items-end justify-between gap-3 mt-3">
        <div>
          <p className="font-data tabular-nums text-lead text-slate-50">{prix != null ? eur(prix, 2) : "—"}</p>
          {variation != null && (
            <p className={`text-micro font-data ${variation >= 0 ? "etat-ok" : "etat-critique"}`}>
              {variation >= 0 ? "+" : ""}
              {pctPlain(variation, 2)} aujourd'hui
            </p>
          )}
        </div>
        {courbe && courbe.length > 2 && (
          <Sparkline
            valeurs={courbe}
            className={`w-24 h-9 shrink-0 ${courbe.at(-1) >= courbe[0] ? "text-emerald-400" : "text-rose-400"}`}
          />
        )}
      </div>

      {position && (
        <dl className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-slate-800 text-micro">
          <div>
            <dt className="text-slate-500">Ta ligne</dt>
            <dd className="font-data text-slate-200 ghost-blur">{eur(valeur)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Poids</dt>
            <dd className="font-data text-slate-200">{total > 0 ? pctPlain((valeur / total) * 100, 1) : "—"}</dd>
          </div>
        </dl>
      )}
      {!position && suivi?.target_price > 0 && (
        <p className="mt-3 pt-3 border-t border-slate-800 text-micro text-slate-400">
          Dans ta watchlist · objectif <span className="font-data text-slate-200">{eur(suivi.target_price, 2)}</span>
        </p>
      )}
    </div>
  );
}
