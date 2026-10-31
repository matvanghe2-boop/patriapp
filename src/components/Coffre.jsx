import { useMemo, useState } from "react";
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
} from "lucide-react";
import { Card, PageGlow, PastilleEtat, GhostButton, CARD_THEMES } from "./ui";
import EtatVide from "./EtatVide";
import ReglagesChiffrement from "./ReglagesChiffrement";
import FormulaireDocument from "./coffre/FormulaireDocument";
import FicheDocument from "./coffre/FicheDocument";
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
} from "../lib/coffre";
import { rangerFichier, supprimerFichiers, ErreurCoffre } from "../lib/coffreFichiers";

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

export default function Coffre() {
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
      </Prerequis>
    );
  } else {
    contenu = <CoffreOuvert userId={user.id} />;
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

function CoffreOuvert({ userId }) {
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

  const documents = coffre.documents;
  const { aTraiter, groupes } = useMemo(
    () => organiserDocuments(filtrerDocuments(documents, recherche), coffre.reglages, aujourdhui),
    [documents, recherche, coffre.reglages, aujourdhui]
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
  const enregistrer = async (saisie, fichier) => {
    if (formulaire?.document) {
      const id = formulaire.document.id;
      const modifieLe = new Date().toISOString();
      modifierDocuments((liste) =>
        liste.map((d) => (d.id === id ? { ...d, ...normaliserSaisie(saisie), modifieLe } : d))
      );
      showToast({ message: "Document mis à jour." });
      return;
    }
    const cleMaitresse = await cleChiffrementActive();
    if (!cleMaitresse)
      throw new ErreurCoffre("Le coffre s'est verrouillé : saisis ta phrase secrète, puis réessaie.");
    const fiche = await rangerFichier({ userId, cleMaitresse, fichier });
    modifierDocuments((liste) => [...liste, nouveauDocument(saisie, [fiche])]);
    showToast({ message: "Document chiffré et rangé dans le coffre." });
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

      {documents.length === 0 ? (
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
            Carte d'identité, attestation d'assurance, facture d'un achat sous garantie : ajoute le PDF ou la
            photo, et sa date d'échéance. Le coffre te dira quand t'en occuper.
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
      )}

      <FormulaireDocument
        ouvert={formulaire !== null}
        initial={formulaire?.document || null}
        onFermer={() => setFormulaire(null)}
        onEnregistrer={enregistrer}
      />
      <FicheDocument
        document={ouvert}
        userId={userId}
        reglages={coffre.reglages}
        aujourdhui={aujourdhui}
        onFermer={() => setOuvertId(null)}
        onModifier={(doc) => {
          setOuvertId(null);
          setFormulaire({ document: doc });
        }}
        onSupprimer={supprimer}
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
