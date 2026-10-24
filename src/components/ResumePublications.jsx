import { useState, useMemo } from "react";
import { FileText, AlertTriangle, ExternalLink, Loader2, Trash2 } from "lucide-react";
import { Card, CardLabel, CARD_THEMES } from "./ui";
import { resumerPublication, estCommuniqueDepose } from "../lib/api";
import { usePersistentState } from "../lib/storage";
import { useToast } from "../lib/ToastContext";
import LecturePublication from "./LecturePublication";
import { todayIso } from "../lib/finance";
import { tenueDesGuidances } from "../../shared/resumePublication.js";
import {
  enregistrerPublication,
  publicationsDe,
  guidancePrecedente,
  historiqueGuidances,
  libelleEvolution,
  tonEvolution,
  retirerPublication,
  clePublication,
} from "../lib/publications";

/**
 * Résumés de communiqués et de résultats, par entreprise.
 *
 * CE QUE CET ÉCRAN PROMET, ET CE QU'IL NE PROMET PAS
 *
 * Il résume du texte public d'entreprise. Il ne conseille rien : ni achat,
 * ni vente, ni cible de cours. Et surtout, il n'affiche AUCUN chiffre que le
 * modèle n'aurait pas recopié du texte source — tout nombre introuvable dans
 * l'original est retiré, compté, et l'ensemble est alors signalé comme
 * incertain plutôt que présenté comme vérifié.
 *
 * Rien du portefeuille ne part : cette route ne reçoit qu'un symbole et du
 * texte déjà public.
 */
