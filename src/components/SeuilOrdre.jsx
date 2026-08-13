import { useMemo } from "react";
import { Receipt, TriangleAlert, CheckCircle2 } from "lucide-react";
import { Card, CardLabel, SectionRepliable } from "./ui";
import { eur, pctPlain } from "../lib/finance";
import {
  BAREME_DEFAUT,
  COUT_CIBLE_DEFAUT,
  cadenceConseillee,
  fraisAnnuelsSelonCadence,
} from "../lib/fraisOrdre";
import { COURTIERS, MARCHES, courtierParId, PLAFOND_LEGAL_PEA_PCT } from "../lib/courtiers";

/** Barème en une phrase lisible, paliers compris. */
function decrireBareme(bareme) {
  if (Array.isArray(bareme?.tranches)) {
    return bareme.tranches
      .map((t) => {
        const tarif = t.fixe ? `${t.fixe.toFixed(2).replace(".", ",")} €` : `${String(t.pourcent).replace(".", ",")} %`;
        const plancher = t.minimum ? ` (min. ${String(t.minimum).replace(".", ",")} €)` : "";
        return t.jusqua == null
          ? `puis ${tarif} au-delà${plancher}`
          : `${tarif} jusqu'à ${t.jusqua.toLocaleString("fr-FR")} €`;
      })
      .join(", ");
  }
  const bouts = [];
  if (bareme?.fixe) bouts.push(`${String(bareme.fixe).replace(".", ",")} € par ordre`);
  if (bareme?.pourcent) bouts.push(`${String(bareme.pourcent).replace(".", ",")} % du montant`);
  if (bareme?.minimum) bouts.push(`minimum ${String(bareme.minimum).replace(".", ",")} €`);
  return bouts.join(" + ") || "aucun frais";
}

/**
 * « À partir de quel montant un ordre vaut-il le coup ? »
 *
 * L'application mesurait les frais déjà payés, jamais ceux qu'on s'apprête à
 * payer. C'est pourtant la seule question qui compte quand on investit de
 * petites sommes : chez un courtier à 2,50 € par ordre, investir 100 € coûte
 * 2,5 % — davantage qu'une année entière de Livret A, perdue à la seconde où
 * l'ordre part. Attendre d'avoir 500 € ramène ce coût à 0,5 %.
 *
 * Le barème vit dans `bourse.fraisCourtier` plutôt que dans une clé de
 * stockage à part : c'est une caractéristique du compte-titres, au même titre
 * que son enveloppe ou sa poche de cash.
 */
