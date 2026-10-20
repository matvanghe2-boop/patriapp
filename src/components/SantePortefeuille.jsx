import { useMemo } from "react";
import { ShieldCheck, Globe2 } from "lucide-react";
import { CarteFocalisable, CardLabel, PastilleEtat } from "./ui";
import EtatVide from "./EtatVide";
import { AnneauProgression } from "./graphiques";
import { santePortefeuille, expositionGeographique } from "../lib/portefeuilleSante";
import { pctPlain, valeurPosition } from "../lib/finance";
import { compositionDe } from "../lib/compositionEtf";
import { PAYS_AGREGE } from "../lib/exposition";

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
        <CardLabel icon={Globe2}>Exposition par pays</CardLabel>
        {geo.pays.length === 0 ? (
          <p className="text-micro text-slate-500 mt-1">
            Aucun pays connu : ces lignes sont des fonds hors catalogue, que l&apos;application ne
            décompose pas au jugé.
          </p>
        ) : (
          <>
            <div className="flex flex-col gap-1.5 mt-2">
              {lignesPays(geo.pays).map((p, i) => (
                <div key={p.nom} className="grid grid-cols-[6rem_1fr_2.6rem] gap-2 items-center">
                  <span className="text-micro text-slate-400 truncate">{p.nom}</span>
                  <span className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                    <span
                      className="block h-full rounded-full"
                      style={{ width: `${p.part}%`, background: COULEURS_PAYS[i % COULEURS_PAYS.length] }}
                    />
                  </span>
                  <span className="text-micro font-data tabular-nums text-slate-400 text-right">
                    {pctPlain(p.part, 0)}
                  </span>
                </div>
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
                  .{c.pays?.[PAYS_AGREGE] != null && " Les pays qu'elle ne détaille pas restent regroupés."}
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
