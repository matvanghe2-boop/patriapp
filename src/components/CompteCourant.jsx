import { useMemo, useState } from "react";
import {
  CreditCard, ChevronLeft, ChevronRight, ArrowDownLeft, ArrowUpRight, Scale, FileText, ShieldCheck,
  TriangleAlert, Trash2, Landmark, Info,
} from "lucide-react";
import { Card, CardLabel, PageGlow, PastilleEtat, SectionRepliable, CARD_THEMES } from "./ui";
import Montant from "./Montant";
import OperationsCompte, { MontantSigne } from "./OperationsCompte";
import { BoutonImport, ApercuImport } from "./ImportReleve";
import { DepensesParCategorie, PrincipauxPostes, CourbeSolde, EntreesSorties } from "./StatsCompte";
import { useToast } from "../lib/ToastContext";
import { useConfirm } from "../lib/ConfirmContext";
import { pctPlain, uid } from "../lib/finance";
import {
  enrichir, soldesApres, soldeActuel, serieSolde, raccordsReleves, moisDisponibles, moisDe, bilan, parMois,
  appliquerImport, retirerReleve, categorie, operationsInhabituelles,
} from "../lib/compteCourant";

/**
 * Onglet Compte courant.
 *
 * Le relevé de la banque est la source : l'application ne saisit rien à la
 * main, elle LIT les relevés PDF, vérifie que chaque ligne a été comprise
 * (solde de départ + mouvements = solde d'arrivée), puis en tire le budget
 * réel — ce qui entre, ce qui sort, où, et ce qui n'est qu'un déplacement
 * entre ses propres comptes.
 */

const dateLongue = (iso) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
const dateCourte = (iso) => (iso ? iso.split("-").reverse().join("/") : "?");

function libelleMois(cle) {
  const [a, m] = cle.split("-").map(Number);
  const texte = new Date(a, m - 1, 1).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  return texte.charAt(0).toUpperCase() + texte.slice(1);
}