export default function SeuilOrdre({ bourse, setBourse, versementMensuel = 0 }) {
  const courtierId = bourse?.courtierId || "boursorama-decouverte";
  const marche = bourse?.marcheOrdre || "euronext";
  const courtier = courtierParId(courtierId) ?? courtierParId("personnalise");

  // Un barème saisi à la main prime sur le catalogue : le courtier peut avoir
  // une offre promotionnelle, et c'est l'avis d'opéré qui fait foi.
  const bareme = bourse?.fraisCourtier || courtier?.baremes?.[marche] || BAREME_DEFAUT;
  const personnalise = courtierId === "personnalise" || Boolean(bourse?.fraisCourtier);
  const coutCible = Number.isFinite(bourse?.coutCibleOrdre) ? bourse.coutCibleOrdre : COUT_CIBLE_DEFAUT;

  const majBareme = (champ, valeur) => {
    const nombre = valeur === "" ? 0 : parseFloat(valeur);
    setBourse((b) => ({
      ...b,
      fraisCourtier: { ...BAREME_DEFAUT, ...(b?.fraisCourtier || {}), [champ]: Number.isFinite(nombre) ? nombre : 0 },
    }));
  };

  const choisirCourtier = (id) =>
    // On efface le barème manuel : garder une saisie d'un autre courtier
    // par-dessus le catalogue produirait un chiffre qui n'est celui de personne.
    setBourse((b) => ({ ...b, courtierId: id, fraisCourtier: undefined }));

  const choisirMarche = (cle) =>
    setBourse((b) => ({ ...b, marcheOrdre: cle, fraisCourtier: undefined }));

  const majCible = (valeur) => {
    const nombre = parseFloat(valeur);
    setBourse((b) => ({ ...b, coutCibleOrdre: Number.isFinite(nombre) ? nombre : COUT_CIBLE_DEFAUT }));
  };

  const cadence = useMemo(
    () => cadenceConseillee({ bareme, versementMensuel, coutCible }),
    [bareme, versementMensuel, coutCible]
  );
  const lignes = useMemo(
    () => fraisAnnuelsSelonCadence(versementMensuel, bareme),
    [versementMensuel, bareme]
  );

  const champ = (label, valeur, onChange, suffixe, pas = "0.1") => (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] text-slate-500">{label}</label>
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          min="0"
          step={pas}
          value={valeur}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-slate-100 font-data tabular-nums focus:outline-none focus:border-violet-400/60"
        />
        <span className="text-xs text-slate-600 shrink-0">{suffixe}</span>
      </div>
    </div>
  );

  return (
    <Card accent="border-violet-500/40 bg-gradient-to-br from-violet-950/40 via-slate-900 to-slate-900">
      <CardLabel icon={Receipt}>À partir de quel montant passer un ordre ?</CardLabel>

      <div className="flex flex-wrap items-end gap-3 mt-2">
        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-slate-500">Courtier</label>
          <select
            value={courtierId}
            onChange={(e) => choisirCourtier(e.target.value)}
            className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-violet-400/60"
          >
            {COURTIERS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.courtier} — {c.offre}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-slate-500">Place d&apos;exécution</label>
          <select
            value={marche}
            onChange={(e) => choisirMarche(e.target.value)}
            className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-violet-400/60 max-w-[18rem]"
          >
            {MARCHES.map((m) => (
              <option key={m.cle} value={m.cle}>{m.label}</option>
            ))}
          </select>
        </div>
        {champ("Coût acceptable", coutCible, majCible, "%", "0.1")}
      </div>

      {/* Barème effectivement appliqué, en toutes lettres : un chiffre qu'on ne
          peut pas relire est un chiffre qu'on ne peut pas contester. */}
      <p className="text-[11px] text-slate-500 mt-2">
        {decrireBareme(bareme)}
        {courtier?.verifieLe && !personnalise && (
          <>
            {" "}· relevé le {new Date(courtier.verifieLe).toLocaleDateString("fr-FR")} sur la{" "}
            {courtier.urlSource ? (
              <a href={courtier.urlSource} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-slate-300">
                brochure tarifaire
              </a>
            ) : (
              "brochure tarifaire"
            )}
            . À confronter à un avis d&apos;opéré réel.
          </>
        )}
      </p>

      {personnalise && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-3">
          {champ("Forfait par ordre", bareme.fixe ?? 0, (v) => majBareme("fixe", v), "€", "0.01")}
          {champ("Part variable", bareme.pourcent ?? 0, (v) => majBareme("pourcent", v), "%", "0.01")}
          {champ("Plancher facturé", bareme.minimum ?? 0, (v) => majBareme("minimum", v), "€", "0.01")}
        </div>
      )}

      {/* ─── Verdict ─────────────────────────────────────────────────────── */}
      <div className="mt-4">
        {cadence.montantMin == null ? (
          <div className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-950/20 px-3.5 py-3">
            <TriangleAlert size={16} className="text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
            <p className="text-xs text-amber-100/90">
              Avec une part variable de {pctPlain(bareme.pourcent ?? 0, 2)}, aucun montant ne descend
              sous {pctPlain(coutCible, 2)} de frais : attendre plus longtemps n&apos;y changerait
              rien. C&apos;est le barème lui-même qu&apos;il faudrait comparer à celui d&apos;un
              autre courtier.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-800 bg-slate-950/50 px-3.5 py-3">
            <p className="text-sm text-slate-200">
              Vise au moins{" "}
              <span className="font-data tabular-nums font-semibold text-violet-300">
                {eur(Math.ceil(cadence.montantMin))}
              </span>{" "}
              par ordre pour que les frais restent sous {pctPlain(coutCible, 2)}.
            </p>

            {cadence.moisAAccumuler != null && (
              <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                À {eur(versementMensuel)} par mois, cela revient à passer un ordre{" "}
                <span className="text-slate-200 font-medium">
                  {cadence.moisAAccumuler === 1
                    ? "chaque mois"
                    : `tous les ${cadence.moisAAccumuler} mois`}
                </span>
                {cadence.coutSiMensuel != null && cadence.moisAAccumuler > 1 && (
                  <>
                    {" "}— soit {pctPlain(cadence.coutAuSeuil, 2)} de frais au lieu de{" "}
                    <span className="text-amber-300">{pctPlain(cadence.coutSiMensuel, 2)}</span> en
                    investissant tous les mois.
                  </>
                )}
                {cadence.moisAAccumuler === 1 && (
                  <> : ton versement mensuel dépasse déjà le seuil.</>
                )}
              </p>
            )}

            {/* Le piège des barèmes par paliers : investir tout ce qu'on a
                accumulé peut coûter PLUS cher, en proportion, que d'en investir
                une partie. Chez BoursoBank, 500 € coûtent 0,40 % et 600 €
                coûtent 0,60 %. */}
            {cadence.resteApresOrdre > 0 && (
              <p className="text-xs text-violet-200/90 mt-2 leading-relaxed rounded-lg border border-violet-500/30 bg-violet-500/5 px-3 py-2">
                N&apos;investis que{" "}
                <span className="font-data tabular-nums font-semibold text-violet-300">
                  {eur(cadence.montantOrdreConseille)}
                </span>{" "}
                et garde <span className="font-data tabular-nums">{eur(cadence.resteApresOrdre)}</span> pour
                l&apos;ordre suivant : passer le palier ferait basculer tout l&apos;ordre au tarif
                supérieur, et coûterait plus cher en proportion qu&apos;un ordre plus petit.
              </p>
            )}

            {cadence.moisAAccumuler === 1 && cadence.resteApresOrdre === 0 && (
              <p className="flex items-center gap-1.5 text-xs text-emerald-400 mt-2">
                <CheckCircle2 size={12} aria-hidden="true" />
                Rien à optimiser de ce côté.
              </p>
            )}

            {/* Le plafond légal s'impose au barème : un écart signale soit une
                offre plus favorable que la brochure, soit une erreur de
                facturation. Dans les deux cas c'est bon à savoir. */}
            {cadence.coutAuSeuil != null && cadence.coutAuSeuil > PLAFOND_LEGAL_PEA_PCT && (
              <p className="text-[11px] text-amber-300/90 mt-2 leading-relaxed">
                Ce barème dépasse les {pctPlain(PLAFOND_LEGAL_PEA_PCT, 2)} que la loi plafonne pour un
                ordre passé en ligne dans un PEA. Vérifie ce qui t&apos;est réellement facturé sur un
                avis d&apos;opéré : le plafond s&apos;impose au courtier.
              </p>
            )}
          </div>
        )}
      </div>

      {lignes.length > 0 && (
        <div className="mt-3">
          <SectionRepliable
            titre="Ce que coûte chaque cadence sur un an"
            resume={`${eur(versementMensuel)}/mois`}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-xs table-cards">
                <thead>
                  <tr className="text-slate-500 text-left">
                    <th className="font-medium pb-2">Cadence</th>
                    <th className="font-medium pb-2 text-right">Par ordre</th>
                    <th className="font-medium pb-2 text-right">Frais / an</th>
                    <th className="font-medium pb-2 text-right">Part des versements</th>
                  </tr>
                </thead>
                <tbody>
                  {lignes.map((l) => {
                    const conseillee = l.moisEntreOrdres === cadence.moisAAccumuler;
                    return (
                      <tr
                        key={l.moisEntreOrdres}
                        className={`border-t border-slate-800/70 ${conseillee ? "text-violet-300" : "text-slate-300"}`}
                      >
                        <td data-label="Cadence" className="py-1.5">
                          {l.moisEntreOrdres === 1 ? "Chaque mois" : `Tous les ${l.moisEntreOrdres} mois`}
                          {conseillee && <span className="text-[10px] ml-1.5 text-violet-400">conseillé</span>}
                        </td>
                        <td data-label="Par ordre" className="py-1.5 text-right font-data tabular-nums ghost-blur">
                          {eur(l.montantParOrdre)}
                        </td>
                        <td data-label="Frais / an" className="py-1.5 text-right font-data tabular-nums">
                          {eur(l.fraisAnnuels, 2)}
                        </td>
                        <td data-label="Part des versements" className="py-1.5 text-right font-data tabular-nums">
                          {pctPlain(l.partDesVersementsPct, 2)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-slate-600">
              Sur la même somme investie dans l&apos;année. Espacer les ordres réduit les frais, mais
              laisse l&apos;argent attendre : au-delà de quelques mois, le rendement manqué finit par
              annuler l&apos;économie.
            </p>
          </SectionRepliable>
        </div>
      )}
    </Card>
  );
}
