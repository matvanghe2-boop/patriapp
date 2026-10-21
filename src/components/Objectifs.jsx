import { useEffect, useRef, useState } from "react";
import { Target, TrendingUp, TrendingDown, CheckCircle2, CalendarClock } from "lucide-react";
import { Card, CardLabel, GhostButton, IconTrash, AddPanel, CARD_THEMES } from "./ui";
import EtatVide from "./EtatVide";
import Montant from "./Montant";
import { AnneauProgression } from "./graphiques";
import TrajectoireObjectif from "./TrajectoireObjectif";
import { useApparence } from "../lib/ApparenceContext";
import { vibrer } from "../lib/haptique";
import { eur, uid, todayIso, pctPlain } from "../lib/finance";
import {
  creerObjectif, evaluerObjectif, formaterDuree, MODELES_OBJECTIFS, echeanceDansMois,
  serieTrajectoire,
} from "../lib/objectifs";
import { useToast } from "../lib/ToastContext";

function formatEcheance(iso) {
  if (!iso) return "—";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}

/** « mars 2029 » : la date d'atteinte, dans N mois. */
function dansMois(mois) {
  const d = new Date();
  d.setMonth(d.getMonth() + mois);
  return d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}

function LigneObjectif({ objectif, etat, onSupprimer, serie = [], epargneSimulee = null }) {
  const { atteint, enAvance, ecart, progressionPct, moisRestants, effortMensuelRequis, retardEstimeMois } = etat;
  const { haptique } = useApparence();

  /**
   * Célébration au franchissement, et une seule fois.
   *
   * Atteindre un objectif de patrimoine est l'un des rares moments réjouissants
   * de cette application, et il ne s'y passait rien : la barre touchait 100 %,
   * point. Pas de confettis pour autant — ce serait faux sur une application
   * qui tient à l'honnêteté de ses chiffres, et insupportable au troisième
   * rechargement de la page.
   *
   * Le témoin distingue « vient d'être atteint » de « était déjà atteint au
   * montage » : sans lui, l'animation se rejouerait à chaque visite de l'onglet.
   */
  const [celebre, setCelebre] = useState(false);
  const etaitAtteint = useRef(atteint);
  useEffect(() => {
    if (atteint && !etaitAtteint.current) {
      setCelebre(true);
      vibrer("validation", haptique);
      const t = setTimeout(() => setCelebre(false), 700);
      return () => clearTimeout(t);
    }
    etaitAtteint.current = atteint;
    return undefined;
  }, [atteint, haptique]);

  const ton = atteint || enAvance ? "text-emerald-400" : "text-amber-300";

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3.5">
      <div className="flex items-start gap-3.5">
        {/* L'anneau remplace la barre de 6 px : sur le seul écran qui mesure
            une distance à parcourir, il tient la comparaison entre plusieurs
            cibles dans un même coup d'œil et libère son centre pour le
            pourcentage. */}
        <AnneauProgression
          valeur={progressionPct}
          taille={56}
          epaisseur={5}
          atteint={atteint}
          libelle={objectif.libelle || "Objectif"}
          className={`shrink-0 ${atteint ? "text-emerald-400" : "text-amber-400"} ${celebre ? "anneau-celebre" : ""}`}
        />

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-slate-100 font-medium truncate">{objectif.libelle || "Objectif"}</div>
              <div className="text-micro text-slate-500 flex items-center gap-1.5 mt-0.5 flex-wrap">
                <CalendarClock size={11} aria-hidden="true" />
                <Montant valeur={objectif.cible} decimales={0} />
                <span>pour {formatEcheance(objectif.echeance)}</span>
                {moisRestants > 0 && <span className="text-slate-500">· dans {formaterDuree(moisRestants)}</span>}
              </div>
            </div>
            <IconTrash onClick={onSupprimer} label={`Supprimer l'objectif ${objectif.libelle}`} />
          </div>

          <div className="mt-2 text-micro">
            {atteint ? (
              <span className="flex items-center gap-1 text-emerald-400 font-medium">
                <CheckCircle2 size={11} aria-hidden="true" /> Objectif atteint
              </span>
            ) : (
              <span className={`flex items-center gap-1 ${ton}`}>
                {enAvance ? <TrendingUp size={11} aria-hidden="true" /> : <TrendingDown size={11} aria-hidden="true" />}
                <Montant valeur={Math.abs(ecart)} decimales={0} className="text-inherit" />
                {enAvance ? " d'avance" : " de retard"}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* La trajectoire remplace la seule barre de progression : elle montre
          l'écart à la ligne cible, c'est-à-dire ce qui décide réellement si
          l'objectif tiendra. L'anneau reste pour le coup d'œil chiffré. */}

      {!atteint && <TrajectoireObjectif serie={serie} cible={objectif.cible} />}


      {!atteint && (
        <div className="mt-2.5 pt-2.5 border-t border-slate-800/70 text-micro text-slate-500 space-y-1">
          {effortMensuelRequis != null && (
            <p>
              Pour tenir l'échéance :{" "}
              <span className="font-data tabular-nums text-slate-300 ghost-blur">
                {eur(effortMensuelRequis)}
              </span>{" "}
              par mois à partir de maintenant.
            </p>
          )}
          {/* Avec le curseur : la date d'arrivée suit le montant choisi. */}
          {epargneSimulee != null && etat.moisJusquAtteinte != null && (
            <p className={retardEstimeMois > 0 ? "text-amber-300/90" : "text-emerald-400/90"}>
              Avec <span className="font-data tabular-nums ghost-blur">{eur(epargneSimulee)}</span> par mois :
              atteint en {dansMois(etat.moisJusquAtteinte)}
              {retardEstimeMois != null &&
                retardEstimeMois !== 0 &&
                `, ${formaterDuree(Math.abs(retardEstimeMois))} ${retardEstimeMois > 0 ? "après" : "avant"} l'échéance`}
              .
            </p>
          )}
          {epargneSimulee == null && retardEstimeMois != null && retardEstimeMois > 0 && (
            <p className="text-amber-300/90">
              Au rythme d'épargne actuel, l'objectif serait atteint avec{" "}
              {formaterDuree(retardEstimeMois)} de retard.
            </p>
          )}
          {epargneSimulee == null && retardEstimeMois != null && retardEstimeMois <= 0 && (
            <p className="text-emerald-400/90">
              Au rythme actuel, l'objectif sera atteint en avance.
            </p>
          )}
          {etat.moisJusquAtteinte == null && (
            <p>Sans épargne mensuelle ni rendement, l'objectif ne progresse plus.</p>
          )}
          {etat.echu && <p className="text-rose-400/90">Échéance dépassée.</p>}
        </div>
      )}
    </div>
  );
}

/**
 * Objectifs de patrimoine datés.
 *
 * L'application projetait et mesurait, mais sans cible à laquelle se comparer :
 * la courbe de patrimoine ne répondait pas à « suis-je en avance ou en
 * retard ? ». Chaque objectif fige son point de départ à la création, ce qui
 * rend l'avance ou le retard mesurable plutôt que déclaratif.
 */
export default function Objectifs({ objectifs = [], setObjectifs, patrimoineNet, epargneMensuelle, tauxAnnuelPct, historique = [] }) {
  const [ouvert, setOuvert] = useState(false);
  const { showToast } = useToast();
  /*
   * Curseur « et si j'épargnais plus ? » : un montant mensuel hypothétique,
   * qui fait bouger en direct la date d'arrivée de chaque objectif. L'effort
   * requis est un chiffre qu'on lit ; voir sa date avancer quand on ajoute
   * 100 € par mois se comprend tout de suite. Rien n'est enregistré.
   */
  const [epargneSimulee, setEpargneSimulee] = useState(null);

  const ajouter = (v) => {
    if (!v.echeance) return;
    setObjectifs((liste) => [
      ...liste,
      creerObjectif({
        id: uid(),
        libelle: v.libelle,
        cible: v.cible,
        echeance: v.echeance,
        patrimoineActuel: patrimoineNet,
      }),
    ]);
  };

  /** Crée directement l'objectif à partir d'un modèle, sans passer par le formulaire. */
  const appliquerModele = (modele) => {
    setObjectifs((liste) => [
      ...liste,
      creerObjectif({
        id: uid(),
        libelle: modele.libelle,
        cible: modele.montant,
        echeance: echeanceDansMois(modele.moisParDefaut),
        patrimoineActuel: patrimoineNet,
      }),
    ]);
    showToast({ message: `Objectif « ${modele.libelle} » ajouté — montant et échéance ajustables.` });
  };

  const supprimer = (id) => {
    const precedent = objectifs;
    const cible = objectifs.find((o) => o.id === id);
    setObjectifs((liste) => liste.filter((o) => o.id !== id));
    showToast({
      message: `Objectif « ${cible?.libelle || "sans nom"} » supprimé.`,
      onUndo: () => setObjectifs(precedent),
    });
  };

  const tries = [...objectifs].sort((a, b) => ((a.echeance || "9999") < (b.echeance || "9999") ? -1 : 1));
  const epargneRetenue = epargneSimulee ?? epargneMensuelle;
  const etats = tries.map((o) =>
    evaluerObjectif(o, {
      patrimoineActuel: patrimoineNet,
      epargneMensuelle: epargneRetenue,
      tauxAnnuelPct,
      aujourdhui: todayIso(),
    })
  );
  const aSimuler = tries.length > 0 && etats.some((e) => !e.atteint);
  // Borne du curseur : assez haut pour couvrir l'effort le plus exigeant.
  const effortMax = Math.max(0, ...etats.map((e) => e.effortMensuelRequis || 0));
  const maxCurseur = Math.max(1000, Math.ceil((Math.max(epargneMensuelle * 3, effortMax * 1.5) || 0) / 100) * 100);

  return (
    <Card accent={CARD_THEMES.emerald}>
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <CardLabel icon={Target}>Objectifs de patrimoine</CardLabel>
        <GhostButton theme="emerald" onClick={() => setOuvert((o) => !o)}>
          Ajouter un objectif
        </GhostButton>
      </div>

      {/* Modèles : la page blanche est le vrai obstacle. Fixer une cible
          suppose de connaître le prix de ce qu'on vise, et c'est justement ce
          qu'on ignore la première fois. Un clic remplit les trois champs, tous
          restent modifiables ensuite. */}
      {objectifs.length === 0 && !ouvert && (
        <div className="mt-1 mb-3">
          <p className="text-micro text-slate-500 mb-2">
            Partir d&apos;un modèle — montants indicatifs, à ajuster ensuite :
          </p>
          <div className="flex flex-wrap gap-1.5">
            {MODELES_OBJECTIFS.map((m) => (
              <button
                key={m.id}
                onClick={() => appliquerModele(m)}
                title={`${m.detail} — environ ${eur(m.montant)}`}
                className="btn-flash text-micro rounded-lg border border-emerald-500/30 bg-emerald-500/5 text-emerald-300 hover:bg-emerald-500/15 hover:border-emerald-400/60 px-2.5 py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/40"
              >
                {m.libelle}
                <span className="text-emerald-500/70 ml-1.5 font-data tabular-nums">
                  ~{eur(m.montant)}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <AddPanel
        open={ouvert}
        onClose={() => setOuvert(false)}
        onSubmit={ajouter}
        fields={[
          { key: "libelle", label: "Libellé", type: "text", placeholder: "Apport résidence principale", required: true },
          { key: "cible", label: "Montant cible (€)", type: "number", step: "1000", required: true },
          { key: "echeance", label: "Échéance", type: "date", required: true, default: "" },
        ]}
      />

      {tries.length === 0 ? (
        <EtatVide picto="objectifs" titre="Aucun objectif fixé">
          Une cible datée transforme « j'épargne » en « je serai à 50 000 € en mars 2028 » — et dit,
          chaque mois, si la trajectoire est en avance ou en retard.
        </EtatVide>
      ) : (
        <div className="flex flex-col gap-3 mt-2">
          {aSimuler && (
            <div className="rounded-xl border border-slate-800 bg-slate-950/40 px-3.5 py-2.5">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <label htmlFor="curseur-epargne" className="text-micro text-slate-400">
                  Et si j&apos;épargnais{" "}
                  <span className="font-data tabular-nums text-slate-100 ghost-blur">{eur(epargneRetenue)}</span> par mois ?
                </label>
                {epargneSimulee != null && (
                  <button
                    onClick={() => setEpargneSimulee(null)}
                    className="text-micro text-emerald-300/80 hover:text-emerald-200"
                  >
                    Revenir à mon rythme ({eur(epargneMensuelle)})
                  </button>
                )}
              </div>
              <input
                id="curseur-epargne"
                type="range"
                min={0}
                max={maxCurseur}
                step={50}
                value={Math.min(maxCurseur, Math.max(0, Math.round(epargneRetenue / 50) * 50))}
                onChange={(e) => setEpargneSimulee(Number(e.target.value))}
                className="w-full mt-1.5 accent-emerald-400"
              />
              <p className="text-micro text-slate-500">
                Simulation seulement : rien n&apos;est enregistré. Rendement de {pctPlain(tauxAnnuelPct || 0, 1)} par an
                supposé constant.
              </p>
            </div>
          )}
          {tries.map((o, i) => (
            <LigneObjectif
              key={o.id}
              objectif={o}
              serie={serieTrajectoire(o, { historique, patrimoineActuel: patrimoineNet })}
              etat={etats[i]}
              epargneSimulee={epargneSimulee}
              onSupprimer={() => supprimer(o.id)}
            />
          ))}
        </div>
      )}
    </Card>
  );
}