export default function ResumePublications({ ticker, nom, lienDocument = null }) {
  const { showToast } = useToast();
  const [publications, setPublications] = usePersistentState("publicationsResumees", []);
  const [texte, setTexte] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState("");
  const [ouvert, setOuvert] = useState(false);

  // Seuls les documents que le serveur sait lire se résument par leur lien :
  // un communiqué déposé (DILA) ou un dépôt SEC. Le lien d'agenda d'une
  // société (catalogue de référence) mène à une page web qu'il refuse — le
  // bouton échouait à chaque fois.
  const lienResumable =
    estCommuniqueDepose(lienDocument) || /^https:\/\/(?:www\.)?sec\.gov\//.test(lienDocument || "") ? lienDocument : null;

  const fil = useMemo(() => publicationsDe(publications, ticker), [publications, ticker]);
  const tenue = useMemo(
    () => tenueDesGuidances(historiqueGuidances(publications, ticker)),
    [publications, ticker]
  );

  const lancer = async ({ depuisLien }) => {
    setEnCours(true);
    setErreur("");
    try {
      const corps = depuisLien
        ? { symbole: ticker, url: lienResumable }
        : { symbole: ticker, texte: texte.trim() };
      if (!depuisLien && !corps.texte) {
        setErreur("Colle le texte du communiqué.");
        return;
      }

      const precedente = guidancePrecedente(publications, ticker, todayIso());
      const r = await resumerPublication({
        ...corps,
        guidancePrecedente: precedente,
        // Le serveur juge la crédibilité de la société sur ce décompte.
        tenue: tenue.total > 0 ? { tenues: tenue.tenues, total: tenue.total } : null,
      });

      if (!r.disponible) {
        setErreur(
          `${r.motif} Le texte reste consultable${r.lien ? " via le lien ci-dessous" : ""}.`
        );
        return;
      }

      setPublications((liste) =>
        enregistrerPublication(liste, {
          ticker,
          nom,
          date: todayIso(),
          cle: clePublication(ticker, r.lien || (corps.texte || "").slice(0, 160)),
          ...r,
        })
      );
      setTexte("");
      setOuvert(false);
      showToast({ message: "Publication résumée et ajoutée au fil." });
    } catch (e) {
      setErreur(e.message || "Le résumé n'a pas pu être produit.");
    } finally {
      setEnCours(false);
    }
  };

  return (
    <Card accent={CARD_THEMES.cyan}>
      <CardLabel icon={FileText}>Communiqués et résultats — {ticker}</CardLabel>

      {/* Crédibilité de l'entreprise sur ses propres promesses. Plus utile
          qu'un commentaire sur la guidance du jour. */}
      {tenue.total > 0 && (
        <p className="text-micro text-slate-400 mt-1">
          Guidances tenues : <span className="text-slate-200">{tenue.tenues} sur {tenue.total}</span>
          {tenue.taux != null && <span className="text-slate-500"> ({Math.round(tenue.taux)} %)</span>}
        </p>
      )}

      {!ouvert ? (
        <>
          {/* Le document est déjà connu : le résumer est l'action principale,
              sans passer par le formulaire de texte à coller. */}
          <div className="flex flex-wrap gap-2 mt-3">
            {lienResumable && (
              <button
                onClick={() => lancer({ depuisLien: true })}
                disabled={enCours}
                className="btn-flash flex items-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/10 text-cyan-300 px-3 py-1.5 text-xs font-medium disabled:opacity-40"
              >
                {enCours && <Loader2 size={13} className="animate-spin" />}
                Résumer ce communiqué
              </button>
            )}
            <button
              onClick={() => setOuvert(true)}
              className="btn-flash text-xs text-cyan-300 hover:text-cyan-200 border border-slate-700 hover:border-cyan-500/40 rounded-lg px-3 py-1.5"
            >
              {lienResumable ? "Coller un autre texte" : "Résumer une publication"}
            </button>
          </div>
          {erreur && <p className="text-micro text-amber-300 mt-2">{erreur}</p>}
        </>
      ) : (
        <div className="mt-3">
          <p className="text-micro text-slate-500 mb-1.5">
            Colle le texte du communiqué. Aucune donnée de ton portefeuille n&apos;est transmise —
            seulement ce texte, déjà public.
          </p>
          <textarea
            value={texte}
            onChange={(e) => setTexte(e.target.value)}
            rows={5}
            placeholder="Colle ici le communiqué ou le compte rendu de résultats…"
            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-cyan-400/60"
          />
          <div className="flex flex-wrap gap-2 mt-2">
            <button
              onClick={() => lancer({ depuisLien: false })}
              disabled={enCours}
              className="btn-flash flex items-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/10 text-cyan-300 px-3 py-1.5 text-xs font-medium disabled:opacity-40"
            >
              {enCours && <Loader2 size={13} className="animate-spin" />}
              Résumer ce texte
            </button>
            {lienResumable && (
              <button
                onClick={() => lancer({ depuisLien: true })}
                disabled={enCours}
                className="text-xs text-slate-400 hover:text-slate-200 border border-slate-700 rounded-lg px-3 py-1.5 disabled:opacity-40"
              >
                Utiliser le document déposé
              </button>
            )}
            <button
              onClick={() => { setOuvert(false); setErreur(""); }}
              className="text-xs text-slate-500 hover:text-slate-300 px-2"
            >
              Annuler
            </button>
          </div>
          {erreur && <p className="text-micro text-amber-300 mt-2">{erreur}</p>}
        </div>
      )}

      {fil.length === 0 ? (
        <p className="text-micro text-slate-500 mt-4">
          Aucune publication résumée pour cette valeur.
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {fil.map((p) => (
            <li key={p.id} className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
              <div className="flex items-start justify-between gap-2">
                <span className="text-micro font-data text-slate-500">{p.date}</span>
                <div className="flex items-center gap-2 shrink-0">
                  {p.fiable === false && (
                    <span
                      className="flex items-center gap-1 text-micro text-amber-300"
                      title="Au moins un chiffre avancé par le modèle est introuvable dans le texte source : il a été retiré."
                    >
                      <AlertTriangle size={11} aria-hidden="true" /> incertain
                    </span>
                  )}
                  <button
                    onClick={() => setPublications((l) => retirerPublication(l, p.id))}
                    className="text-slate-500 hover:text-rose-400"
                    aria-label={`Supprimer le résumé du ${p.date}`}
                  >
                    <Trash2 size={12} aria-hidden="true" />
                  </button>
                </div>
              </div>

              {p.resume && <p className="text-sm text-slate-300 mt-1">{p.resume}</p>}

              {p.chiffres?.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2.5">
                  {p.chiffres.map((c, i) => (
                    <div key={i} className="rounded-lg border border-slate-800 px-2 py-1.5">
                      <div className="text-micro text-slate-500">{c.libelle}</div>
                      <div className="font-data tabular-nums text-sm text-slate-100">
                        {c.valeur}
                        {c.unite ? ` ${c.unite}` : ""}
                      </div>
                      {c.periode && <div className="text-micro text-slate-500">{c.periode}</div>}
                    </div>
                  ))}
                </div>
              )}

              {/* Les chiffres écartés sont COMPTÉS, pas cachés : c'est ce qui
                  permet de juger si le résumé mérite confiance. */}
              {p.chiffresRejetes?.length > 0 && (
                <p className="text-micro text-amber-300/80 mt-2">
                  {p.chiffresRejetes.length} chiffre(s) avancé(s) par le modèle étaient introuvables
                  dans le texte source et ont été retirés.
                </p>
              )}

              {/* Grille de critères calculée, puis interprétation rédigée :
                  les chiffres publiés remis dans l'historique de la société. */}
              <LecturePublication
                criteres={p.criteres || []}
                interpretation={p.interpretation || null}
                contexte={p.contexte || null}
                precaution={p.precaution || null}
              />

              {p.guidance && (
                <p className="text-micro mt-2">
                  <span className={tonEvolution(p.evolutionGuidance?.sens)}>
                    {libelleEvolution(p.evolutionGuidance?.sens)}
                  </span>
                  {p.guidance.texte && <span className="text-slate-400"> — {p.guidance.texte}</span>}
                </p>
              )}

              {p.trajectoire && <p className="text-micro text-slate-500 mt-2">{p.trajectoire}</p>}

              {p.risques?.length > 0 && (
                <ul className="mt-2 flex flex-col gap-0.5">
                  {p.risques.map((r, i) => (
                    <li key={i} className="text-micro text-slate-500">• {r}</li>
                  ))}
                </ul>
              )}

              {p.lien && (
                <a
                  href={p.lien}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-micro text-sky-400 hover:text-sky-300 mt-2"
                >
                  <ExternalLink size={10} aria-hidden="true" /> Document d&apos;origine
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