export default function CompteCourant({
  compteOperations = [],
  setCompteOperations,
  compteReleves = [],
  setCompteReleves,
  compteRegles = [],
  setCompteRegles,
  cash,
  setCash,
}) {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [apercu, setApercu] = useState(null);
  const [moisChoisi, setMoisChoisi] = useState(null);
  const [filtreCategorie, setFiltreCategorie] = useState(null);

  // Le titulaire du relevé le plus récent sert à reconnaître les virements
  // entre ses propres comptes.
  const titulaire = useMemo(
    () => [...compteReleves].sort((a, b) => String(a.fin).localeCompare(String(b.fin))).pop()?.titulaire || null,
    [compteReleves]
  );
  const enrichies = useMemo(
    () => enrichir(compteOperations, { regles: compteRegles, titulaire }),
    [compteOperations, compteRegles, titulaire]
  );
  const soldes = useMemo(() => soldesApres(compteOperations, compteReleves), [compteOperations, compteReleves]);
  const serie = useMemo(() => serieSolde(compteOperations, compteReleves), [compteOperations, compteReleves]);
  const actuel = useMemo(() => soldeActuel(compteReleves), [compteReleves]);
  const trous = useMemo(() => raccordsReleves(compteReleves), [compteReleves]);
  const mois = useMemo(() => moisDisponibles(compteOperations), [compteOperations]);
  const flux = useMemo(() => parMois(enrichies), [enrichies]);
  const nbParCle = useMemo(() => {
    const n = new Map();
    for (const op of enrichies) n.set(op.analyse.cle, (n.get(op.analyse.cle) || 0) + 1);
    return n;
  }, [enrichies]);

  const moisCourant = moisChoisi && mois.includes(moisChoisi) ? moisChoisi : mois[mois.length - 1] || null;
  const duMois = useMemo(() => enrichies.filter((o) => moisDe(o.date) === moisCourant), [enrichies, moisCourant]);
  const stats = useMemo(() => bilan(duMois), [duMois]);
  const inhabituelles = useMemo(() => operationsInhabituelles(enrichies, moisCourant), [enrichies, moisCourant]);
  const indexMois = mois.indexOf(moisCourant);

  const changerMois = (pas) => {
    const cible = mois[indexMois + pas];
    if (!cible) return;
    setMoisChoisi(cible);
    setFiltreCategorie(null);
  };

  const importer = (lots) => {
    let etat = { operations: compteOperations, releves: compteReleves };
    for (const lot of lots) etat = appliquerImport(lot, etat);
    setCompteOperations(etat.operations);
    setCompteReleves(etat.releves);
    setApercu(null);
    setMoisChoisi(null);
    const n = lots.reduce((s, l) => s + l.nouvelles.length, 0);
    showToast({ message: `${n} opération${n > 1 ? "s" : ""} importée${n > 1 ? "s" : ""}.` });
  };

  const classer = (op, idCategorie, { pourToutes }) => {
    const cle = op.analyse.cle;
    if (pourToutes) {
      // La règle prime sur les choix faits une à une : on les efface pour ce
      // marchand, sans quoi une ancienne correction contredirait la règle.
      const memes = new Set(enrichies.filter((o) => o.analyse.cle === cle).map((o) => o.id));
      setCompteRegles((rs) => [...(rs || []).filter((r) => r.cle !== cle), { id: uid(), cle, categorie: idCategorie }]);
      setCompteOperations((ops) =>
        ops.map((o) => (memes.has(o.id) && o.categorieManuelle ? { ...o, categorieManuelle: undefined } : o))
      );
    } else {
      setCompteOperations((ops) => ops.map((o) => (o.id === op.id ? { ...o, categorieManuelle: idCategorie } : o)));
    }
    showToast({ message: `Classé dans « ${categorie(idCategorie).libelle} ».` });
  };

  /**
   * Met des opérations à part du budget du mois — ou les y remet. La valeur
   * est écrite explicitement, `false` compris : une opération que l'on a
   * choisi de garder ne doit plus être proposée à la mise à part.
   */
  const mettreAPart = (ids, aPart) => {
    const cibles = new Set(ids);
    setCompteOperations((ops) => ops.map((o) => (cibles.has(o.id) ? { ...o, horsBudget: aPart } : o)));
    const n = cibles.size;
    showToast({
      message: aPart
        ? `${n > 1 ? `${n} opérations mises` : "Opération mise"} à part du budget du mois.`
        : `${n > 1 ? `${n} opérations gardées` : "Opération gardée"} dans le budget du mois.`,
    });
  };

  const supprimerReleve = async (releve) => {
    const ok = await confirm({
      title: "Retirer ce relevé ?",
      message: `Les ${releve.nbOperations} opérations du relevé du ${dateCourte(releve.debut)} au ${dateCourte(releve.fin)} seront retirées. Tu pourras le réimporter.`,
      confirmLabel: "Retirer",
      danger: true,
    });
    if (!ok) return;
    const etat = retirerReleve(releve.id, { operations: compteOperations, releves: compteReleves });
    setCompteOperations(etat.operations);
    setCompteReleves(etat.releves);
  };

  const vide = compteOperations.length === 0 && compteReleves.length === 0;
  const cashCentimes = Math.round((cash ?? 0) * 100);

  return (
    <div className="relative space-y-6">
      <PageGlow color="lime" />

      <div className="relative flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-slate-50">
            Compte <span className="text-lime-300">courant</span>
          </h1>
          <p className="text-sm text-slate-500 mt-1">Tes relevés, ton solde et ton budget réel, mois par mois.</p>
        </div>
        {!vide && <BoutonImport onLu={setApercu} />}
      </div>

      {apercu && (
        <ApercuImport
          resultats={apercu}
          existant={{ operations: compteOperations, releves: compteReleves }}
          onConfirmer={importer}
          onAnnuler={() => setApercu(null)}
        />
      )}

      {vide ? (
        !apercu && <AccueilVide onLu={setApercu} />
      ) : (
        <>
          {actuel && (
            <Card role="vedette" accent={CARD_THEMES.lime}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-xs text-slate-400">Solde au {dateLongue(actuel.date)}</div>
                  <Montant valeur={actuel.solde / 100} decimales={2} className="block font-display text-vedette text-slate-50 mt-1" />
                  <div className="text-xs text-slate-500 mt-2 flex items-center gap-1.5">
                    <Landmark size={13} aria-hidden="true" />
                    {actuel.releve.banque}
                    {actuel.releve.compte && <> · compte •••• {actuel.releve.compte}</>}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  {actuel.releve.controleOk ? (
                    <PastilleEtat etat="ok">Vérifié sur le relevé</PastilleEtat>
                  ) : (
                    <PastilleEtat etat="attention">Relevé non vérifié</PastilleEtat>
                  )}
                  <span className="text-micro text-slate-500">
                    {compteReleves.length} relevé{compteReleves.length > 1 ? "s" : ""} · {compteOperations.length} opération
                    {compteOperations.length > 1 ? "s" : ""}
                  </span>
                </div>
              </div>
            </Card>
          )}

          {actuel && setCash && cashCentimes !== actuel.solde && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-3 text-sm">
              <p className="text-slate-300">
                Ton patrimoine compte <Montant valeur={cashCentimes / 100} decimales={2} /> sur le compte courant ; ton
                dernier relevé indique <Montant valeur={actuel.solde / 100} decimales={2} /> au {dateCourte(actuel.date)}.
              </p>
              <button
                type="button"
                onClick={() => {
                  setCash(actuel.solde / 100);
                  showToast({ message: "Solde du compte courant reporté dans le patrimoine." });
                }}
                className="rounded-lg border border-lime-400/40 bg-lime-400/10 px-3 py-1.5 text-xs text-lime-100 hover:bg-lime-400/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-400/40"
              >
                Reporter ce solde dans le patrimoine
              </button>
            </div>
          )}

          {trous.map((t) => (
            <div key={`${t.apres}-${t.avant}`} className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-200">
              <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
              <p>
                Il manque probablement un relevé entre le {dateCourte(t.apres)} et le {dateCourte(t.avant)} : les soldes
                ne se raccordent pas (écart de <Montant valeur={Math.abs(t.ecart) / 100} decimales={2} />).
              </p>
            </div>
          ))}

          {moisCourant && (
            <>
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => changerMois(-1)}
                  disabled={indexMois <= 0}
                  aria-label="Mois précédent"
                  className="rounded-lg border border-slate-800 p-2 text-slate-400 hover:text-slate-100 disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-400/40"
                >
                  <ChevronLeft size={16} aria-hidden="true" />
                </button>
                <h2 className="font-display text-lg text-slate-100" aria-live="polite">{libelleMois(moisCourant)}</h2>
                <button
                  type="button"
                  onClick={() => changerMois(1)}
                  disabled={indexMois >= mois.length - 1}
                  aria-label="Mois suivant"
                  className="rounded-lg border border-slate-800 p-2 text-slate-400 hover:text-slate-100 disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-400/40"
                >
                  <ChevronRight size={16} aria-hidden="true" />
                </button>
              </div>

              {inhabituelles.length > 0 && (
                <div className="rounded-xl border border-sky-500/30 bg-sky-500/5 px-4 py-3 text-sm space-y-2">
                  <div className="flex items-start gap-2 text-slate-200">
                    <Info size={16} className="mt-0.5 shrink-0 text-sky-300" aria-hidden="true" />
                    <p>
                      {inhabituelles.length > 1
                        ? `${inhabituelles.length} opérations sortent de l'ordinaire ce mois-ci`
                        : "Une opération sort de l'ordinaire ce mois-ci"}{" "}
                      : chacune dépasse à elle seule ce qui entre ou sort d'habitude en un mois. Ponctuelles, elles
                      fausseraient la lecture de ton budget courant.
                    </p>
                  </div>
                  <ul className="pl-6 space-y-0.5 text-xs text-slate-400">
                    {inhabituelles.map((op) => (
                      <li key={op.id} className="flex justify-between gap-3 max-w-md">
                        <span className="truncate">
                          {op.analyse.titre}
                          {op.analyse.motif && <span className="text-slate-500"> · « {op.analyse.motif} »</span>}
                        </span>
                        <MontantSigne centimes={op.montant} />
                      </li>
                    ))}
                  </ul>
                  <div className="flex flex-wrap gap-2 pl-6">
                    <button
                      type="button"
                      onClick={() => mettreAPart(inhabituelles.map((o) => o.id), true)}
                      className="rounded-lg border border-sky-400/40 bg-sky-400/10 px-3 py-1.5 text-xs text-sky-100 hover:bg-sky-400/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/40"
                    >
                      Mettre à part du budget
                    </button>
                    <button
                      type="button"
                      onClick={() => mettreAPart(inhabituelles.map((o) => o.id), false)}
                      className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/40"
                    >
                      Les garder dans le budget
                    </button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card>
                  <CardLabel icon={ArrowDownLeft}>Entrées</CardLabel>
                  <Montant valeur={stats.entrees / 100} decimales={2} className="font-display text-chiffre text-emerald-300" />
                </Card>
                <Card>
                  <CardLabel icon={ArrowUpRight}>Sorties</CardLabel>
                  <Montant valeur={stats.sorties / 100} decimales={2} className="font-display text-chiffre text-slate-100" />
                </Card>
                <Card>
                  <CardLabel icon={Scale}>Reste du mois</CardLabel>
                  <Montant
                    valeur={stats.net / 100}
                    decimales={2}
                    className={`font-display text-chiffre ${stats.net >= 0 ? "text-emerald-300" : "text-rose-300"}`}
                  />
                  {stats.tauxEpargne != null && (
                    <div className="text-xs text-slate-500 mt-1">
                      {stats.net >= 0
                        ? `Soit ${pctPlain(stats.tauxEpargne * 100, 0)} des entrées`
                        : `${pctPlain(-stats.tauxEpargne * 100, 0)} de plus que les entrées`}
                    </div>
                  )}
                </Card>
              </div>
              {(stats.interneSortant > 0 || stats.interneEntrant > 0) && (
                <p className="text-xs text-slate-500 -mt-2">
                  Hors mouvements entre tes comptes : <Montant valeur={stats.interneSortant / 100} decimales={2} /> partis,{" "}
                  <Montant valeur={stats.interneEntrant / 100} decimales={2} /> revenus. Ils ne sont ni des dépenses ni
                  des revenus.
                </p>
              )}
              {stats.horsBudgetNombre > 0 && (
                <p className="text-xs text-slate-500 -mt-2">
                  Mis à part du budget : {stats.horsBudgetNombre} opération{stats.horsBudgetNombre > 1 ? "s" : ""}{" "}
                  ponctuelle{stats.horsBudgetNombre > 1 ? "s" : ""}
                  {stats.horsBudgetEntrant > 0 && (
                    <>
                      , <Montant valeur={stats.horsBudgetEntrant / 100} decimales={2} /> reçus
                    </>
                  )}
                  {stats.horsBudgetSortant > 0 && (
                    <>
                      , <Montant valeur={stats.horsBudgetSortant / 100} decimales={2} /> envoyés
                    </>
                  )}
                  . {stats.horsBudgetNombre > 1 ? "Elles restent" : "Elle reste"} dans le solde.
                </p>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
                <Card className="lg:col-span-3">
                  <CardLabel icon={CreditCard}>Opérations</CardLabel>
                  <OperationsCompte
                    operations={duMois}
                    soldes={soldes}
                    nbParCle={nbParCle}
                    filtreCategorie={filtreCategorie}
                    onEffacerFiltreCategorie={() => setFiltreCategorie(null)}
                    onClasser={classer}
                    onMettreAPart={mettreAPart}
                  />
                </Card>
                <div className="lg:col-span-2 space-y-6">
                  <DepensesParCategorie
                    depenses={stats.depensesParCategorie}
                    filtreCategorie={filtreCategorie}
                    onFiltrer={setFiltreCategorie}
                  />
                  <PrincipauxPostes postes={stats.principauxPostes} />
                  <CourbeSolde serie={serie} mois={moisCourant} />
                </div>
              </div>

              <EntreesSorties mois={flux} />
            </>
          )}

          <SectionRepliable titre="Relevés importés" icon={FileText} resume={`${compteReleves.length}`}>
            <ul className="divide-y divide-slate-800">
              {[...compteReleves]
                .sort((a, b) => String(b.debut).localeCompare(String(a.debut)))
                .map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                    {r.controleOk ? (
                      <ShieldCheck size={16} className="text-emerald-300" aria-label="Solde vérifié" />
                    ) : (
                      <TriangleAlert size={16} className="text-amber-300" aria-label="Solde non vérifié" />
                    )}
                    <span className="flex-1 min-w-0">
                      <span className="block text-slate-200">
                        Du {dateCourte(r.debut)} au {dateCourte(r.fin)}
                      </span>
                      <span className="block text-xs text-slate-500">
                        {r.nbOperations} opérations · <Montant valeur={(r.soldeDebut ?? 0) / 100} decimales={2} /> →{" "}
                        <Montant valeur={(r.soldeFin ?? 0) / 100} decimales={2} />
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => supprimerReleve(r)}
                      aria-label={`Retirer le relevé du ${dateCourte(r.debut)} au ${dateCourte(r.fin)}`}
                      className="rounded-lg p-1.5 text-slate-500 hover:text-rose-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/40"
                    >
                      <Trash2 size={15} aria-hidden="true" />
                    </button>
                  </li>
                ))}
            </ul>
          </SectionRepliable>
        </>
      )}
    </div>
  );
}

