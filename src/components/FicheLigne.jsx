import { useEffect, useMemo, useState } from "react";
import { ExternalLink, NotebookPen, CalendarDays, Coins, ListOrdered, Link2 } from "lucide-react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine } from "recharts";
import Modal from "./Modal";
import AssetLogo from "./AssetLogo";
import { eur, pct, pctPlain, nombre, valeurPosition, coutPosition, compact } from "../lib/finance";
import { fetchHistory } from "../lib/api";
import { secteurDe } from "../lib/sectors";
import { compositionDe } from "../lib/compositionEtf";
import { placeDuTicker } from "../../shared/eligibilitePea.js";
import { dividendeAttendu } from "../../shared/dividendes.js";
import { evenementsReference } from "../../shared/calendrierReference.js";
import { rendementsQuotidiens, correlation } from "../lib/correlations";
import { todayIso } from "../lib/finance";

/**
 * Tout sur une ligne, au même endroit.
 *
 * Ce qu'on sait d'une position était réparti entre quatre écrans : Marché
 * pour la courbe et les comptes, Opérations pour le journal, Stratégie pour
 * la thèse, Calendrier pour les rendez-vous. Pour répondre à « où en est ma
 * ligne Air Liquide ? », il fallait les ouvrir tous. La fiche les rassemble,
 * sans rien recalculer à part : ce sont les mêmes chiffres qu'ailleurs.
 */

const MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const dateCourte = (iso) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "2-digit" });
const LIBELLES_OP = { ACHAT: "Achat", VENTE: "Vente", DIVIDENDE: "Dividende", SPLIT: "Division" };

function Section({ icone: Icone, titre, children }) {
  return (
    <section className="border-t border-slate-800 pt-3 mt-3">
      <h3 className="flex items-center gap-1.5 text-micro uppercase tracking-wider text-slate-500 mb-1.5">
        {Icone && <Icone size={12} aria-hidden="true" />}
        {titre}
      </h3>
      {children}
    </section>
  );
}

function Chiffre({ libelle, valeur, classe = "text-slate-100", flou = false }) {
  return (
    <div>
      <div className="text-micro text-slate-500">{libelle}</div>
      <div className={`font-data tabular-nums text-sm ${classe} ${flou ? "ghost-blur" : ""}`}>{valeur}</div>
    </div>
  );
}

