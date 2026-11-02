import { useMemo, useState } from "react";
import { ShieldCheck, Globe2 } from "lucide-react";
import { CarteFocalisable, CardLabel, PastilleEtat } from "./ui";
import EtatVide from "./EtatVide";
import { AnneauProgression } from "./graphiques";
import { santePortefeuille, expositionGeographique, expositionParZone } from "../lib/portefeuilleSante";
import { pctPlain, valeurPosition } from "../lib/finance";
import { compositionDe } from "../lib/compositionEtf";
import { estPaysAgrege } from "../lib/exposition";

/**
 * Santé du portefeuille et exposition géographique — onglet PEA & Bourse.
 *
 * PLACÉ ICI ET PAS AU DASHBOARD : ces deux mesures portent sur les LIGNES, pas
 * sur le patrimoine. Un score de robustesse au Dashboard inviterait à le lire
 * comme un jugement global alors qu'il ne dit rien des livrets, de
 * l'immobilier ni des liquidités.
 *
 * Les deux blocs sont réunis parce qu'ils répondent à la même question sous
 * deux angles : où le portefeuille est-il concentré sans qu'on le voie ?
 */

const COULEURS_PAYS = ["#a78bfa", "#818cf8", "#22d3ee", "#34d399", "#fbbf24", "#64748b"];

/**
 * Les cinq premiers pays, puis une ligne « Autres » qui regroupe le reste ET
 * le bloc que la fiche d'un indice ne détaille pas. Ce bloc (« Autres pays
 * développés », 12 % d'un MSCI World) se classait sinon deuxième, entre les
 * États-Unis et le Japon, comme s'il s'agissait d'un pays.
 */
function lignesPays(pays) {
  const detailles = pays.filter((p) => !p.agrege);
  const tete = detailles.slice(0, 5);
  const reste = [...detailles.slice(5), ...pays.filter((p) => p.agrege)];
  if (reste.length === 0) return tete;
  return [
    ...tete,
    {
      nom: "Autres",
      valeur: reste.reduce((s, p) => s + p.valeur, 0),
      part: reste.reduce((s, p) => s + p.part, 0),
    },
  ];
}

/** « 30 septembre 2026 », pour dater la fiche d'un indice. */
const dateLongue = (iso) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

const COULEUR_BLOC = "#64748b";

/** Une ligne de la carte : libellé, barre, part. */
function BarreGeo({ nom, part, couleur }) {
  return (
    <div className="grid grid-cols-[8.5rem_1fr_2.6rem] gap-2 items-center">
      <span className="text-micro text-slate-400 leading-tight">{nom}</span>
      <span className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
        <span className="block h-full rounded-full" style={{ width: `${part}%`, background: couleur }} />
      </span>
      {/* Une décimale sous 1 % : une zone réelle mais petite ne doit pas
          s'afficher « 0 % », comme si elle n'existait pas. */}
      <span className="text-micro font-data tabular-nums text-slate-400 text-right">{pctPlain(part, part > 0 && part < 1 ? 1 : 0)}</span>
    </div>
  );
}

/**
 * Deux lectures de l'exposition géographique, au choix.
 *
 * « Siège » range chaque société dans le pays de sa place de cotation : Vusion
 * y est 100 % française. « Chiffre d'affaires » la range là où elle VEND, quand
 * la société le publie — c'est la lecture par défaut dès qu'une ligne au moins
 * est couverte, parce que c'est elle qui dit à quelles économies le
 * portefeuille est exposé.
 */
const VUES_GEO = [
  { id: "ca", libelle: "Chiffre d'affaires" },
  { id: "siege", libelle: "Siège" },
];

