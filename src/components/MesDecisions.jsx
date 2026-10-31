import { useEffect, useMemo, useState } from "react";
import { Undo2, ShoppingCart } from "lucide-react";
import { Card, CardLabel, EmptyState, CARD_THEMES } from "./ui";
import { eur, nombre, pct, pctPlain } from "../lib/finance";
import { fetchHistory, fetchTauxChange } from "../lib/api";
import { ventesAvecRecul, qualiteAchats, periodeNecessaire, TIERS } from "../lib/decisions";
import { useMaintenant } from "../lib/useMaintenant";

/**
 * Mes ventes avec le recul, et la qualité de mes points d'entrée.
 *
 * Calculées sur le journal d'opérations entier, avec les cours hebdomadaires
 * de chaque titre traité. Une seule série de requêtes pour les deux cartes :
 * elles lisent les mêmes historiques.
 */

const PAR_REQUETE = 40;
const dateFr = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });

export default function MesDecisions({ bourse }) {
  const operations = useMemo(() => bourse?.operations || [], [bourse]);
  const [historiques, setHistoriques] = useState(null);
  const [versEuro, setVersEuro] = useState({});
  const [erreur, setErreur] = useState("");

  const maintenant = useMaintenant();
  // Les titres traités, en une chaîne : l'effet de chargement en dépend par
  // VALEUR. Un journal recréé à l'identique (synchronisation, nouvel objet
  // `bourse`) ne doit pas retélécharger les mêmes séries.
  const listeTickers = useMemo(
    () =>
      [...new Set(operations.filter((o) => o?.type === "ACHAT" || o?.type === "VENTE").map((o) => String(o.asset || "").trim().toUpperCase()).filter(Boolean))]
        .sort()
        .join(","),
    [operations]
  );
  const periode = periodeNecessaire(operations, new Date(maintenant).toISOString().slice(0, 10));

  useEffect(() => {
    const tickers = listeTickers ? listeTickers.split(",") : [];
    if (tickers.length === 0 || !periode) return undefined;
    let annule = false;
    const tranches = [];
    for (let i = 0; i < tickers.length; i += PAR_REQUETE) tranches.push(tickers.slice(i, i + PAR_REQUETE));
    Promise.all(tranches.map((t) => fetchHistory(t, periode, "1wk", { dividendes: true })))
      .then(async (reponses) => {
        const carte = new Map();
        for (const r of reponses.flat()) if (r?.ok) carte.set(r.symbol.toUpperCase(), r);
        const devises = [...new Set([...carte.values()].map((r) => (r.currency === "GBp" ? "GBP" : r.currency)).filter((d) => d && d !== "EUR"))];
        const taux = devises.length ? await fetchTauxChange(devises).catch(() => []) : [];
        if (annule) return;
        setVersEuro(Object.fromEntries(taux.filter((t) => t.ok).map((t) => [t.devise, t.versEuro])));
        setHistoriques(carte);
        setErreur("");
      })
      .catch(() => {
        if (!annule) setErreur("Les cours historiques sont indisponibles pour le moment : réessaie plus tard.");
      });
    return () => {
      annule = true;
    };
  }, [listeTickers, periode]);

  const coursActuels = useMemo(
    () => new Map((bourse?.positions || []).filter((p) => Number(p.quantity) > 0 && p.current_price > 0).map((p) => [String(p.ticker).toUpperCase(), p.current_price])),
    [bourse]
  );
  const ventes = useMemo(
    () => (historiques ? ventesAvecRecul({ operations, historiques, coursActuels, versEuro }) : null),
    [operations, historiques, coursActuels, versEuro]
  );
  const achats = useMemo(() => (historiques ? qualiteAchats({ operations, historiques }) : null), [operations, historiques]);

  if (!listeTickers) return null;

  return (
    <>
      <CarteVentes ventes={ventes} erreur={erreur} />
      <CarteAchats achats={achats} erreur={erreur} />
    </>
  );
}

function Chargement({ erreur }) {
  return erreur ? <p className="text-micro text-amber-300/90 mt-1">{erreur}</p> : <p className="text-micro text-slate-500 mt-1">Chargement des cours…</p>;
}

const RAISONS = {
  "sans-cours": "cours actuel inconnu",
  incoherent: "prix hors de la fourchette de sa semaine : saisie erronée ou division d'actions non enregistrée ?",
};

