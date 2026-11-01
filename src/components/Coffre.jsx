import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Lock,
  LockKeyhole,
  LogIn,
  ShieldCheck,
  Search,
  ChevronRight,
  FileText,
  Image as IconeImage,
  CalendarClock,
  SlidersHorizontal,
  LifeBuoy,
} from "lucide-react";
import { Card, PageGlow, PastilleEtat, GhostButton, CARD_THEMES } from "./ui";
import EtatVide from "./EtatVide";
import ReglagesChiffrement from "./ReglagesChiffrement";
import FormulaireDocument from "./coffre/FormulaireDocument";
import FicheDocument from "./coffre/FicheDocument";
import VueEcheances from "./coffre/VueEcheances";
import ReglagesCoffre from "./coffre/ReglagesCoffre";
import StockageCoffre from "./coffre/StockageCoffre";
import OngletsGlissants from "./OngletsGlissants";
import { useSousOnglet } from "../lib/useHashRoute";
import { useAuth } from "../lib/AuthContext";
import { useToast } from "../lib/ToastContext";
import { useConfirm } from "../lib/ConfirmContext";
import { isSupabaseConfigured } from "../lib/supabaseClient";
import {
  usePersistentState,
  useEtatChiffrement,
  cleChiffrementActive,
  verrouillerCetAppareil,
} from "../lib/storage";
import { useMaintenant } from "../lib/useMaintenant";
import { todayIso } from "../lib/finance";
import {
  COFFRE_VIDE,
  STATUTS,
  estCoffre,
  filtrerDocuments,
  organiserDocuments,
  espaceUtilise,
  formatTaille,
  echeanceEnClair,
  typeDe,
  nouveauDocument,
  normaliserSaisie,
  contratLie,
} from "../lib/coffre";
import { rangerFichier, supprimerFichiers, ErreurCoffre } from "../lib/coffreFichiers";
import { evenementAgenda, lienGoogleAgenda, fichierIcs, marquerAgenda } from "../lib/coffreAgenda";
import { fichiersPartages, oublierPartage } from "../lib/partageCoffre";

/**
 * Onglet « Coffre » : les papiers importants, chiffrés de bout en bout
 * (COFFRE_SPEC.md).
 *
 * Le coffre n'existe qu'avec un compte ET le chiffrement de Patrium actif :
 * c'est la clé de Patrium qui enveloppe la clé de chaque fichier. Tant que ce
 * n'est pas le cas, l'onglet explique ce qui manque et ouvre le réglage du
 * chiffrement existant, plutôt que d'en dupliquer l'interface.
 */

/** Offre gratuite de Supabase : 1 Go de fichiers par projet. */
const QUOTA_OCTETS = 1024 * 1024 * 1024;

const boutonPrincipal =
  "inline-flex items-center gap-2 rounded-lg bg-fuchsia-400 hover:bg-fuchsia-300 text-slate-950 text-sm font-semibold px-4 py-2 disabled:opacity-50";

