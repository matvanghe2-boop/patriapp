import { useState, useMemo } from "react";
import { Coins, TrendingUp, TrendingDown, Info } from "lucide-react";
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell,
} from "recharts";
import { Card, CardLabel, EmptyState, CARD_THEMES } from "./ui";
import { eur, pctPlain, compact, triPosition } from "../lib/finance";
import {
  totalAttendu, comparerAttenduPercu, rendementSurPrixDeRevient,
  percusParActif, serieAvecProjection, totalRetenueSource,
} from "../../shared/dividendes";

/**
 * Dividendes encaissés, dividendes attendus, et TRI par ligne.
 *
 * Deux chiffres coexistaient sans jamais se rencontrer : le rendement
 * théorique, calculé depuis le dividende annoncé par action, et les
 * encaissements réels enregistrés dans le journal d'opérations. Les confronter
 * révèle les coupures de dividende et les saisies oubliées — et la série
 * année par année montre si le dividende croît, ce qu'un rendement instantané
 * ne dit jamais.
 *
 * Le TRI par ligne complète le tableau : le PRU dit ce qu'on a payé, le TRI
 * dit ce que l'argent a rapporté compte tenu de QUAND il a été investi.
 */
export default function SuiviDividendes({ bourse }) {
  const positions = useMemo(() => bourse?.positions || [], [bourse]);
  const operations = useMemo(() => bourse?.operations || [], [bourse]);

  const [horizon, setHorizon] = useState(10);
  // Taux imposé par l'utilisateur, quand il veut tester une autre hypothèse
  // que celle mesurée sur son propre historique.
  const [tauxManuel, setTauxManuel] = useState("");

  const attendu = useMemo(() => totalAttendu(positions), [positions]);
  const projection = useMemo(
    () =>
      serieAvecProjection(operations, positions, {
        anneesProjection: horizon,
        tauxForce: tauxManuel === "" ? null : parseFloat(tauxManuel),
      }),
    [operations, positions, horizon, tauxManuel]
  );
  const serie = projection.serie;
  const bilan = useMemo(() => comparerAttenduPercu(operations, positions), [operations, positions]);
  const yoc = useMemo(() => rendementSurPrixDeRevient(positions), [positions]);

  // Retenue à la source étrangère, définitivement perdue dans un PEA. Elle est
  // invisible sur les rendements affichés — un titre allemand à 4 % n'en
  // rapporte que 3,4 % — et elle change donc le classement des lignes.
  const retenue = useMemo(
    () => totalRetenueSource(positions, bourse?.envelope),
    [positions, bourse?.envelope]
  );
  const parActif = useMemo(() => percusParActif(operations), [operations]);

  const tris = useMemo(
    () =>
      positions
        .map((p) => ({ position: p, ...triPosition(p, operations, { baseline: bourse?.ledgerBaseline }) }))
        .sort((a, b) => (b.tri ?? -Infinity) - (a.tri ?? -Infinity)),
    [positions, operations, bourse]
  );
  const trisCalculables = tris.filter((l) => l.tri != null);
  const trisIncomplets = tris.filter((l) => !l.complet);

  const aucunDividende = serie.length === 0 && attendu === 0;

  return (
    <div className="flex flex-col gap-4">
      <Card accent={CARD_THEMES.emerald}>
        <CardLabel icon={Coins}>Dividendes — attendus et réellement perçus</CardLabel>

        {aucunDividende ? (
          <EmptyState>
            Aucun dividende suivi. Renseigne le dividende annuel par action de tes lignes, ou saisis
            un encaissement dans le journal d'opérations.
          </EmptyState>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-1">
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                <div className="text-[11px] text-slate-500 uppercase tracking-wide">Attendu / an</div>
                <div className="font-data font-bold text-slate-100 ghost-blur">{eur(attendu)}</div>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                <div className="text-[11px] text-slate-500 uppercase tracking-wide">Perçu cette année</div>
                <div className="font-data font-bold text-emerald-400 ghost-blur">{eur(bilan.percu)}</div>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                <div className="text-[11px] text-slate-500 uppercase tracking-wide">Avancement</div>
                {/* Comparer la réalisation à l'avancement de l'année : à mi-année,
                    avoir encaissé la moitié de l'attendu est conforme. */}
                <div
                  className={`font-data font-bold ${
                    bilan.realisationPct == null
                      ? "text-slate-500"
                      : bilan.realisationPct + 10 < bilan.avancementAnneePct
                        ? "text-amber-300"
                        : "text-slate-100"
                  }`}
                  title={`${pctPlain(bilan.realisationPct ?? 0, 0)} de l'attendu encaissé, alors que l'année est faite à ${pctPlain(bilan.avancementAnneePct, 0)}`}
                >
                  {bilan.realisationPct == null ? "—" : pctPlain(bilan.realisationPct, 0)}
                </div>
                <div className="text-[10px] text-slate-600">année à {pctPlain(bilan.avancementAnneePct, 0)}</div>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                <div className="text-[11px] text-slate-500 uppercase tracking-wide">Sur prix de revient</div>
                <div className="font-data font-bold text-amber-300">{yoc == null ? "—" : pctPlain(yoc, 2)}</div>
                <div className="text-[10px] text-slate-600">ne bouge pas avec le cours</div>
              </div>
            </div>

            {retenue > 0 && (
              <p className="flex items-start gap-1.5 text-[11px] text-amber-300/90 mt-2">
                <Info size={11} className="shrink-0 mt-0.5" aria-hidden="true" />
                <span>
                  <span className="ghost-blur font-data">{eur(retenue, 2)}</span> par an partent en
                  retenue à la source étrangère, et ne reviendront pas : dans un {bourse?.envelope},
                  l&apos;absence d&apos;imposition française prive du crédit d&apos;impôt qui
                  l&apos;annulerait ailleurs. À rendement annoncé égal, une société française
                  rapporte donc davantage qu&apos;une société étrangère.
                </span>
              </p>
            )}

            {bilan.realisationPct != null && bilan.realisationPct + 15 < bilan.avancementAnneePct && (
              <p className="flex items-start gap-1.5 text-[11px] text-amber-300/90 mt-2">
                <Info size={11} className="shrink-0 mt-0.5" aria-hidden="true" />
                Tu as encaissé nettement moins que prévu au regard de l'avancement de l'année : soit un
                dividende a été réduit, soit un encaissement n'a pas été saisi dans le journal.
              </p>
            )}

            {/* Réglages de la projection */}
            <div className="flex flex-wrap items-end gap-4 mt-4 pt-3 border-t border-slate-800">
              <div>
                <span className="text-[11px] text-slate-500 block mb-1">Horizon de projection</span>
                <div className="flex gap-1">
                  {[5, 10].map((n) => (
                    <button
                      key={n}
                      onClick={() => setHorizon(n)}
                      aria-pressed={horizon === n}
                      className={`text-[11px] rounded-lg border px-2.5 py-1 ${
                        horizon === n
                          ? "text-emerald-300 border-emerald-500/50 bg-emerald-500/10"
                          : "text-slate-500 border-slate-700 hover:text-slate-300"
                      }`}
                    >
                      {n} ans
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label htmlFor="div-taux" className="text-[11px] text-slate-500 block mb-1">
                  Croissance annuelle (%)
                </label>
                <input
                  id="div-taux"
                  type="number"
                  step="0.5"
                  value={tauxManuel}
                  onChange={(e) => setTauxManuel(e.target.value)}
                  placeholder={projection.croissance.tauxPct != null ? projection.croissance.tauxPct.toFixed(1) : "—"}
                  className="w-24 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-sm font-data tabular-nums focus:outline-none focus:border-emerald-400/60"
                />
              </div>
              <p className="text-[11px] text-slate-500 pb-1 flex-1 min-w-[14rem]">
                {projection.croissance.tauxPct != null ? (
                  <>
                    Croissance mesurée sur tes dividendes :{" "}
                    <strong className="text-emerald-300">{pctPlain(projection.croissance.tauxPct, 1)}</strong> par an
                    ({projection.croissance.premiere} → {projection.croissance.derniere}).
                    {projection.tauxEstImpose && " Tu as imposé un autre taux ci-contre."}
                  </>
                ) : (
                  <>
                    Pas encore deux années pleines d'encaissements : la croissance ne peut pas être
                    mesurée. Saisis une hypothèse pour voir une projection.
                  </>
                )}
              </p>
            </div>

            {serie.length >= 2 && (
              <div className="h-64 mt-3">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={serie} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                    <XAxis dataKey="annee" stroke="#64748b" fontSize={11} axisLine={false} tickLine={false} />
                    <YAxis stroke="#64748b" fontSize={10} tickFormatter={compact} width={58} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8, fontSize: 12 }}
                      formatter={(v) => eur(v, 2)}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    {/* Trois natures, trois couleurs : encaissé, année en cours
                        incomplète, projection. Les mélanger dans une barre
                        uniforme ferait passer une hypothèse pour un fait. */}
                    <Bar dataKey="montant" name="Encaissé" radius={[3, 3, 0, 0]}>
                      {serie.map((x) => (
                        <Cell key={`p-${x.annee}`} fill={x.partielle ? "#475569" : "#34d399"} />
                      ))}
                    </Bar>
                    <Bar dataKey="projete" name="Projeté" radius={[3, 3, 0, 0]} fill="#8b5cf6" fillOpacity={0.55} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}

            {projection.dernierProjete != null && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                <div className="rounded-xl border border-violet-500/25 bg-violet-500/5 p-3">
                  <div className="text-[11px] text-violet-300/80 uppercase tracking-wide">
                    Dividende annuel en {Number(new Date().getFullYear()) + horizon}
                  </div>
                  <div className="font-data font-bold text-violet-300 ghost-blur">
                    {eur(projection.dernierProjete)}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                  <div className="text-[11px] text-slate-500 uppercase tracking-wide">
                    Cumul sur {horizon} ans
                  </div>
                  <div className="font-data font-bold text-slate-100 ghost-blur">{eur(projection.cumulProjete)}</div>
                </div>
              </div>
            )}

            {projection.dernierProjete != null && (
              <p className="text-[11px] text-slate-600 mt-2">
                Projection à croissance constante, à partir du dividende attendu sur douze mois. Elle
                suppose que tu conserves tes lignes et que les entreprises maintiennent ce rythme —
                ni l'un ni l'autre n'est garanti.
              </p>
            )}

            {serie.some((s) => s.croissancePct != null) && (
              <div className="flex flex-wrap gap-2 mt-2">
                {serie
                  .filter((s) => s.croissancePct != null)
                  .map((s) => (
                    <span
                      key={s.annee}
                      className={`inline-flex items-center gap-1 text-[11px] rounded-full border px-2 py-0.5 ${
                        s.croissancePct >= 0
                          ? "text-emerald-300 border-emerald-500/30 bg-emerald-500/10"
                          : "text-rose-300 border-rose-500/30 bg-rose-500/10"
                      }`}
                    >
                      {s.croissancePct >= 0 ? <TrendingUp size={10} aria-hidden="true" /> : <TrendingDown size={10} aria-hidden="true" />}
                      {s.annee} : {s.croissancePct >= 0 ? "+" : ""}{s.croissancePct.toFixed(1)} %
                    </span>
                  ))}
              </div>
            )}

            {serie.some((s) => s.partielle) && (
              <p className="text-[11px] text-slate-600 mt-2">
                L'année en cours apparaît en gris : elle est incomplète, et sa croissance n'est pas
                calculée tant qu'elle n'est pas terminée.
              </p>
            )}

            {parActif.length > 0 && (
              <div className="mt-4 pt-3 border-t border-slate-800">
                <div className="text-[11px] text-slate-500 uppercase tracking-wide mb-2">
                  Encaissé par actif, depuis l'origine
                </div>
                <div className="flex flex-wrap gap-2">
                  {parActif.map((a) => (
                    <span key={a.actif} className="text-[11px] font-data text-slate-300 border border-slate-800 bg-slate-950/60 rounded-lg px-2 py-1">
                      {a.actif} <span className="text-emerald-400 ghost-blur">{eur(a.montant)}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </Card>

      {/* ─── TRI par ligne ─────────────────────────────────────────────── */}
      <Card accent={CARD_THEMES.violet}>
        <CardLabel icon={TrendingUp}>Taux de rendement interne, par ligne</CardLabel>

        {trisCalculables.length === 0 ? (
          <EmptyState>
            {trisIncomplets.length > 0
              ? "Aucune ligne n'a un journal d'opérations complet : le TRI ne peut pas être calculé sans le coût d'achat initial."
              : "Le TRI se calcule à partir du journal d'opérations : il apparaîtra dès qu'une ligne aura un historique d'ordres et plus de trente jours d'ancienneté."}
          </EmptyState>
        ) : (
          <div className="flex flex-col gap-2 mt-1">
            {trisCalculables.map(({ position, tri }) => (
              <div
                key={position.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/50 px-3 py-2"
              >
                <div className="min-w-0">
                  <span className="font-data font-semibold text-slate-100">{position.ticker}</span>
                  <span className="text-[11px] text-slate-500 ml-2 truncate">{position.name}</span>
                </div>
                <span className={`font-data tabular-nums text-sm font-semibold ${tri >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  {tri >= 0 ? "+" : ""}{tri.toFixed(2)} % / an
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Un TRI calculé sur un journal partiel est faux, et spectaculairement
            faux : sans le coût d'achat initial, la série se résume à une petite
            sortie récente suivie de la valeur totale d'aujourd'hui. Mieux vaut
            dire pourquoi le chiffre manque que d'en afficher un flatteur. */}
        {trisIncomplets.length > 0 && (
          <div className="mt-3 pt-3 border-t border-slate-800">
            <p className="flex items-start gap-1.5 text-[11px] text-amber-300/90">
              <Info size={11} className="shrink-0 mt-0.5" aria-hidden="true" />
              <span>
                {trisIncomplets.length} ligne(s) sans TRI : le journal d'opérations ne couvre pas la
                totalité de la position, donc le coût d'achat initial manque. Saisis les ordres
                d'origine dans « Stratégie &amp; Logs → Opérations » pour obtenir un taux exact.
              </span>
            </p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {trisIncomplets.map(({ position, quantiteJournal, quantitePosition }) => (
                <span
                  key={position.id}
                  className="text-[10px] font-data text-slate-500 border border-slate-800 bg-slate-950/60 rounded-lg px-2 py-0.5"
                  title={`${quantiteJournal} titre(s) retracé(s) dans le journal sur ${quantitePosition} détenu(s)`}
                >
                  {position.ticker} {quantiteJournal}/{quantitePosition}
                </span>
              ))}
            </div>
          </div>
        )}

        {trisCalculables.length > 0 && (
          <p className="text-[11px] text-slate-600 mt-3">
            Le TRI tient compte des dates : deux lignes affichant « +30 % » n'ont rien à voir si
            l'une a mis six ans et l'autre six mois. Dividendes encaissés inclus.
          </p>
        )}
      </Card>
    </div>
  );
}
