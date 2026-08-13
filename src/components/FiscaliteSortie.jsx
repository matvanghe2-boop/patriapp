import { useMemo, useState } from "react";
import { Receipt, ChevronDown, ChevronUp, Info, AlertTriangle } from "lucide-react";
import { CarteRepliable, CARD_THEMES } from "./ui";
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
export default function FiscaliteSortie({ bourse, bourseGainAbs, bourseTotal, replie, onBasculer }) {
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
      <CarteRepliable
        titre="Plus-value nette après impôt"
        icon={Receipt}
        accent={CARD_THEMES.violet}
        replie={replie}
        onBasculer={onBasculer}
      >
        <p className="text-sm text-slate-500">
          {bourseGainAbs < 0
            ? "Le portefeuille est en moins-value : aucune imposition à simuler. Une moins-value est reportable sur les plus-values des dix années suivantes (hors PEA)."
            : "Aucune plus-value latente à imposer pour le moment."}
        </p>
      </CarteRepliable>
    );
  }

  const net = bourseGainAbs - fisc.totalPrelevements;

  // Avant cinq ans, l'impôt n'est PAS la principale conséquence d'un retrait :
  // le plan est clôturé et son antériorité perdue. Cette carte ne montrait que
  // le chiffre, c'est-à-dire la moitié la moins importante de la décision —
  // d'autant plus sur un plan ouvert récemment, où les cinq ans sont l'actif
  // le plus précieux du compte.
  const peaAvantCinqAns = enveloppe === "PEA" && bourse?.peaOuverture && age && !age.eligible;

  return (
    <CarteRepliable
      titre="Plus-value nette après impôt"
      icon={Receipt}
      accent={CARD_THEMES.violet}
      replie={replie}
      onBasculer={onBasculer}
      resume={eur(net)}
      actions={
        <button
          onClick={() => setOuvert((o) => !o)}
          aria-expanded={ouvert}
          className="btn-flash flex items-center gap-1 text-[11px] text-violet-300/80 hover:text-violet-200"
        >
          {ouvert ? <ChevronUp size={12} aria-hidden="true" /> : <ChevronDown size={12} aria-hidden="true" />}
          Détail
        </button>
      }
    >

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

      {peaAvantCinqAns && (
        <div className="mt-3 rounded-xl border border-rose-500/40 bg-rose-950/20 px-3.5 py-3">
          <div className="flex items-start gap-2.5">
            <AlertTriangle size={15} className="text-rose-400 shrink-0 mt-0.5" aria-hidden="true" />
            <div className="text-xs text-rose-100/90 space-y-1.5 leading-relaxed">
              <p className="font-medium text-rose-200">
                Avant 5 ans, un retrait ne fait pas que déclencher l&apos;impôt : il CLÔTURE le plan.
              </p>
              <p>
                Tout retrait avant le{" "}
                {BAREMES_FISCAUX.peaDureeExonerationAnnees}
                <sup>e</sup> anniversaire entraîne la fermeture du PEA et la vente de toutes les
                lignes. L&apos;antériorité fiscale repart de zéro : rouvrir un plan le lendemain
                signifie attendre cinq ans de plus. Quelques cas y échappent (licenciement,
                invalidité, création d&apos;entreprise), sur justificatif.
              </p>
              <p className="text-rose-200/80">
                Encore {age.monthsRemaining} mois à tenir. Attendre ferait tomber l&apos;impôt à
                0 € — les prélèvements sociaux, eux, resteraient dus — et surtout laisserait le
                plan ouvert.
              </p>
            </div>
          </div>
        </div>
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
    </CarteRepliable>
  );
}
