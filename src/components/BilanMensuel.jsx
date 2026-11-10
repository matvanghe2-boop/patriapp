import { useMemo, useState } from "react";
import { CalendarClock, X, TrendingUp, TrendingDown, ShieldCheck, RefreshCw, Play } from "lucide-react";
import Recit, { Etiquette } from "./Recit";
import Montant from "./Montant";
import { Card, CardLabel, CARD_THEMES } from "./ui";
import { eur, pctPlain, todayIso, nombre } from "../lib/finance";
import { revisionReferencesEchue, PERIODICITE_REVISION_MOIS } from "../../shared/horizon";

/**
 * Bilan mensuel proactif (jalon 9 de HORIZON_SPEC.md).
 *
 * Horizon souffre du défaut que la spec identifie dès le départ : on ouvre un
 * simulateur quand on a une décision à prendre, donc rarement. Ce bilan inverse
 * la charge — c'est l'application qui signale ce qui a bougé.
 *
 * Volontairement **sans IA** : il ne consomme aucun quota, ne sort aucune
 * donnée, et reste identique en mode dégradé. Un bilan qui dépend d'un
 * fournisseur externe cesserait d'apparaître le jour où le quota est épuisé,
 * c'est-à-dire au pire moment.
 *
 * Il porte aussi le rappel de revue semestrielle des valeurs de référence
 * (§10 bis), qui n'a nulle part ailleurs où vivre.
 */
export default function BilanMensuel({
  patrimoineNet = 0,
  historyPast = [],
  tauxEpargnePct = 0,
  epargneSecuriteMois = null,
  dernierBilan,
  onVu,
  aujourdhui = new Date(),
}) {
  const bilan = useMemo(
    () => construireBilan({ patrimoineNet, historyPast, tauxEpargnePct, epargneSecuriteMois, aujourdhui }),
    [patrimoineNet, historyPast, tauxEpargnePct, epargneSecuriteMois, aujourdhui]
  );

  const [recit, setRecit] = useState(false);

  if (!bilanEstDu(dernierBilan, aujourdhui)) return null;

  // Le même bilan, raconté diapositive après diapositive (Recit.jsx).
  const mois = new Date(aujourdhui.getFullYear(), aujourdhui.getMonth() - 1, 15).toLocaleDateString("fr-FR", { month: "long" });
  const TEINTES = { positif: 152, negatif: 350, neutre: 200 };
  const diapos = [
    {
      cle: "intro",
      teinte: 188,
      contenu: (
        <>
          <Etiquette>Bilan du mois</Etiquette>
          <p className="recit-grand first-letter:uppercase">{mois}</p>
          <p className="recit-phrase">Trente jours de patrimoine, en {bilan.constats.length + 1} temps.</p>
        </>
      ),
    },
    {
      cle: "patrimoine",
      teinte: 168,
      contenu: (
        <>
          <Etiquette>Patrimoine net aujourd&apos;hui</Etiquette>
          <p className="recit-grand">
            <Montant valeur={patrimoineNet} decimales={0} rouleaux depart={bilan.reference ?? undefined} />
          </p>
          {bilan.reference != null && (
            <p className="recit-note">
              Il y a trente jours : <Montant valeur={bilan.reference} decimales={0} />
            </p>
          )}
        </>
      ),
    },
    ...bilan.constats.map((c) => ({
      cle: c.cle + c.ton,
      teinte: TEINTES[c.ton] ?? 200,
      contenu: (
        <>
          <Etiquette>{c.cle === "variation" ? "Sur trente jours" : c.cle === "epargne" ? "Effort d'épargne" : "Matelas de sécurité"}</Etiquette>
          <p className="recit-phrase">{c.texte}</p>
        </>
      ),
    })),
    {
      cle: "fin",
      teinte: 188,
      contenu: (
        <>
          <Etiquette>À dans un mois</Etiquette>
          <p className="recit-phrase">Calculé dans ton navigateur, sans appel à un modèle.</p>
          <div className="recit-actions">
            <button type="button" onClick={() => setRecit(false)}>
              Fermer
            </button>
          </div>
        </>
      ),
    },
  ];

  return (
    <Card accent={CARD_THEMES.cyan}>
      {recit && <Recit diapos={diapos} titre={`Bilan de ${mois}`} onFermer={() => setRecit(false)} duree={5500} />}
      <div className="flex items-start justify-between gap-4">
        <CardLabel icon={CalendarClock}>Bilan du mois</CardLabel>
        <button
          type="button"
          onClick={() => setRecit(true)}
          className="ml-auto flex items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 py-1 text-xs text-slate-300 hover:border-cyan-400/50 hover:text-cyan-200"
        >
          <Play size={12} aria-hidden="true" /> Voir en récit
        </button>
        <button
          onClick={() => onVu?.(todayIso())}
          aria-label="Masquer le bilan du mois"
          className="text-slate-500 hover:text-slate-200 transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      <div className="space-y-2.5">
        {bilan.constats.map((c) => (
          <div key={c.cle} className="flex items-start gap-2.5 text-sm">
            <span className={`mt-0.5 shrink-0 ${c.ton === "positif" ? "text-emerald-400" : c.ton === "negatif" ? "text-rose-400" : "text-slate-500"}`}>
              {c.ton === "positif" ? <TrendingUp size={14} /> : c.ton === "negatif" ? <TrendingDown size={14} /> : <ShieldCheck size={14} />}
            </span>
            <p className="text-slate-300">{c.texte}</p>
          </div>
        ))}

        {bilan.revision.echue && (
          <div className="flex items-start gap-2.5 text-sm pt-2 border-t border-slate-800">
            <RefreshCw size={14} className="mt-0.5 shrink-0 text-amber-400" />
            <p className="text-amber-200/90">
              Les valeurs de référence (coûts de possession, barèmes fiscaux, rendements) datent de{" "}
              {bilan.revision.moisEcoules} mois. Une relecture est prévue tous les{" "}
              {PERIODICITE_REVISION_MOIS} mois — elles restent utilisables entre-temps, et
              modifiables à la main dans le tableau d&apos;hypothèses.
            </p>
          </div>
        )}
      </div>

      <p className="text-xs text-slate-500 mt-3">
        Calculé dans ton navigateur, sans appel à un modèle. S&apos;affiche une fois par mois.
      </p>
    </Card>
  );
}

