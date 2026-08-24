import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Search, CornerDownLeft } from "lucide-react";
import { eur, valeurPosition } from "../lib/finance";
import { useApparence } from "../lib/ApparenceContext";
import { vibrer } from "../lib/haptique";

/**
 * Palette de commandes (Ctrl/⌘ + K).
 *
 * `GlobalSearch` indexait déjà livrets, positions, opérations, passifs,
 * watchlist, notes et enveloppes — sans le moindre appel réseau. Mais elle
 * n'avait aucun raccourci clavier, aucune navigation aux flèches, et son menu
 * déroulant n'était annoncé aux lecteurs d'écran ni comme une liste, ni comme
 * un champ de recherche.
 *
 * Cette palette reprend le même index et corrige les trois. Elle y ajoute ce
 * qui manquait vraiment : les ACTIONS. Chercher « CW8 » et sauter à la ligne
 * est utile ; taper « export » et déclencher la sauvegarde l'est davantage,
 * parce que c'est une commande qui vit aujourd'hui dans un menu latéral qu'on
 * ne pense à ouvrir que lorsqu'on sait déjà ce qu'on cherche.
 *
 * NORMALISATION DES ACCENTS : « Épargne » doit se trouver en tapant « epargne ».
 * Sans cela, un index français est inutilisable au clavier rapide.
 */

const sansAccent = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** Construit l'index consultable à partir de l'état patrimonial. */
export function construireIndex({
  livrets = [],
  bourse = { positions: [], operations: [] },
  dettes = [],
  watchlist = [],
  strategyNotes = [],
  enveloppes = [],
  objectifs = [],
}) {
  const items = [];
  const pousser = (o) => items.push({ ...o, cle: sansAccent(`${o.libelle} ${o.categorie} ${o.detail}`) });

  livrets.forEach((l) =>
    pousser({ id: `livret-${l.id}`, onglet: "livrets", categorie: "Livret", libelle: l.name, detail: eur(l.balance) })
  );
  (bourse.positions || []).forEach((p) =>
    pousser({
      id: `pos-${p.id}`,
      onglet: "bourse",
      categorie: "Position",
      libelle: `${p.name || p.ticker}`,
      detail: `${p.ticker} · ${eur(valeurPosition(p))}`,
    })
  );
  (bourse.operations || []).forEach((op) =>
    pousser({
      id: `op-${op.id}`,
      onglet: "strategie",
      categorie: "Opération",
      libelle: `${op.type} ${op.asset || op.ticker || ""}`.trim(),
      detail: op.date || "",
    })
  );
  dettes.forEach((d) =>
    pousser({ id: `dette-${d.id}`, onglet: "dashboard", categorie: "Passif", libelle: d.name, detail: eur(d.amount) })
  );
  watchlist.forEach((w) =>
    pousser({ id: `watch-${w.id}`, onglet: "bourse", categorie: "Watchlist", libelle: w.name || w.ticker, detail: w.ticker })
  );
  strategyNotes.forEach((n) =>
    pousser({ id: `note-${n.id}`, onglet: "strategie", categorie: "Note de thèse", libelle: n.ticker || n.titre || "Note", detail: n.date || "" })
  );
  enveloppes.forEach((e) =>
    pousser({ id: `env-${e.id}`, onglet: "livrets", categorie: "Enveloppe", libelle: e.label, detail: eur(e.amount) })
  );
  objectifs.forEach((o) =>
    pousser({ id: `obj-${o.id}`, onglet: "dashboard", categorie: "Objectif", libelle: o.libelle, detail: o.echeance || "" })
  );
  return items;
}