/** Les achats laissés de côté, et pourquoi — jamais en silence. */
function AchatsEcartes({ achats }) {
  const raisons = [
    achats.nbHistoriqueCourt > 0 &&
      `${achats.nbHistoriqueCourt} sans six mois de cotation avant ${achats.nbHistoriqueCourt > 1 ? "eux" : "lui"}`,
    achats.nbIncoherents > 0 &&
      `${achats.nbIncoherents} à un prix hors de la fourchette des cours de ${achats.nbIncoherents > 1 ? "leur" : "sa"} semaine (saisie erronée ou division d'actions non enregistrée ?)`,
  ].filter(Boolean);
  if (raisons.length === 0) return null;
  const n = achats.nbHistoriqueCourt + achats.nbIncoherents;
  return (
    <p className="text-micro text-amber-300/90 mt-2">
      {n} achat{n > 1 ? "s" : ""} laissé{n > 1 ? "s" : ""} de côté : {raisons.join(" ; ")}.
    </p>
  );
}

function CarteVentes({ ventes, erreur }) {
  return (
    <Card accent={CARD_THEMES.violet}>
      <CardLabel icon={Undo2}>Mes ventes, avec le recul</CardLabel>
      {!ventes ? (
        <Chargement erreur={erreur} />
      ) : ventes.ventes.length === 0 ? (
        <EmptyState picto="operations">Aucune vente dans le journal : rien à relire pour l&apos;instant.</EmptyState>
      ) : (
        <>
          {ventes.nbComptees > 0 && (
            <>
              <p className="text-sm text-slate-300 mt-1">
                {ventes.bilan >= 0 ? "Garder aurait rapporté " : "Vendre t'a évité "}
                <span className={`font-data font-semibold ghost-blur ${ventes.bilan >= 0 ? "text-rose-400" : "text-emerald-400"}`}>
                  {eur(Math.abs(ventes.bilan), 0)}
                </span>
                {ventes.bilan >= 0 ? " de plus que tes ventes, dividendes compris." : " par rapport au fait de garder, dividendes compris."}
              </p>
              <p className="text-micro text-slate-500 mt-0.5">
                Sur {ventes.nbComptees} vente{ventes.nbComptees > 1 ? "s" : ""} : <span className="ghost-blur">{eur(ventes.manque, 0)}</span> manqués
                sur les titres repartis à la hausse, <span className="ghost-blur">{eur(ventes.evite, 0)}</span> évités sur ceux qui ont baissé.
              </p>
            </>
          )}

          <ul className="mt-3 divide-y divide-slate-800/60">
            {ventes.ventes.slice(0, 12).map((v) => (
              <li key={v.id || `${v.ticker}-${v.date}`} className="flex items-center gap-3 py-2 text-xs">
                <span className="w-24 shrink-0 text-slate-500">{dateFr(v.date)}</span>
                <span className="min-w-0 flex-1">
                  <span className="font-data text-slate-200">{v.ticker}</span>
                  <span className="text-slate-500"> · {nombre(v.quantite, v.quantite % 1 ? 2 : 0)} vendus à {nombre(v.prixVente, 2)}</span>
                  {v.statut === "ok" && (
                    <span className="text-slate-500">
                      {" "}→ {nombre(v.cours, 2)} aujourd&apos;hui ({pct(v.variationPct, 0)})
                    </span>
                  )}
                </span>
                {v.statut === "ok" ? (
                  <span
                    className={`font-data tabular-nums shrink-0 ghost-blur ${v.ecart >= 0 ? "text-rose-400" : "text-emerald-400"}`}
                    title={v.dividendesManques > 0 ? `dont ${nombre(v.dividendesManques, 2)} ${v.devise} de dividendes détachés depuis` : undefined}
                  >
                    {v.ecartEuro != null ? `${v.ecart >= 0 ? "+" : "−"}${eur(Math.abs(v.ecartEuro), 0)}` : `${nombre(v.ecart, 0)} ${v.devise}`}
                  </span>
                ) : (
                  <span className="text-micro text-slate-500 shrink-0 max-w-[12rem] text-right">{RAISONS[v.statut]}</span>
                )}
              </li>
            ))}
          </ul>

          <p className="text-micro text-slate-500 mt-2">
            En <span className="text-rose-400">rouge</span>, ce que garder aurait rapporté de plus ; en{" "}
            <span className="text-emerald-400">vert</span>, la baisse évitée. Écart = (cours d&apos;aujourd&apos;hui − prix de
            vente) × quantité, plus les dividendes détachés depuis. Hors frais et fiscalité ; divisions d&apos;actions du journal
            prises en compte.
          </p>
        </>
      )}
    </Card>
  );
}

