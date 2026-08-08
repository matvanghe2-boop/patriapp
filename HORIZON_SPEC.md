# Horizon — Spécification détaillée

> Module « Simulateur » de **Patrium**. Assistant de simulation financière piloté par IA agentive.
> Statut : **jalons 1 à 6 livrés** — moteur, UI à formulaires, anonymiseur,
> registre d'outils, boucle d'orchestration, adaptateurs Gemini/Groq/Ollama,
> route `api/advisor.js`, assistant conversationnel. **488 tests.**
> Reste : jalon 7 (réglages de confidentialité + fallback B), 8 (scénarios
> sauvegardés), 9 (bilan mensuel proactif).
>
> ⚠️ **Non vérifié en conditions réelles** : aucun appel à Gemini n'a été fait
> (pas de clé). Les adaptateurs sont testés contre des `fetch` simulés.
> Placement : sous-onglet **« Projet »** de l'onglet **Simulation**, thème violet,
> chargé en `lazy` (chunk séparé de 19 kB).
> Dernière mise à jour : 2026-08-08

---

## 1. Objectif et périmètre

### Le problème

Patrium répond à « où en suis-je ? ». Il ne répond pas à « et si ? ».

Le fichier `plan_immo_2032.ods` existe précisément parce que ce besoin n'est couvert nulle part : projeter, comparer des scénarios, mesurer l'impact d'une décision sur un objectif lointain. Horizon est la version applicative de ce tableur.

### Ce que fait Horizon

Tu poses une question en langage naturel — « impact de l'achat d'une voiture à 28 000 € ? » — et l'assistant :

1. identifie les hypothèses manquantes et te les demande (ou propose des valeurs par défaut sourcées),
2. décompose la question en calculs,
3. appelle des fonctions déterministes qui produisent les chiffres,
4. compare les scénarios pertinents,
5. rend une réponse chiffrée, avec graphiques et impact explicite sur tes objectifs.

### Ce que Horizon ne fait pas

- **Aucune écriture.** Pas de création d'opération, pas de modification de position, pas de suppression. En lecture seule par construction, pas par consigne.
- **Aucun conseil en investissement personnalisé.** Ce sont des simulations sous hypothèses explicites. Disclaimer permanent dans l'UI.
- **Aucune donnée de marché en temps réel dans les projections.** Les rendements sont des hypothèses paramétrables, pas des prédictions.

### Intégration

**Sous-onglet « Projet » de l'onglet « Simulation »** existant, aux côtés de « Projection » et « Immobilier & Crédit ».

Le placement suit la logique déjà posée dans `Simulation.jsx` : projection, crédit immobilier et arbitrage de projet relèvent du même geste — projeter une décision financière dans le temps. On arrive presque toujours sur « Projet » depuis une projection d'épargne.

```
Simulation
 ├── Projection            (existant)
 ├── Immobilier & Crédit   (existant)
 └── Projet                ← Horizon
```

Réutilise l'auth Supabase, `PatrimoineContext`, le design system (`ui.jsx`, `CARD_THEMES`), recharts et le déploiement Vercel. Pas de nouveau projet, pas de nouveau domaine, pas d'entrée de menu supplémentaire.

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────┐
│  UI — onglet Simulateur (React, dans Patrium)           │
│  · fil conversationnel   · graphiques   · panneau debug │
└───────────────────────────┬─────────────────────────────┘
                            │ HTTP (SSE)
┌───────────────────────────▼─────────────────────────────┐
│  /api/advisor  (Vercel serverless)                      │
│                                                          │
│  ┌────────────────────────────────────────────────┐     │
│  │  Orchestrateur — boucle de tool use            │     │
│  └───┬───────────────────────────────────┬────────┘     │
│      │                                   │              │
│  ┌───▼──────────────┐         ┌──────────▼───────────┐  │
│  │ Adaptateur LLM   │         │  Registre d'outils   │  │
│  │ · Gemini (déf.)  │         │  (schémas JSON)      │  │
│  │ · Claude (fallb.)│         └──────────┬───────────┘  │
│  │ · Ollama (opt.)  │                    │              │
│  └──────────────────┘         ┌──────────▼───────────┐  │
│                               │  Moteur de calcul    │  │
│                               │  (pur, déterministe) │  │
│                               └──────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                            ▲
                            │ contexte anonymisé
