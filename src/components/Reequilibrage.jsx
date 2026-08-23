import { useState, useMemo } from "react";
import { Scale, RotateCcw, Wallet, AlertTriangle, Info, ArrowUp, ArrowDown } from "lucide-react";
import { CarteRepliable, EmptyState, ProgressBar, CARD_THEMES } from "./ui";
import { eur, pctPlain, lireNombre } from "../lib/finance";
import { fiscaliteEnveloppe } from "../../shared/horizon";
import {
  construirePlan, ciblesEquiponderees, ciblesActuelles,
} from "../../shared/reequilibrage";

/**
 * Plan de rééquilibrage du portefeuille.
 *
 * Remplace le simulateur d'ordre, qui répondait à « combien vendre de CETTE
 * ligne pour la ramener à 10 % ? ». La question était mal posée : vendre une
 * ligne modifie le poids de toutes les autres, et on ne rééquilibre jamais une
 * position isolément.
 *
 * Les poids cibles vivent sur la position (`poidsCible`), donc ils sont
 * persistés et synchronisés comme le reste du portefeuille. Deux préréglages
 * évitent d'avoir à saisir douze pourcentages avant d'obtenir quoi que ce soit.
 */
export default function Reequilibrage({ bourse, setBourse, replie, onBasculer }) {
  const positions = useMemo(() => bourse?.positions || [], [bourse]);

  const [apport, setApport] = useState("");
  const [sansVente, setSansVente] = useState(false);
  const [tolerance, setTolerance] = useState(1);

  const ciblesPct = useMemo(
    () => Object.fromEntries(positions.filter((p) => Number.isFinite(p.poidsCible)).map((p) => [p.id, p.poidsCible])),
    [positions]
  );

  const definirCibles = (cibles) =>
    setBourse((b) => ({
      ...b,
      positions: b.positions.map((p) => ({ ...p, poidsCible: cibles[p.id] ?? null })),
    }));

  const modifierCible = (id, valeur) =>
    setBourse((b) => ({
      ...b,
      positions: b.positions.map((p) => (p.id === id ? { ...p, poidsCible: valeur } : p)),
    }));

  const plan = useMemo(
    () =>
      construirePlan(positions, ciblesPct, {
        apport: lireNombre(apport) ?? 0,
        sansVente,
        seuilTolerancePct: tolerance,
      }),
    [positions, ciblesPct, apport, sansVente, tolerance]
  );

  // Impôt estimé sur la part de plus-value réellement cédée. Le moteur fiscal
  // est celui déjà utilisé par la carte « plus-value nette après impôt ».
  const fisc = useMemo(() => {
    if (plan.plusValueCedeeTotale <= 0) return null;
    return fiscaliteEnveloppe({
      enveloppe: bourse?.envelope || "PEA",
      montant: plan.totalVentes,
      plusValue: plan.plusValueCedeeTotale,
      dureeDetentionAnnees: 0,
    });
  }, [plan, bourse]);

  const cibleDefinie = Object.keys(ciblesPct).length > 0;

  // Somme des cibles telles qu'elles sont saisies — avant normalisation. C'est
  // ce total-là que l'utilisateur doit voir pour savoir ce qu'il lui reste à
  // répartir ; le total normalisé vaudrait toujours 100 et n'apprendrait rien.
  const sommeCibles = positions.reduce(
    (s, p) => s + (Number.isFinite(p.poidsCible) ? p.poidsCible : plan.ordres.find((o) => o.id === p.id)?.poidsActuelPct ?? 0),
    0
  );

  if (positions.length === 0) {
    return (
      <CarteRepliable
        titre="Plan de rééquilibrage"
        icon={Scale}
        accent={CARD_THEMES.violet}
        replie={replie}
        onBasculer={onBasculer}
      >
        <EmptyState>Ajoute des positions pour construire un plan de rééquilibrage.</EmptyState>
      </CarteRepliable>
    );
  }

  return (
    <CarteRepliable
      titre="Plan de rééquilibrage"
      icon={Scale}
      accent={CARD_THEMES.violet}
      replie={replie}
      onBasculer={onBasculer}
      resume={`${positions.length} ligne(s)`}
    >
      <div className="flex items-center justify-end gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => definirCibles(ciblesEquiponderees(positions))}
            className="text-[11px] text-violet-300 hover:text-violet-200 border border-violet-500/40 rounded-lg px-2.5 py-1"
          >
            Équipondérer
          </button>
          <button
            onClick={() => definirCibles(ciblesActuelles(positions))}
            className="text-[11px] text-slate-400 hover:text-slate-200 border border-slate-700 rounded-lg px-2.5 py-1"
          >
            Figer les poids actuels
          </button>
          {cibleDefinie && (
            <button
              onClick={() => definirCibles({})}
              title="Effacer les poids cibles"
              className="text-slate-600 hover:text-rose-400 p-1"
              aria-label="Effacer les poids cibles"
            >
              <RotateCcw size={13} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {!cibleDefinie && (
        <p className="text-[11px] text-slate-500 mt-1">
          Aucun poids cible défini : chaque ligne est considérée à sa répartition actuelle. Choisis un
          préréglage ou saisis tes cibles ci-dessous.
        </p>
      )}

      {/* ─── Paramètres ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end gap-4 mt-3 pt-3 border-t border-slate-800">
        <div>
          <label htmlFor="reeq-apport" className="text-[11px] text-slate-500 block mb-1">
            Apport à investir (€)
          </label>
          <input
            id="reeq-apport"
            type="number"
            step="100"
            min="0"
            value={apport}
            onChange={(e) => setApport(e.target.value)}
            placeholder="0"
            className="w-28 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-sm font-data tabular-nums focus:outline-none focus:border-violet-400/60"
          />
        </div>
        <div>
          <label htmlFor="reeq-tol" className="text-[11px] text-slate-500 block mb-1">
            Tolérance (%)
          </label>
          <input
            id="reeq-tol"
            type="number"
            step="0.5"
            min="0"
            value={tolerance}
            onChange={(e) => setTolerance(lireNombre(e.target.value) ?? 0)}
            className="w-20 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-sm font-data tabular-nums focus:outline-none focus:border-violet-400/60"
          />
        </div>
        <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer pb-1">
          <input
            type="checkbox"
            checked={sansVente}
            onChange={(e) => setSansVente(e.target.checked)}
            className="accent-violet-400"
          />
          {/* Un rééquilibrage par apport ne déclenche aucun impôt. */}
          N'acheter que ce qui manque (aucune vente)
        </label>
      </div>

      {/* ─── Synthèse ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
          <div className="text-[11px] text-slate-500 uppercase tracking-wide">Dérive moyenne</div>
          <div className={`font-data font-bold ${plan.deriveMoyennePct > 5 ? "text-amber-300" : "text-slate-100"}`}>
            {pctPlain(plan.deriveMoyennePct, 1)}
          </div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
          <div className="text-[11px] text-slate-500 uppercase tracking-wide">À acheter</div>
          <div className="font-data font-bold text-emerald-400 ghost-blur">{eur(plan.totalAchats)}</div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
          <div className="text-[11px] text-slate-500 uppercase tracking-wide">À vendre</div>
          <div className="font-data font-bold text-rose-400 ghost-blur">{eur(plan.totalVentes)}</div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
          <div className="text-[11px] text-slate-500 uppercase tracking-wide">Liquidités</div>
          <div
            className={`font-data font-bold ghost-blur ${plan.besoinLiquidites > 0 ? "text-amber-300" : "text-slate-100"}`}
            title={plan.besoinLiquidites > 0 ? "Il manque des liquidités pour exécuter le plan" : "Le plan se finance seul"}
          >
            {plan.besoinLiquidites > 0 ? `−${eur(plan.besoinLiquidites)}` : eur(Math.abs(plan.besoinLiquidites))}
          </div>
        </div>
      </div>

      {plan.ciblesNormalisees && (
        <p className="flex items-start gap-1.5 text-[11px] text-amber-300/90 mt-2">
          <Info size={11} className="shrink-0 mt-0.5" aria-hidden="true" />
          Tes poids cibles totalisent {pctPlain(plan.sommeCiblesInitiale, 1)} : ils ont été ramenés
          proportionnellement à 100 % pour construire le plan.
        </p>
      )}

      {fisc && (
        <p className="flex items-start gap-1.5 text-[11px] text-amber-200 mt-2">
          <AlertTriangle size={11} className="shrink-0 mt-0.5" aria-hidden="true" />
          Les ventes exposeraient environ {eur(plan.plusValueCedeeTotale)} de plus-value, soit{" "}
          <strong>{eur(fisc.totalPrelevements)}</strong> de prélèvements estimés. Un rééquilibrage par
          apport, sans vente, n'en déclencherait aucun.
        </p>
      )}

      {/* ─── Cibles et ordres ───────────────────────────────────────────── */}
      <div className="mt-4 pt-3 border-t border-slate-800">
        <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
          <span className="text-[11px] text-slate-500 uppercase tracking-wide">
            Poids cible par ligne
          </span>
          {/* La somme est affichée en permanence : saisir douze pourcentages
              sans savoir où l'on en est oblige à les additionner de tête. */}
          <span
            className={`text-[11px] font-data tabular-nums ${
              Math.abs(sommeCibles - 100) < 0.05
                ? "text-emerald-400"
                : sommeCibles > 100
                  ? "text-rose-400"
                  : "text-amber-300"
            }`}
          >
            Total {pctPlain(sommeCibles, 1)}
            {Math.abs(sommeCibles - 100) >= 0.05 && (
              <span className="text-slate-500">
                {" "}· {sommeCibles > 100 ? "excédent" : "reste"} {pctPlain(Math.abs(100 - sommeCibles), 1)}
              </span>
            )}
          </span>
        </div>

        <div className="flex flex-col gap-2">
          {plan.ordres.map((o) => {
            const position = positions.find((p) => p.id === o.id);
            const cibleSaisie = Number.isFinite(position?.poidsCible) ? position.poidsCible : "";
            return (
              <div
                key={o.id}
                className={`rounded-xl border px-3 py-2.5 ${
                  o.sens === "achat"
                    ? "border-emerald-500/25 bg-emerald-500/5"
                    : o.sens === "vente"
                      ? "border-rose-500/25 bg-rose-500/5"
                      : "border-slate-800 bg-slate-950/40"
                }`}
              >
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <span className="font-data font-semibold text-slate-100">{o.ticker}</span>
                    <span className="text-[11px] text-slate-500 ml-2">{o.nom}</span>
                    <div className="text-[11px] text-slate-500 font-data tabular-nums mt-0.5">
                      actuel {pctPlain(o.poidsActuelPct, 1)}
                      <span className="text-slate-600 mx-1">→</span>
                      cible {pctPlain(o.poidsCiblePct, 1)}
                    </div>
                  </div>

                  <label className="flex items-center gap-1.5 text-[11px] text-slate-500 shrink-0">
                    <span className="sr-only">Poids cible de {o.ticker}</span>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      value={cibleSaisie}
                      onChange={(e) => modifierCible(o.id, e.target.value === "" ? null : lireNombre(e.target.value))}
                      placeholder={o.poidsActuelPct.toFixed(1)}
                      aria-label={`Poids cible de ${o.ticker} en pourcentage`}
                      className="w-20 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-sm font-data tabular-nums text-right focus:outline-none focus:border-violet-400/60"
                    />
                    <span className="text-slate-500">%</span>
                  </label>

                  <span className="shrink-0 w-[11rem] text-right">
                    {o.sens === "aucun" ? (
                      <span className="text-[11px] text-slate-600">
                        {o.negligeable ? "dans la tolérance" : "rien à faire"}
                      </span>
                    ) : (
                      <span
                        className={`inline-flex items-center gap-1 text-xs font-data font-semibold ${
                          o.sens === "achat" ? "text-emerald-400" : "text-rose-400"
                        }`}
                      >
                        {o.sens === "achat" ? <ArrowUp size={12} aria-hidden="true" /> : <ArrowDown size={12} aria-hidden="true" />}
                        {o.sens === "achat" ? "Acheter" : "Vendre"} {Math.abs(o.quantite).toFixed(2)}
                        <span className="ghost-blur"> · {eur(Math.abs(o.ecartEuros))}</span>
                      </span>
                    )}
                  </span>
                </div>

                <div className="mt-2">
                  <ProgressBar
                    value={o.poidsActuelPct}
                    accent={o.sens === "vente" ? "bg-rose-400" : o.sens === "achat" ? "bg-emerald-400" : "bg-violet-400"}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {plan.aExecuter.length === 0 && (
          <p className="text-sm text-emerald-400/90 mt-3">
            Aucun ordre à passer : toutes les lignes sont dans la tolérance de {pctPlain(tolerance, 1)}.
          </p>
        )}
      </div>

      <p className="flex items-start gap-1.5 text-[11px] text-slate-600 mt-3">
        <Wallet size={11} className="shrink-0 mt-0.5" aria-hidden="true" />
        Plan indicatif : les ordres sont à passer chez ton courtier, rien n'est exécuté ici. Les
        quantités sont théoriques — la plupart des courtiers n'acceptent pas les fractions de titre.
      </p>
    </CarteRepliable>
  );
}
