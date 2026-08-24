import { useEffect } from "react";
import { X, TrendingUp, TrendingDown } from "lucide-react";
import { createPortal } from "react-dom";
import { eur, pct } from "../lib/finance";
import { useValeurAnimee } from "./ui";

/**
 * Mode présentation.
 *
 * Le mode Ghost sert à montrer son écran SANS les chiffres. Le besoin inverse
 * existe tout autant : les montrer, en grand, à quelqu'un assis à côté, sur un
 * écran externe, ou simplement pour que l'application reste lisible posée sur
 * un bureau à un mètre.
 *
 * Trois partis pris :
 *
 *  · **Rien d'autre que les chiffres.** Pas de navigation, pas de carte, pas
 *    de bouton hormis la sortie. Un mode présentation qui garde son interface
 *    ne présente rien, il agrandit.
 *  · **L'écran reste allumé** tant qu'il est actif, via `wakeLock` quand le
 *    navigateur l'expose. C'est le seul mode de l'application où l'on ne
 *    touche pas l'appareil pendant plusieurs minutes.
 *  · **Le mode Ghost reste prioritaire.** S'il est actif, les montants
 *    demeurent caviardés : on ne veut pas qu'un raccourci de présentation
 *    déshabille un écran qu'on avait délibérément masqué.
 */
export default function ModePresentation({ ouvert, onFermer, patrimoineNet, deltaPct, tauxEpargne, matelasMois }) {
  const valeur = useValeurAnimee(ouvert ? patrimoineNet : 0);

  // Échap pour sortir : c'est la convention de tout affichage plein écran, et
  // le seul geste disponible quand l'interface a disparu.
  useEffect(() => {
    if (!ouvert) return undefined;
    const surTouche = (e) => {
      if (e.key === "Escape") onFermer?.();
    };
    document.addEventListener("keydown", surTouche);
    return () => document.removeEventListener("keydown", surTouche);
  }, [ouvert, onFermer]);

  // Empêche la mise en veille pendant la présentation. L'API n'existe pas
  // partout et se refuse hors contexte sécurisé : l'échec est silencieux, il
  // ne coûte qu'un écran qui s'éteindra normalement.
  useEffect(() => {
    if (!ouvert || typeof navigator === "undefined" || !navigator.wakeLock) return undefined;
    let verrou = null;
    navigator.wakeLock.request("screen").then((v) => { verrou = v; }).catch(() => {});
    return () => {
      verrou?.release?.().catch(() => {});
    };
  }, [ouvert]);

  if (!ouvert) return null;

  const positif = (deltaPct ?? 0) >= 0;

  return createPortal(
    <div className="presentation" role="dialog" aria-modal="true" aria-label="Mode présentation">
      <button
        onClick={onFermer}
        aria-label="Quitter le mode présentation"
        className="presentation-sortie btn-flash text-slate-500 hover:text-slate-100 p-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/40"
      >
        <X size={22} aria-hidden="true" />
      </button>

      <div className="flex flex-col items-center gap-3">
        <span className="presentation-label">Patrimoine net</span>
        <span className="presentation-valeur ghost-blur">{eur(valeur)}</span>
        {deltaPct != null && (
          <span
            className={`flex items-center gap-2 text-lead ${positif ? "etat-ok" : "etat-critique"}`}
          >
            {positif ? <TrendingUp size={20} aria-hidden="true" /> : <TrendingDown size={20} aria-hidden="true" />}
            <span className="font-data">{pct(deltaPct)}</span>
            <span className="text-slate-500 text-corps">sur 30 jours</span>
          </span>
        )}
      </div>

      <div className="presentation-reperes">
        {Number.isFinite(tauxEpargne) && (
          <div className="presentation-repere">
            <b className="ghost-blur">{tauxEpargne.toFixed(0)} %</b>
            <span>Taux d'épargne</span>
          </div>
        )}
        {matelasMois != null && (
          <div className="presentation-repere">
            <b className="ghost-blur">{matelasMois.toFixed(1)}</b>
            <span>Mois de matelas</span>
          </div>
        )}
      </div>

      <p className="text-micro text-slate-600">Échap pour revenir</p>
    </div>,
    document.body
  );
}