┌───────────────────────────┴─────────────────────────────┐
│  Anonymiseur (client) — tourne AVANT tout envoi réseau  │
└───────────────────────────┬─────────────────────────────┘
                            │
                   État Patrium (localStorage / Supabase)
```

### Principe directeur

**Le modèle n'effectue aucun calcul.** Il choisit les outils, lit les résultats, rédige. Toute valeur numérique affichée à l'écran provient d'une fonction TypeScript testée. Conséquence : la justesse des chiffres est indépendante de la qualité du modèle, ce qui rend un modèle gratuit parfaitement viable.

---

## 3. Moteur de calcul

Couche pure : aucune I/O, aucune dépendance à l'IA, aucun accès à l'état global. Entrées explicites, sorties déterministes, entièrement testable.

**Cette couche a de la valeur seule** — elle alimente un simulateur à formulaires utilisable sans IA (jalon 2).

### 3.1 `simuler_credit`

```
entrées : montant, taux_annuel, duree_mois, assurance_mensuelle?, frais_dossier?
sorties : mensualite, cout_total_credit, taux_effectif_global,
          tableau_amortissement[{mois, capital, interets, restant_du}]
```

Amortissement à échéances constantes. TAEG incluant assurance et frais.

### 3.2 `cout_total_possession`

```
entrées : prix_achat, horizon_annees, categorie ("voiture" | "immobilier" | "generique"),
          overrides? { assurance_annuelle, entretien_annuel, energie_annuelle,
                       taxe_annuelle, decote_annuelle_pct }
sorties : cout_total, cout_annuel_moyen, cout_mensuel_moyen,
          valeur_residuelle, ventilation[{poste, montant, part_pct}]
```

Chaque catégorie a des valeurs par défaut **documentées et sourcées**. Toute valeur par défaut utilisée est retournée dans `hypotheses_appliquees[]` pour affichage — jamais silencieuse.

### 3.3 `cout_opportunite`

```
entrées : montant, rendement_annuel_pct, horizon_annees, inflation_pct?
sorties : valeur_future_nominale, valeur_future_reelle, manque_a_gagner
```

Répond à : « ces 28 000 € auraient donné quoi en restant investis ? »

### 3.4 `projeter_patrimoine`

```
entrées : patrimoine_initial, versement_mensuel, allocation[{classe, part}],
          horizon_annees, tirages? (défaut 1000), graine? (pour reproductibilité)
sorties : percentiles { p10, p25, p50, p75, p90 } par année,
          probabilite_objectif?, trajectoire_mediane[],
          qualite_estimation { profondeur_historique_mois, fiabilite, avertissement? }
```

Monte-Carlo, rendements log-normaux par classe d'actifs. **Graine paramétrable** : deux exécutions identiques donnent le même résultat, sinon impossible de comparer deux scénarios honnêtement.

Les couples rendement/volatilité ne sont **pas** passés en entrée : ils sont dérivés de l'historique Patrium (§3.10).

### 3.10 `estimer_rendements` — dérivation depuis l'historique Patrium

```
entrées : (aucune — lit l'historique de patrimoine net et les positions)
sorties : par classe d'actifs { rendement_annualise, volatilite_annualisee,
                                profondeur_mois, fiabilite }
          + correlations entre classes si la profondeur le permet
