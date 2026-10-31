import { useState, useEffect } from "react";
import { eur, upsertByDate, computeInvestedCapital, investedCapitalAsOf, todayIso, valeurPosition } from "./finance";
import { fetchQuotes, fetchTauxChange, fetchHistory, fetchScreen } from "./api";
import { majDividendeAuto, repartitionMensuelle, dividendesAVerifier } from "./dividendesAuto";
import { plagePour, joursManquants, reconstituer, indexerClotures, datesCotees, ABSENCE_MAX_JOURS, recalculerReleves, appliquerRecalcul } from "./rattrapage";
import { BENCHMARKS, CLES_INDICE } from "./benchmarks";
import { usePersistentState } from "./storage";
import { useToast } from "./ToastContext";

const today = () => todayIso();

/**
 * Suivi des cours du portefeuille — la partie « réseau » de l'onglet Bourse.
 *
 * Actualisation des cours et des dividendes, relevé quotidien de la valeur du
 * portefeuille et des indices, rattrapage des jours manqués et recalcul des
 * relevés. Ces ~400 lignes vivaient dans le corps de Bourse.jsx, mêlées au
 * rendu : elles n'ont pas changé, elles ont seulement été regroupées ici.
 */
export function useSuiviBourse({ bourse, setBourse, bourseHistory, setBourseHistory }) {
  const { showToast } = useToast();
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState("");
  const [dailyData, setDailyData] = usePersistentState("bourseDailyData", {});
  // Séries de cours par ticker, accumulées au fil des actualisations et
  // consommées par les sparklines du tableau de positions.
  const [seriesCours, setSeriesCours] = usePersistentState("bourseSeriesCours", {});
  const [trackLoading, setTrackLoading] = useState(false);
  const [trackError, setTrackError] = useState("");

  /**
   * Dividende par action et calendrier de détachement, depuis la source de
   * marché. Ne remplace jamais une saisie manuelle (voir dividendesAuto.js).
   * Deux appels pour tout le portefeuille, quelle que soit sa taille : les
   * ratios (dividende annoncé) et deux ans d'historique mensuel avec les
   * détachements, qui disent EN QUEL MOIS le dividende tombe.
   */
  const completerDividendes = async (symboles) => {
    const aujourdhui = todayIso();
    const [ratios, historiques] = await Promise.all([
      fetchScreen(symboles).catch(() => []),
      fetchHistory(symboles, "2y", "1mo", { dividendes: true }).catch(() => []),
    ]);
    const ratiosPar = new Map((ratios || []).map((r) => [String(r.symbole || "").toUpperCase(), r]));
    const moisPar = new Map(
      (historiques || [])
        .filter((h) => h?.ok && Array.isArray(h.dividendes))
        .map((h) => [String(h.symbol).toUpperCase(), repartitionMensuelle(h.dividendes, aujourdhui)])
    );
    if (ratiosPar.size === 0 && moisPar.size === 0) return;

    // Ce qui va changer, pour le dire : un remplissage silencieux ne se
    // distinguait pas d'un remplissage qui ne marche pas.
    const changes = (bourse.positions || [])
      .map((p) => {
        const maj = majDividendeAuto(p, ratiosPar.get(String(p.ticker || "").toUpperCase()), aujourdhui);
        return maj && "annual_dividend" in maj && Number(maj.annual_dividend) !== Number(p.annual_dividend || 0)
          ? `${p.ticker} ${eur(maj.annual_dividend, 2)}`
          : null;
      })
      .filter(Boolean);

    const avant = bourse;
    setBourse((b) => ({
      ...b,
      positions: b.positions.map((p) => {
        const cle = String(p.ticker || "").toUpperCase();
        const ratio = ratiosPar.get(cle);
        const maj = majDividendeAuto(p, ratio, aujourdhui);
        const mois = moisPar.has(cle) ? { dividendeMois: moisPar.get(cle) } : null;
        // Ligne vérifiée dès que la source a répondu pour elle, même si sa
        // valeur est manuelle ou inchangée : c'est ce qui évite de la
        // réinterroger à chaque ouverture de l'onglet.
        const verifie = (ratio && ratio.ok !== false) || mois ? { dividendeVerifieLe: aujourdhui } : null;
        return maj || mois || verifie ? { ...p, ...(maj || {}), ...(mois || {}), ...(verifie || {}) } : p;
      }),
    }));

    if (changes.length > 0) {
      showToast({
        message: `Dividende par action mis à jour : ${changes.join(", ")}.`,
        onUndo: () => setBourse(avant),
      });
    }
  };

  const refreshPrices = async () => {
    if (bourse.positions.length === 0) return;
    setRefreshing(true);
    setRefreshMsg("");
    try {
      const symbols = bourse.positions.map((p) => p.ticker);
      const quotes = await fetchQuotes(symbols);
      const newDailyData = {};
      // Copie de travail des séries existantes : elles sont complétées dans la
      // boucle ci-dessous, puis persistées en une seule écriture.
      const serieParTicker = { ...(seriesCours || {}) };
      const refreshedAt = new Date().toISOString();

      // Taux de change des devises effectivement rencontrées dans les cours
      // qu'on vient de recevoir — la devise d'une position peut changer au
      // premier rafraîchissement, quand elle n'était pas encore connue.
      const devises = [...new Set(
        quotes.filter((q) => q.ok && q.currency && q.currency !== "EUR").map((q) => q.currency)
      )];
      let tauxParDevise = {};
      if (devises.length > 0) {
        try {
          const taux = await fetchTauxChange(devises);
          tauxParDevise = Object.fromEntries(
            taux.filter((t) => t.ok).map((t) => [t.devise, t.versEuro])
          );
        } catch {
          // Échec des taux : les cours restent à jour, les positions étrangères
          // gardent leur ancien taux (ou aucun) et l'avertissement subsiste.
          tauxParDevise = {};
        }
      }

      setBourse((b) => ({
        ...b,
        // Date de dernière actualisation des cours — c'est elle qui mesure la
        // fraîcheur réelle des données affichées. Le Dashboard s'appuyait
        // auparavant sur l'historique de patrimoine, alimenté automatiquement
        // chaque jour, et affichait donc toujours « actualisé aujourd'hui »
        // même quand les cours dataient de plusieurs semaines.
        pricesUpdatedAt: refreshedAt,
        positions: b.positions.map((p) => {
          const q = quotes.find((x) => x.symbol === p.ticker);
          if (q?.ok) {
            // Compute daily variation
            if (q.previousClose && q.price) {
              newDailyData[p.ticker] = {
                changeAbs: q.price - q.previousClose,
                changePct: ((q.price - q.previousClose) / q.previousClose) * 100,
              };
            }
            /*
             * Série de cours, pour la sparkline de la ligne.
             *
             * Elle s'ACCUMULE au fil des actualisations, elle n'est pas
             * reconstituée : c'est le même parti pris que le relevé quotidien
             * du patrimoine, qui refuse d'inventer un passé qu'il n'a pas
             * observé. Un point par jour, le dernier de la journée l'emportant,
             * et soixante au maximum — au-delà, une micro-courbe de 4,5 rem ne
             * distingue plus rien.
             *
             * Conséquence assumée : la sparkline n'apparaît qu'après quelques
             * jours d'usage. Une courbe tirée d'un historique complet serait
             * disponible tout de suite, mais coûterait un appel réseau par
             * ligne à chaque ouverture de l'onglet.
             */
            if (q.price) {
              const jour = todayIso();
              const ancienne = (serieParTicker[p.ticker] || []).filter((pt) => pt.d !== jour);
              serieParTicker[p.ticker] = [...ancienne, { d: jour, p: q.price }].slice(-60);
            }
            // Devise de cotation ET taux de conversion vers l'euro. Sans ce
            // taux, un titre coté en dollars était compté à parité 1:1 dans la
            // valeur du portefeuille, la plus-value et la répartition.
            const devise = q.currency || p.currency || "EUR";
            const taux = devise === "EUR" ? 1 : tauxParDevise[devise] ?? p.fxRate ?? null;
            return {
              ...p,
              current_price: q.price,
              // Clôture de la veille CONSERVÉE sur la position : c'est elle qui
              // permet de calculer la variation du jour du portefeuille entier.
              // C'est Yahoo qui décide de ce qu'est « la veille » — vendredi pour
              // un lundi, l'avant-veille après un jour férié — ce qui évite d'avoir
              // à tenir un calendrier boursier par place.
              previousClose: q.previousClose ?? p.previousClose ?? null,
              currency: devise,
              fxRate: taux,
              fxUpdatedAt: taux != null && devise !== "EUR" ? refreshedAt : p.fxUpdatedAt ?? null,
            };
          }
          return p;
        }),
      }));
      // Mettre à jour les données persistées (fusionner avec les existantes)
      setDailyData((prev) => ({ ...prev, ...newDailyData }));
      setSeriesCours(serieParTicker);
      // Dividendes : lancés APRÈS les cours et sans les attendre — un échec
      // ici ne doit jamais faire échouer l'actualisation.
      completerDividendes(symbols);
      const failed = quotes.filter((q) => !q.ok).length;
      setRefreshMsg(failed > 0 ? `${failed} cours sur ${quotes.length} n'ont pas pu être actualisés.` : "Tous les cours ont été actualisés.");
    } catch {
      setRefreshMsg("Actualisation impossible — vérifiez votre connexion internet.");
    } finally {
      setRefreshing(false);
    }
  };

  const captureSnapshot = async (silent = false) => {
    if (!silent) { setTrackLoading(true); setTrackError(""); }
    try {
      const tickers = [...new Set(bourse.positions.map((p) => p.ticker))];
      const allSymbols = [...tickers, ...BENCHMARKS.map((b) => b.symbol)];
      const quotes = allSymbols.length > 0 ? await fetchQuotes(allSymbols) : [];
      const priceMap = {};
      const veilleMap = {};
      quotes.forEach((q) => {
        if (!q.ok) return;
        priceMap[q.symbol] = q.price;
        if (q.previousClose != null) veilleMap[q.symbol] = q.previousClose;
      });

      /*
       * La clôture de la veille est écrite sur les positions ICI aussi.
       *
       * Elle ne l'était que dans `refreshPrices`, déclenché par le bouton
       * « Actualiser les cours ». Tant qu'on ne l'avait pas pressé une fois,
       * aucune position ne portait de `previousClose` : `variationDuJour` se
       * déclarait inexploitable et la variation du jour ne s'affichait tout
       * simplement pas, sans rien dire. Or ce relevé-ci tourne tout seul au
       * montage de l'onglet, et il tient déjà les cotations en main — les
       * jeter pour les redemander plus tard n'avait aucun sens.
       */
      /*
       * Le COURS aussi, et pas seulement la veille.
       *
       * Seule la clôture de la veille était écrite ici : la variation du jour
       * rapprochait donc la veille fraîche d'un cours resté à la dernière
       * pression du bouton — parfois vieux de plusieurs jours. Le chiffre
       * affiché sous la valeur du portefeuille, et le briefing du Dashboard,
       * n'étaient alors la variation de rien. Ce relevé tient les cotations
       * du jour : il les écrit.
       */
      if (Object.keys(veilleMap).length > 0 || Object.keys(priceMap).length > 0) {
        setBourse((b) => ({
          ...b,
          ...(tickers.some((t) => priceMap[t] != null) ? { pricesUpdatedAt: new Date().toISOString() } : {}),
          positions: b.positions.map((p) =>
            veilleMap[p.ticker] != null || priceMap[p.ticker] != null
              ? {
                  ...p,
                  ...(veilleMap[p.ticker] != null ? { previousClose: veilleMap[p.ticker] } : {}),
                  ...(priceMap[p.ticker] != null ? { current_price: priceMap[p.ticker] } : {}),
                }
              : p
          ),
        }));
      }

      // Valorisation par `valeurPosition`, donc CONVERTIE en euros. L'ancien
      // calcul multipliait le cours par la quantité sans toucher au taux de
      // change : une ligne en dollars entrait dans l'instantané quotidien à
      // parité 1:1, alors que le reste de l'application la convertit. La
      // courbe de valeur et la variation du jour en héritaient.
      const valeur =
        bourse.positions.reduce(
          (sum, p) => sum + valeurPosition({ ...p, current_price: priceMap[p.ticker] ?? p.current_price }),
          0
        ) + bourse.cash_pocket;
      // Cumul des versements, dérivé du journal d'opérations — et non plus
      // `Σ quantité × PRU + cash`, qui chutait à chaque vente alors qu'aucun
      // argent n'était sorti du compte.
      const capital = investedCapitalAsOf(computeInvestedCapital(bourse), today());

      const entry = {
        date: today(),
        valeur: Math.round(valeur),
        capital: Math.round(capital),
        // Dérivé de la liste d'indices, et non réécrit à la main : c'est
        // l'énumération en dur de trois clés qui avait laissé Nasdaq, MSCI
        // Emerging et Or vides en permanence.
        ...Object.fromEntries(BENCHMARKS.map((b) => [b.cle, priceMap[b.symbol] ?? null])),
      };
      setBourseHistory((h) => upsertByDate(h, entry));

      const failed = quotes.filter((q) => !q.ok).length;
      if (failed > 0) setTrackError(`${failed} cotation(s) sur ${quotes.length} indisponible(s).`);
    } catch {
      setTrackError("Mise à jour du suivi impossible — vérifie ta connexion internet.");
    } finally {
      if (!silent) setTrackLoading(false);
    }
  };

  /**
   * Rattrapage des jours d'absence.
   *
   * Le relevé ci-dessus ne sait prendre que le jour même. Une semaine sans
   * ouvrir l'application laisse donc sept trous que rien ne comblera jamais :
   * ni le calendrier de la rétrospective, ni les courbes, ni le TWR n'ont de
   * quoi les remplir.
   *
   * On les reconstitue à partir des CLÔTURES RÉELLES et du journal d'opérations,
   * qui est daté. C'est plus juste qu'un relevé pris en séance, et cela ne
   * demande aucune infrastructure : pas de travail planifié côté serveur, donc
   * pas de clé de service capable de lire les données de tous les utilisateurs.
   */
  const rattraperHistorique = async () => {
    // Sans relevé antérieur, il n'y a pas d'absence à combler : il y a un
    // début. Reconstituer une année à partir d'un portefeuille qui n'existait
    // pas encore tracerait une ligne plate à zéro — du bruit présenté comme de
    // l'histoire.
    if (bourseHistory.length === 0) return;

    const dernier = bourseHistory.map((e) => e.date).filter(Boolean).sort().at(-1);
    const absence = Math.round(
      (new Date(`${today()}T00:00:00`) - new Date(`${dernier}T00:00:00`)) / 86400000
    );
    // Un seul jour d'écart, c'est le rythme normal : hier relevé, aujourd'hui
    // ouvert. Au-delà d'un an, ce n'est plus une absence.
    if (absence < 2 || absence > ABSENCE_MAX_JOURS) return;

    const tickers = [...new Set(bourse.positions.map((p) => p.ticker))];
    const symboles = [...tickers, ...BENCHMARKS.map((b) => b.symbol)];

    try {
      // `interval=1d` explicitement : sur une plage courte la route descendrait
      // d'elle-même en intraday, ce qui multiplierait le volume par cinquante
      // pour une information — la clôture — qu'on peut demander directement.
      const reponses = await fetchHistory(symboles, plagePour(absence), "1d");
      const clotures = indexerClotures(reponses);
      const dates = joursManquants(bourseHistory, datesCotees(clotures), today());
      const releves = reconstituer({ bourse, dates, clotures, indices: CLES_INDICE });
      if (releves.length === 0) return;

      const avant = bourseHistory;
      setBourseHistory((h) => releves.reduce(upsertByDate, h));
      showToast({
        message: `${releves.length} jour${releves.length > 1 ? "s" : ""} d'absence reconstitué${
          releves.length > 1 ? "s" : ""
        } à partir des clôtures.`,
        onUndo: () => setBourseHistory(avant),
      });
    } catch {
      // Un rattrapage qui échoue laisse l'historique tel quel. C'est un
      // confort : rien dans l'onglet n'en dépend, et une erreur affichée ici
      // ferait passer pour une panne ce qui n'est qu'une donnée absente.
    }
  };

  /**
   * Recalcul des relevés DÉJÀ enregistrés.
   *
   * Le rattrapage ci-dessus ne comble que les trous ; il ne corrige jamais un
   * point existant, et c'est voulu — un relevé pris en séance vaut mieux
   * qu'une clôture reconstituée. Sauf quand ce relevé a figé une valeur
   * fausse, ce qui est exactement ce qu'a produit le « faux creux » : après
   * une vente dont le produit n'était pas crédité en poche cash au même
   * instant, le portefeuille paraissait avoir perdu le montant de la vente.
   * Le creux est entré dans l'historique, et le rattrapage ne pouvait pas
   * l'en sortir.
   *
   * Le recalcul rejoue le journal CORRIGÉ contre les clôtures réelles, et ne
   * touche que les points dont la valeur change. Rien n'est écrit avant que
   * l'utilisateur ait vu l'écart, point par point.
   */
  const [apercuRecalcul, setApercuRecalcul] = useState(null);
  const [recalculEnCours, setRecalculEnCours] = useState(false);

  const preparerRecalcul = async () => {
    if (bourseHistory.length === 0) return;
    setRecalculEnCours(true);
    setTrackError("");
    try {
      const premier = bourseHistory.map((e) => e.date).filter(Boolean).sort()[0];
      const profondeur = Math.round(
        (new Date(`${today()}T00:00:00`) - new Date(`${premier}T00:00:00`)) / 86400000
      );
      const tickers = [...new Set(bourse.positions.map((p) => p.ticker))];
      const symboles = [...tickers, ...BENCHMARKS.map((b) => b.symbol)];
      const reponses = await fetchHistory(symboles, plagePour(Math.min(profondeur, ABSENCE_MAX_JOURS)), "1d");
      const clotures = indexerClotures(reponses);
      const changements = recalculerReleves({
        bourse,
        historique: bourseHistory,
        clotures,
        indices: CLES_INDICE,
      });
      setApercuRecalcul(changements);
    } catch {
      setTrackError("Recalcul impossible — les clôtures n'ont pas pu être récupérées.");
    } finally {
      setRecalculEnCours(false);
    }
  };

  const validerRecalcul = () => {
    if (!apercuRecalcul || apercuRecalcul.length === 0) return;
    const avant = bourseHistory;
    setBourseHistory((h) => appliquerRecalcul(h, apercuRecalcul));
    showToast({
      message: `${apercuRecalcul.length} relevé(s) recalculé(s) à partir du journal.`,
      onUndo: () => setBourseHistory(avant),
    });
    setApercuRecalcul(null);
  };

  useEffect(() => {
    const hasToday = bourseHistory.some((e) => e.date === today());
    // Une position sans clôture de veille empêche le calcul de la variation
    // du jour. Le relevé quotidien ramène justement ces clôtures : on le
    // déclenche donc aussi dans ce cas, même si le point du jour existe déjà.
    // Sinon la variation restait invisible jusqu'à ce que l'utilisateur pense
    // à presser « Actualiser les cours » — c'est-à-dire, en pratique, jamais.
    const veilleManquante = bourse.positions.some(
      (p) => p.quantity && (p.previousClose == null || !(p.previousClose > 0))
    );
    // Effet de CHARGEMENT : Relevé de performance du jour au montage :
    // `captureSnapshot` lève son propre témoin de chargement avant d'interroger
    // le réseau. C'est la définition même d'un effet — synchroniser avec un
    // système externe.
    //
    // Le rattrapage passe D'ABORD : il remonte le temps, le relevé écrit le
    // présent. Dans l'ordre inverse, le message de rattrapage arriverait après
    // le point du jour, sans qu'on sache à quoi il se rapporte.
    //
    // Plus de `set-state-in-effect` à museler ici : les deux écritures d'état
    // partent désormais d'une continuation asynchrone, pas du corps de l'effet.
    rattraperHistorique().finally(() => {
      if (!hasToday || veilleManquante) captureSnapshot(true);
    });
    // Dividendes : vérifiés tout seuls, comme les cours, et non plus
    // seulement sur « Actualiser les cours » — qu'on ne presse presque jamais
    // puisque les cours, eux, s'actualisent déjà à l'ouverture. Une fois par
    // semaine au plus : un dividende change une ou deux fois par an.
    if (dividendesAVerifier(bourse.positions, todayIso())) {
      completerDividendes([...new Set(bourse.positions.map((p) => p.ticker).filter(Boolean))]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    refreshing, refreshMsg, refreshPrices, completerDividendes,
    dailyData, seriesCours,
    trackLoading, trackError, captureSnapshot,
    apercuRecalcul, setApercuRecalcul, recalculEnCours, preparerRecalcul, validerRecalcul,
  };
}