function AccueilVide({ onLu }) {
  return (
    <Card accent={CARD_THEMES.lime} className="space-y-4">
      <div className="flex items-start gap-3">
        <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-lime-400/15 text-lime-300 shrink-0">
          <CreditCard size={20} aria-hidden="true" />
        </span>
        <div className="space-y-2 text-sm text-slate-300">
          <p className="text-slate-100 font-medium">Importe tes relevés de compte BoursoBank</p>
          <p>
            Télécharge les relevés mensuels au format PDF depuis ton espace client, puis choisis-les ici, un ou
            plusieurs à la fois. Patrium en tire tes opérations, ton solde jour par jour et ton budget réel.
          </p>
          <ul className="text-xs text-slate-400 space-y-1 list-disc pl-4">
            <li>
              Le PDF est lu dans ce navigateur : il n'est envoyé à aucun serveur. Seules les opérations extraites
              rejoignent tes données Patrium, synchronisées sur ton compte comme le reste.
            </li>
            <li>Chaque relevé est vérifié : solde de départ + opérations doit redonner le solde d'arrivée.</li>
            <li>Réimporter un relevé déjà présent n'ajoute aucun doublon.</li>
          </ul>
        </div>
      </div>
      <BoutonImport onLu={onLu} principal libelle="Choisir mes relevés PDF" />
    </Card>
  );
}
