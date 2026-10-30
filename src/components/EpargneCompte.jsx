import { useId, useMemo, useState } from "react";
import { PiggyBank, Repeat, HandCoins, Vault, Plus, Check, ArrowLeftRight, Hourglass } from "lucide-react";
import { Card, CardLabel } from "./ui";
import Montant from "./Montant";
import { pctPlain, uid } from "../lib/finance";
import { COULEURS } from "../lib/styleGraphique";
import { RATES_CATALOG } from "../../shared/ratesCatalog";
import { categorie, normaliser, CATEGORIES } from "../lib/compteCourant";
import { argentQuiDort, recurrences, misDeCoteParMois, budgetMoyen, coutHabitude } from "../lib/analyseCompte";
import { enregistrerDansBourse, enregistrerSurLivret } from "../lib/liensComptes";
import { aboDepuisCharge, correspond } from "../lib/abonnements";
import { MontantSigne } from "./OperationsCompte";

/**
 * Sous-onglet « Épargne & charges » du compte courant : ce qui revient chaque
 * mois, ce qu'il reste une fois les charges fixes payées, ce qui est
 * réellement mis de côté — et ce que coûte l'argent laissé sur le compte.
 */

const euros = (c) => c / 100;
const dateCourte = (iso) => (iso ? iso.split("-").reverse().join("/") : "—");
const nomMois = (cle) => {
  const [a, m] = cle.split("-").map(Number);
  return new Date(a, m - 1, 1).toLocaleDateString("fr-FR", { month: "short", year: "2-digit" });
};

const LIVRET_A = RATES_CATALOG.find((r) => r.id === "livret-a");

// ─── Argent qui dort ─────────────────────────────────────────────────────────

export function ArgentQuiDort({ serie, solde, depensesMensuelles, livrets = [] }) {
  // Ce qui est déjà sur un Livret A réduit la place disponible sous le plafond.
  const dejaPlace = livrets
    .filter((l) => /livret\s*a\b/i.test(l.name || ""))
    .reduce((s, l) => s + Math.round((l.balance || 0) * 100), 0);
  const plafond = Math.max(0, Math.round((LIVRET_A?.plafond ?? Infinity) * 100) - dejaPlace);
  const calcul = useMemo(
    () =>
      argentQuiDort({
        serie,
        solde: solde?.solde,
        reserve: Math.round(depensesMensuelles || 0),
        tauxPct: LIVRET_A?.value,
        plafond,
      }),
    [serie, solde, depensesMensuelles, plafond]
  );
  if (!calcul || !LIVRET_A) return null;

  return (
    <Card>
      <CardLabel icon={Vault}>L'argent qui dort</CardLabel>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-3">
        <div>
          <div className="text-micro text-slate-500">
            {solde.ajustement
              ? `Solde estimé (relevé du ${dateCourte(solde.date)} corrigé)`
              : `Sur le compte au ${dateCourte(solde.date)}`}
          </div>
          <Montant valeur={euros(solde.solde)} decimales={2} className="font-display text-xl text-slate-100" />
        </div>
        <div>
          <div className="text-micro text-slate-500">Réserve pour le mois (1 mois de dépenses)</div>
          <Montant valeur={euros(calcul.reserve)} decimales={2} className="font-display text-xl text-slate-300" />
        </div>
        <div>
          <div className="text-micro text-slate-500">Au-delà, l'argent qui dort</div>
          <Montant valeur={euros(calcul.excedent)} decimales={2} className="font-display text-xl text-lime-300" />
        </div>
      </div>
      {calcul.excedent > 0 ? (
        <p className="text-sm text-slate-300">
          Placés au Livret A ({pctPlain(LIVRET_A.value, 2)} net), ils rapporteraient environ{" "}
          <Montant valeur={euros(calcul.gainAnnuel)} decimales={0} className="text-slate-100" /> par an, soit{" "}
          <Montant valeur={euros(calcul.gainMensuel)} decimales={2} className="text-slate-100" /> par mois d'attente.
        </p>
      ) : (
        <p className="text-sm text-slate-300">Ton solde ne dépasse pas un mois de dépenses : rien ne dort.</p>
      )}
      {calcul.manqueAGagner > 0 && (
        <p className="text-xs text-slate-500 mt-1">
          Depuis le {dateCourte(calcul.depuis)}, l'argent laissé au-delà de cette réserve aurait rapporté environ{" "}
          <Montant valeur={euros(calcul.manqueAGagner)} decimales={2} /> au Livret A.
        </p>
      )}
      <p className="text-micro text-slate-500 mt-2">
        Ordre de grandeur : le Livret A calcule ses intérêts par quinzaine et les verse une fois par an. Plafond pris en
        compte : <Montant valeur={euros(plafond)} decimales={0} />.
      </p>
    </Card>
  );
}

