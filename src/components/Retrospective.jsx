import { useMemo, useState } from "react";
import { Sparkles, TrendingUp, TrendingDown, Coins, Repeat, Target, CalendarRange } from "lucide-react";
import Modal from "./Modal";
import Montant from "./Montant";
import EtatVide from "./EtatVide";
import { CalendrierAnnuel, CalendrierCompare, CourbeEvolution } from "./graphiques";
import { eur, pct } from "../lib/finance";
import { construireRetrospective, anneesDisponibles, nomMois, joursDeLAnnee, semainesAgitees } from "../lib/retrospective";

/**
 * Rétrospective annuelle.
 *
 * C'est le seul endroit où Patrium peut se permettre d'être spectaculaire :
 * une fois par an, sur des chiffres réels, et sans que rien ne sorte du
 * navigateur. Tout est calculé à partir de données que l'application détient
 * déjà — relevés quotidiens, journal d'opérations, historique du profil.
 *
 * DEUX RETENUES, qui la distinguent d'un « année en résumé » de service en
 * ligne :
 *
 *  · **Rien n'est fabriqué.** Sous trente jours relevés, l'écran le dit et
 *    s'arrête là plutôt que d'extrapoler une année à partir de quelques points.
 *  · **Le mode Ghost s'y applique intégralement.** C'est précisément l'écran
 *    qu'on montre à quelqu'un ; il doit rester montrable.
 */