```

Les hypothèses de rendement sont **entièrement dérivées de tes données réelles**, pas de moyennes de marché génériques. Le relevé quotidien de patrimoine net déjà présent dans Patrium est la source.

**Le problème de la profondeur d'historique.** Une volatilité estimée sur 8 mois de données n'a pas de sens statistique : elle capture une conjoncture, pas un régime. Projeter 10 ans là-dessus produirait des intervalles de confiance faussement précis. Trois paliers :

| Profondeur | Fiabilité | Comportement |
|---|---|---|
| < 24 mois | **insuffisante** | Estimation refusée. Bascule sur la table de référence (§3.11), signalée comme telle dans l'UI et dans `hypotheses_appliquees[]`. |
| 24 – 60 mois | **indicative** | Estimation utilisée, avec avertissement affiché et intervalles élargis. |
| > 60 mois | **exploitable** | Estimation utilisée telle quelle. |

Le palier atteint est **toujours affiché** à côté de la projection. Une simulation qui ne dit pas sur quoi elle repose est pire qu'une absence de simulation.

À mesure que ton historique Patrium s'allonge, les projections gagnent mécaniquement en pertinence — sans aucune action de ta part.

### 3.11 Table de référence — mode par défaut jusqu'en 2028

**État actuel : ~1 mois d'historique Patrium.** Le palier « insuffisant » s'applique donc, et s'appliquera jusqu'à environ **août 2028** (24 mois de relevés). La table de référence n'est pas un cas limite : c'est le mode de fonctionnement nominal d'Horizon pendant ses deux premières années. Elle doit être traitée en conséquence — pas comme un bouche-trou.

| Classe d'actifs | Rendement annuel | Volatilité (σ) | Statut |
|---|---|---|---|
| Actions | **8,0 %** | 15 % | ✅ fixé |
| Obligations | **3,0 %** | 6 % | ✅ fixé |
| Monétaire / livrets | **2,5 %** | 0,5 % | ✅ fixé |
| Immobilier | **4,0 %** | 8 % | ✅ fixé |

Quatre classes, sans découpage géographique. Une maille plus fine (US / Europe / émergents) donnerait des projections plus précises, mais exigerait de fixer chaque couple à la main dès maintenant pour un bénéfice qui n'arriverait qu'en 2028, au moment où ces valeurs seront de toute façon remplacées par tes données réelles.

**Pourquoi la volatilité est indispensable.** Le Monte-Carlo tire des rendements aléatoires autour de la moyenne ; c'est σ qui détermine la largeur de la fourchette. Avec σ=0 la projection est une droite, ce qui donnerait une illusion de certitude — exactement le défaut que la simulation est censée corriger. Sur un portefeuille actions à 8 %/σ15 % sur 10 ans, l'écart P10–P90 est très large : c'est le message, pas un bug.

**Nominal, pas réel.** Les 8 % sont un rendement nominal, avant inflation. Le moteur expose systématiquement les deux vues :

- *nominal* — le montant affiché sur le relevé en 2036,
- *réel* — ce que cette somme achètera, à inflation paramétrable (défaut 2 %).

Pour un objectif comme l'achat immobilier 2032, la vue réelle est la seule qui ait un sens : la cible évolue avec les prix.

**Corrélations.** Sur portefeuille diversifié, tirer chaque classe indépendamment sous-estime le risque en cas de choc simultané. Avec la table de référence, on applique une matrice de corrélation simplifiée et documentée. Elle sera remplacée par les corrélations réelles dès que l'historique atteint 60 mois.

**Traçabilité.** Chaque valeur de cette table est affichée dans le tableau d'hypothèses avec la mention explicite **« valeur de référence — historique Patrium insuffisant (N mois / 24) »**, et reste modifiable à la main pour tester une hypothèse plus prudente ou plus optimiste.

**Transition.** À 24 mois de relevés, Horizon signale la bascule possible vers les estimations dérivées et te laisse **choisir** — pas de changement silencieux des hypothèses sous une projection que tu avais déjà interprétée.

### 3.5 `comparer_scenarios`

```
entrées : scenarios[{nom, description, hypotheses, resultat_projection}]
sorties : tableau_comparatif, ecarts_vs_reference, verdict_chiffre
```

Ne prend pas de décision. Aligne les chiffres côte à côte.

### 3.6 `impact_objectif`

```
entrées : objectif {nom, montant_cible, date_cible}, scenario_avant, scenario_apres
sorties : retard_mois, ecart_montant_a_date, nouvelle_date_atteinte,
          effort_mensuel_correctif