export default function SantePortefeuille({ positions = [], secteursManuels = {} }) {
  const sante = useMemo(
    () => santePortefeuille(positions, { secteursManuels }),
    [positions, secteursManuels]
  );
  // Indices au catalogue réellement présents, pour en citer la source et l'âge.
  const indices = useMemo(() => {
    const vus = new Map();
    for (const p of positions) {
      const c = compositionDe(p.ticker);
      if (c && valeurPosition(p) > 0) vus.set(c.indice, c);
    }
    return [...vus.values()];
  }, [positions]);
  const geo = useMemo(() => expositionGeographique(positions), [positions]);
  const parZone = useMemo(() => expositionParZone(positions), [positions]);
  // `null` : pas encore choisi — le chiffre d'affaires dès qu'il est connu.
  const [vueChoisie, setVueGeo] = useState(null);
  const vueGeo = vueChoisie ?? (parZone.partChiffreAffaires > 0 ? "ca" : "siege");

  if (sante.score == null) {
    return (
      <CarteFocalisable titre="Santé du portefeuille" icon={ShieldCheck} accent="teinte-violet carte-domaine">
        <CardLabel icon={ShieldCheck}>Santé du portefeuille</CardLabel>
        <EtatVide picto="bourse" titre="Aucune ligne à analyser">
          Ajoute au moins une position pour mesurer sa concentration, son équilibre sectoriel et son
          exposition aux devises.
        </EtatVide>
      </CarteFocalisable>
    );
  }

  return (
    <CarteFocalisable titre="Santé du portefeuille" icon={ShieldCheck} accent="teinte-violet carte-domaine">
      <CardLabel icon={ShieldCheck}>Santé du portefeuille</CardLabel>

      <div className="flex items-center gap-4 mt-2">
        <AnneauProgression
          valeur={sante.score}
          taille={64}
          epaisseur={6}
          libelle="Score de robustesse"
          className="shrink-0 text-violet-400"
        />
        <div className="flex-1 min-w-0 flex flex-col gap-1.5">
          {sante.composantes.map((c) => (
            <div key={c.cle} className="grid grid-cols-[5.5rem_1fr_2.2rem] gap-2 items-center">
              <span className="text-micro text-slate-500">{c.libelle}</span>
              <span className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                {Number.isFinite(c.note) && (
                  <span
                    className={`block h-full rounded-full ${
                      c.seuil === "critique" ? "bg-rose-400" : c.seuil === "attention" ? "bg-amber-400" : "bg-emerald-400"
                    }`}
                    style={{ width: `${c.note}%` }}
                  />
                )}
              </span>
              <span className="text-micro font-data tabular-nums text-slate-400 text-right">
                {Number.isFinite(c.note) ? Math.round(c.note) : "—"}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/*
        La composante la plus basse d'abord — c'est elle qui dit quoi faire.
        Le score global, lui, ne dit rien : un portefeuille à 68 peut être
        parfaitement équilibré et beaucoup trop concentré, ou l'inverse, et les
        deux appellent des décisions opposées.
      */}
      <div className="flex flex-col gap-1.5 mt-3 pt-3 border-t border-slate-800">
        {[...sante.composantes]
          .filter((c) => c.constat)
          .sort((a, b) => (a.note ?? 101) - (b.note ?? 101))
          .slice(0, 2)
          .map((c) => (
            <p key={c.cle} className="flex items-start gap-2 text-micro text-slate-400">
              <PastilleEtat etat={c.seuil}>{c.libelle}</PastilleEtat>
              <span className="flex-1 pt-0.5">{c.constat}</span>
            </p>
          ))}
      </div>

      {/* ── Exposition géographique ──────────────────────────────────────── */}
      <div className="mt-4 pt-3 border-t border-slate-800">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <CardLabel icon={Globe2}>{vueGeo === "ca" ? "Exposition par zone" : "Exposition par pays"}</CardLabel>
          <div role="group" aria-label="Base de l'exposition géographique" className="inline-flex rounded-lg border border-slate-700 p-0.5">
            {VUES_GEO.map((v) => (
              <button
                key={v.id}
                type="button"
                aria-pressed={vueGeo === v.id}
                onClick={() => setVueGeo(v.id)}
                className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                  vueGeo === v.id ? "bg-violet-500/15 text-violet-200" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {v.libelle}
              </button>
            ))}
          </div>
        </div>
        {vueGeo === "ca" ? (
          <ExpositionParZone expo={parZone} />
        ) : geo.pays.length === 0 ? (
          <p className="text-micro text-slate-500 mt-1">
            Aucun pays connu : ces lignes sont des fonds hors catalogue, que l&apos;application ne
            décompose pas au jugé.
          </p>
        ) : (
          <>
            <div className="flex flex-col gap-1.5 mt-2">
              {lignesPays(geo.pays).map((p, i) => (
                <BarreGeo key={p.nom} nom={p.nom} part={p.part} couleur={COULEURS_PAYS[i % COULEURS_PAYS.length]} />
              ))}
            </div>
            {/* D'où viennent ces pays : dit à l'écran, parce qu'une carte
                dont on ignore la fabrication se lit comme une certitude. */}
            <div className="flex flex-col gap-1 mt-2">
              {indices.map((c) => (
                <p key={c.indice} className="text-micro text-slate-500">
                  ETF décomposés selon l&apos;indice {c.indice} :{" "}
                  <a
                    href={c.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={c.source}
                    className="underline hover:text-slate-300"
                  >
                    fiche de l&apos;indice au {dateLongue(c.date)}
                  </a>
                  .{Object.keys(c.pays || {}).some(estPaysAgrege) && " Les pays qu'elle ne détaille pas restent regroupés."}
                </p>
              ))}
              {geo.partCotation > 0 && (
                <p className="text-micro text-slate-500">
                  {pctPlain(geo.partCotation, 0)} du portefeuille est situé d&apos;après sa place de
                  cotation — juste dans l&apos;immense majorité des cas, pas toujours : une société
                  étrangère peut être cotée à Paris.
                </p>
              )}
              {geo.partInconnue > 0 && (
                <p className="text-micro text-amber-300/90">
                  {pctPlain(geo.partInconnue, 0)} du portefeuille n&apos;a pas de pays connu (fonds hors
                  catalogue). Ces lignes sont comptées à part, jamais réparties au prorata —
                  l&apos;inventer donnerait une carte fausse que rien ne signalerait.
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </CarteFocalisable>
  );
}

/**
 * Exposition par zone, d'après le chiffre d'affaires publié.
 *
 * Les BLOCS — ce qu'une société ne sépare pas, comme « EMEA » — viennent à
 * part, en gris, après les zones : mêlés à elles, ils passeraient pour une
 * région de plus.
 */
function ExpositionParZone({ expo }) {
  if (expo.zones.length === 0 && expo.blocs.length === 0) {
    return (
      <p className="text-micro text-slate-500 mt-1">
        Aucune zone connue : ces lignes sont des fonds hors catalogue, que l&apos;application ne
        décompose pas au jugé.
      </p>
    );
  }
  return (
    <>
      <div className="flex flex-col gap-1.5 mt-2">
        {expo.zones.map((z, i) => (
          <BarreGeo key={z.nom} nom={z.nom} part={z.part} couleur={COULEURS_PAYS[i % COULEURS_PAYS.length]} />
        ))}
      </div>
      {expo.blocs.length > 0 && (
        <>
          <p className="text-micro text-slate-500 mt-3 mb-1.5">Non séparé par les sociétés</p>
          <div className="flex flex-col gap-1.5">
            {expo.blocs.map((b) => (
              <BarreGeo key={b.nom} nom={b.nom} part={b.part} couleur={COULEUR_BLOC} />
            ))}
          </div>
        </>
      )}
      {/* Sur quoi repose la carte : dit à l'écran, ligne par ligne d'origine. */}
      <div className="flex flex-col gap-1 mt-2">
        {expo.partChiffreAffaires > 0 && (
          <p className="text-micro text-slate-500">
            {pctPlain(expo.partChiffreAffaires, 0)} du portefeuille est réparti d&apos;après le chiffre
            d&apos;affaires publié par la société :{" "}
            {expo.societes.map((s, i) => (
              <span key={s.ticker}>
                {i > 0 && ", "}
                <a href={s.url} target="_blank" rel="noopener noreferrer" title={s.source} className="underline hover:text-slate-300">
                  {s.societe} ({s.exercice})
                </a>
              </span>
            ))}
            .
          </p>
        )}
        {expo.partSiege > 0 && (
          <p className="text-micro text-slate-500">
            {pctPlain(expo.partSiege, 0)} (ETF) est réparti d&apos;après le siège des sociétés de leur
            indice : les fiches d&apos;indice ne publient pas de chiffre d&apos;affaires par zone.
          </p>
        )}
        {expo.partCotation > 0 && (
          <p className="text-micro text-slate-500">
            {pctPlain(expo.partCotation, 0)} du portefeuille est situé d&apos;après sa place de cotation,
            faute de chiffre d&apos;affaires publié au catalogue.
          </p>
        )}
        {expo.partInconnue > 0 && (
          <p className="text-micro text-amber-300/90">
            {pctPlain(expo.partInconnue, 0)} du portefeuille n&apos;a pas de zone connue (fonds hors
            catalogue). Ces lignes sont comptées à part, jamais réparties au prorata.
          </p>
        )}
      </div>
    </>
  );
}
