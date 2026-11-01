import { useEffect, useState } from "react";
import { HardDrive, Cloud, Archive, Download, Upload, Trash2, Search } from "lucide-react";
import { Card } from "../ui";
import { useToast } from "../../lib/ToastContext";
import { useConfirm } from "../../lib/ConfirmContext";
import { cleChiffrementActive } from "../../lib/storage";
import { formatTaille, espaceUtilise, estCoffre, COFFRE_VIDE } from "../../lib/coffre";
import {
  listerFichiersCloud,
  orphelinsDuStockage,
  supprimerFichiers,
  octetsChiffres,
} from "../../lib/coffreFichiers";
import {
  horsLigneActif,
  reglerHorsLigne,
  contenuCache,
  viderCache,
  retirerDuCache,
} from "../../lib/coffreCache";
import { creerArchive, restaurerArchive, nomArchive, fusionnerCoffres } from "../../lib/coffreArchive";

/**
 * Sous-onglet « Réglages » du coffre, seconde moitié : ce qui touche aux
 * fichiers eux-mêmes (COFFRE_SPEC.md, jalon 5).
 *
 *  · sur cet appareil : fichiers gardés, chiffrés, pour la consultation hors
 *    ligne ;
 *  · dans le stockage : espace occupé, et ménage des fichiers orphelins ;
 *  · archive de sauvegarde : tout le coffre en un fichier illisible sans la
 *    clé, à ranger où l'on veut, et à restaurer si des fichiers disparaissent.
 */

const BOUTON =
  "inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:border-fuchsia-400/60 disabled:opacity-40 disabled:cursor-not-allowed";

/** Offre gratuite de Supabase : 1 Go de fichiers. */
const QUOTA_OCTETS = 1024 * 1024 * 1024;

const pourcent = (fait, total) => (total ? `${fait}/${total}` : "");

async function cleOuErreur() {
  const cle = await cleChiffrementActive();
  if (!cle) throw new Error("Le coffre s'est verrouillé : saisis ta phrase secrète, puis réessaie.");
  return cle;
}

