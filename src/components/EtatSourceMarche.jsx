import { useEffect, useState } from "react";
import { CloudOff } from "lucide-react";
import { fetchEtatSource } from "../lib/api";

/**
 * Bandeau « source de cours indisponible ».
 *
 * Sans lui, une panne de la source Yahoo se manifeste par une succession
 * d'échecs isolés — un cours qui ne se met pas à jour, une fiche entreprise
 * vide, un screener sans résultat — dont rien n'indique la cause commune.
 * L'utilisateur conclut naturellement que c'est SON portefeuille ou SON filtre
 * qui pose problème, alors qu'aucune de ses données n'est en cause.
 *
 * DEUX GARDE-FOUS, parce qu'un bandeau d'alarme qui se trompe est pire que
 * pas de bandeau du tout :
 *
 *  - il ne s'affiche qu'après DEUX vérifications négatives consécutives, pour
 *    ne pas clignoter sur un incident réseau d'une seconde ;
 *  - il disparaît de lui-même au premier retour à la normale.
 *
 * La vérification est volontairement peu fréquente : la route est mise en
 * cache 60 s côté serveur, et c'est un diagnostic, pas une donnée.
 */
const INTERVALLE_MS = 5 * 60_000;
const ECHECS_AVANT_ALERTE = 2;

export default function EtatSourceMarche() {
  const [enPanne, setEnPanne] = useState(false);

  useEffect(() => {
    let annule = false;
    let echecs = 0;

    const verifier = async () => {
      // Inutile d'interroger quoi que ce soit hors ligne : le navigateur le
      // sait déjà, et l'app affiche par ailleurs son propre état de connexion.
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;
      const etat = await fetchEtatSource();
      if (annule) return;
      echecs = etat.ok ? 0 : echecs + 1;
      setEnPanne(echecs >= ECHECS_AVANT_ALERTE);
    };

    verifier();
    const id = setInterval(verifier, INTERVALLE_MS);
    // Un retour au premier plan est le bon moment pour revérifier : c'est là
    // que l'utilisateur va constater — ou non — que les cours remontent.
    const surVisibilite = () => {
      if (document.visibilityState === "visible") verifier();
    };
    document.addEventListener("visibilitychange", surVisibilite);

    return () => {
      annule = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", surVisibilite);
    };
  }, []);

  if (!enPanne) return null;

  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/5 px-4 py-3 mb-4 text-sm"
    >
      <CloudOff size={16} className="shrink-0 mt-0.5 text-amber-300" aria-hidden="true" />
      <div className="flex flex-col gap-0.5">
        <span className="text-amber-200 font-medium">Source de cours indisponible</span>
        <span className="text-slate-400 text-[13px]">
          Les cours, fondamentaux et taux de change ne peuvent pas être actualisés pour le moment.
          Tes données ne sont pas en cause : elles sont intactes sur cet appareil, et les montants
          affichés restent ceux de la dernière actualisation réussie.
        </span>
      </div>
    </div>
  );
}