export default function Coffre({ contracts = [] }) {
  const { user } = useAuth();
  const etat = useEtatChiffrement();
  const [chiffrementOuvert, setChiffrementOuvert] = useState(false);
  const ouvrirChiffrement = () => setChiffrementOuvert(true);

  let contenu;
  if (!isSupabaseConfigured || !user) {
    contenu = (
      <Prerequis icone={LogIn} titre="Connecte-toi pour ouvrir le coffre">
        <p>
          Le coffre range tes papiers dans ton espace Supabase, pour les retrouver sur ton téléphone comme sur
          ton ordinateur. Il a donc besoin de ton compte.
        </p>
      </Prerequis>
    );
  } else if (!etat.actif) {
    contenu = (
      <Prerequis
        icone={ShieldCheck}
        titre="Active d'abord le chiffrement de bout en bout"
        action={
          <button type="button" onClick={ouvrirChiffrement} className={boutonPrincipal}>
            <LockKeyhole size={16} />
            Activer le chiffrement
          </button>
        }
      >
        <p>
          Chaque papier est chiffré sur ton appareil avant de partir vers Supabase, avec une clé tirée de ta
          phrase secrète. Le serveur ne voit que des blocs illisibles : ni le nom, ni les dates, ni le
          contenu.
        </p>
        <p>
          Activer le chiffrement chiffre aussi toutes tes autres données Patrium dans le cloud. Sans la
          phrase, rien n'est récupérable : note-la en lieu sûr.
        </p>
      </Prerequis>
    );
  } else if (etat.verrouille) {
    contenu = (
      <Prerequis
        icone={Lock}
        titre="Coffre verrouillé sur cet appareil"
        action={
          <button type="button" onClick={ouvrirChiffrement} className={boutonPrincipal}>
            <LockKeyhole size={16} />
            Déverrouiller
          </button>
        }
      >
        <p>Saisis ta phrase secrète pour ouvrir le coffre et reprendre la synchronisation.</p>
        {etat.codeSecours && <p>Phrase oubliée ? Le même écran te propose ton code de secours.</p>}
      </Prerequis>
    );
  } else {
    contenu = (
      <CoffreOuvert
        userId={user.id}
        contracts={contracts}
        sansCodeSecours={!etat.codeSecours}
        onChiffrement={ouvrirChiffrement}
      />
    );
  }

  return (
    <div className="relative space-y-6">
      <PageGlow color="fuchsia" />
      {contenu}
      <ReglagesChiffrement ouvert={chiffrementOuvert} onFermer={() => setChiffrementOuvert(false)} />
    </div>
  );
}

function EnTete({ children }) {
  return (
    <div className="relative flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-2xl text-slate-50">
          Coffre <span className="text-fuchsia-300">à papiers</span>
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Tes papiers importants, chiffrés sur ton appareil avant d'être envoyés.
        </p>
      </div>
      {children}
    </div>
  );
}

function Prerequis({ icone: Icone, titre, children, action }) {
  return (
    <>
      <EnTete />
      <Card role="vedette" accent={CARD_THEMES.fuchsia}>
        <div className="flex gap-4 items-start">
          <span className="text-fuchsia-300 mt-0.5" aria-hidden="true">
            <Icone size={22} />
          </span>
          <div className="space-y-3">
            <h2 className="text-lead text-slate-100">{titre}</h2>
            <div className="text-sm text-slate-400 space-y-2">{children}</div>
            {action}
          </div>
        </div>
      </Card>
    </>
  );
}