```

Le calcul le plus utile du lot : « cette voiture repousse ton apport immo de 7 mois ».

### 3.7 `fiscalite_enveloppe`

```
entrées : enveloppe ("PEA" | "AV" | "CTO" | "PER"), montant, plus_value, duree_detention
sorties : impot_du, prelevements_sociaux, net_apres_impot, regime_applique,
          source { url, intitule, date_consultation }
```

Barèmes en table de configuration datée, pas en dur dans le code.

**Sources officielles françaises uniquement** — `impots.gouv.fr`, `service-public.fr`, `economie.gouv.fr`, `legifrance.gouv.fr`. Chaque entrée de la table porte son URL source, l'intitulé exact du dispositif et la date de consultation. Ces trois champs remontent jusque dans l'UI : un chiffre fiscal affiché est toujours cliquable vers sa source.

Saisie manuelle, pas de scraping — ces pages changent de structure sans préavis et un parseur cassé produirait des barèmes faux en silence, ce qui est bien pire qu'un barème périmé et daté. La table est révisée dans le cycle semestriel (§10 bis).

### 3.8 `demander_hypothese`

```
entrées : question, options?[{valeur, libelle, source}], valeur_defaut_suggeree
sorties : (rend la main à l'UI — l'orchestrateur suspend la boucle)
```

Outil spécial : au lieu d'inventer un taux de crédit, l'agent demande. L'UI affiche un sélecteur, la réponse revient dans la boucle.

### 3.9 `lire_contexte`

```
entrées : (aucune)
sorties : le contexte anonymisé (section 5)
```

Lecture seule. Le seul point d'accès aux données.

---

## 4. Registre d'outils

Chaque fonction du moteur est exposée au modèle via un schéma JSON.

**La qualité des descriptions est le principal levier de performance** avec un petit modèle. Règle : chaque description dit **quand appeler** l'outil, pas seulement ce qu'il fait.

```
✗ "Calcule le coût total de possession d'un bien."
✓ "Appelle cet outil dès que l'utilisateur envisage d'acquérir un bien durable
   (véhicule, logement, équipement). Il chiffre le coût réel sur la durée de
   détention — pas seulement le prix d'achat — en incluant assurance, entretien,
   énergie, taxes et décote. À utiliser avant toute comparaison achat/location."
```

Contraintes :
- Tous les paramètres typés, avec `enum` quand les valeurs sont finies.
- Paramètres réellement obligatoires marqués `required`, les autres avec défaut documenté.
- **Aucun outil d'écriture dans le registre.** L'absence de capacité remplace le garde-fou.

---

## 5. Anonymiseur (option A)

Tourne **côté client**, avant tout appel réseau. Transforme l'état Patrium en contexte dépersonnalisé.

### Règles de transformation

| Donnée Patrium | Envoyé | Exemple |
|---|---|---|
| Solde d'un livret | Ratio en mois de dépenses | `epargne_securite: "3.2 mois"` |
| Montant du patrimoine | Ordre de grandeur normalisé | `patrimoine_base_100: 100` |
| Lignes du PEA | Classes d'actifs agrégées | `{actions_monde: 62%, oblig: 18%}` |
| Tickers détenus | *(supprimé)* | — |
| Revenus | Taux d'épargne | `taux_epargne: 0.31` |
| Date de naissance | Horizon en années | `horizon_retraite: 27` |
| Nom, e-mail, ID | *(supprimé)* | — |
| Objectifs | Nom générique + horizon + ratio | `{type:"immobilier", dans:6, cible_x_patrimoine:1.4}` |

### Base 100

Tous les montants normalisés sur une base : le patrimoine net actuel vaut 100. Les résultats reviennent en base 100 et sont **re-multipliés côté client** avant affichage. Le modèle raisonne sur des proportions justes sans jamais voir un euro.

Une fuite du contexte anonymisé révèle : une répartition d'actifs et des ratios. Rien d'exploitable, rien de nominatif.

### Panneau de transparence

Bouton **« Voir ce qui est envoyé »**, toujours accessible, affichant le payload JSON exact de la dernière requête. C'est ce qui rend l'option A vérifiable plutôt que déclarative — dans l'esprit du « vérifie toi-même » de YouTube Wrapped.

### Fallback B

Réglage `advisor.send_real_amounts`, **désactivé par défaut**, dans les paramètres de confidentialité :

- écran de consentement explicite au premier activation,
- bandeau visible dans l'UI tant qu'il est actif,
- mention dans le tableau « Où vont tes données » du README,
- réversible à tout moment.

---

## 6. Adaptateur LLM

### Interface

Un contrat unique, N implémentations :

```
envoyer(messages, outils, options) → { type: "appel_outil", outils[] }
                                   | { type: "texte", contenu }