export default function Retrospective({
  ouvert,
  onFermer,
  historyPast = [],
  operations = [],
  positions = [],
  profileHistory = [],
  bourseHistory = [],
}) {
  const annees = useMemo(() => anneesDisponibles(historyPast), [historyPast]);
  const [an, setAn] = useState(() => annees[0] ?? new Date().getFullYear());

  const bilan = useMemo(
    () => construireRetrospective({ an, historyPast, operations, positions, profileHistory }),
    [an, historyPast, operations, positions, profileHistory]
  );

  const agitees = useMemo(() => semainesAgitees(bourseHistory), [bourseHistory]);

  // L'année précédente n'est proposée que si elle a de quoi être comparée :
  // une poignée de relevés produirait une bande presque vide, qui suggérerait
  // à tort une année sans mouvement.
  const anneePrecedente = useMemo(() => {
    const jours = joursDeLAnnee(historyPast, an - 1);
    return jours.filter((j) => j.variation != null).length >= 30 ? jours : null;
  }, [historyPast, an]);

  const serie = useMemo(
    () =>
      historyPast
        .filter((p) => String(p.date || "").startsWith(String(an)))
        .sort((a, b) => (a.date < b.date ? -1 : 1))
        .map((p) => Number(p.value) || 0),
    [historyPast, an]
  );

  const positif = (bilan.variation ?? 0) >= 0;

  return (
    <Modal
      open={ouvert}
      onClose={onFermer}
      label={`Rétrospective ${an}`}
      showClose
      panelClassName="teinte-accent w-full max-w-2xl rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl overflow-hidden"
    >
      <div className="retro">
        <header className="retro-tete">
          <span className="retro-eyebrow">
            <Sparkles size={13} aria-hidden="true" /> Rétrospective
          </span>
          <div className="flex items-center gap-2">
            <h2 className="retro-annee font-display">{an}</h2>
            {annees.length > 1 && (
              <select
                value={an}
                onChange={(e) => setAn(Number(e.target.value))}
                aria-label="Choisir l'année"
                className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-300"
              >
                {annees.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            )}
          </div>
        </header>

        {!bilan.exploitable ? (
          <EtatVide picto="calendrier" titre="Pas encore assez de relevés">
            Patrium a relevé ton patrimoine {bilan.joursReleves} jour{bilan.joursReleves > 1 ? "s" : ""} en {an}.
            Il en faut une trentaine pour qu'une rétrospective dise quelque chose de vrai — un bilan
            calculé sur quelques points épars ressemblerait à un bilan sans en être un.
          </EtatVide>
        ) : (
          <>
            {/* ── Le chiffre qui compte ─────────────────────────────────── */}
            <section className="retro-vedette">
              <p className="retro-label">Patrimoine net au 31 décembre</p>
              <Montant valeur={bilan.fin ?? 0} decimales={0} anime className="retro-montant" />
              <p className={`retro-delta ${positif ? "text-emerald-400" : "text-rose-400"}`}>
                {positif ? <TrendingUp size={15} aria-hidden="true" /> : <TrendingDown size={15} aria-hidden="true" />}
                <Montant valeur={bilan.variation ?? 0} decimales={0} className="text-inherit" />
                <span className="opacity-70">sur l'année</span>
                {bilan.variationPct != null && (
                  <span className="font-data">({pct(bilan.variationPct)})</span>
                )}
              </p>
            </section>

            {/* ── La courbe de l'année ──────────────────────────────────── */}
            {serie.length >= 2 && (
              <section className="retro-bloc">
                <p className="retro-label">L'année en une ligne</p>
                <CourbeEvolution
                  valeurs={serie}
                  largeur={520}
                  hauteur={110}
                  libelle={`Évolution du patrimoine en ${an}`}
                  className="w-full h-auto text-emerald-400 ghost-blur"
                />
              </section>
            )}

            {/* ── Le calendrier ─────────────────────────────────────────── */}
            <section className="retro-bloc">
              <p className="retro-label">Jour par jour</p>
              {/* Comparaison avec l'année précédente quand elle existe : un
                  patrimoine se lit mal sur douze mois isolés — les creux de
                  janvier et les versements de fin d'année reviennent tous les
                  ans, et on ne les reconnaît qu'en les voyant se répéter. */}
              {anneePrecedente ? (
                <CalendrierCompare
                  annees={[
                    { an, jours: bilan.jours },
                    { an: an - 1, jours: anneePrecedente },
                  ]}
                  semainesAgitees={agitees}
                  formatVariation={(n) => `${n > 0 ? "+" : ""}${eur(n, 0)}`}
                />
              ) : (
                <CalendrierAnnuel
                  jours={bilan.jours}
                  semainesAgitees={agitees}
                  formatVariation={(n) => `${n > 0 ? "+" : ""}${eur(n, 0)}`}
                />
              )}
              <p className="retro-note">
                {bilan.joursReleves} jours relevés sur {bilan.jours.length}. Les cases sombres sont
                les jours où l'application n'a pas été ouverte — une courbe les aurait reliés en
                silence. Une variation portée par un week-end vient des séances précédentes : les
                marchés étaient fermés.
              </p>
            </section>

            {/* ── Les faits marquants ───────────────────────────────────── */}
            <section className="retro-grille">
              {bilan.meilleurMois && (
                <Fait icone={TrendingUp} label="Meilleur mois" ton="hausse">
                  <strong>{nomMois(bilan.meilleurMois.cle)}</strong>
                  <Montant valeur={bilan.meilleurMois.delta} decimales={0} />
                </Fait>
              )}
              {bilan.pireMois && (
                <Fait icone={TrendingDown} label="Mois le plus dur" ton="baisse">
                  <strong>{nomMois(bilan.pireMois.cle)}</strong>
                  <Montant valeur={bilan.pireMois.delta} decimales={0} />
                </Fait>
              )}
              {bilan.dividendes > 0 && (
                <Fait icone={Coins} label="Dividendes encaissés">
                  <Montant valeur={bilan.dividendes} decimales={0} />
                </Fait>
              )}
              {bilan.operations > 0 && (
                <Fait icone={Repeat} label="Opérations passées">
                  <strong className="font-data">{bilan.operations}</strong>
                  <span className="text-slate-500 text-xs">
                    {bilan.achats} achat{bilan.achats > 1 ? "s" : ""} · {bilan.ventes} vente{bilan.ventes > 1 ? "s" : ""}
                  </span>
                </Fait>
              )}
              {bilan.meilleureLigne && (
                <Fait icone={Target} label="Ligne la plus performante">
                  <strong>{bilan.meilleureLigne.nom}</strong>
                  <span className="font-data text-emerald-400">{pct(bilan.meilleureLigne.pct)}</span>
                </Fait>
              )}
              {bilan.tauxEpargneMoyen != null && (
                <Fait icone={CalendarRange} label="Taux d'épargne moyen">
                  <strong className="font-data">{bilan.tauxEpargneMoyen.toFixed(0)} %</strong>
                </Fait>
              )}
            </section>

            <p className="retro-pied">
              Calculé sur cet appareil, à partir de tes seules données. Rien n'a été envoyé nulle part.
            </p>
          </>
        )}
      </div>
    </Modal>
  );
}

function Fait({ icone: Icone, label, ton, children }) {
  return (
    <div className={`retro-fait ${ton ? `retro-fait-${ton}` : ""}`}>
      <span className="retro-fait-icone" aria-hidden="true">
        <Icone size={14} />
      </span>
      <span className="retro-fait-label">{label}</span>
      <span className="retro-fait-valeur ghost-blur">{children}</span>
    </div>
  );
}