// ─── Charges fixes et reste à vivre ──────────────────────────────────────────

export function ChargesFixes({ charges, revenusMensuels, subs = [], setSubs }) {
  const total = charges.reduce((s, c) => s + c.montant, 0);
  const deja = new Set(subs.map((s) => normaliser(s.label)));
  const suivie = (c) => deja.has(normaliser(c.titre)) || subs.some((s) => correspond(s, c.cle));
  const resteAVivre = revenusMensuels != null ? revenusMensuels - total : null;
  const prochaines = [...charges].sort((a, b) => a.prochaine.localeCompare(b.prochaine)).slice(0, 4);

  return (
    <Card>
      <CardLabel icon={Repeat}>Charges fixes et reste à vivre</CardLabel>
      {charges.length === 0 ? (
        <p className="text-sm text-slate-500">
          Aucune charge ne revient encore chaque mois. Il faut qu'un même prélèvement se répète deux mois, ou un même
          paiement par carte trois mois, pour être reconnu.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <div>
              <div className="text-micro text-slate-500">Revenus moyens</div>
              {revenusMensuels == null ? <span className="text-slate-500">—</span> : (
                <Montant valeur={euros(revenusMensuels)} decimales={0} className="font-display text-xl text-slate-100" />
              )}
            </div>
            <div>
              <div className="text-micro text-slate-500">Charges fixes</div>
              <Montant valeur={euros(total)} decimales={2} className="font-display text-xl text-slate-100" />
            </div>
            <div>
              <div className="text-micro text-slate-500">Reste à vivre par mois</div>
              {resteAVivre == null ? <span className="text-slate-500">—</span> : (
                <Montant
                  valeur={euros(resteAVivre)}
                  decimales={0}
                  className={`font-display text-xl ${resteAVivre >= 0 ? "text-emerald-300" : "text-rose-300"}`}
                />
              )}
            </div>
          </div>
          <ul className="divide-y divide-slate-800/70 text-sm">
            {charges.map((c) => {
              const ajoute = suivie(c);
              return (
                <li key={`${c.cle}-${c.montant}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                  <span className="flex-1 min-w-0">
                    <span className="block text-slate-100 truncate">{c.titre}</span>
                    <span className="block text-xs text-slate-500">
                      {categorie(c.categorie).libelle} · vers le {c.jour} du mois · {c.nombreMois} mois
                    </span>
                  </span>
                  <Montant valeur={euros(c.montant)} decimales={2} className="text-slate-100" />
                  {setSubs && (
                    <button
                      type="button"
                      disabled={ajoute}
                      onClick={() =>
                        setSubs((s) => [...(s || []), aboDepuisCharge(c, uid())])
                      }
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:text-slate-100 disabled:opacity-60 disabled:cursor-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-400/40"
                    >
                      {ajoute ? <Check size={12} aria-hidden="true" /> : <Plus size={12} aria-hidden="true" />}
                      {ajoute ? "Dans Abonnements" : "Ajouter aux abonnements"}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="mt-3 pt-3 border-t border-slate-800 text-xs">
            <div className="text-micro uppercase tracking-wider text-slate-500 mb-1">Prochaines échéances estimées</div>
            <ul className="space-y-0.5">
              {prochaines.map((c) => (
                <li key={`p-${c.cle}-${c.montant}`} className="flex justify-between gap-3">
                  <span className="text-slate-300">
                    {dateCourte(c.prochaine)} · {c.titre}
                  </span>
                  <Montant valeur={euros(c.montant)} decimales={2} className="text-slate-100" />
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
      <p className="text-micro text-slate-500 mt-3">
        Une charge est reconnue quand le même marchand revient pour un montant comparable — deux mois pour un
        prélèvement, trois pour un paiement par carte, au même moment du mois — et encore récemment. Le reste à vivre se
        calcule sur les revenus moyens des trois derniers mois.
      </p>
    </Card>
  );
}

export function RevenusReguliers({ revenus }) {
  if (revenus.length === 0) return null;
  const total = revenus.reduce((s, r) => s + r.montant, 0);
  return (
    <Card>
      <CardLabel icon={HandCoins}>Revenus réguliers</CardLabel>
      <ul className="divide-y divide-slate-800/70 text-sm">
        {revenus.map((r) => (
          <li key={`${r.cle}-${r.montant}`} className="flex items-center gap-3 py-2">
            <span className="flex-1 min-w-0">
              <span className="block text-slate-100 truncate">{r.titre}</span>
              <span className="block text-xs text-slate-500">
                {categorie(r.categorie).libelle} · vers le {r.jour} du mois · prochain attendu le {dateCourte(r.prochaine)}
              </span>
            </span>
            <span className="text-emerald-300 whitespace-nowrap">+<Montant valeur={euros(r.montant)} decimales={2} /></span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-slate-500 mt-2">
        Soit <Montant valeur={euros(total)} decimales={2} className="text-slate-300" /> attendus chaque mois.
      </p>
    </Card>
  );
}

// ─── Virements vers ses comptes ─────────────────────────────────────────────

/**
 * Virements vers (ou depuis) ses propres comptes, face aux autres onglets.
 *
 * Ceux qui correspondent à un versement déjà saisi sont rattachés tout seuls.
 * Les autres sont proposés à l'enregistrement — vers le PEA, vers un livret,
 * ou laissés de côté s'ils concernent un compte que l'app ne suit pas. Rien
 * n'est créé d'office : le relevé ne dit pas toujours vers QUEL compte
 * l'argent est parti.
 */
export function VirementsComptes({
  sansCorrespondance = [],
  nbRattaches = 0,
  enveloppe = "PEA",
  livrets = [],
  setBourse,
  setLivrets,
  setCompteOperations,
}) {
  const [tout, setTout] = useState(false);
  if (sansCorrespondance.length === 0 && nbRattaches === 0) return null;
  const visibles = tout ? sansCorrespondance : sansCorrespondance.slice(0, 5);
  const ignorer = (op) =>
    setCompteOperations?.((ops) => ops.map((o) => (o.id === op.id ? { ...o, lienIgnore: true } : o)));
  const bouton =
    "rounded-lg border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-400/40";

  return (
    <Card>
      <CardLabel icon={ArrowLeftRight}>Virements vers tes comptes</CardLabel>
      {nbRattaches > 0 && (
        <p className="text-xs text-slate-400 mb-2">
          {nbRattaches} virement{nbRattaches > 1 ? "s" : ""} déjà rattaché{nbRattaches > 1 ? "s" : ""} à un versement
          enregistré dans PEA & Bourse ou dans un livret : compté{nbRattaches > 1 ? "s" : ""} une seule fois.
        </p>
      )}
      {sansCorrespondance.length === 0 ? (
        <p className="text-sm text-slate-400">Tous tes virements entre comptes sont rattachés.</p>
      ) : (
        <>
          <p className="text-sm text-slate-300 mb-2">
            Ces virements ne correspondent à aucun versement connu. Indique où est allé l'argent pour que tes autres
            onglets restent à jour.
          </p>
          <ul className="divide-y divide-slate-800/70 text-sm">
            {visibles.map((op) => (
              <li key={op.id} className="py-2 space-y-1.5">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-500 w-20">{dateCourte(op.date)}</span>
                  <span className="flex-1 min-w-0 truncate text-slate-200">{op.analyse.titre}</span>
                  <MontantSigne centimes={op.montant} />
                </div>
                <div className="flex flex-wrap gap-1.5 pl-[5.75rem]">
                  {setBourse && (
                    <button type="button" className={bouton} onClick={() => setBourse((b) => enregistrerDansBourse(b, op))}>
                      {op.montant < 0 ? "Versement sur le" : "Retrait du"} {enveloppe}
                    </button>
                  )}
                  {setLivrets &&
                    livrets.map((l) => (
                      <button
                        key={l.id}
                        type="button"
                        className={bouton}
                        onClick={() => setLivrets((ls) => ls.map((x) => (x.id === l.id ? enregistrerSurLivret(x, op) : x)))}
                      >
                        {op.montant < 0 ? "Dépôt sur" : "Retrait de"} {l.name}
                      </button>
                    ))}
                  <button type="button" className={bouton} onClick={() => ignorer(op)}>
                    Autre compte, ne rien faire
                  </button>
                </div>
              </li>
            ))}
          </ul>
          {sansCorrespondance.length > 5 && (
            <button
              type="button"
              onClick={() => setTout((t) => !t)}
              className="mt-2 text-xs text-slate-400 hover:text-slate-200 underline underline-offset-2"
            >
              {tout ? "Voir moins" : `Voir les ${sansCorrespondance.length} virements`}
            </button>
          )}
        </>
      )}
    </Card>
  );
}

// ─── Coût des habitudes ──────────────────────────────────────────────────────

// Catégories proposées d'abord : celles qui relèvent d'un choix. Le loyer ou
// l'énergie coûtent aussi, mais ne sont pas des « habitudes » à arbitrer.
const HABITUDES = ["restauration", "jeux", "loisirs", "shopping", "voyages", "abonnements", "transport"];

/**
 * Le vrai coût d'une habitude : sa moyenne mensuelle ramenée à l'année, puis
 * ce que la même somme deviendrait versée chaque mois au Livret A ou en
 * bourse. Le rendement boursier est l'hypothèse du simulateur, pas une
 * promesse — l'écran le dit.
 */
export function CoutHabitudes({ enrichies, tauxBoursePct = 6 }) {
  const idChamp = useId();
  const presentes = useMemo(() => {
    const ids = new Set(enrichies.filter((o) => o.famille === "depense" && !o.horsBudget).map((o) => o.categorie));
    return CATEGORIES.filter((c) => ids.has(c.id));
  }, [enrichies]);
  const parDefaut = HABITUDES.find((h) => presentes.some((c) => c.id === h)) || presentes[0]?.id;
  const [choix, setChoix] = useState(null);
  const id = choix && presentes.some((c) => c.id === choix) ? choix : parDefaut;
  const taux = useMemo(
    () => [
      { libelle: `Livret A (${pctPlain(LIVRET_A?.value ?? 0, 2)})`, tauxPct: LIVRET_A?.value ?? 0 },
      { libelle: `Bourse (hypothèse ${pctPlain(tauxBoursePct, 0)} par an)`, tauxPct: tauxBoursePct },
    ],
    [tauxBoursePct]
  );
  const cout = useMemo(() => (id ? coutHabitude(enrichies, id, { taux }) : null), [enrichies, id, taux]);
  if (!cout) return null;

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <CardLabel icon={Hourglass}>Le vrai coût de tes habitudes</CardLabel>
        <label htmlFor={idChamp} className="sr-only">Catégorie</label>
        <select
          id={idChamp}
          value={id}
          onChange={(e) => setChoix(e.target.value)}
          className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-lime-400/40"
        >
          {presentes.map((c) => (
            <option key={c.id} value={c.id}>{c.libelle}</option>
          ))}
        </select>
      </div>
      <p className="text-sm text-slate-300">
        {cout.libelle} : <Montant valeur={euros(cout.mensuel)} decimales={0} className="text-slate-100" /> par mois en
        moyenne, soit <Montant valeur={euros(cout.annuel)} decimales={0} className="text-slate-100" /> par an.
      </p>
      <div className="overflow-x-auto -mx-1 mt-3">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-slate-500 text-left">
              <th scope="col" className="font-normal py-1 px-1">Si cette somme était placée chaque mois</th>
              {cout.projections.map((p) => (
                <th key={p.annees} scope="col" className="font-normal py-1 px-1 text-right">{p.annees} ans</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/70">
            <tr>
              <th scope="row" className="font-normal text-left text-slate-400 py-1.5 px-1">Total dépensé</th>
              {cout.projections.map((p) => (
                <td key={p.annees} className="text-right px-1"><Montant valeur={euros(p.verse)} decimales={0} /></td>
              ))}
            </tr>
            {taux.map((t, i) => (
              <tr key={t.libelle}>
                <th scope="row" className="font-normal text-left text-slate-400 py-1.5 px-1">{t.libelle}</th>
                {cout.projections.map((p) => (
                  <td key={p.annees} className="text-right px-1 text-slate-100">
                    <Montant valeur={euros(p.placements[i].valeur)} decimales={0} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-micro text-slate-500 mt-2">
        Moyenne sur tous les mois de relevés, mois sans dépense compris. Le rendement boursier est celui du simulateur :
        une hypothèse, sans garantie.
      </p>
    </Card>
  );
}

// ─── Ce qui est mis de côté ──────────────────────────────────────────────────

export function MisDeCote({ lignes }) {
  if (lignes.length === 0) return null;
  const total = lignes.reduce((s, l) => s + l.net, 0);
  const max = Math.max(1, ...lignes.map((l) => Math.abs(l.net)));
  return (
    <Card>
      <CardLabel icon={PiggyBank}>Ce que tu mets réellement de côté</CardLabel>
      <ul className="space-y-1.5 text-xs">
        {lignes.map((l) => (
          <li key={l.mois} className="flex items-center gap-2">
            <span className="w-14 text-slate-400">{nomMois(l.mois)}</span>
            <span className="flex-1 h-1.5 rounded-full bg-slate-800 overflow-hidden">
              <span
                className="block h-full rounded-full"
                style={{ width: `${(Math.abs(l.net) / max) * 100}%`, background: l.net >= 0 ? COULEURS.domaine : COULEURS.baisse }}
              />
            </span>
            <span className={`w-24 text-right ${l.net >= 0 ? "text-slate-100" : "text-rose-300"}`}>
              {l.net > 0 ? "+" : ""}
              <Montant valeur={euros(l.net)} decimales={0} />
            </span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-slate-500 mt-2">
        Argent parti vers tes autres comptes, moins celui qui en est revenu :{" "}
        <Montant valeur={euros(total)} decimales={0} className="text-slate-300" /> sur la période. C'est ton épargne
        effective, distincte du reste du mois qui peut rester sur le compte courant.
      </p>
    </Card>
  );
}

export default function EpargneCompte({
  enrichies,
  serie,
  solde,
  livrets,
  subs,
  setSubs,
  liens,
  sansCorrespondance,
  setBourse,
  setLivrets,
  setCompteOperations,
  enveloppe,
  tauxBoursePct,
}) {
  const budget = useMemo(() => budgetMoyen(enrichies), [enrichies]);
  const rec = useMemo(() => recurrences(enrichies), [enrichies]);
  const misDeCote = useMemo(() => misDeCoteParMois(enrichies), [enrichies]);
  return (
    <div className="space-y-6">
      {solde && (
        <ArgentQuiDort serie={serie} solde={solde} depensesMensuelles={budget?.depenses} livrets={livrets} />
      )}
      <VirementsComptes
        sansCorrespondance={sansCorrespondance}
        nbRattaches={liens?.size || 0}
        enveloppe={enveloppe}
        livrets={livrets}
        setBourse={setBourse}
        setLivrets={setLivrets}
        setCompteOperations={setCompteOperations}
      />
      <ChargesFixes charges={rec.charges} revenusMensuels={budget?.revenus ?? null} subs={subs} setSubs={setSubs} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
        <RevenusReguliers revenus={rec.revenus} />
        <MisDeCote lignes={misDeCote} />
      </div>
      <CoutHabitudes enrichies={enrichies} tauxBoursePct={tauxBoursePct} />
    </div>
  );
}
