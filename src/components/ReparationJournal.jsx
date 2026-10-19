import { useMemo, useState } from "react";
import { Wrench, AlertTriangle, Check } from "lucide-react";
import { Card, CardLabel, GhostButton, CARD_THEMES } from "./ui";
import { eur, formatDateShort, versementsSuspects, convertirEnAjustements } from "../lib/finance";
import { useToast } from "../lib/ToastContext";

/**
 * Outil de réparation du journal — versements fabriqués par une correction de
 * solde.
 *
 * Jusqu'ici, corriger la poche cash créait un VERSEMENT ou un RETRAIT, c'est-
 * à-dire un mouvement d'argent entre le compte courant et le portefeuille.
 * C'est faux dans le cas le plus fréquent : on recale son solde parce qu'une
 * vente ou des frais ne tombaient pas juste, pas parce qu'on a viré de
 * l'argent. Conséquence visible : après une vente, la performance lisait une
 * sortie d'argent du montant de la vente, alors que rien n'avait quitté le
 * portefeuille.
 *
 * La saisie est corrigée pour l'avenir ; cet écran s'occupe du PASSÉ.
 *
 * Deux niveaux de certitude, et ils ne se valent pas :
 *
 *  - « sûr » : l'écriture porte `origine: "ajustement-cash"`. Aucun doute.
 *  - « probable » : écriture antérieure au marquage, reconnue à son empreinte
 *    (aucun titre, aucune quantité, aucun prix, aucuns frais). Un versement
 *    saisi à la main laisse exactement la même trace — d'où la nécessité de
 *    faire trancher l'utilisateur plutôt que de convertir d'office.
 *
 * Rien n'est écrit sans un aperçu préalable et une confirmation explicite,
 * et l'opération reste annulable depuis le toast.
 */
export default function ReparationJournal({ bourse, setBourse, appliquerJournal }) {
  const { showToast } = useToast();
  const operations = useMemo(() => bourse?.operations || [], [bourse]);
  const suspects = useMemo(() => versementsSuspects(operations), [operations]);

  // Présélection : seules les écritures certaines. Les « probables » demandent
  // un regard, les cocher d'avance reviendrait à décider à la place de
  // l'utilisateur sur des données qu'on ne sait pas interpréter.
  const [selection, setSelection] = useState(() =>
    new Set(suspects.filter((s) => s.certitude === "sure").map((s) => s.operation.id))
  );
  const [ouvert, setOuvert] = useState(false);

  if (suspects.length === 0) return null;

  const basculer = (id) =>
    setSelection((prev) => {
      const suivant = new Set(prev);
      if (suivant.has(id)) suivant.delete(id);
      else suivant.add(id);
      return suivant;
    });

  const impact = suspects
    .filter((s) => selection.has(s.operation.id))
    .reduce((somme, s) => {
      const montant = Math.abs(Number(s.operation.amount ?? s.operation.montantNet ?? 0) || 0);
      return somme + (s.operation.type === "RETRAIT" ? -montant : montant);
    }, 0);

  const convertir = () => {
    const ids = [...selection];
    if (ids.length === 0) return;
    const precedent = bourse;
    const suivantes = convertirEnAjustements(operations, ids);
    setBourse(appliquerJournal(bourse, suivantes));
    showToast({
      message: `${ids.length} écriture(s) convertie(s) en ajustement de solde.`,
      onUndo: () => setBourse(precedent),
    });
    setOuvert(false);
  };

  const supprimer = () => {
    const ids = new Set(selection);
    if (ids.size === 0) return;
    const precedent = bourse;
    const suivantes = operations.filter((op) => !ids.has(op.id));
    setBourse(appliquerJournal(bourse, suivantes));
    showToast({
      message: `${ids.size} écriture(s) supprimée(s) du journal.`,
      onUndo: () => setBourse(precedent),
    });
    setOuvert(false);
  };

  return (
    <Card accent={CARD_THEMES.amber}>
      <CardLabel icon={Wrench}>Réparer le journal</CardLabel>

      <p className="text-sm text-slate-300 mt-1">
        {suspects.length} écriture{suspects.length > 1 ? "s" : ""} ressemble
        {suspects.length > 1 ? "nt" : ""} à une correction de solde enregistrée comme un vrai
        mouvement d&apos;argent. Tant qu&apos;elles portent ce type, elles comptent dans ton capital
        investi et faussent la performance.
      </p>

      {!ouvert ? (
        <GhostButton onClick={() => setOuvert(true)} icon={Wrench}>
          Voir ce qui changerait
        </GhostButton>
      ) : (
        <>
          <ul className="mt-3 flex flex-col gap-1.5">
            {suspects.map(({ operation, certitude, motif }) => {
              const coche = selection.has(operation.id);
              const montant = Math.abs(Number(operation.amount ?? operation.montantNet ?? 0) || 0);
              return (
                <li key={operation.id}>
                  <label
                    className={`flex items-start gap-2.5 rounded-lg border p-2.5 cursor-pointer transition-colors ${
                      coche
                        ? "border-amber-500/40 bg-amber-500/5"
                        : "border-slate-800 hover:border-slate-700"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={coche}
                      onChange={() => basculer(operation.id)}
                      className="mt-0.5 accent-amber-400"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 flex-wrap">
                        <span className="font-data tabular-nums text-slate-200 text-sm">
                          {formatDateShort(operation.date)}
                        </span>
                        <span className="text-micro font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border border-slate-700 text-slate-400">
                          {operation.type}
                        </span>
                        <span className="font-data tabular-nums text-slate-300 text-sm">
                          {eur(montant, 2)}
                        </span>
                        {certitude === "sure" ? (
                          <span className="text-micro text-emerald-400">certain</span>
                        ) : (
                          <span className="text-micro text-amber-300">à vérifier</span>
                        )}
                      </span>
                      <span className="block text-micro text-slate-500 mt-0.5">{motif}</span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>

          {/* L'aperçu chiffré : ce que la conversion change, avant de l'écrire. */}
          <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-micro text-slate-400">
            <p className="flex items-start gap-1.5">
              <AlertTriangle size={11} className="mt-0.5 shrink-0 text-amber-300" aria-hidden="true" />
              <span>
                <span className="text-slate-200">{selection.size} écriture(s) sélectionnée(s).</span>{" "}
                <span className="font-medium">Convertir</span> garde ton solde inchangé et retire{" "}
                <span className="font-data tabular-nums text-slate-200">{eur(Math.abs(impact), 2)}</span>{" "}
                {impact >= 0 ? "du capital investi" : "de retraits comptés à tort"} — c&apos;est la
                performance qui redevient juste. <span className="font-medium">Supprimer</span>{" "}
                retire l&apos;écriture entièrement et{" "}
                <span className="text-amber-300">modifie donc ta poche cash</span> de{" "}
                <span className="font-data tabular-nums">{eur(-impact, 2)}</span>.
              </span>
            </p>
          </div>

          <div className="flex flex-wrap gap-2 mt-3">
            <button
              onClick={convertir}
              disabled={selection.size === 0}
              className="btn-flash flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 px-3 py-1.5 text-sm font-medium disabled:opacity-40"
            >
              <Check size={14} aria-hidden="true" /> Convertir en ajustement
            </button>
            <GhostButton onClick={supprimer} disabled={selection.size === 0}>
              Supprimer ces écritures
            </GhostButton>
            <GhostButton onClick={() => setOuvert(false)}>Annuler</GhostButton>
          </div>
        </>
      )}
    </Card>
  );
}
