import { useMemo } from "react";
import { ShieldCheck, Globe2 } from "lucide-react";
import { CarteFocalisable, CardLabel, PastilleEtat } from "./ui";
import EtatVide from "./EtatVide";
import { AnneauProgression } from "./graphiques";
import { santePortefeuille, expositionGeographique } from "../lib/portefeuilleSante";

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

const COULEURS_PAYS = ["#a78bfa", "#818cf8", "#22d3ee", "#34d399", "#fbbf24", "#fb7185"];

export default function SantePortefeuille({ positions = [] }) {
  const sante = useMemo(() => santePortefeuille(positions), [positions]);
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
            Le pays de chaque ligne est renseigné en consultant sa fiche dans l'onglet Marché. Aucune
            ligne n'en porte encore.
          </p>
        ) : (
          <>
            <div className="flex flex-col gap-1.5 mt-2">
              {geo.pays.slice(0, 5).map((p, i) => (
                <div key={p.nom} className="grid grid-cols-[6rem_1fr_2.6rem] gap-2 items-center">
                  <span className="text-micro text-slate-400 truncate">{p.nom}</span>
                  <span className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                    <span
                      className="block h-full rounded-full"
                      style={{ width: `${p.part}%`, background: COULEURS_PAYS[i % COULEURS_PAYS.length] }}
                    />
                  </span>
                  <span className="text-micro font-data tabular-nums text-slate-400 text-right">
                    {p.part.toFixed(0)} %
                  </span>
                </div>
              ))}
            </div>
            {geo.partInconnue > 0 && (
              <p className="text-micro text-amber-300/90 mt-2">
                {geo.partInconnue.toFixed(0)} % du portefeuille n'a pas de pays connu. Ces lignes sont
                comptées à part, jamais réparties au prorata — l'inventer donnerait une carte fausse
                que rien ne signalerait.
              </p>
            )}
          </>
        )}
      </div>
    </CarteFocalisable>
  );
}
