import { useMemo, useState } from "react";
import { Medal, Lock } from "lucide-react";
import { Card, PageGlow, CARD_THEMES } from "./ui";
import Medaille from "./badges/Medaille";
import { usePersistentState } from "../lib/storage";
import { useContexteBadges } from "../lib/useBadges";
import {
  CATALOGUE, FAMILLES, RARETES, ETAT_BADGES_VIDE, NIVEAU_MAX, evaluerBadges, niveauAcquis, normaliserEtat,
  rareteDe, estANiveaux, libelleSeuil, libelleValeur, resumeVitrine,
} from "../lib/badges";

/**
 * Onglet Badges — la vitrine.
 *
 * Le niveau AFFICHÉ est celui qui a été acquis et enregistré (il ne redescend
 * jamais) ; la barre de progression, elle, lit les données du jour pour dire
 * ce qui manque avant le niveau suivant. Les badges secrets ne disent rien
 * d'eux-mêmes tant qu'ils ne sont pas découverts.
 */

/** Teinte de chaque matière pour les petits repères de niveau. */
const TEINTES = {
  commun: "linear-gradient(135deg, #f7d6b4, #a8652c)",
  "peu-commun": "linear-gradient(135deg, #ffffff, #8e99a8)",
  rare: "linear-gradient(135deg, #fff6c2, #c8930f)",
  epique: "linear-gradient(135deg, #f8fbff, #b9a7f5 55%, #7e8ba6)",
  legendaire: "linear-gradient(135deg, #f0fdff, #8fe6ff 45%, #2f6fd1)",
};
const COULEUR_TEXTE = {
  commun: "text-orange-300",
  "peu-commun": "text-slate-200",
  rare: "text-amber-300",
  epique: "text-violet-200",
  legendaire: "text-cyan-200",
};

