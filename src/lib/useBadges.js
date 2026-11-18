import { useEffect, useMemo, useRef, useState } from "react";
import { usePatrimoine } from "./PatrimoineContext";
import {
  usePersistentState, useEtatChiffrement, getLastBackupAt, estBacASable, attendreHydratationCloud,
} from "./storage";
import { controlesDonnees } from "./qualiteDonnees";
import { todayIso } from "./finance";
import {
  evaluerBadges, integrerEvaluation, leverDrapeau, annoncerBadges, ETAT_BADGES_VIDE,
} from "./badges";

/**
 * Branchement des badges sur les données de Patrium.
 *
 * `useContexteBadges` rassemble ce que lisent les conditions (lib/badges.js) ;
 * `useSuiviBadges`, monté une fois dans App, évalue en arrière-plan, retient ce
 * qui monte et annonce les déblocages à la scène de célébration — quel que soit
 * l'onglet ouvert.
 */

/** Référence stable : un `{}` neuf à chaque rendu relancerait l'évaluation sans fin. */
const SANS_DRAPEAU = Object.freeze({});

/** Délai après le démarrage : laisse le cloud livrer ses versions avant de trancher. */
const DELAI_DEMARRAGE_MS = 1500;
/** Une saisie, un import, une actualisation des cours : on attend que ça se pose. */
const DELAI_EVALUATION_MS = 800;

/** Le contexte des conditions. `etat` fournit les drapeaux (mode Ghost). */
export function useContexteBadges(etat) {
  const p = usePatrimoine();
  const [allocationTarget] = usePersistentState("allocationTarget", { bourse: 60 });
  const [ignores] = usePersistentState("abonnementsIgnores", []);
  const [avances] = usePersistentState("avances", []);
  const [historiqueSante] = usePersistentState("historiqueSante", []);
  const [recordsAnnonces] = usePersistentState("recordsAnnonces", null);
  const chiffrement = useEtatChiffrement();
  const drapeaux = etat?.drapeaux || SANS_DRAPEAU;

  // La date de la dernière sauvegarde vit hors de l'état React : elle est
  // relue à chaque recalcul, et l'export lui-même modifie toujours des données.
  return useMemo(
    () => ({
      aujourdhui: todayIso(),
      isEmpty: p.isEmpty,
      patrimoineNet: p.patrimoineNet,
      historique: p.historyPast,
      livrets: p.livrets,
      livretsTotal: p.livretsTotal,
      matelasEuros: (p.livretsTotal || 0) + (p.matelasCompteCourant || 0),
      matelasMois: p.matelasMois,
      bourse: p.bourse,
      bourseHistory: p.bourseHistory,
      bourseGainPct: p.bourseGainPct,
      bourseInvested: p.bourseInvested,
      bourseTotal: p.bourseTotal,
      allocationTarget,
      depensesMensuelles: p.profile?.monthly_expenses || 0,
      compteEnrichies: p.compteEnrichies,
      compteReleves: p.compteReleves,
      subs: p.subs,
      ignores,
      strategyNotes: p.strategyNotes,
      objectifs: p.objectifs,
      objectifsSalues: recordsAnnonces?.objectifs || [],
      scenarios: (p.simScenarios?.length || 0) + (p.horizonScenarios?.length || 0),
      avances,
      historiqueSante,
      controlesDonnees: controlesDonnees(p).length,
      chiffrement,
      derniereSauvegarde: getLastBackupAt(),
      drapeaux,
      secteursManuels: p.secteursManuels,
    }),
    // `p` change d'identité dès qu'une donnée bouge (voir PatrimoineContext).
    [p, allocationTarget, ignores, avances, historiqueSante, recordsAnnonces, chiffrement, drapeaux]
  );
}

/**
 * Évalue, retient, annonce. Le premier passage débloque tout ce qui est déjà
 * acquis en UNE célébration ; ensuite, un déblocage seul a sa propre scène, et
 * plusieurs à la fois (un import de relevé) sont regroupés.
 *
 * Rien en bac à sable : un « et si » ne débloque pas de vrai badge.
 */
export function useSuiviBadges({ ghostMode = false } = {}) {
  const [etat, setEtat] = usePersistentState("badges", ETAT_BADGES_VIDE);
  const contexte = useContexteBadges(etat);
  const [pret, setPret] = useState(false);
  // Lu par la minuterie au moment où elle se déclenche, pas à sa création.
  const etatRef = useRef(etat);
  useEffect(() => {
    etatRef.current = etat;
  }, [etat]);

  useEffect(() => {
    let annule = false;
    let minuterie = null;
    attendreHydratationCloud().then(() => {
      if (!annule) minuterie = setTimeout(() => setPret(true), DELAI_DEMARRAGE_MS);
    });
    return () => {
      annule = true;
      clearTimeout(minuterie);
    };
  }, []);

  // Le mode Ghost ne laisse aucune trace dans les données : on la garde ici.
  useEffect(() => {
    if (ghostMode && !estBacASable()) setEtat((e) => leverDrapeau(e, "fantome", todayIso()));
  }, [ghostMode, setEtat]);

  useEffect(() => {
    if (!pret || estBacASable()) return undefined;
    const t = setTimeout(() => {
      const { etat: suivant, nouveautes, premierPassage } = integrerEvaluation(
        etatRef.current,
        evaluerBadges(contexte),
        todayIso()
      );
      if (suivant === etatRef.current) return;
      setEtat(suivant);
      if (nouveautes.length) {
        annoncerBadges({ nouveautes, groupe: premierPassage || nouveautes.length > 1, premierPassage });
      }
    }, DELAI_EVALUATION_MS);
    return () => clearTimeout(t);
  }, [pret, contexte, setEtat]);

  return etat;
}