function CoffreOuvert({ userId, contracts, sansCodeSecours = false, onChiffrement }) {
  const [valeur, setCoffre] = usePersistentState("coffre", COFFRE_VIDE);
  const coffre = estCoffre(valeur) ? valeur : COFFRE_VIDE;
  const { showToast } = useToast();
  const confirm = useConfirm();
  const maintenant = useMaintenant();
  const aujourdhui = todayIso(new Date(maintenant));
  const [recherche, setRecherche] = useState("");
  // null : fermé ; { document: null } : ajout ; { document } : modification.
  const [formulaire, setFormulaire] = useState(null);
  const [ouvertId, setOuvertId] = useState(null);
  const [onglet, setOnglet] = useSousOnglet(["documents", "echeances", "reglages"], "documents");

  const documents = coffre.documents;
  const { aTraiter, groupes } = useMemo(
    () => organiserDocuments(filtrerDocuments(documents, recherche), coffre.reglages, aujourdhui, contracts),
    [documents, recherche, coffre.reglages, aujourdhui, contracts]
  );
  const aTraiterTous = useMemo(
    () => organiserDocuments(documents, coffre.reglages, aujourdhui, contracts).aTraiter.length,
    [documents, coffre.reglages, aujourdhui, contracts]
  );
  const ouvert = documents.find((d) => d.id === ouvertId) || null;
  const espace = espaceUtilise(documents);

  // Mise à jour fonctionnelle : un document ajouté pendant qu'un autre écran
  // modifie le coffre ne doit pas écraser sa modification.
  const modifierDocuments = (f) =>
    setCoffre((c) => {
      const base = estCoffre(c) ? c : COFFRE_VIDE;
      return { ...base, documents: f(base.documents) };
    });

  /**
   * Ajout : chiffrer et envoyer le fichier, PUIS écrire les métadonnées. Un
   * échec en chemin laisse au pire un fichier chiffré sans référence, jamais
   * un document qui pointe vers un fichier absent.
   */
  const rangerTous = async (fichiers) => {
    if (fichiers.length === 0) return [];
    const cleMaitresse = await cleChiffrementActive();
    if (!cleMaitresse)
      throw new ErreurCoffre("Le coffre s'est verrouillé : saisis ta phrase secrète, puis réessaie.");
    const fiches = [];
    try {
      for (const fichier of fichiers) fiches.push(await rangerFichier({ userId, cleMaitresse, fichier }));
    } catch (e) {
      // Un envoi a échoué en route : les fichiers déjà partis n'ont plus de
      // document, on les retire plutôt que de les laisser orphelins.
      supprimerFichiers(
        userId,
        fiches.map((f) => f.id)
      ).catch(() => {});
      throw e;
    }
    return fiches;
  };

  const enregistrer = async (saisie, fichiers) => {
    const fiches = await rangerTous(fichiers);
    if (formulaire?.document) {
      const id = formulaire.document.id;
      const modifieLe = new Date().toISOString();
      modifierDocuments((liste) =>
        liste.map((d) =>
          d.id === id
            ? { ...d, ...normaliserSaisie(saisie), fichiers: [...(d.fichiers || []), ...fiches], modifieLe }
            : d
        )
      );
      showToast({
        message: fiches.length ? "Document mis à jour, fichiers ajoutés." : "Document mis à jour.",
      });
      return;
    }
    modifierDocuments((liste) => [...liste, nouveauDocument(saisie, fiches)]);
    showToast({ message: "Document chiffré et rangé dans le coffre." });
  };

  // Fichiers reçus par « Partager » : le formulaire s'ouvre avec eux. La file
  // d'attente est vidée à la fermeture, qu'ils aient été rangés ou non.
  useEffect(() => {
    let annule = false;
    fichiersPartages()
      .then((fichiers) => {
        if (!annule && fichiers.length) setFormulaire({ document: null, fichiers, partage: true });
      })
      .catch(() => {});
    return () => {
      annule = true;
    };
  }, []);

  const fermerFormulaire = () => {
    if (formulaire?.partage) oublierPartage().catch(() => {});
    setFormulaire(null);
  };

  const retirerFichier = async (doc, fichier) => {
    const ok = await confirm({
      title: `Retirer « ${fichier.nom} » ?`,
      message: `Ce fichier sera effacé du coffre. Le document « ${doc.titre} » garde ses autres fichiers.`,
      confirmLabel: "Retirer",
      danger: true,
    });
    if (!ok) return;
    modifierDocuments((liste) =>
      liste.map((d) =>
        d.id === doc.id ? { ...d, fichiers: (d.fichiers || []).filter((f) => f.id !== fichier.id) } : d
      )
    );
    try {
      await supprimerFichiers(userId, [fichier.id]);
      showToast({ message: "Fichier retiré." });
    } catch {
      showToast({
        type: "error",
        message: "Fichier retiré du document, mais il n'a pas pu être effacé du stockage.",
      });
    }
  };

  const supprimer = async (doc) => {
    const ok = await confirm({
      title: `Supprimer « ${doc.titre} » ?`,
      message:
        "Le document et son fichier seront effacés du coffre, sur tous tes appareils. C'est définitif.",
      confirmLabel: "Supprimer",
      danger: true,
    });
    if (!ok) return;
    // Les métadonnées d'abord : un échec du stockage laisse un fichier
    // orphelin, illisible et sans référence, que le ménage retrouvera.
    modifierDocuments((liste) => liste.filter((d) => d.id !== doc.id));
    setOuvertId(null);
    try {
      await supprimerFichiers(
        userId,
        (doc.fichiers || []).map((f) => f.id)
      );
      showToast({ message: "Document supprimé." });
    } catch {
      showToast({
        type: "error",
        message: "Document retiré du coffre, mais son fichier chiffré n'a pas pu être effacé du stockage.",
      });
    }
  };

  const evenementDe = (doc) =>
    evenementAgenda(doc, coffre.reglages, { aujourdhui, contrat: contratLie(doc, contracts) });

  /**
   * Ouvre Google Agenda sur le rappel pré-rempli et retient qu'il a été posé.
   * On ne peut pas savoir si l'utilisateur l'a bien enregistré : l'écran des
   * échéances permet de le rouvrir à tout moment.
   */
  const ajouterAgenda = (doc) => {
    const evt = evenementDe(doc);
    if (!evt) return;
    window.open(lienGoogleAgenda(evt), "_blank", "noopener,noreferrer");
    modifierDocuments((liste) => liste.map((d) => (d.id === doc.id ? marquerAgenda(d, evt) : d)));
  };

  const exporterIcs = () => {
    const evenements = new Map(documents.map((doc) => [doc.id, evenementDe(doc)]).filter(([, evt]) => evt));
    if (evenements.size === 0) return;
    const url = URL.createObjectURL(
      new Blob([fichierIcs([...evenements.values()])], { type: "text/calendar;charset=utf-8" })
    );
    const lien = document.createElement("a");
    lien.href = url;
    lien.download = "coffre-rappels.ics";
    document.body.appendChild(lien);
    lien.click();
    lien.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    modifierDocuments((liste) =>
      liste.map((d) => (evenements.has(d.id) ? marquerAgenda(d, evenements.get(d.id)) : d))
    );
    showToast({
      message: `${evenements.size} rappel${evenements.size > 1 ? "s" : ""} exporté${evenements.size > 1 ? "s" : ""} : importe le fichier dans ton agenda.`,
    });
  };

  const changerReglages = (f) =>
    setCoffre((c) => {
      const base = estCoffre(c) ? c : COFFRE_VIDE;
      return { ...base, reglages: f(base.reglages || COFFRE_VIDE.reglages) };
    });

  const verrouiller = async () => {
    const ok = await confirm({
      title: "Verrouiller cet appareil ?",
      message:
        "La clé de chiffrement est oubliée sur cet appareil. Ta phrase secrète sera demandée pour rouvrir le coffre, et la synchronisation de Patrium reste en pause d'ici là.",
      confirmLabel: "Verrouiller",
    });
    if (ok) verrouillerCetAppareil();
  };

  return (
    <>
      <EnTete>
        <div className="flex items-center gap-2">
          <GhostButton theme="fuchsia" icon={Lock} onClick={verrouiller}>
            Verrouiller
          </GhostButton>
          <button type="button" onClick={() => setFormulaire({ document: null })} className={boutonPrincipal}>
            <Plus size={16} />
            Ajouter
          </button>
        </div>
      </EnTete>

      {sansCodeSecours && (
        <div className="relative flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-100">
          <p className="flex items-start gap-2">
            <LifeBuoy size={16} className="shrink-0 mt-0.5" aria-hidden="true" />
            Pas encore de code de secours : si tu oublies ta phrase secrète, ton coffre sera perdu.
          </p>
          <button
            type="button"
            onClick={onChiffrement}
            className="rounded-lg border border-amber-400/50 px-3 py-1.5 text-xs text-amber-200 hover:bg-amber-400/10"
          >
            Créer un code de secours
          </button>
        </div>
      )}

      <OngletsGlissants
        className="teinte-fuchsia"
        avecPanneaux
        ariaLabel="Sections du coffre"
        actif={onglet}
        onChange={setOnglet}
        onglets={[
          { id: "documents", libelle: "Documents", icone: FileText },
          { id: "echeances", libelle: "Échéances", icone: CalendarClock, badge: aTraiterTous || undefined },
          { id: "reglages", libelle: "Réglages", icone: SlidersHorizontal },
        ]}
      />

      <div
        role="tabpanel"
        id={`panneau-${onglet}`}
        aria-labelledby={`onglet-${onglet}`}
        className="space-y-6"
      >
        {onglet === "echeances" && (
          <VueEcheances
            coffre={coffre}
            contracts={contracts}
            aujourdhui={aujourdhui}
            onAgenda={ajouterAgenda}
            onExporter={exporterIcs}
            onOuvrir={setOuvertId}
          />
        )}
        {onglet === "reglages" && (
          <>
            <ReglagesCoffre reglages={coffre.reglages} onChange={changerReglages} />
            <StockageCoffre userId={userId} coffre={coffre} setCoffre={setCoffre} />
          </>
        )}
        {onglet === "documents" &&
          (documents.length === 0 ? (
            <Card>
              <EtatVide
                picto="coffre"
                titre="Ton coffre est vide"
                action={
                  <button
                    type="button"
                    onClick={() => setFormulaire({ document: null })}
                    className={boutonPrincipal}
                  >
                    <Plus size={16} />
                    Ranger un premier papier
                  </button>
                }
              >
                Carte d'identité, attestation d'assurance, facture d'un achat sous garantie : ajoute le PDF ou
                la photo, et sa date d'échéance. Le coffre te dira quand t'en occuper.
              </EtatVide>
            </Card>
          ) : (
            <>
              <label className="relative block">
                <span className="sr-only">Rechercher dans le coffre</span>
                <Search
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={recherche}
                  onChange={(e) => setRecherche(e.target.value)}
                  placeholder="Rechercher : passeport, mutuelle, lave-linge…"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-fuchsia-400/40"
                />
              </label>

              {aTraiter.length === 0 && groupes.length === 0 && (
                <p className="text-sm text-slate-500">Aucun document ne correspond à « {recherche} ».</p>
              )}

              {aTraiter.length > 0 && (
                <Section titre="À traiter" entrees={aTraiter} onOuvrir={setOuvertId} accent />
              )}
              {groupes.map((g) => (
                <Section
                  key={g.categorie.id}
                  titre={g.categorie.libelle}
                  entrees={g.entrees}
                  onOuvrir={setOuvertId}
                />
              ))}

              <p className="text-micro text-slate-500">
                {documents.length} document{documents.length > 1 ? "s" : ""} · {formatTaille(espace)} sur 1 Go
                {espace > QUOTA_OCTETS * 0.8 && " — l'espace gratuit de Supabase arrive à sa limite"}
              </p>
            </>
          ))}
      </div>

      <FormulaireDocument
        ouvert={formulaire !== null}
        initial={formulaire?.document || null}
        contracts={contracts}
        fichiersInitiaux={formulaire?.fichiers}
        onFermer={fermerFormulaire}
        onEnregistrer={enregistrer}
      />
      <FicheDocument
        document={ouvert}
        userId={userId}
        reglages={coffre.reglages}
        aujourdhui={aujourdhui}
        contrat={ouvert ? contratLie(ouvert, contracts) : null}
        evenement={ouvert ? evenementDe(ouvert) : null}
        onAgenda={ajouterAgenda}
        onFermer={() => setOuvertId(null)}
        onModifier={(doc) => {
          setOuvertId(null);
          setFormulaire({ document: doc });
        }}
        onSupprimer={supprimer}
        onRetirerFichier={retirerFichier}
      />
    </>
  );
}

