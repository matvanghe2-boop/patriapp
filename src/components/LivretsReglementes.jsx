import { useId, useMemo, useState } from "react";
import { Landmark, CalendarClock, CircleCheck, CircleDashed } from "lucide-react";
import { Card, CardLabel, PastilleEtat, CARD_THEMES } from "./ui";
import Montant from "./Montant";
import { pctPlain } from "../lib/finance";
import { livretsReglementes, eligibiliteLep, scenariosRevision, PLAFONDS_LEP } from "../lib/epargne";

/**
 * Livrets réglementés : ceux que tu as, ceux qui manquent, et la prochaine
 * révision des taux chiffrée.
 *
 * Rien ici n'est un conseil : la carte rend visibles des faits — un livret
 * sans impôt que tu n'as pas ouvert, l'argent qui dort sur le compte courant
 * au-delà d'un mois de dépenses, ce que changerait un taux revu au 1er février.
 * Le droit au LEP dépend du revenu fiscal de référence, que l'application ne
 * connaît pas : il se vérifie ici, sans être enregistré.
 */
export default function LivretsReglementes({ livrets = [], argentQuiDort = 0 }) {
  const ids = useId();
  const reglementes = useMemo(() => livretsReglementes(livrets), [livrets]);
  const [rfr, setRfr] = useState("");
  const [parts, setParts] = useState("1");
  const lep = eligibiliteLep({ rfr: rfr === "" ? null : rfr, parts });
  const detenus = reglementes.filter((r) => r.detenu);
  const revision = detenus.find((r) => r.prochaineRevision)?.prochaineRevision || null;

  return (
    <Card accent={CARD_THEMES.indigo}>
      <CardLabel icon={Landmark}>Livrets réglementés</CardLabel>
      <p className="text-mini text-slate-500 mt-1">Sans impôt, sans risque, disponibles à tout moment. Un même taux pour tous, fixé par l'État.</p>

      <ul className="mt-3 flex flex-col gap-2">
        {reglementes.map((r) => {
          const potentiel = !r.detenu && argentQuiDort > 0 && r.tauxPct ? (Math.min(argentQuiDort, r.plafond || argentQuiDort) * r.tauxPct) / 100 : null;
          return (
            <li key={r.id} className="flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-950/50 px-3 py-2.5">
              {r.detenu ? (
                <CircleCheck size={16} className="mt-0.5 shrink-0 etat-ok" aria-hidden="true" />
              ) : (
                <CircleDashed size={16} className="mt-0.5 shrink-0 text-slate-500" aria-hidden="true" />
              )}
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 flex-wrap">
                  <span className="text-corps text-slate-100">{r.libelle}</span>
                  {r.tauxPct != null && <span className="font-data text-xs text-indigo-300">{pctPlain(r.tauxPct, 1)}</span>}
                  {r.plafond && <span className="text-micro text-slate-500">plafond <Montant valeur={r.plafond} decimales={0} sensible={false} /></span>}
                </span>
                <span className="block text-micro text-slate-500 mt-0.5">
                  {r.detenu ? (
                    <>
                      Tu en as un : <Montant valeur={Number(r.detenu.balance) || 0} decimales={0} />, soit{" "}
                      <Montant valeur={((Number(r.detenu.balance) || 0) * (r.tauxPct || 0)) / 100} decimales={0} /> d'intérêts par an.
                    </>
                  ) : r.id === "lep" ? (
                    "Réservé aux revenus modestes : vérifie ton droit juste en dessous."
                  ) : potentiel ? (
                    <>
                      Pas encore ouvert. L'argent qui dort sur ton compte courant au-delà d'un mois de dépenses y
                      rapporterait environ <Montant valeur={potentiel} decimales={0} /> par an.
                    </>
                  ) : (
                    "Pas encore ouvert."
                  )}
                </span>
              </span>
            </li>
          );
        })}
      </ul>

      {/* Droit au LEP — le revenu saisi n'est ni enregistré ni envoyé. */}
      <div className="mt-4 rounded-xl border border-slate-800 px-3 py-3">
        <div className="text-xs text-slate-300">Ai-je droit au LEP ?</div>
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <div>
            <label htmlFor={`${ids}-rfr`} className="text-micro text-slate-500">Revenu fiscal de référence (€)</label>
            <input
              id={`${ids}-rfr`}
              type="number"
              min="0"
              step="100"
              value={rfr}
              onChange={(e) => setRfr(e.target.value)}
              placeholder="Sur ton avis d'impôt"
              className="w-44 block bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm font-data focus:outline-none focus:border-indigo-400/60"
            />
          </div>
          <div>
            <label htmlFor={`${ids}-parts`} className="text-micro text-slate-500">Parts fiscales</label>
            <select
              id={`${ids}-parts`}
              value={parts}
              onChange={(e) => setParts(e.target.value)}
              className="block bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-indigo-400/60"
            >
              {["1", "1.5", "2", "2.5", "3", "3.5", "4"].map((p) => (
                <option key={p} value={p}>{p.replace(".", ",")}</option>
              ))}
            </select>
          </div>
          {lep && (
            <PastilleEtat etat={lep.eligible ? "ok" : "neutre"}>
              {lep.eligible ? "Éligible" : "Au-dessus du plafond"} · plafond {lep.plafond.toLocaleString("fr-FR")} €
            </PastilleEtat>
          )}
        </div>
        <p className="text-micro text-slate-500 mt-2">
          Plafonds {PLAFONDS_LEP.annee} (métropole) : {PLAFONDS_LEP.unePart.toLocaleString("fr-FR")} € pour une part, +{" "}
          {PLAFONDS_LEP.demiPart.toLocaleString("fr-FR")} € par demi-part. La banque vérifie sur ton avis d'impôt ; rien
          de ce que tu saisis ici n'est enregistré.
        </p>
      </div>

      {/* Prochaine révision, chiffrée sur tes soldes. */}
      {revision && detenus.length > 0 && (
        <div className="mt-4">
          <div className="flex items-center gap-1.5 text-xs text-slate-300">
            <CalendarClock size={13} className="text-indigo-300" aria-hidden="true" />
            Prochaine révision des taux le{" "}
            {new Date(`${revision}T00:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
          </div>
          <ul className="mt-2 flex flex-col gap-1.5">
            {detenus.map((r) => (
              <li key={r.id} className="text-micro text-slate-400">
                <span className="text-slate-300">{r.libelle}</span> :{" "}
                {scenariosRevision(r.detenu, r.tauxPct).map((s, i) => (
                  <span key={s.tauxPct}>
                    {i > 0 && " · "}à {pctPlain(s.tauxPct, 1)},{" "}
                    <span className={s.ecart < 0 ? "etat-attention" : "etat-ok"}>
                      {s.ecart > 0 ? "+" : ""}
                      <Montant valeur={s.ecart} decimales={0} />
                    </span>
                    /an
                  </span>
                ))}
              </li>
            ))}
          </ul>
          <p className="text-micro text-slate-500 mt-2">
            Des scénarios, pas une prévision : le taux révisé dépend de l'inflation et des taux courts du semestre, que
            l'application ne suit pas.
          </p>
        </div>
      )}
    </Card>
  );
}
