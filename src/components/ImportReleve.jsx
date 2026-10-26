import { useMemo, useRef, useState } from "react";
import { FileUp, X } from "lucide-react";
import { Card, PastilleEtat } from "./ui";
import Montant from "./Montant";
import { extrairePagesPdf } from "../lib/lirePdf";
import { lireReleveBourso, ReleveIllisible } from "../lib/releveBourso";
import { preparerLots } from "../lib/compteCourant";

/**
 * Import des relevés PDF du compte courant, en deux temps : LIRE, puis
 * MONTRER ce qui va être écrit. Rien n'est enregistré avant la confirmation —
 * un relevé mal lu se voit à l'aperçu (contrôle du solde en échec) au lieu de
 * se découvrir des semaines plus tard dans les statistiques.
 */

const dateCourte = (iso) => (iso ? iso.split("-").reverse().join("/") : "?");

/** Bouton de sélection : lit les PDF choisis et transmet le résultat brut. */
export function BoutonImport({ onLu, libelle = "Importer des relevés", principal = false }) {
  const [lecture, setLecture] = useState(false);
  const champ = useRef(null);

  const lire = async (e) => {
    const fichiers = [...(e.target.files || [])];
    e.target.value = "";
    if (fichiers.length === 0) return;
    setLecture(true);
    const resultats = [];
    for (const fichier of fichiers) {
      try {
        resultats.push({ fichier: fichier.name, releve: lireReleveBourso(await extrairePagesPdf(fichier)) });
      } catch (err) {
        resultats.push({
          fichier: fichier.name,
          erreur: err instanceof ReleveIllisible ? err.message : "Fichier illisible : est-ce bien un PDF ?",
        });
      }
    }
    setLecture(false);
    onLu(resultats);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => champ.current?.click()}
        disabled={lecture}
        className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-400/40 disabled:opacity-60 ${
          principal
            ? "border-lime-400/50 bg-lime-400/15 text-lime-100 hover:bg-lime-400/25"
            : "border-slate-700 text-slate-300 hover:text-slate-50 hover:border-lime-400/40"
        }`}
      >
        <FileUp size={16} aria-hidden="true" />
        {lecture ? "Lecture du relevé…" : libelle}
      </button>
      <input
        ref={champ}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        onChange={lire}
        className="sr-only"
        tabIndex={-1}
        aria-label="Choisir des relevés PDF"
      />
    </>
  );
}

/** Aperçu avant écriture : un bilan par fichier, puis une seule confirmation. */
export function ApercuImport({ resultats, existant, onConfirmer, onAnnuler }) {
  const lots = useMemo(() => preparerLots(resultats, existant), [resultats, existant]);

  const aImporter = lots.filter((l) => l.lot && l.lot.nouvelles.length > 0);
  const total = aImporter.reduce((s, l) => s + l.lot.nouvelles.length, 0);

  return (
    <Card className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg text-slate-50">Aperçu de l'import</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Lu dans ce navigateur. Rien n'est enregistré tant que tu n'as pas confirmé.
          </p>
        </div>
        <button
          type="button"
          onClick={onAnnuler}
          aria-label="Fermer l'aperçu"
          className="text-slate-500 hover:text-slate-200 rounded p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-400/40"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>

      <ul className="space-y-3">
        {lots.map((l, i) => (
          <li key={`${l.fichier}-${i}`} className="rounded-xl border border-slate-800 bg-slate-950/50 p-3 text-sm">
            <div className="text-xs text-slate-500 truncate">{l.fichier}</div>
            {l.erreur ? (
              <p className="text-rose-300 mt-1">{l.erreur}</p>
            ) : (
              <ResumeLot lot={l.lot} releveLu={l.releve} />
            )}
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={onAnnuler}
          className="rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:text-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-400/40"
        >
          Annuler
        </button>
        <button
          type="button"
          disabled={total === 0}
          onClick={() => onConfirmer(aImporter.map((l) => l.lot))}
          className="rounded-xl border border-lime-400/50 bg-lime-400/15 px-4 py-2 text-sm text-lime-100 hover:bg-lime-400/25 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-400/40"
        >
          {total === 0 ? "Rien de nouveau à importer" : `Importer ${total} opération${total > 1 ? "s" : ""}`}
        </button>
      </div>
    </Card>
  );
}

function ResumeLot({ lot, releveLu }) {
  const { releve, nouvelles, doublons } = lot;
  return (
    <div className="mt-1 space-y-1.5">
      <div className="text-slate-100">
        Relevé du {dateCourte(releve.debut)} au {dateCourte(releve.fin)}
        {releve.compte && <span className="text-slate-500"> · compte •••• {releve.compte}</span>}
      </div>
      <div className="text-xs text-slate-400">
        {releveLu.operations.length} opération{releveLu.operations.length > 1 ? "s" : ""} lue
        {releveLu.operations.length > 1 ? "s" : ""} · {nouvelles.length} nouvelle{nouvelles.length > 1 ? "s" : ""}
        {doublons > 0 && ` · ${doublons} déjà présente${doublons > 1 ? "s" : ""}`}
      </div>
      {releve.soldeDebut != null && releve.soldeFin != null && (
        <div className="text-xs text-slate-400">
          Solde <Montant valeur={releve.soldeDebut / 100} decimales={2} /> →{" "}
          <Montant valeur={releve.soldeFin / 100} decimales={2} />
        </div>
      )}
      {releve.controleOk ? (
        <PastilleEtat etat="ok">Solde vérifié : chaque ligne a été lue</PastilleEtat>
      ) : (
        <PastilleEtat etat="critique">
          {releve.ecart != null ? (
            <>
              Écart de <Montant valeur={Math.abs(releve.ecart) / 100} decimales={2} /> avec le solde du relevé : une
              ligne a pu être mal lue
            </>
          ) : (
            "Solde du relevé introuvable : impossible de vérifier la lecture"
          )}
        </PastilleEtat>
      )}
    </div>
  );
}