/** Le bilan est-il dû ? Jamais vu, ou vu il y a plus de 30 jours. */
export function bilanEstDu(dernierBilan, aujourdhui = new Date()) {
  if (!dernierBilan) return true;
  const vu = new Date(dernierBilan);
  if (Number.isNaN(vu.getTime())) return true;
  return (aujourdhui - vu) / 86400000 >= 30;
}

/**
 * Construit les constats du mois.
 *
 * Chaque constat est chiffré et porte un ton, pour que l'œil aille d'abord à ce
 * qui se dégrade. Aucun conseil : ce sont des faits, la décision reste à
 * l'utilisateur.
 */
export function construireBilan({
  patrimoineNet = 0,
  historyPast = [],
  tauxEpargnePct = 0,
  epargneSecuriteMois = null,
  aujourdhui = new Date(),
}) {
  const constats = [];

  // ─── Variation sur 30 jours ────────────────────────────────────────────────
  const seuil = new Date(aujourdhui.getTime() - 30 * 86400000);
  const anciens = (historyPast || [])
    .filter((h) => h?.date && new Date(h.date) <= seuil)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const reference = anciens[anciens.length - 1];

  if (reference && reference.value > 0) {
    const ecart = patrimoineNet - reference.value;
    const ecartPct = (ecart / reference.value) * 100;
    constats.push({
      cle: "variation",
      ton: ecart >= 0 ? "positif" : "negatif",
      texte: `Ton patrimoine net a ${ecart >= 0 ? "progressé" : "reculé"} de ${eur(Math.abs(ecart))} sur 30 jours (${pctPlain(Math.abs(ecartPct))}).`,
    });
  } else {
    constats.push({
      cle: "variation",
      ton: "neutre",
      texte: "Pas encore 30 jours de relevés : la variation mensuelle apparaîtra le mois prochain.",
    });
  }

  // ─── Effort d'épargne ──────────────────────────────────────────────────────
  if (tauxEpargnePct > 0) {
    constats.push({
      cle: "epargne",
      ton: tauxEpargnePct >= 20 ? "positif" : "neutre",
      texte: `Ton taux d'épargne est de ${pctPlain(tauxEpargnePct)} de tes revenus.`,
    });
  }

  // ─── Matelas de sécurité ───────────────────────────────────────────────────
  if (epargneSecuriteMois != null) {
    const suffisant = epargneSecuriteMois >= 3;
    constats.push({
      cle: "matelas",
      ton: suffisant ? "positif" : "negatif",
      texte: suffisant
        ? `Ton épargne de sécurité couvre ${nombre(epargneSecuriteMois, 1)} mois de dépenses.`
        : `Ton épargne de sécurité ne couvre que ${nombre(epargneSecuriteMois, 1)} mois de dépenses — en dessous des trois mois habituellement retenus.`,
    });
  }

  return {
    constats,
    revision: revisionReferencesEchue(aujourdhui),
    // Le relevé d'il y a trente jours, d'où le récit fait rouler le montant.
    reference: reference && reference.value > 0 ? reference.value : null,
  };
}