const COULEURS_TIERS = { bas: "bg-emerald-400", milieu: "bg-amber-300", haut: "bg-rose-400" };

function CarteAchats({ achats, erreur }) {
  if (achats && achats.achats.length === 0) return null;
  const total = achats ? achats.repartition.bas + achats.repartition.milieu + achats.repartition.haut : 0;

  return (
    <Card accent={CARD_THEMES.violet}>
      <CardLabel icon={ShoppingCart}>Qualité de mes achats</CardLabel>
      {!achats ? (
        <Chargement erreur={erreur} />
      ) : achats.nbLus === 0 ? (
        <>
          <p className="text-micro text-slate-500 mt-1">Aucun achat n&apos;a pu être situé dans sa fourchette annuelle.</p>
          <AchatsEcartes achats={achats} />
        </>
      ) : (
        <>
          <p className="text-sm text-slate-300 mt-1">
            En moyenne, tu as acheté à{" "}
            <span className="font-data font-semibold text-slate-50">{pctPlain(achats.positionMoyennePct, 0)}</span> de la fourchette
            des 52 semaines précédentes
            {achats.ecartMoisMoyenPct != null && (
              <>
                {" "}— soit{" "}
                <span className={`font-data ${achats.ecartMoisMoyenPct <= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  {pct(achats.ecartMoisMoyenPct, 1)}
                </span>{" "}
                par rapport au cours moyen du mois d&apos;achat
              </>
            )}
            .
          </p>

          <div className="mt-3">
            <div className="flex h-2.5 rounded-full overflow-hidden" role="img" aria-label={`${achats.repartition.bas} achats dans le tiers bas, ${achats.repartition.milieu} au milieu, ${achats.repartition.haut} dans le tiers haut`}>
              {["bas", "milieu", "haut"].map((t) =>
                achats.repartition[t] > 0 ? <div key={t} className={COULEURS_TIERS[t]} style={{ width: `${(achats.repartition[t] / total) * 100}%` }} /> : null
              )}
            </div>
            <div className="flex justify-between text-micro text-slate-500 mt-1">
              <span>{achats.repartition.bas} dans le tiers bas</span>
              <span>{achats.repartition.milieu} au milieu</span>
              <span>{achats.repartition.haut} dans le tiers haut</span>
            </div>
          </div>

          {achats.parLigne.length > 1 && (
            <div className="mt-4 flex flex-col gap-1.5">
              {achats.parLigne.slice(0, 10).map((l) => (
                <div key={l.ticker} className="flex items-center gap-3 text-xs">
                  <span className="w-24 shrink-0 font-data text-slate-200 truncate">{l.ticker}</span>
                  <span className="relative h-1.5 flex-1 rounded-full bg-gradient-to-r from-emerald-400/40 via-amber-300/40 to-rose-400/40">
                    <span className="absolute -top-[3px] w-2.5 h-2.5 rounded-full bg-slate-50 border border-slate-950" style={{ left: `calc(${l.positionMoyennePct}% - 5px)` }} />
                  </span>
                  <span className="w-28 shrink-0 text-right text-micro text-slate-500">
                    {pctPlain(l.positionMoyennePct, 0)} · {l.achats} achat{l.achats > 1 ? "s" : ""}
                  </span>
                </div>
              ))}
            </div>
          )}

          <p className="text-micro text-slate-500 mt-3">
            0 % = acheté au plus bas des 52 semaines qui ont précédé l&apos;achat, 100 % = au plus haut ; tiers bas sous{" "}
            {nombre(TIERS.bas, 0)} %, tiers haut au-delà de {nombre(TIERS.haut, 0)} %. Moyennes pondérées par le montant investi.
            Cours moyen du mois = moyenne des clôtures hebdomadaires.
          </p>
          <AchatsEcartes achats={achats} />
        </>
      )}
    </Card>
  );
}