const dateFr = (iso) =>
  iso ? new Date(`${iso}T00:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : "";

const FILTRES = [
  { id: "tous", libelle: "Tous" },
  { id: "obtenus", libelle: "Obtenus" },
  { id: "a-debloquer", libelle: "À débloquer" },
];

export default function Badges() {
  const [etatBrut] = usePersistentState("badges", ETAT_BADGES_VIDE);
  const etat = normaliserEtat(etatBrut);
  const contexte = useContexteBadges(etatBrut);
  const evaluations = useMemo(() => evaluerBadges(contexte), [contexte]);
  const resume = useMemo(() => resumeVitrine(etatBrut), [etatBrut]);
  const [famille, setFamille] = useState("toutes");
  const [filtre, setFiltre] = useState("tous");

  const visibles = CATALOGUE.filter((b) => {
    if (famille !== "toutes" && b.famille !== famille) return false;
    const obtenu = niveauAcquis(etat, b.id) > 0;
    return filtre === "tous" || (filtre === "obtenus" ? obtenu : !obtenu);
  });
  const familles = FAMILLES.filter((f) => visibles.some((b) => b.famille === f.id));

  return (
    <div className="relative space-y-6">
      <PageGlow color="fuchsia" />

      <div className="relative">
        <h1 className="font-display text-2xl text-slate-50">
          <span className="text-fuchsia-300">Badges</span>
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Ta vitrine : chaque étape de ton patrimoine laisse une médaille. Un badge obtenu ne se perd jamais.
        </p>
      </div>

      <Resume resume={resume} />

      <div className="relative space-y-3">
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label="Familles de badges">
          {[{ id: "toutes", libelle: "Toutes" }, ...FAMILLES].map((f) => (
            <Puce key={f.id} actif={famille === f.id} onClick={() => setFamille(f.id)}>
              {f.libelle}
            </Puce>
          ))}
        </div>
        <div className="flex gap-2" role="group" aria-label="Afficher">
          {FILTRES.map((f) => (
            <Puce key={f.id} actif={filtre === f.id} onClick={() => setFiltre(f.id)} discret>
              {f.libelle}
            </Puce>
          ))}
        </div>
      </div>

      {visibles.length === 0 ? (
        <p className="text-sm text-slate-500">Aucun badge ici pour l'instant.</p>
      ) : (
        familles.map((f) => {
          const duGroupe = visibles.filter((b) => b.famille === f.id);
          const tous = CATALOGUE.filter((b) => b.famille === f.id);
          const obtenus = tous.filter((b) => niveauAcquis(etat, b.id) > 0).length;
          return (
            <section key={f.id} className="relative space-y-3" aria-labelledby={`famille-${f.id}`}>
              <h2 id={`famille-${f.id}`} className="flex items-baseline gap-2 text-xs uppercase tracking-wider text-slate-500">
                {f.libelle}
                <span className="font-data normal-case tracking-normal text-slate-600">
                  {obtenus}/{tous.length}
                </span>
              </h2>
              <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {duGroupe.map((b) => (
                  <CarteBadge key={b.id} badge={b} etat={etat} evaluation={evaluations[b.id]} />
                ))}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}

function Puce({ actif, onClick, children, discret = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={actif}
      className={`btn-flash shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs transition-colors ${
        actif
          ? "border-fuchsia-400/60 bg-fuchsia-400/15 text-fuchsia-200"
          : discret
            ? "border-transparent text-slate-500 hover:text-slate-300"
            : "border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-200"
      }`}
    >
      {children}
    </button>
  );
}

function Resume({ resume }) {
  const part = resume.totalMedailles ? resume.medailles / resume.totalMedailles : 0;
  return (
    <Card accent={CARD_THEMES.fuchsia} className="relative">
      <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
        <div>
          <p className="flex items-center gap-2 text-xs uppercase tracking-wider text-slate-500">
            <Medal size={13} aria-hidden="true" /> Ta vitrine
          </p>
          <p className="mt-1 font-display text-3xl text-slate-50">
            {resume.badges}
            <span className="text-lg text-slate-500"> / {resume.totalBadges} badges</span>
          </p>
          <p className="text-sm text-slate-400">
            {resume.medailles} médaille{resume.medailles > 1 ? "s" : ""} sur {resume.totalMedailles}
          </p>
        </div>
        <ul className="flex flex-wrap gap-4" aria-label="Médailles par rareté">
          {RARETES.map((r) => (
            <li key={r.id} className="flex items-center gap-2">
              <Medaille badge={{ icone: "Medal", rarete: r.id }} taille="sm" />
              <span className="text-sm">
                <span className="font-data text-slate-100">{resume.parRarete[r.id]}</span>{" "}
                <span className={COULEUR_TEXTE[r.id]}>{r.matiere}</span>
                <span className="sr-only"> ({r.libelle})</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-800" aria-hidden="true">
        <div className="h-full rounded-full bg-gradient-to-r from-fuchsia-400 to-amber-300" style={{ width: `${Math.round(part * 100)}%` }} />
      </div>
    </Card>
  );
}

function CarteBadge({ badge, etat, evaluation }) {
  const acquis = niveauAcquis(etat, badge.id);
  const obtenu = acquis > 0;
  const cache = badge.secret && !obtenu;
  const aNiveaux = estANiveaux(badge);
  const rarete = rareteDe(badge, Math.max(acquis, 1));
  const dates = etat.obtenus[badge.id]?.dates || {};

  let ligneRarete;
  if (cache) ligneRarete = "Badge secret";
  else if (aNiveaux && obtenu) ligneRarete = `${rarete.matiere} · niveau ${acquis} sur ${NIVEAU_MAX}`;
  else if (aNiveaux) ligneRarete = "5 niveaux, du bronze au diamant";
  else ligneRarete = `${rarete.matiere} · ${rarete.libelle}`;

  return (
    <li className="medaille-survol">
      <Card className={`h-full ${obtenu ? "" : "opacity-80"}`}>
        <div className="flex items-start gap-4">
          <div className="pt-1">
            <Medaille
              badge={badge}
              niveau={Math.max(acquis, 1)}
              ouverte={obtenu}
              secrete={badge.secret}
              taille="md"
              anime={obtenu ? "balancement" : null}
            />
          </div>
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-corps font-semibold text-slate-100">{cache ? "???" : badge.nom}</h3>
              <span className="font-data text-micro text-slate-600">#{badge.numero}</span>
            </div>
            <p className={`text-micro ${obtenu ? COULEUR_TEXTE[rarete.id] : "text-slate-500"}`}>
              {!obtenu && <Lock size={10} aria-hidden="true" className="mr-1 inline -mt-0.5" />}
              {ligneRarete}
            </p>
            <p className="text-xs text-slate-400">
              {cache ? "Il se découvre en route, sans prévenir." : badge.condition}
            </p>
            {aNiveaux && <Paliers badge={badge} acquis={acquis} dates={dates} />}
            {aNiveaux && acquis < NIVEAU_MAX && <Progression badge={badge} acquis={acquis} evaluation={evaluation} />}
            {!aNiveaux && obtenu && dates[1] && <p className="text-micro text-slate-500">Obtenu le {dateFr(dates[1])}</p>}
            {aNiveaux && acquis === NIVEAU_MAX && <p className="text-micro text-cyan-200">Diamant : le sommet.</p>}
          </div>
        </div>
      </Card>
    </li>
  );
}

/** Les cinq niveaux, chacun à sa couleur une fois atteint. */
function Paliers({ badge, acquis, dates }) {
  return (
    <ol className="flex items-center gap-1.5 pt-0.5" aria-label="Niveaux">
      {RARETES.map((r, i) => {
        const n = i + 1;
        const atteint = n <= acquis;
        const texte = `${r.matiere} : ${libelleSeuil(badge, n)}${atteint && dates[n] ? `, obtenu le ${dateFr(dates[n])}` : ""}`;
        return (
          <li key={r.id} title={texte} className="flex flex-col items-center">
            <span
              className={`block h-2.5 w-2.5 rounded-full ${atteint ? "" : "border border-slate-700 bg-slate-800"}`}
              style={atteint ? { background: TEINTES[r.id] } : undefined}
            />
            <span className="sr-only">{texte}{atteint ? "" : " (pas encore)"}</span>
          </li>
        );
      })}
      <li aria-hidden="true" className="ml-1 text-micro text-slate-500">
        {libelleSeuil(badge, 1)} → {libelleSeuil(badge, NIVEAU_MAX)}
      </li>
    </ol>
  );
}

function Progression({ badge, acquis, evaluation }) {
  const prochain = acquis + 1;
  const seuil = badge.seuils[acquis];
  const valeur = Number(evaluation?.valeur) || 0;
  const part = seuil > 0 ? Math.max(0, Math.min(1, valeur / seuil)) : 0;
  const matiere = RARETES[prochain - 1].matiere;
  return (
    <div className="space-y-1 pt-0.5">
      <div className="flex justify-between gap-2 text-micro">
        <span className="text-slate-500">
          Prochain : <span className="text-slate-300">{matiere}</span> à {libelleSeuil(badge, prochain)}
        </span>
        <span className="ghost-blur font-data text-slate-400">{libelleValeur(badge, valeur)}</span>
      </div>
      <div
        className="h-1 overflow-hidden rounded-full bg-slate-800"
        role="progressbar"
        aria-label={`Progression vers le niveau ${matiere}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(part * 100)}
      >
        <div className="h-full rounded-full bg-fuchsia-400/80" style={{ width: `${Math.round(part * 100)}%` }} />
      </div>
    </div>
  );
}