export default function PaletteCommandes({ ouvert, onFermer, index = [], actions = [], onNaviguer }) {
  const { haptique } = useApparence();
  const [requete, setRequete] = useState("");
  const [selection, setSelection] = useState(0);
  const champRef = useRef(null);
  const listeRef = useRef(null);

  const resultats = useMemo(() => {
    const q = sansAccent(requete.trim());
    const cmds = actions
      .filter((a) => !q || sansAccent(`${a.libelle} ${a.motsCles || ""}`).includes(q))
      .map((a) => ({ ...a, categorie: "Action", estAction: true }));
    if (!q) return cmds.slice(0, 8);
    const trouves = index.filter((i) => i.cle.includes(q)).slice(0, 12);
    return [...cmds, ...trouves];
  }, [requete, index, actions]);

  // La sélection retombe en tête à chaque frappe : sans cela, elle pointerait
  // sur un rang qui ne désigne plus le même résultat. Ajustement pendant le
  // rendu plutôt qu'effet, pour ne pas peindre une ligne surlignée qui va
  // immédiatement changer.
  const [requetePrecedente, setRequetePrecedente] = useState(requete);
  if (requete !== requetePrecedente) {
    setRequetePrecedente(requete);
    setSelection(0);
  }

  // Remise à zéro à la fermeture, décidée pendant le rendu : rouvrir la palette
  // sur la recherche précédente n'a aucun intérêt.
  const [ouvertPrecedent, setOuvertPrecedent] = useState(ouvert);
  if (ouvert !== ouvertPrecedent) {
    setOuvertPrecedent(ouvert);
    if (!ouvert) setRequete("");
  }

  useEffect(() => {
    if (ouvert) champRef.current?.focus();
  }, [ouvert]);

  // La ligne sélectionnée doit rester visible quand on descend au clavier.
  useEffect(() => {
    listeRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [selection]);

  if (!ouvert) return null;

  const choisir = (r) => {
    vibrer("navigation", haptique);
    if (r.estAction) r.executer?.();
    else onNaviguer?.(r.onglet);
    onFermer?.();
  };

  const auClavier = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelection((s) => (resultats.length ? (s + 1) % resultats.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelection((s) => (resultats.length ? (s - 1 + resultats.length) % resultats.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const r = resultats[selection];
      if (r) choisir(r);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onFermer?.();
    }
  };

  return createPortal(
    <div
      className="modal-overlay fixed inset-0 z-[110] bg-slate-950/70 backdrop-blur-sm flex items-start justify-center p-4 pt-[12vh]"
      onMouseDown={(e) => e.target === e.currentTarget && onFermer?.()}
    >
      {/* `role="dialog"` et non `listbox` sur le conteneur : c'est une fenêtre
          qui CONTIENT une liste, et le champ de recherche en est le libellé. */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Palette de commandes"
        className="modal-panel w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl overflow-hidden"
      >
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-slate-800">
          <Search size={15} className="text-slate-500 shrink-0" aria-hidden="true" />
          <input
            ref={champRef}
            value={requete}
            onChange={(e) => setRequete(e.target.value)}
            onKeyDown={auClavier}
            placeholder="Chercher une ligne, lancer une action…"
            aria-label="Chercher"
            aria-controls="palette-resultats"
            aria-activedescendant={resultats[selection] ? `palette-${resultats[selection].id}` : undefined}
            role="combobox"
            aria-expanded="true"
            className="flex-1 bg-transparent text-sm text-slate-100 placeholder-slate-600 focus:outline-none"
          />
          <kbd className="text-micro font-data text-slate-600 border border-slate-700 rounded px-1.5 py-0.5">Échap</kbd>
        </div>

        <div id="palette-resultats" role="listbox" ref={listeRef} className="max-h-[46vh] overflow-y-auto py-1">
          {resultats.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-slate-500">Rien ne correspond à « {requete} ».</p>
          )}
          {resultats.map((r, i) => (
            <button
              key={r.id}
              id={`palette-${r.id}`}
              role="option"
              aria-selected={i === selection}
              onMouseEnter={() => setSelection(i)}
              onClick={() => choisir(r)}
              className={`w-full flex items-center gap-3 px-4 py-2 text-left text-sm ${
                i === selection ? "bg-amber-400/10 text-amber-200" : "text-slate-300"
              }`}
            >
              {r.icone && <r.icone size={14} className="shrink-0 opacity-70" aria-hidden="true" />}
              <span className="truncate flex-1">{r.libelle}</span>
              <span className="text-micro text-slate-500 shrink-0">{r.detail || r.categorie}</span>
              {i === selection && <CornerDownLeft size={12} className="text-slate-600 shrink-0" aria-hidden="true" />}
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}

/**
 * Raccourci global d'ouverture.
 *
 * Séparé du composant parce que l'écouteur doit vivre même quand la palette
 * est fermée — donc démontée. `metaKey` autant que `ctrlKey` : le raccourci
 * doit répondre au réflexe de l'utilisateur, quel que soit son système.
 */
export function useRaccourciPalette(ouvrir) {
  useEffect(() => {
    const surTouche = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        ouvrir();
      }
    };
    document.addEventListener("keydown", surTouche);
    return () => document.removeEventListener("keydown", surTouche);
  }, [ouvrir]);
}
