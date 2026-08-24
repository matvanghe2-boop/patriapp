import { Check, Monitor, Moon, Sun, Rows3, Rows4, Vibrate, Sparkles } from "lucide-react";
import Modal from "./Modal";
import { useApparence, THEMES_AFFICHAGE, DENSITES } from "../lib/ApparenceContext";
import { haptiqueDisponible, vibrer } from "../lib/haptique";

/**
 * Réglages d'apparence.
 *
 * Cinq préférences, toutes persistées et donc synchronisées : thème, accent,
 * densité, retour tactile, animations.
 *
 * CHAQUE RÉGLAGE S'APPLIQUE IMMÉDIATEMENT, sans bouton « Enregistrer ». Ce
 * sont des choix visuels : leur effet EST leur aperçu, et demander une
 * validation obligerait à imaginer le résultat avant de le voir.
 */

const ICONES_THEME = { auto: Monitor, sombre: Moon, clair: Sun };
const ICONES_DENSITE = { confortable: Rows3, compacte: Rows4 };

export default function ReglagesApparence({ ouvert, onFermer }) {
  const {
    theme, setTheme,
    accent, setAccent, accentsDisponibles,
    densite, setDensite,
    haptique, setHaptique,
    animations, setAnimations,
  } = useApparence();

  return (
    <Modal
      open={ouvert}
      onClose={onFermer}
      label="Apparence"
      showClose
      panelClassName="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl"
    >
      <div className="p-5 flex flex-col gap-6">
        <div>
          <h2 className="font-display text-lg text-slate-50">Apparence</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Ces réglages suivent ton compte : ils se retrouvent sur tes autres appareils.
          </p>
        </div>

        {/* ── Thème ────────────────────────────────────────────────────── */}
        <Groupe titre="Thème">
          <div className="grid grid-cols-3 gap-2">
            {THEMES_AFFICHAGE.map((t) => {
              const Icone = ICONES_THEME[t.id];
              const actif = theme === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTheme(t.id)}
                  aria-pressed={actif}
                  className={`btn-flash flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-xs transition-colors ${
                    actif
                      ? "border-amber-400/60 bg-amber-400/10 text-amber-200"
                      : "border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-600"
                  }`}
                >
                  <Icone size={17} aria-hidden="true" />
                  {t.libelle}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-slate-500 mt-2">
            {THEMES_AFFICHAGE.find((t) => t.id === theme)?.detail}
          </p>
        </Groupe>

        {/* ── Accent ───────────────────────────────────────────────────── */}
        <Groupe titre="Couleur d'accent">
          <div className="flex flex-wrap gap-2">
            {accentsDisponibles.map((a) => {
              const actif = accent === a.id;
              return (
                <button
                  key={a.id}
                  onClick={() => setAccent(a.id)}
                  aria-pressed={actif}
                  aria-label={a.libelle}
                  title={a.libelle}
                  className={`pastille-accent ${actif ? "pastille-active" : ""}`}
                  style={{ "--pastille": `hsl(${a.teinte})` }}
                >
                  {actif && <Check size={13} strokeWidth={3} aria-hidden="true" />}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-slate-500 mt-2">
            Teinte des boutons, des anneaux et des repères. Chaque onglet garde par ailleurs sa
            propre couleur de domaine.
          </p>
        </Groupe>

        {/* ── Densité ──────────────────────────────────────────────────── */}
        <Groupe titre="Densité des tableaux">
          <div className="grid grid-cols-2 gap-2">
            {DENSITES.map((d) => {
              const Icone = ICONES_DENSITE[d.id];
              const actif = densite === d.id;
              return (
                <button
                  key={d.id}
                  onClick={() => setDensite(d.id)}
                  aria-pressed={actif}
                  className={`btn-flash flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs text-left transition-colors ${
                    actif
                      ? "border-amber-400/60 bg-amber-400/10 text-amber-200"
                      : "border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-600"
                  }`}
                >
                  <Icone size={16} aria-hidden="true" className="shrink-0" />
                  <span>
                    <span className="block font-medium">{d.libelle}</span>
                    <span className="block text-[10px] opacity-70">{d.detail}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </Groupe>

        {/* ── Retours ──────────────────────────────────────────────────── */}
        <Groupe titre="Retours">
          <Bascule
            icone={Sparkles}
            titre="Animations"
            detail={
              animations === null
                ? "Suit le réglage d'accessibilité du système"
                : animations
                  ? "Activées, même si le système les réduit"
                  : "Réduites dans Patrium"
            }
            valeur={animations}
            surTrois
            onChange={setAnimations}
          />
          {/* Le retour tactile n'est proposé que là où il existe : afficher un
              interrupteur sans effet sur un ordinateur de bureau n'informe de
              rien, et donne l'impression que quelque chose est cassé. */}
          {haptiqueDisponible() && (
            <Bascule
              icone={Vibrate}
              titre="Retour tactile"
              detail="Une brève vibration à la navigation et à la validation"
              valeur={haptique}
              onChange={(v) => {
                setHaptique(v);
                if (v) vibrer("validation", true);
              }}
            />
          )}
        </Groupe>
      </div>
    </Modal>
  );
}

function Groupe({ titre, children }) {
  return (
    <section>
      <h3 className="text-xs uppercase tracking-wider text-slate-500 mb-2.5">{titre}</h3>
      {children}
    </section>
  );
}

/**
 * Interrupteur à deux ou trois états.
 *
 * `surTrois` ajoute la position « Automatique » — indispensable pour les
 * animations : quelqu'un qui a demandé la réduction du mouvement au niveau du
 * système ne devrait pas avoir à le redire ici, et c'est ce que `null`
 * exprime.
 */
function Bascule({ icone: Icone, titre, detail, valeur, onChange, surTrois = false }) {
  const etats = surTrois
    ? [{ v: null, l: "Auto" }, { v: true, l: "Oui" }, { v: false, l: "Non" }]
    : [{ v: true, l: "Oui" }, { v: false, l: "Non" }];

  return (
    <div className="flex items-center gap-3 py-2">
      <Icone size={15} className="text-slate-500 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm text-slate-200">{titre}</p>
        <p className="text-[11px] text-slate-500 leading-snug">{detail}</p>
      </div>
      <div role="group" aria-label={titre} className="flex rounded-lg border border-slate-700 overflow-hidden shrink-0">
        {etats.map((e) => (
          <button
            key={String(e.v)}
            onClick={() => onChange(e.v)}
            aria-pressed={valeur === e.v}
            className={`px-2.5 py-1 text-[11px] transition-colors ${
              valeur === e.v ? "bg-amber-400/15 text-amber-200" : "text-slate-500 hover:text-slate-300"
            }`}
          >
            {e.l}
          </button>
        ))}
      </div>
    </div>
  );
}