export default function StockageCoffre({ userId, coffre, setCoffre }) {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [enCours, setEnCours] = useState(null); // libellé de l'opération en cours
  const [horsLigne, setHorsLigne] = useState(horsLigneActif);
  const [cache, setCache] = useState(null);
  const [verification, setVerification] = useState(null);

  const references = new Set(coffre.documents.flatMap((d) => (d.fichiers || []).map((f) => f.id)));
  const espace = espaceUtilise(coffre.documents);

  const relireCache = () => contenuCache().then(setCache);
  useEffect(() => {
    let annule = false;
    contenuCache().then((c) => {
      if (!annule) setCache(c);
    });
    return () => {
      annule = true;
    };
  }, []);

  /** Lance une opération longue : un seul à la fois, avec son libellé, et l'erreur en toast. */
  const executer = async (libelle, action) => {
    setEnCours(libelle);
    try {
      await action();
    } catch (e) {
      showToast({ type: "error", message: e?.message || "L'opération n'a pas abouti." });
    } finally {
      setEnCours(null);
    }
  };

  // ─── Sur cet appareil ─────────────────────────────────────────────────────

  const changerHorsLigne = (actif) => {
    reglerHorsLigne(actif);
    setHorsLigne(actif);
  };

  const toutGarder = () =>
    executer("Copie sur l'appareil…", async () => {
      const presents = new Set((await contenuCache()).map((c) => c.id));
      const manquants = [...references].filter((id) => !presents.has(id));
      for (const [i, id] of manquants.entries()) {
        setEnCours(`Copie sur l'appareil… ${pourcent(i + 1, manquants.length)}`);
        await octetsChiffres(userId, id);
      }
      // Les fichiers d'anciens documents n'ont plus rien à faire ici.
      await retirerDuCache([...presents].filter((id) => !references.has(id)));
      await relireCache();
      showToast({ message: "Tous les fichiers du coffre sont consultables sans réseau sur cet appareil." });
    });

  const viderAppareil = async () => {
    const ok = await confirm({
      title: "Vider les fichiers de cet appareil ?",
      message: "Ils restent dans le coffre ; ils seront retéléchargés à la prochaine ouverture.",
      confirmLabel: "Vider",
    });
    if (!ok) return;
    await viderCache();
    await relireCache();
  };

  // ─── Stockage ─────────────────────────────────────────────────────────────

  const verifier = () =>
    executer("Vérification du stockage…", async () => {
      const fichiers = await listerFichiersCloud(userId);
      setVerification({
        fichiers,
        orphelins: orphelinsDuStockage(coffre.documents, fichiers),
        manquants: [...references].filter((id) => !fichiers.some((f) => f.id === id)),
      });
    });

  const effacerOrphelins = async () => {
    const { orphelins } = verification;
    const ok = await confirm({
      title: `Effacer ${orphelins.length} fichier${orphelins.length > 1 ? "s" : ""} orphelin${orphelins.length > 1 ? "s" : ""} ?`,
      message:
        "Aucun document du coffre ne les référence : ce sont des restes d'envois interrompus ou de suppressions inachevées. Ils seront effacés du stockage.",
      confirmLabel: "Effacer",
      danger: true,
    });
    if (!ok) return;
    executer("Ménage…", async () => {
      await supprimerFichiers(
        userId,
        orphelins.map((o) => o.id)
      );
      setVerification(null);
      showToast({ message: "Stockage nettoyé." });
    });
  };

  // ─── Archive ──────────────────────────────────────────────────────────────

  const exporter = () =>
    executer("Préparation de l'archive…", async () => {
      const cleMaitresse = await cleOuErreur();
      const texte = await creerArchive({
        userId,
        cleMaitresse,
        coffre,
        surProgression: (fait, total) => setEnCours(`Préparation de l'archive… ${pourcent(fait, total)}`),
      });
      const url = URL.createObjectURL(new Blob([texte], { type: "application/json" }));
      const lien = document.createElement("a");
      lien.href = url;
      lien.download = nomArchive();
      document.body.appendChild(lien);
      lien.click();
      lien.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast({
        message: `Archive enregistrée (${formatTaille(texte.length)}). Range-la où tu veux : elle est illisible sans ta clé.`,
      });
    });

  const restaurer = async (fichier) => {
    if (!fichier) return;
    const ok = await confirm({
      title: "Restaurer cette archive ?",
      message:
        "Les documents qui manquent dans le coffre reviendront, et les fichiers absents du stockage y seront renvoyés. Rien de ce qui existe déjà n'est écrasé.",
      confirmLabel: "Restaurer",
    });
    if (!ok) return;
    executer("Restauration…", async () => {
      const cleMaitresse = await cleOuErreur();
      const resultat = await restaurerArchive({
        userId,
        cleMaitresse,
        texte: await fichier.text(),
        coffreActuel: coffre,
        surProgression: (fait, total) => setEnCours(`Restauration… ${pourcent(fait, total)}`),
      });
      // Fusion refaite sur l'état le plus récent : le coffre a pu changer pendant les envois.
      setCoffre((c) => fusionnerCoffres(estCoffre(c) ? c : COFFRE_VIDE, resultat.coffreArchive).coffre);
      setVerification(null);
      const { documentsRestaures: d, fichiersRenvoyes: f, fichiersIntrouvables: x } = resultat;
      showToast({
        type: x ? "error" : undefined,
        message:
          d || f
            ? `${d} document${d > 1 ? "s" : ""} restauré${d > 1 ? "s" : ""}, ${f} fichier${f > 1 ? "s" : ""} renvoyé${f > 1 ? "s" : ""}${x ? `, ${x} introuvable${x > 1 ? "s" : ""} dans l'archive` : ""}.`
            : "Rien à restaurer : le coffre contient déjà tout ce que l'archive contient.",
      });
    });
  };

  const tailleCache = (cache || []).reduce((s, c) => s + c.taille, 0);
  const gardes = (cache || []).filter((c) => references.has(c.id)).length;

  return (
    <>
      <Card>
        <h2 className="flex items-center gap-2 text-lead text-slate-100">
          <HardDrive size={18} aria-hidden="true" /> Sur cet appareil
        </h2>
        <label className="mt-3 flex items-start gap-3 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={horsLigne}
            onChange={(e) => changerHorsLigne(e.target.checked)}
            className="mt-1 accent-fuchsia-400"
          />
          <span>
            Garder les fichiers sur cet appareil pour les consulter sans réseau
            <span className="block text-micro text-slate-500">
              Ils y restent chiffrés, comme dans le stockage : sans ta clé, ils sont illisibles. Chaque
              fichier ouvert ou rangé est gardé.
            </span>
          </span>
        </label>
        <p className="mt-3 text-micro text-slate-500">
          {cache === null
            ? "…"
            : `${gardes} fichier${gardes > 1 ? "s" : ""} sur ${references.size} gardé${gardes > 1 ? "s" : ""} ici · ${formatTaille(tailleCache)}`}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={toutGarder}
            disabled={!!enCours || !horsLigne || references.size === 0}
            className={BOUTON}
          >
            <Download size={14} aria-hidden="true" />
            Tout garder maintenant
          </button>
          <button
            type="button"
            onClick={viderAppareil}
            disabled={!!enCours || !cache?.length}
            className={BOUTON}
          >
            <Trash2 size={14} aria-hidden="true" />
            Vider cet appareil
          </button>
        </div>
      </Card>

      <Card>
        <h2 className="flex items-center gap-2 text-lead text-slate-100">
          <Cloud size={18} aria-hidden="true" /> Stockage
        </h2>
        <p className="mt-1 text-sm text-slate-400">
          {formatTaille(espace)} sur 1 Go (offre gratuite de Supabase)
          {espace > QUOTA_OCTETS * 0.8 && " : la limite approche."}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" onClick={verifier} disabled={!!enCours} className={BOUTON}>
            <Search size={14} aria-hidden="true" />
            Vérifier le stockage
          </button>
          {verification && (
            <span className="text-micro text-slate-400" role="status">
              {verification.fichiers.length} fichier{verification.fichiers.length > 1 ? "s" : ""} dans le
              stockage · {verification.orphelins.length} orphelin
              {verification.orphelins.length > 1 ? "s" : ""}
              {verification.orphelins.length > 0 &&
                ` (${formatTaille(verification.orphelins.reduce((s, o) => s + o.taille, 0))})`}
              {verification.manquants.length > 0 &&
                ` · ${verification.manquants.length} manquant${verification.manquants.length > 1 ? "s" : ""} : restaure une archive pour ${verification.manquants.length > 1 ? "les" : "le"} retrouver`}
            </span>
          )}
          {verification?.orphelins.length > 0 && (
            <button
              type="button"
              onClick={effacerOrphelins}
              disabled={!!enCours}
              className={`${BOUTON} border-rose-500/40 text-rose-300`}
            >
              <Trash2 size={14} aria-hidden="true" />
              Effacer les orphelins
            </button>
          )}
        </div>
      </Card>

      <Card>
        <h2 className="flex items-center gap-2 text-lead text-slate-100">
          <Archive size={18} aria-hidden="true" /> Archive de sauvegarde
        </h2>
        <p className="mt-1 text-sm text-slate-400">
          Tout le coffre, documents et fichiers, en un seul fichier chiffré. Range-le hors de Supabase (clé
          USB, Drive) : si des fichiers disparaissaient du stockage, il les rendrait. Il ne s'ouvre qu'avec ta
          clé, par ta phrase ou ton code de secours.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={exporter}
            disabled={!!enCours || coffre.documents.length === 0}
            className={BOUTON}
          >
            <Download size={14} aria-hidden="true" />
            Exporter l'archive
          </button>
          <label className={`${BOUTON} cursor-pointer ${enCours ? "pointer-events-none opacity-40" : ""}`}>
            <Upload size={14} aria-hidden="true" />
            Restaurer une archive
            <input
              type="file"
              accept=".json,application/json"
              aria-label="Archive à restaurer"
              className="sr-only"
              disabled={!!enCours}
              onChange={(e) => {
                restaurer(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
        </div>
      </Card>

      {enCours && (
        <p role="status" className="text-sm text-fuchsia-300">
          {enCours}
        </p>
      )}
    </>
  );
}
