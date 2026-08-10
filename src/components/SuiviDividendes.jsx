import { useMemo } from "react";
import { Coins, TrendingUp, TrendingDown, Info } from "lucide-react";
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell,
} from "recharts";
import { Card, CardLabel, EmptyState, CARD_THEMES } from "./ui";
import { eur, pctPlain, triPosition } from "../lib/finance";
import {
  serieAnnuelle, totalAttendu, comparerAttenduPercu,
  rendementSurPrixDeRevient, percusParActif,
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

  const attendu = useMemo(() => totalAttendu(positions), [positions]);
  const serie = useMemo(() => serieAnnuelle(operations, { attenduAnnuel: attendu }), [operations, attendu]);
  const bilan = useMemo(() => comparerAttenduPercu(operations, positions), [operations, positions]);
  const yoc = useMemo(() => rendementSurPrixDeRevient(positions), [positions]);
  const parActif = useMemo(() => percusParActif(operations), [operations]);

  const tris = useMemo(
    () =>
      positions
        .map((p) => ({ position: p, tri: triPosition(p, operations) }))
        .filter((l) => l.tri != null)
        .sort((a, b) => b.tri - a.tri),
    [positions, operations]
  );

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

            {bilan.realisationPct != null && bilan.realisationPct + 15 < bilan.avancementAnneePct && (
              <p className="flex items-start gap-1.5 text-[11px] text-amber-300/90 mt-2">
                <Info size={11} className="shrink-0 mt-0.5" aria-hidden="true" />
                Tu as encaissé nettement moins que prévu au regard de l'avancement de l'année : soit un
                dividende a été réduit, soit un encaissement n'a pas été saisi dans le journal.
              </p>
            )}

            {serie.length >= 2 && (
              <div className="h-56 mt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={serie} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                    <XAxis dataKey="annee" stroke="#64748b" fontSize={11} axisLine={false} tickLine={false} />
                    <YAxis stroke="#64748b" fontSize={10} tickFormatter={(v) => eur(v, 0)} width={58} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8, fontSize: 12 }}
                      formatter={(v, nom) => (nom === "Croissance" ? `${v?.toFixed(1)} %` : eur(v, 2))}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="montant" name="Perçu" radius={[3, 3, 0, 0]}>
                      {/* L'année en cours est incomplète par nature : la peindre
                          comme les autres ferait croire à un effondrement. */}
                      {serie.map((s) => (
                        <Cell key={s.annee} fill={s.partielle ? "#334155" : "#34d399"} />
                      ))}
                    </Bar>
                    <Line
                      type="monotone"
                      dataKey="attendu"
                      name="Attendu"
                      stroke="#fbbf24"
                      strokeWidth={2}
                      strokeDasharray="4 4"
                      dot={{ r: 3 }}
                      connectNulls
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
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
        {tris.length === 0 ? (
          <EmptyState>
            Le TRI se calcule à partir du journal d'opérations : il apparaîtra dès qu'une ligne aura
            au moins un ordre daté et plus de trente jours d'ancienneté.
          </EmptyState>
        ) : (
          <>
            <div className="flex flex-col gap-2 mt-1">
              {tris.map(({ position, tri }) => (
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
            <p className="text-[11px] text-slate-600 mt-3">
              Le TRI tient compte des dates : deux lignes affichant « +30 % » n'ont rien à voir si
              l'une a mis six ans et l'autre six mois. Dividendes encaissés inclus.
            </p>
          </>
        )}
      </Card>
    </div>
  );
}