export default function FicheLigne({
  position,
  onClose,
  bourse,
  strategyNotes = [],
  secteursManuels = {},
  onOuvrirMarche,
}) {
  const ticker = String(position?.ticker || "").toUpperCase();
  const autres = useMemo(
    () =>
      [...new Set((bourse?.positions || []).map((p) => String(p.ticker || "").toUpperCase()))].filter(
        (t) => t && t !== ticker
      ),
    [bourse?.positions, ticker]
  );
  const [series, setSeries] = useState(null);
  const [erreur, setErreur] = useState("");

  // Un seul appel : un an de cours de la ligne ET des autres, pour la courbe
  // et pour situer la ligne face au reste du portefeuille.
  useEffect(() => {
    if (!ticker) return undefined;
    let annule = false;
    // Effet de CHARGEMENT : témoin levé avant la requête.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSeries(null);
    setErreur("");
    fetchHistory([ticker, ...autres], "1y", "1d")
      .then((r) => {
        if (annule) return;
        setSeries(Object.fromEntries((r || []).filter((x) => x?.ok).map((x) => [String(x.symbol).toUpperCase(), x.series])));
      })
      .catch(() => {
        if (!annule) setErreur("L'historique des cours est indisponible pour le moment.");
      });
    return () => {
      annule = true;
    };
    // `autres` est dérivé des positions ; sa liste suffit comme clé.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticker, autres.join(",")]);

  const courbe = useMemo(() => (series?.[ticker] || []).map((p) => ({ date: p.date, cours: p.close })), [series, ticker]);

  const voisins = useMemo(() => {
    if (!series?.[ticker]) return [];
    const a = rendementsQuotidiens(series[ticker]);
    return autres
      .map((t) => {
        const c = series[t] ? correlation(a, rendementsQuotidiens(series[t])) : null;
        return c ? { ticker: t, rho: c.rho } : null;
      })
      .filter(Boolean)
      .sort((x, y) => y.rho - x.rho);
  }, [series, ticker, autres]);

  if (!position) return null;

  const valeur = valeurPosition(position);
  const cout = coutPosition(position);
  const gain = valeur - cout;
  const total = (bourse?.positions || []).reduce((s, p) => s + valeurPosition(p), 0);
  const variationJour =
    position.previousClose > 0 && position.current_price > 0
      ? ((position.current_price - position.previousClose) / position.previousClose) * 100
      : null;

  const composition = compositionDe(ticker);
  const secteur = composition ? `Diversifié (${composition.indice})` : secteurDe({ ticker }, secteursManuels);
  const pays = composition ? null : position.pays || position.country || placeDuTicker(ticker)?.pays || null;

  const operations = (bourse?.operations || [])
    .filter((op) => String(op.asset || "").toUpperCase() === ticker)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  const dividendesRecus = operations.filter((op) => op.type === "DIVIDENDE");
  const totalRecu = dividendesRecus.reduce((s, op) => s + (Number(op.amount ?? op.montantNet) || 0), 0);

  const revenuAnnuel = dividendeAttendu(position, bourse?.envelope || "PEA");
  const moisDetachement = Object.keys(position.dividendeMois || {})
    .map(Number)
    .sort((a, b) => a - b)
    .map((m) => MOIS[m - 1]);

  const notes = (strategyNotes || []).filter((n) => !n.archivee && String(n.ticker || "").toUpperCase() === ticker);
  const rendezVous = evenementsReference([ticker])
    .filter((e) => e.date >= todayIso())
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .slice(0, 3);

  // Repères d'achats et de ventes sur la courbe, à la date la plus proche.
  const marques = operations
    .filter((op) => (op.type === "ACHAT" || op.type === "VENTE") && courbe.length && op.date >= courbe[0].date)
    .map((op) => ({ ...op, point: courbe.find((p) => p.date >= op.date) }))
    .filter((m) => m.point);

  return (
    <Modal
      open
      onClose={onClose}
      label={`Fiche de la ligne ${ticker}`}
      showClose
      panelClassName="ml-auto h-full max-h-full w-full max-w-xl rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl overflow-y-auto"
    >
      <div className="p-5">
        {/* ── En-tête ── */}
        <div className="flex items-center gap-3 pr-8">
          <AssetLogo ticker={ticker} size="sm" />
          <div className="min-w-0">
            <h2 className="font-display text-lg text-slate-50 truncate">{position.name || ticker}</h2>
            <div className="text-micro text-slate-500">
              <span className="font-data">{ticker}</span> · {position.type || "Titre"} · {secteur}
              {pays && <> · {pays}</>}
            </div>
          </div>
        </div>

        {/* ── Position ── */}
        <div className="grid grid-cols-3 gap-3 mt-4">
          <Chiffre
            libelle="Cours"
            valeur={
              <>
                {eur(position.current_price, 2)}
                {variationJour != null && (
                  <span className={`ml-1 text-micro ${variationJour >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                    {pct(variationJour, 1)}
                  </span>
                )}
              </>
            }
          />
          <Chiffre libelle="Quantité · PRU" valeur={`${nombre(position.quantity, position.quantity % 1 ? 2 : 0)} · ${eur(position.pru, 2)}`} flou />
          <Chiffre libelle="Valeur" valeur={eur(valeur)} flou />
          <Chiffre
            libelle="Plus-value latente"
            valeur={`${eur(gain)} (${pct(cout > 0 ? (gain / cout) * 100 : 0, 1)})`}
            classe={gain >= 0 ? "text-emerald-400" : "text-rose-400"}
            flou
          />
          <Chiffre libelle="Poids" valeur={total > 0 ? pctPlain((valeur / total) * 100, 1) : "—"} />
          <Chiffre
            libelle="Dividende / an"
            valeur={revenuAnnuel > 0 ? eur(revenuAnnuel) : position.dividendeSource ? "aucun" : "—"}
            flou
          />
        </div>

        {/* ── Courbe ── */}
        <Section titre="Un an de cours">
          {erreur ? (
            <p className="text-micro text-amber-300/90">{erreur}</p>
          ) : !series ? (
            <p className="text-micro text-slate-500">Chargement…</p>
          ) : courbe.length < 2 ? (
            <p className="text-micro text-slate-500">Historique indisponible pour ce titre.</p>
          ) : (
            <>
              <div style={{ height: 160 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={courbe} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
                    <XAxis dataKey="date" tickFormatter={dateCourte} tick={{ fill: "rgb(var(--c-slate-500))", fontSize: 10 }} axisLine={false} tickLine={false} minTickGap={40} />
                    <YAxis domain={["auto", "auto"]} tick={{ fill: "rgb(var(--c-slate-500))", fontSize: 10 }} axisLine={false} tickLine={false} width={40} tickFormatter={(v) => compact(v)} />
                    {position.pru > 0 && (
                      <ReferenceLine
                        y={position.pru}
                        stroke="#fbbf24"
                        strokeDasharray="4 4"
                        label={{ value: "ton PRU", fill: "#fbbf24", fontSize: 9, position: "insideTopLeft" }}
                      />
                    )}
                    {marques.map((m) => (
                      <ReferenceLine key={m.id || `${m.date}${m.type}`} x={m.point.date} stroke={m.type === "ACHAT" ? "#34d399" : "#fb7185"} strokeOpacity={0.5} />
                    ))}
                    <Line type="monotone" dataKey="cours" stroke="#a78bfa" strokeWidth={1.6} dot={false} isAnimationActive={false} />
                    <Tooltip
                      formatter={(v) => [eur(v, 2), "Cours"]}
                      labelFormatter={dateCourte}
                      contentStyle={{ background: "rgb(var(--c-slate-950))", border: "1px solid rgb(var(--c-slate-700))", borderRadius: 8, fontSize: 11 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              {marques.length > 0 && (
                <p className="text-micro text-slate-500 mt-1">Traits verticaux : tes achats (vert) et ventes (rouge).</p>
              )}
            </>
          )}
        </Section>

        {/* ── Dividendes ── */}
        <Section icone={Coins} titre="Dividendes">
          <p className="text-xs text-slate-300">
            {position.annual_dividend > 0 ? (
              <>
                {eur(position.annual_dividend, 2)} par action
                <span className="text-slate-500"> ({position.dividendeSource === "auto" ? "source de marché" : "saisi à la main"})</span>
                {moisDetachement.length > 0 && <> · détaché en {moisDetachement.join(", ")} l&apos;an dernier</>}.
              </>
            ) : (
              <>Aucun dividende attendu.</>
            )}
          </p>
          {dividendesRecus.length > 0 && (
            <p className="text-micro text-slate-500 mt-0.5">
              Reçus d&apos;après le journal : <span className="ghost-blur">{eur(totalRecu, 2)}</span> en {dividendesRecus.length}{" "}
              versement{dividendesRecus.length > 1 ? "s" : ""}, le dernier le {dateCourte(dividendesRecus[0].date)}.
            </p>
          )}
        </Section>

        {/* ── Thèse ── */}
        <Section icone={NotebookPen} titre="Ta thèse">
          {notes.length === 0 ? (
            <p className="text-micro text-slate-500">
              Aucune thèse notée pour cette ligne : l&apos;onglet Stratégie &amp; Logs permet d&apos;écrire pourquoi tu
              l&apos;as achetée — utile le jour où elle baisse.
            </p>
          ) : (
            notes.map((n) => (
              <div key={n.id} className="text-xs text-slate-300 mb-2">
                {n.titre && <div className="text-slate-100 font-medium">{n.titre}</div>}
                {n.these && <p className="text-slate-400 line-clamp-4 whitespace-pre-line">{n.these}</p>}
                <div className="text-micro text-slate-500 mt-0.5">
                  {n.objectif_cours && (
                    <>
                      Objectif de cours {eur(Number(n.objectif_cours), 2)}
                      {position.current_price > 0 && Number(n.objectif_cours) > 0 && (
                        <> ({pct(((Number(n.objectif_cours) - position.current_price) / position.current_price) * 100, 0)} du cours actuel)</>
                      )}
                      {" · "}
                    </>
                  )}
                  Thèse {n.statut || "intacte"}
                  {n.conditions_vente && <> · vendre si : {n.conditions_vente}</>}
                </div>
              </div>
            ))
          )}
        </Section>

        {/* ── Rendez-vous ── */}
        {rendezVous.length > 0 && (
          <Section icone={CalendarDays} titre="Prochains rendez-vous publiés">
            <ul className="text-xs text-slate-300 space-y-0.5">
              {rendezVous.map((e) => (
                <li key={`${e.date}${e.label}`}>
                  <span className="font-data text-slate-500 mr-2">{dateCourte(e.date)}</span>
                  {e.label}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* ── Voisins ── */}
        {voisins.length > 0 && (
          <Section icone={Link2} titre="Face au reste du portefeuille">
            <p className="text-xs text-slate-300">
              Bouge le plus avec <span className="font-data">{voisins[0].ticker}</span> ({nombre(voisins[0].rho, 2)})
              {voisins.length > 1 && (
                <>
                  , le moins avec <span className="font-data">{voisins.at(-1).ticker}</span> ({nombre(voisins.at(-1).rho, 2)})
                </>
              )}
              .
            </p>
            <p className="text-micro text-slate-500 mt-0.5">Corrélation des rendements quotidiens sur un an.</p>
          </Section>
        )}

        {/* ── Journal ── */}
        <Section icone={ListOrdered} titre="Opérations">
          {operations.length === 0 ? (
            <p className="text-micro text-slate-500">Aucune opération enregistrée pour cette ligne.</p>
          ) : (
            <ul className="divide-y divide-slate-800">
              {operations.slice(0, 6).map((op) => (
                <li key={op.id || `${op.date}${op.type}${op.quantity}`} className="flex items-center gap-3 py-1 text-xs">
                  <span className="w-20 font-data text-slate-500">{dateCourte(op.date)}</span>
                  <span className="flex-1 text-slate-300">{LIBELLES_OP[op.type] || op.type}</span>
                  <span className="font-data tabular-nums text-slate-400 ghost-blur">
                    {op.type === "DIVIDENDE"
                      ? eur(Number(op.amount ?? op.montantNet) || 0, 2)
                      : op.quantity
                        ? `${nombre(Number(op.quantity), Number(op.quantity) % 1 ? 2 : 0)} × ${eur(Number(op.price) || 0, 2)}`
                        : ""}
                  </span>
                </li>
              ))}
              {operations.length > 6 && (
                <li className="py-1 text-micro text-slate-500">… et {operations.length - 6} plus anciennes, dans Stratégie &amp; Logs.</li>
              )}
            </ul>
          )}
        </Section>

        <div className="border-t border-slate-800 pt-3 mt-3 flex justify-end">
          <button
            onClick={() => onOuvrirMarche?.(ticker)}
            className="flex items-center gap-1.5 text-xs text-violet-300 hover:text-violet-200"
          >
            Comptes, ratios et valorisation dans Marché <ExternalLink size={12} aria-hidden="true" />
          </button>
        </div>
      </div>
    </Modal>
  );
}