```

L'orchestrateur ne connaît que ce contrat. Changer de fournisseur = changer une variable d'environnement.

### Règle absolue : aucun modèle payant

**Horizon n'appelle jamais une IA facturée à l'usage.** Pas de Claude API, pas d'OpenAI, pas de quelque fournisseur payant que ce soit — ni par défaut, ni en fallback, ni derrière un bouton.

Cette contrainte est **structurelle, pas configurable** : aucun adaptateur payant n'est écrit, aucune variable d'environnement ne peut en activer un. Le coût d'exécution d'Horizon est de zéro euro, par construction.

### Fournisseur par défaut : Gemini

- Modèle : famille **Flash** (rapide, free tier, function calling natif).
- Clé API en variable d'environnement Vercel, **jamais dans le bundle client**.
- Tous les appels passent par `/api/advisor`.
- ⚠️ Les quotas du free tier évoluent : **à vérifier avant implémentation**, et à afficher dans l'UI (« X requêtes restantes aujourd'hui »).

### Chaîne de repli — gratuite uniquement

Bascule en cascade, sans jamais quitter le gratuit :

```
Gemini Flash (défaut)
      │ quota épuisé, ou 2 échecs JSON consécutifs
      ▼
Groq (free tier, modèles ouverts)
      │ quota épuisé, ou indisponible
      ▼
Ollama en local (illimité, si serveur joignable)
      │ indisponible
      ▼
Mode dégradé : simulateur à formulaires (jalon 2)
```

Le **mode dégradé** est le filet de sécurité qui rend la contrainte tenable : quand plus aucun modèle gratuit n'est disponible, Horizon retombe sur le simulateur à formulaires. Tu perds la question en langage naturel, tu gardes tous les calculs. C'est précisément pourquoi le jalon 2 précède l'IA.

Le fournisseur ayant servi la réponse est **toujours indiqué** dans l'UI.

### Ollama en local

Promu de « optionnel » à **maillon de la chaîne de repli** (jalon 6). Nécessite un serveur Ollama joignable. Double intérêt : réserve illimitée quand les quotas sont épuisés, et confidentialité intégrale — dans ce mode, la promesse « aucune donnée ne sort » de Patrium reste littéralement vraie.

---

## 7. Boucle d'orchestration

```
1. Réception : question utilisateur + contexte anonymisé
2. Construction du prompt système (rôle, contraintes, disclaimer, format attendu)
3. Boucle :
     a. appel LLM avec l'historique + les schémas d'outils
     b. si réponse = appel(s) d'outil :
          - valider les paramètres contre le schéma
          - exécuter les fonctions du moteur (en parallèle si indépendantes)
          - journaliser {outil, entrées, sorties} pour le panneau debug
          - réinjecter les résultats, continuer
     c. si réponse = texte : sortir
     d. garde-fou : max 12 itérations
