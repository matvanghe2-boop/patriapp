import { useMemo } from "react";
import { PiggyBank, Repeat, HandCoins, Vault, Plus, Check } from "lucide-react";
import { Card, CardLabel } from "./ui";
import Montant from "./Montant";
import { pctPlain, uid } from "../lib/finance";
import { COULEURS } from "../lib/styleGraphique";
import { RATES_CATALOG } from "../../shared/ratesCatalog";
import { categorie, normaliser } from "../lib/compteCourant";
import { argentQuiDort, recurrences, misDeCoteParMois, budgetMoyen } from "../lib/analyseCompte";

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

/** Catégorie de l'onglet Abonnements la plus proche d'une catégorie du relevé. */
const CATEGORIE_ABONNEMENT = {
  sport: "Sport / Bien-être",
  telecom: "Téléphonie",
  abonnements: "Logiciel / Cloud",
};

export function ChargesFixes({ charges, revenusMensuels, subs = [], setSubs }) {
  const total = charges.reduce((s, c) => s + c.montant, 0);
  const deja = new Set(subs.map((s) => normaliser(s.label)));
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
              const ajoute = deja.has(normaliser(c.titre));
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
                        setSubs((s) => [
                          ...(s || []),
                          {
                            id: uid(),
                            category: CATEGORIE_ABONNEMENT[c.categorie] || "Autre",
                            label: c.titre,
                            montant: euros(c.montant),
                            frequence: "mensuelle",
                            prochaine_date: c.prochaine,
                          },
                        ])
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

export default function EpargneCompte({ enrichies, serie, solde, livrets, subs, setSubs }) {
  const budget = useMemo(() => budgetMoyen(enrichies), [enrichies]);
  const rec = useMemo(() => recurrences(enrichies), [enrichies]);
  const misDeCote = useMemo(() => misDeCoteParMois(enrichies), [enrichies]);
  return (
    <div className="space-y-6">
      {solde && (
        <ArgentQuiDort serie={serie} solde={solde} depensesMensuelles={budget?.depenses} livrets={livrets} />
      )}
      <ChargesFixes charges={rec.charges} revenusMensuels={budget?.revenus ?? null} subs={subs} setSubs={setSubs} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
        <RevenusReguliers revenus={rec.revenus} />
        <MisDeCote lignes={misDeCote} />
      </div>
    </div>
  );
}