function Section({ titre, entrees, onOuvrir, accent = false }) {
  return (
    <section aria-label={titre}>
      <h2
        className={`text-micro uppercase tracking-wider mb-2 ${accent ? "text-fuchsia-300" : "text-slate-500"}`}
      >
        {titre}
      </h2>
      <ul className="rounded-2xl border border-slate-800 bg-slate-900 divide-y divide-slate-800 overflow-hidden">
        {entrees.map((e) => (
          <li key={e.doc.id}>
            <LigneDocument entree={e} onOuvrir={onOuvrir} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function LigneDocument({ entree, onOuvrir }) {
  const { doc, statut } = entree;
  const type = typeDe(doc.type);
  const image = (doc.fichiers?.[0]?.mime || "").startsWith("image/");
  const Icone = image ? IconeImage : FileText;
  const detail = echeanceEnClair(entree);
  return (
    <button
      type="button"
      onClick={() => onOuvrir(doc.id)}
      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-800/60 focus-visible:outline-none focus-visible:bg-slate-800/60"
    >
      <Icone size={18} className="text-slate-500 shrink-0" aria-hidden="true" />
      <span className="flex-1 min-w-0">
        <span className="block text-sm text-slate-100 truncate">{doc.titre}</span>
        <span className="block text-micro text-slate-500 truncate">
          {doc.titre !== type.libelle ? `${type.libelle}${detail ? " · " : ""}` : ""}
          {detail}
        </span>
      </span>
      {statut !== "aucune" && statut !== "a_jour" && (
        <PastilleEtat etat={STATUTS[statut].etat}>{STATUTS[statut].libelle}</PastilleEtat>
      )}
      <ChevronRight size={16} className="text-slate-600 shrink-0" aria-hidden="true" />
    </button>
  );
}