4. Renvoyer : texte + journal des appels + données brutes pour les graphiques
```

### Points de conception

- **Streaming SSE.** Un tour complet peut durer 20 à 60 s. L'UI affiche la progression : « calcul du crédit… », « projection sur 10 ans… ».
- **Suspension sur `demander_hypothese`.** La boucle s'arrête, l'UI pose la question, la réponse relance la boucle avec l'historique intact.
- **Validation stricte des paramètres** avant exécution. Un paramètre hors schéma renvoie une erreur au modèle plutôt que de planter — il corrige au tour suivant.
- **Les données brutes remontent au client.** L'utilisateur voit des graphiques, pas seulement de la prose.

### Prompt système — principes

Court et précis. Il définit : le rôle, l'obligation de passer par les outils pour tout chiffre, l'interdiction d'inventer une hypothèse sans le signaler, le format de réponse attendu (verdict d'abord, détail ensuite), et le rappel qu'il s'agit de simulations.

---

## 8. Interface

### Écran principal

```
┌──────────────────────────────────────────────────────┐
│ Simulateur                    [Voir ce qui est envoyé]│
├──────────────────────────────────────────────────────┤
│                                                       │
│  Suggestions :                                        │
│  · Impact d'un achat immobilier en 2032               │
│  · Rembourser mon crédit ou investir ?                │
│  · Et si je passe à 4 jours par semaine ?             │
│                                                       │
│  ┌─────────────────────────────────────────────┐     │
│  │ Pose ta question…                            │     │
│  └─────────────────────────────────────────────┘     │
│                                                       │
│  ── Réponse ──────────────────────────────────       │
│  Verdict chiffré en une phrase                        │
│  [Graphique comparatif de scénarios]                  │
│  [Tableau des hypothèses appliquées — modifiables]    │
│  Détail du raisonnement                               │
│                                                       │
│  ▸ Journal des calculs (repliable)                    │
│                                                       │
│  Simulations sous hypothèses. Pas un conseil en       │
│  investissement.                                      │
└──────────────────────────────────────────────────────┘
```

### Éléments clés

- **Hypothèses modifiables.** Chaque hypothèse retenue s'affiche avec sa source et se change d'un clic → recalcul immédiat, sans repasser par le modèle (les outils sont déterministes).
- **Journal des calculs.** Chaque appel d'outil avec ses entrées et sorties. Auditable.
- **Scénarios sauvegardés.** Un scénario intéressant se garde et se compare plus tard.

---

## 9. Sécurité et confidentialité

| Risque | Mitigation |
|---|---|
| Fuite de données financières | Anonymisation côté client + panneau de transparence |
| Modification non voulue des données | Aucun outil d'écriture exposé — absence de capacité |
| Injection de prompt | Le contexte est généré par ton code, pas par une saisie libre ; les outils valident leurs paramètres |
| Chiffres hallucinés | Le modèle ne calcule pas ; toute valeur vient d'une fonction testée |
| Dépense API surprise | **Impossible** — aucun adaptateur payant n'existe dans le code |
| Indisponibilité de tous les modèles gratuits | Mode dégradé : simulateur à formulaires, tous les calculs restent accessibles |
| Projection sur un historique trop court | Paliers de fiabilité (§3.10), estimation refusée sous 24 mois, avertissement affiché |
| Barème fiscal périmé | Date de consultation affichée à côté de chaque chiffre ; revue semestrielle |
| Clé API exposée | Serveur uniquement, variable d'environnement Vercel |
| Confusion simulation / conseil | Disclaimer permanent, hypothèses toujours visibles |

---

## 10. Jalons

| # | Livrable | Dépend de | Valeur seule |
|---|---|---|---|
| **1** | ✅ **LIVRÉ** — Moteur de calcul (§3) + 75 tests unitaires | — | ✅ Socle réutilisable |
| **2** | ✅ **LIVRÉ** — Sous-onglet « Projet » à formulaires, sans IA (14 tests) | 1 | ✅ **Produit utilisable** |
| **3** | ✅ **LIVRÉ** — Anonymiseur base 100 + audit + panneau de transparence (43 tests) | — | ✅ Renforce la confiance |
| **4** | ✅ **LIVRÉ** — Adaptateur Gemini + registre d'outils + boucle + route serveur (60 tests) | 1, 3 | — |
| **5** | ✅ **LIVRÉ** — UI conversationnelle + journal des calculs (13 tests) | 2, 4 | ✅ Horizon complet |
| **6** | ✅ **LIVRÉ** — Chaîne de repli gratuite : Groq + Ollama + mode dégradé | 4 | ✅ Robustesse |
| **7** | Réglages de confidentialité + fallback B | 4 | ✅ Contrôle |
| **8** | Scénarios sauvegardés + comparaison différée | 5 | ✅ Rétention |
| **9** | Mode proactif : bilan mensuel automatique | 5 | ✅ Rétention |

**Point de sortie sûr après le jalon 2** : si l'IA déçoit, tu as quand même un simulateur financier fonctionnel.

---

## 10 bis. Cycle de révision semestriel

Toutes les valeurs paramétriques sont regroupées dans un dossier de configuration unique, chaque entrée portant `{ valeur, source_url, date_consultation }`.

**Tous les 6 mois**, une révision manuelle passe en revue :

| Table | Source | Note |
|---|---|---|
| Coûts de possession (entretien, assurance, énergie, décote) | Sources publiques sectorielles | Par catégorie de bien |
| Barèmes fiscaux (IR, PFU, plafonds PEA/PER/AV, PS) | **Sites officiels `.gouv.fr`** | §3.7 |
| Taux de crédit moyens de référence | Sources publiques | Hypothèse par défaut, toujours modifiable |
| Quotas et modèles des fournisseurs gratuits | Docs fournisseurs | Gemini, Groq |

| Table de référence rendement/volatilité (§3.11) | Ton arbitrage | **Tant que l'historique < 24 mois**, soit jusqu'à ~août 2028 |

Une fois les 24 mois atteints et la bascule acceptée, les rendements sortent de ce cycle : ils sont alors recalculés en continu depuis ton historique Patrium (§3.10).

**Mécanisme de rappel.** Patrium te rappelle déjà d'exporter tes données au bout de 30 jours — même principe : un bandeau discret s'affiche quand une table dépasse 6 mois depuis sa dernière consultation. Aucune vérification automatique, aucun réseau : juste une comparaison de dates.

Une valeur périmée n'est jamais bloquante. Elle est **signalée** dans `hypotheses_appliquees[]` avec sa date, et reste modifiable à la main dans le tableau d'hypothèses.

---

## 11. Points ouverts

1. **Quotas Gemini et Groq** — à vérifier avant le jalon 4, puis à chaque revue semestrielle. Si Gemini se révèle trop serré à l'usage, l'ordre de la chaîne de repli s'inverse sans réécriture.
2. **Matrice de corrélation simplifiée** (§3.11) — les coefficients entre les quatre classes restent à poser. Peu sensible en pratique tant que ton allocation est concentrée ; à traiter au jalon 1.

Les autres questions sont tranchées (§12). **La spec est validée et prête pour l'implémentation.**

---

## 12. Décisions actées

- Intégration dans **Patrium**, pas de site autonome.
- **Option A** (anonymisation) par défaut, **fallback B** (montants réels) sur opt-in explicite.
- **Aucune IA payante, jamais** — contrainte structurelle, pas configurable.
- **Gemini free tier** par défaut, puis Groq, puis Ollama, puis mode dégradé.
- **Lecture seule**, sans exception.
- Le moteur de calcul précède l'IA — pas l'inverse.
- **Barèmes fiscaux** : saisie manuelle depuis les sources officielles `.gouv.fr`, chaque entrée datée et sourcée.
- **Rendements par classe d'actifs** : entièrement dérivés de l'historique Patrium, avec paliers de fiabilité — **mais table de référence en vigueur jusqu'à ~août 2028** (1 mois d'historique aujourd'hui). Actions fixées à **8 % / σ 15 %**.
- **Double vue nominal / réel** sur toute projection, inflation par défaut 2 %.
- **Quatre classes d'actifs** : actions, obligations, monétaire, immobilier. Pas de découpage géographique.
- **Valeurs par défaut** : revue manuelle tous les 6 mois, rappel par bandeau.
- **`plan_immo_2032.ods`** : ressaisie manuelle des hypothèses, pas d'import automatique.
