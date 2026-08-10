import { useMemo, useState } from "react";
import { Receipt, ChevronDown, ChevronUp, Info } from "lucide-react";
import { Card, CardLabel, CARD_THEMES } from "./ui";
import { eur, pctPlain, computePeaAge } from "../lib/finance";
import { fiscaliteEnveloppe, BAREMES_FISCAUX } from "../../shared/horizon";

/**
 * Plus-value NETTE après impôt, sur le portefeuille réel.
 *
 * L'application affichait partout une plus-value brute — le chiffre qui fait
 * plaisir, pas celui qu'on encaisse. Elle disposait pourtant déjà de tout ce
 * qu'il faut pour calculer le net : l'enveloppe fiscale, la plus-value latente
 * et, pour le PEA, la date d'ouverture qui conditionne l'exonération.
 *
 * Le calcul lui-même vit dans `shared/horizon.js` (`fiscaliteEnveloppe`), avec
 * les barèmes et leur source. Ce composant ne fait que lui donner les données
 * du portefeuille et présenter le résultat.
 *
 * Il s'agit d'une simulation de sortie TOTALE et immédiate : c'est la borne
 * haute de l'imposition, utile comme repère, pas un conseil fiscal.
 */
export default function FiscaliteSortie({ bourse, bourseGainAbs, bourseTotal }) {
  const [ouvert, setOuvert] = useState(false);

  const enveloppe = bourse?.envelope || "PEA";
  const age = computePeaAge(bourse?.peaOuverture);

  const fisc = useMemo(() => {
    if (!bourseGainAbs || bourseGainAbs <= 0) return null;
    return fiscaliteEnveloppe({
      enveloppe,
      montant: bourseTotal || 0,
      plusValue: bourseGainAbs,
      // Le PEA est la seule enveloppe dont l'app connaît la date d'ouverture.
      // Sans elle, on retient 0 an : le régime le moins favorable, plutôt
      // qu'une exonération supposée qui minorerait l'impôt affiché.
      dureeDetentionAnnees: enveloppe === "PEA" ? (age?.years ?? 0) : 0,
    });
  }, [enveloppe, bourseGainAbs, bourseTotal, age]);

  if (!fisc) {
    return (
      <Card accent={CARD_THEMES.violet}>
        <CardLabel icon={Receipt}>Plus-value nette après impôt</CardLabel>
        <p className="text-sm text-slate-500 mt-1">
          {bourseGainAbs < 0
            ? "Le portefeuille est en moins-value : aucune imposition à simuler. Une moins-value est reportable sur les plus-values des dix années suivantes (hors PEA)."
            : "Aucune plus-value latente à imposer pour le moment."}
        </p>
      </Card>
    );
  }

  const net = bourseGainAbs - fisc.totalPrelevements;

  return (
    <Card accent={CARD_THEMES.violet}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <CardLabel icon={Receipt}>Plus-value nette après impôt</CardLabel>
        <button
          onClick={() => setOuvert((o) => !o)}
          aria-expanded={ouvert}
          className="flex items-center gap-1 text-[11px] text-violet-300/80 hover:text-violet-200"
        >
          {ouvert ? <ChevronUp size={12} aria-hidden="true" /> : <ChevronDown size={12} aria-hidden="true" />}
          Détail
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-2">
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
          <div className="text-[11px] text-slate-500 uppercase tracking-wide">Plus-value brute</div>
          <div className="font-data font-bold text-slate-100 ghost-blur">{eur(bourseGainAbs)}</div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
          <div className="text-[11px] text-slate-500 uppercase tracking-wide">Impôt</div>
          <div className="font-data font-bold text-slate-300 ghost-blur">−{eur(fisc.impotDu)}</div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
          <div className="text-[11px] text-slate-500 uppercase tracking-wide">Prélèvements sociaux</div>
          <div className="font-data font-bold text-slate-300 ghost-blur">−{eur(fisc.prelevementsSociaux)}</div>
        </div>
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3">
          <div className="text-[11px] text-emerald-300/80 uppercase tracking-wide">Net encaissé</div>
          <div className="font-data font-bold text-emerald-400 ghost-blur">{eur(net)}</div>
        </div>
      </div>

      <p className="text-[11px] text-slate-500 mt-2.5">
        {fisc.regimeApplique} — taux effectif de {pctPlain(fisc.tauxEffectifPct, 1)} sur la plus-value.
      </p>

      {enveloppe === "PEA" && age && !age.eligible && (
        <p className="text-[11px] text-amber-300/90 mt-1.5">
          Encore {age.monthsRemaining} mois avant les {BAREMES_FISCAUX.peaDureeExonerationAnnees} ans du
          PEA : attendre ferait tomber l'impôt à 0 € (les prélèvements sociaux resteraient dus).
        </p>
      )}
      {enveloppe === "PEA" && !bourse?.peaOuverture && (
        <p className="text-[11px] text-slate-600 mt-1.5">
          Date d'ouverture du PEA non renseignée : le calcul retient le régime le moins favorable.
        </p>
      )}

      {ouvert && (
        <div className="mt-3 pt-3 border-t border-slate-800 space-y-1.5 text-[11px] text-slate-500">
          <p>
            Simulation d'une <strong className="text-slate-400">sortie totale et immédiate</strong> de
            l'enveloppe {enveloppe}. C'est la borne haute : un retrait partiel n'est imposé qu'au
            prorata de la plus-value qu'il contient.
          </p>
          <p>
            Prélèvements sociaux : {BAREMES_FISCAUX.prelevementsSociauxPct} % · PFU (impôt) :{" "}
            {BAREMES_FISCAUX.pfuImpotPct} %.
          </p>
          <p className="flex items-start gap-1.5">
            <Info size={11} className="shrink-0 mt-0.5" aria-hidden="true" />
            <span>
              Barèmes saisis à la main depuis {fisc.source?.intitule || "les sources officielles"}
              {fisc.source?.aVerifier ? " — à confirmer à la source avant toute décision" : ""}. Ceci
              n'est pas un conseil fiscal.
            </span>
          </p>
        </div>
      )}
    </Card>
  );
}
