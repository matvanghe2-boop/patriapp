import { useId, useMemo } from "react";
import { Scale, Users, User, ExternalLink } from "lucide-react";
import { Card, CardLabel, PastilleEtat, PageGlow, CARD_THEMES } from "./ui";
import Montant from "./Montant";
import { usePersistentState } from "../lib/storage";
import { comparerRattachement, PARAMETRES_IMPOT } from "../lib/rattachementFiscal";

/**
 * Sous-onglet « Impôts » de Simulation : rattaché au foyer de ses parents, ou
 * déclaration séparée ? Estimation simplifiée (voir rattachementFiscal.js),
 * qui renvoie au simulateur officiel pour trancher.
 */
const CHAMP = "w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm font-data focus:outline-none focus:border-cyan-400/60";
const DEFAUT = { revenuParents: "", situation: "couple", autresEnfants: 0, age: "", etudiant: true, salaires: "", aide: "" };
const fmt = (n) => n.toLocaleString("fr-FR");

export default function ComparateurRattachement() {
  const ids = useId();
  const [reglages, setReglages] = usePersistentState("rattachementReglages", DEFAUT);
  const r = { ...DEFAUT, ...(reglages || {}) };
  const champ = (cle, lire = (e) => e.target.value) => (e) => setReglages((x) => ({ ...DEFAUT, ...(x || {}), [cle]: lire(e) }));
  const an = PARAMETRES_IMPOT.anneeRevenus;

  const resultat = useMemo(
    () =>
      comparerRattachement({
        parents: {
          revenu: Number(r.revenuParents) || 0,
          couple: r.situation === "couple",
          parentIsole: r.situation === "isole",
          autresEnfants: Number(r.autresEnfants) || 0,
        },
        jeune: { salaires: Number(r.salaires) || 0, aide: Number(r.aide) || 0, age: r.age === "" ? null : Number(r.age), etudiant: r.etudiant },
      }),
    [r.revenuParents, r.situation, r.autresEnfants, r.salaires, r.aide, r.age, r.etudiant]
  );
  const pret = Number(r.revenuParents) > 0;
  const meilleur = resultat.scenarios.find((s) => s.id === resultat.meilleur);

  return (
    <div className="relative space-y-6">
      <PageGlow color="cyan" />
      <div>
        <h1 className="font-display text-2xl text-slate-50">
          Rattaché ou <span className="text-cyan-300">déclaration séparée</span> ?
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Impôt de tes parents et le tien, sur les revenus {an}, selon la façon de déclarer. Estimation simplifiée.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card accent={CARD_THEMES.cyan}>
          <CardLabel icon={Users}>Le foyer de tes parents</CardLabel>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label htmlFor={`${ids}-revenu`} className="text-micro text-slate-500">Revenu net imposable {an} (sans l'aide qu'ils te versent)</label>
              <input id={`${ids}-revenu`} type="number" min="0" step="100" inputMode="numeric" value={r.revenuParents} onChange={champ("revenuParents")} placeholder="ex. 60000" className={CHAMP} />
            </div>
            <div>
              <label htmlFor={`${ids}-situation`} className="text-micro text-slate-500">Situation</label>
              <select id={`${ids}-situation`} value={r.situation} onChange={champ("situation")} className={CHAMP}>
                <option value="couple">Mariés ou pacsés</option>
                <option value="seul">Parent seul</option>
                <option value="isole">Parent seul qui t'élève seul (case T)</option>
              </select>
            </div>
            <div>
              <label htmlFor={`${ids}-enfants`} className="text-micro text-slate-500">Autres enfants à charge</label>
              <input id={`${ids}-enfants`} type="number" min="0" max="10" value={r.autresEnfants} onChange={champ("autresEnfants")} className={CHAMP} />
            </div>
          </div>
        </Card>

        <Card accent={CARD_THEMES.cyan}>
          <CardLabel icon={User}>Toi</CardLabel>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <label htmlFor={`${ids}-age`} className="text-micro text-slate-500">Âge au 1er janvier {an}</label>
              <input id={`${ids}-age`} type="number" min="16" max="40" value={r.age} onChange={champ("age")} className={CHAMP} />
            </div>
            <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-300">
              <input type="checkbox" checked={!!r.etudiant} onChange={champ("etudiant", (e) => e.target.checked)} className="accent-cyan-400" />
              Étudiant
            </label>
            <div>
              <label htmlFor={`${ids}-salaires`} className="text-micro text-slate-500">Salaires imposables {an}</label>
              <input id={`${ids}-salaires`} type="number" min="0" step="10" value={r.salaires} onChange={champ("salaires")} placeholder="0" className={CHAMP} />
            </div>
            <div>
              <label htmlFor={`${ids}-aide`} className="text-micro text-slate-500">Aide de tes parents sur l'année</label>
              <input id={`${ids}-aide`} type="number" min="0" step="10" value={r.aide} onChange={champ("aide")} placeholder="0" className={CHAMP} />
            </div>
            <div className="col-span-2 flex flex-wrap gap-1.5">
              {[
                ["Tu vis chez eux : forfait", PARAMETRES_IMPOT.forfaitHebergement],
                ["Maximum déductible", PARAMETRES_IMPOT.pensionMax],
              ].map(([libelle, valeur]) => (
                <button
                  key={libelle}
                  type="button"
                  onClick={() => setReglages((x) => ({ ...DEFAUT, ...(x || {}), aide: String(valeur) }))}
                  className="btn-flash rounded-full border border-cyan-400/25 bg-cyan-500/5 px-2.5 py-0.5 text-micro text-cyan-100 hover:border-cyan-300/50"
                >
                  {libelle} {fmt(valeur)} €
                </button>
              ))}
            </div>
            <p className="col-span-2 text-micro text-slate-500">
              Si tu as moins de 26 ans, tes salaires de job étudiant sont exonérés jusqu'à trois Smic mensuels : saisis
              seulement la part imposable. Un don ponctuel (une grosse somme pour un projet) n'est pas une pension :
              ne compte que l'aide à tes besoins courants.
            </p>
          </div>
        </Card>
      </div>

      <Card accent={CARD_THEMES.cyan}>
        <CardLabel icon={Scale}>Les trois façons de déclarer</CardLabel>
        {!pret ? (
          <p className="mt-3 text-sm text-slate-400">Renseigne le revenu imposable de tes parents pour lancer la comparaison.</p>
        ) : (
          <>
            {resultat.ecart > 0 && meilleur && (
              <p className="mt-2 text-sm text-slate-200">
                Le moins cher : <span className="text-cyan-200">{meilleur.libelle.toLowerCase()}</span>, environ{" "}
                <Montant valeur={resultat.ecart} className="text-cyan-200" /> d'impôt en moins pour vos deux foyers que l'option suivante.
              </p>
            )}
            {resultat.ecart === 0 && <p className="mt-2 text-sm text-slate-300">Les options se valent : le choix ne change rien à l'impôt total.</p>}
            {!resultat.eligibilite.possible && (
              <p className="mt-2 text-micro etat-attention">{resultat.eligibilite.motif} Restent les déclarations séparées.</p>
            )}
            {resultat.aidePlafonnee && (
              <p className="mt-2 text-micro text-slate-500">
                La déduction est plafonnée à {fmt(PARAMETRES_IMPOT.pensionMax)} € : l'aide au-delà n'est pas prise en compte.
              </p>
            )}
            <ul className="mt-3 flex flex-col gap-2">
              {resultat.scenarios.map((s) => {
                const top = s.id === resultat.meilleur && resultat.ecart > 0;
                return (
                  <li key={s.id} className={`rounded-xl border px-3 py-2.5 ${top ? "border-cyan-400/40 bg-cyan-500/5" : "border-slate-800 bg-slate-950/50"}`}>
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <span className="flex items-center gap-2 text-corps text-slate-100">
                        {s.libelle}
                        {top && <PastilleEtat etat="ok">le moins cher</PastilleEtat>}
                      </span>
                      <span className="text-right">
                        <Montant valeur={s.total} className="block text-corps text-slate-100" />
                        <span className="block text-micro text-slate-500">impôt total</span>
                      </span>
                    </div>
                    <div className="mt-1 text-micro text-slate-500">
                      Tes parents : <Montant valeur={s.parents.net} /> ({fmt(s.parents.parts)} parts
                      {s.parents.plafonne && ", avantage des parts plafonné"}
                      {s.parents.decote > 0 && ", décote appliquée"})
                      {s.jeune && (
                        <>
                          {" · "}Toi : <Montant valeur={s.jeune.net} /> sur <Montant valeur={s.jeune.revenu} /> imposables
                        </>
                      )}
                      {s.id === "rattache" && " · tes revenus s'ajoutent aux leurs"}
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
        <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-2.5 text-micro text-slate-500 space-y-1">
          <p>
            Barème {an + 1} sur les revenus {an} : quotient familial plafonné ({fmt(PARAMETRES_IMPOT.plafondDemiPart)} € par demi-part),
            décote, déduction de 10 % sur les salaires et les pensions. Ne sont pas pris en compte : réductions et crédits d'impôt,
            revenus de placements, parents séparés qui déclarent chacun de leur côté.
          </p>
          <p>
            Le rattachement compte aussi pour les bourses et les aides au logement : regarde-les avant de choisir. Rattachement et
            pension déduite ne se cumulent pas pour un même enfant.
          </p>
          <a
            href="https://www.impots.gouv.fr/simulateurs"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-cyan-300 hover:text-cyan-200"
          >
            Vérifier avec le simulateur officiel <ExternalLink size={11} aria-hidden="true" />
          </a>
        </div>
      </Card>
    </div>
  );
}
