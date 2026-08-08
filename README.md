# 📊 Patrium

Dashboard personnel de gestion de patrimoine et de simulation financière.

## Où vont tes données

C'est la question la plus importante pour une app de ce type, donc autant y répondre en premier et sans détour.

| Donnée | Où elle est stockée | Qui peut la lire |
| --- | --- | --- |
| Livrets, positions, opérations, historique, abonnements… | `localStorage` du navigateur **et**, si tu as un compte, table `kv_store` de ta base Supabase | Toi seul — la sécurité au niveau ligne (RLS) de Supabase restreint chaque ligne à son propriétaire |
| E-mail + mot de passe | Supabase Auth | Toi seul |
| Tickers que tu consultes | Envoyés à **Yahoo Finance** (via `/api/*`) pour récupérer les cours | Yahoo |
| Descriptions d'entreprises (texte public fourni par Yahoo) | Envoyées à un endpoint public de **Google Translate** pour l'affichage en français | Google |
| Questions posées à l'assistant du sous-onglet **Projet**, accompagnées d'un contexte **anonymisé** : répartition en pourcentages, taux d'épargne, mois d'épargne de sécurité. Aucun montant, aucun nom de compte, aucun ticker. | Envoyées au fournisseur de modèle configuré — **Gemini** par défaut, sinon Groq, sinon Ollama | Le fournisseur configuré, ou personne du tout avec Ollama, qui tourne en local |

Ce qui n'est **jamais** envoyé nulle part : tes montants, tes soldes, tes quantités détenues, ton PRU, tes revenus. Les endpoints `/api/*` ne reçoivent que des symboles boursiers (`AI.PA`, `CW8.PA`…), jamais une position.

**Une exception, et elle est sous ton contrôle.** Le sous-onglet Projet propose un réglage « montants réels », **désactivé par défaut**, qui transmet tes montants en euros au lieu de les normaliser en base 100. Il ne s'active que derrière un écran de consentement, affiche un bandeau permanent tant qu'il est actif, et se désactive en un clic sans confirmation. Même dans ce mode, aucun nom de compte, ticker, ISIN ni identifiant ne part : le mode change l'unité des montants, pas le périmètre de ce qui est envoyé. Le bouton « Voir ce qui est envoyé » affiche à tout moment la charge utile exacte.

Sans clé de fournisseur configurée, l'assistant ne s'affiche pas et le sous-onglet Projet fonctionne entièrement dans le navigateur, via ses formulaires.

Sans configuration Supabase, l'app fonctionne en **mode local pur** : rien ne sort du navigateur, à part les tickers ci-dessus.

⚠️ La synchronisation Supabase n'est **pas une sauvegarde** : une suppression se propage sur tous les appareils. L'export JSON (menu latéral) reste la seule vraie copie de secours — l'app te le rappelle si tu n'en as pas fait depuis 30 jours.

« Réinitialiser » efface les données **locales et cloud** : sur un compte connecté, l'effacement se propage donc à tous tes appareils.

## Ce que contient l'app

L'application démarre **vide** : aucun patrimoine fictif n'est préchargé. Un bouton « Charger un jeu d'exemple » est proposé sur le Dashboard tant que rien n'est saisi, et il annonce clairement que ses chiffres sont inventés.

- **Dashboard** — patrimoine brut/net, plus-value latente, taux d'épargne, allocation d'actifs, historique du patrimoine net (relevé automatique une fois par jour), variation sur 30 jours glissants, projection à 6 mois capitalisée au taux moyen pondéré du patrimoine
- **Livrets & Épargne** — suivi des supports à capital garanti, plafonds, matelas de sécurité, enveloppes de ventilation
- **PEA & Bourse** — positions, plus/moins-values, recherche par **ticker, ISIN ou nom**, actualisation des cours, import PDF de relevés de courtage, watchlist, heatmap sectorielle, calendrier financier
- **Simulation** — intérêts composés sur l'ensemble du patrimoine (poche Livrets + poche Bourse, chacune avec son taux et son versement), scénarios comparables
- **Immobilier & Crédit** — sous-onglet de Simulation : apport, mensualités sur 15/20/25 ans, alerte taux d'endettement (norme HCSF 35 %), suivi des travaux
- **Stratégie & Logs** — journal des thèses d'investissement, timeline des jalons, opérations
- **Abonnements** — dépenses récurrentes, contrats et échéances de résiliation
- **Sauvegarde** — export/import JSON depuis le menu latéral

### Sur mobile

L'app est installable (PWA) et pensée pour le téléphone : navigation par **barre basse** atteignable au pouce, en-tête qui se condense au défilement pour garder le patrimoine net visible, et **tableaux transformés en cartes empilées** sous 768 px — plus aucun défilement horizontal.

### Mode Ghost

Le bouton en forme d'œil floute tous les montants, y compris les graduations des graphiques, pour pouvoir montrer son écran sans exposer ses chiffres. Survoler une valeur la révèle temporairement. Les graphiques de données publiques (performance sectorielle) ne sont pas floutés.

## Stack technique

- **Frontend** : React 18 + Vite + Tailwind CSS, `recharts` pour les graphiques, `lucide-react` pour les icônes
- **Backend** : fonctions serverless Vercel dans `api/` (aucun framework) — cours, recherche, historique, calendrier, fiche entreprise, analyse de PDF
- **Auth & synchronisation** : Supabase (Postgres + Auth), optionnel
- **Stockage** : `localStorage` en cache local systématique, Supabase en miroir si un compte est connecté
- **Tests** : Vitest — `npm test`

### Scripts

```bash
npm run dev        # serveur de développement Vite
npm run build      # build de production
npm test           # tests unitaires
npm run lint       # ESLint
npm run format     # Prettier
npm run verify     # lint + tests + build (ce que fait la CI)
```

---

## 🚀 Déploiement sur Vercel

C'est la façon la plus simple d'avoir un vrai site avec les cours de bourse fonctionnels (les fonctions de `api/` ne tournent que sur Vercel ou via `vercel dev`, pas avec un simple `npm run dev`).

### 1. Pousser le projet sur GitHub

```bash
git init
git add .
git commit -m "Initial commit — Patrium"
```

Crée un dépôt vide sur [github.com/new](https://github.com/new), puis :

```bash
git remote add origin https://github.com/<ton-pseudo>/<nom-du-repo>.git
git branch -M main
git push -u origin main
```

### 2. Importer le projet sur Vercel

1. Va sur [vercel.com/new](https://vercel.com/new)
2. Sélectionne le dépôt
3. Vercel détecte **Vite** automatiquement
4. Renseigne les variables d'environnement (section suivante), puis **Deploy**

À chaque `git push` sur `main`, Vercel redéploie. Le workflow GitHub Actions (`.github/workflows/ci.yml`) lance lint + tests + build sur chaque push et chaque pull request.

### 3. Variables d'environnement

| Variable | Obligatoire | Rôle |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | non | URL du projet Supabase. Absente ⇒ mode local pur, sans compte |
| `VITE_SUPABASE_ANON_KEY` | non | Clé publique Supabase (protégée par RLS) |
| `ALLOWED_ORIGINS` | **oui en production** | Origines autorisées à appeler `api/*`, séparées par des virgules. Ex : `https://patrium.vercel.app` |
| `WEBSTAT_CLIENT_ID` | non | Identifiant client Banque de France (Webstat), pour rafraîchir en direct quelques taux du sous-onglet Taux. Absent ⇒ catalogue de référence maintenu à la main (voir plus bas) |

Les variables préfixées `VITE_` sont **intégrées au JavaScript envoyé au navigateur** : elles sont donc publiques par construction. C'est acceptable pour la clé `anon` de Supabase (c'est son rôle, la sécurité repose sur RLS) ; n'y mets jamais de clé de service.

### 4. Créer la table Supabase

Exécute `sql/schema.sql` dans l'éditeur SQL de ton projet Supabase. La table est protégée par RLS : chaque utilisateur ne voit que ses propres lignes.

### 5. (Optionnel) Domaine personnalisé

Réglages du projet Vercel → **Domains**.

⚠️ **Confidentialité** : l'URL Vercel est publique. N'importe qui avec le lien peut ouvrir la page de connexion — mais sans identifiants, aucune donnée n'est accessible.

---

## 💻 En local

### Frontend seul (sans cours de bourse)

```bash
npm install
npm run dev
```
→ `http://localhost:5173`. Tout fonctionne sauf ce qui dépend de `api/`.

### Avec les fonctions serverless

```bash
npm install -g vercel
vercel dev
```
→ frontend **et** fonctions `api/*` ensemble, comme en production.

---

## 🔎 Données de marché : ce qu'il faut savoir

- Cours, recherche, historique, calendrier et fiches entreprise passent par l'endpoint **non officiel** de Yahoo Finance. C'est gratuit et sans clé API, mais **non documenté et non garanti** : il peut ralentir, tomber ou changer de comportement sans préavis.
- Les fiches entreprise passent en plus par un endpoint public de Google Translate pour la traduction en français, avec repli silencieux sur le texte anglais en cas d'échec. Même réserve : service non contractuel.
- En cas d'échec, l'app **ne plante jamais** : un message s'affiche et la saisie manuelle reste possible.
- Toute la couche d'accès est centralisée dans `api/_lib/yahoo.js`. Pour changer de fournisseur ou ajouter un fournisseur de secours, c'est le seul fichier à toucher — le frontend (`src/lib/api.js`) est inchangé.

### Fournisseurs de données boursières gratuits — pour aller plus loin

Yahoo Finance couvre aujourd'hui l'intégralité des besoins (cours, recherche, historique, calendrier, fiches entreprise) mais reste un endpoint non officiel. Voici les alternatives gratuites les plus sérieuses si un jour il fallait le doubler ou le remplacer — aucune n'est branchée dans le code actuel, elles sont documentées ici pour une implémentation future :

| Fournisseur | Quota gratuit | Nécessite une clé | Points forts | Limites |
| --- | --- | --- | --- | --- |
| **Finnhub** | 60 req/min | Oui (gratuite, email) | Quota généreux, cours temps réel, profils d'entreprise, recherche de symbole | Chandeliers (historique intraday/quotidien) **non inclus** dans le plan gratuit |
| **Twelve Data** | 800 crédits/jour | Oui (gratuite, email) | Bonne couverture d'échanges internationaux, séries temporelles complètes | Données différées de 4h sur le plan gratuit |
| **Alpha Vantage** | 5 req/min, 25/jour | Oui (gratuite, email) | Doyen du secteur, très documenté | Quota très bas, données différées de 15 min |
| **Frankfurter.app** | Illimité | **Non** | Taux de change officiels BCE, aucune clé requise, idéal pour un ETF/action coté en devise étrangère | Uniquement des taux de change, pas de cours d'actions/ETF |
| **EODHD** | Essai limité | Oui | Couverture large (actions, crypto, forex, fondamentaux) une fois payant | Plan gratuit très restreint, l'essentiel est payant |

Recommandation si l'app devait un jour se doubler d'un fournisseur de secours : **Finnhub** pour les cours (quota le plus confortable), complété par **Frankfurter.app** pour les taux de change — le seul des deux à ne nécessiter aucune inscription.

### Protections des endpoints `api/*`

Les fonctions sont publiques par nature (pas d'authentification, elles ne servent que des données de marché publiques), mais elles ne sont plus un proxy ouvert :

- **Origine** : les requêtes navigateur venant d'un domaine hors `ALLOWED_ORIGINS` sont rejetées (403)
- **Débit** : fenêtre glissante par IP et par endpoint (de 10 req/min pour `parse-pdf` à 120 pour `quote`)
- **Cache** : mémoire + `s-maxage` CDN, pour ne pas retaper Yahoo à chaque rechargement de page
- **Validation** : les symboles sont filtrés par expression régulière stricte avant toute interpolation dans une URL externe
- **Upload** : `parse-pdf` plafonne la taille, vérifie la signature `%PDF-` et refuse tout le reste

Limite connue : le compteur de débit et le cache sont **par instance serverless** (mémoire locale, remise à zéro à froid). C'est suffisant pour couper un abus grossier ; un quota strict demanderait un store partagé (Vercel KV / Upstash Redis).

## 💶 Sous-onglet Taux (Livrets & Épargne)

Barème centralisé des taux réglementés, de crédit, de banques centrales, d'inflation et de fiscalité, avec recherche, filtres par catégorie et comparaison automatique aux livrets réellement détenus (`src/components/RatesHub.jsx`).

**Pourquoi ce n'est pas branché en direct sur l'API Webstat de la Banque de France** — vérifié par appel direct au moment de l'implémentation : le catalogue **public et sans clé** de Webstat (`https://webstat.banque-france.fr/api/explore/v2.1/...`, Opendatasoft Explore API) ne sert que des **métadonnées de recherche**. Sur plus de 42 000 jeux de données catalogués, un seul expose des enregistrements requêtables via cette API publique, et ce n'est pas une série de taux. Les valeurs réelles (taux du Livret A, du LEP, du CEL...) ne sont accessibles qu'via l'**API sécurisée** `api.webstat.banque-france.fr`, avec un identifiant client (`X-IBM-Client-Id`) obtenu par inscription gratuite sur [developer.webstat.banque-france.fr](https://developer.webstat.banque-france.fr/).

En conséquence, l'onglet fonctionne en **deux couches**, comme le reste de l'app avec Yahoo/Supabase :

1. **Catalogue de référence** (`src/lib/ratesCatalog.js`) — la source de vérité par défaut : taux officiels maintenus à la main, chacun avec sa date d'entrée en vigueur, sa date de révision connue et sa source citée. Valeurs vérifiées le 26/07/2026 (Livret A 1,70 %, LDDS 1,70 %, LEP 2,50 %, CEL 1,25 % brut, PEL 1,75 % brut, taux d'usure crédit ≥20 ans 5,19 %, BCE dépôt/refi/prêt marginal 2,25/2,40/2,65 %, inflation INSEE +1,8 % sur un an).
2. **Rafraîchissement live optionnel** (`api/rates.js` + `api/_lib/webstat.js`) — si `WEBSTAT_CLIENT_ID` est configuré, l'endpoint tente de récupérer la dernière observation des quelques séries dont la clé Webstat est confirmée (Livret A, LEP, CEL) et remplace la valeur de référence en cas de succès ; sinon la référence reste affichée, avec un badge « Référence » plutôt que « Live ».

Sans clé configurée ni connexion à `/api/rates` (ex : `npm run dev` sans `vercel dev`), l'onglet retombe sur le catalogue de référence importé directement côté client — jamais d'onglet vide ni d'erreur bloquante.

**Pour aller plus loin** : élargir `RATES_CATALOG` (Euribor 12 mois, taux d'usure par durée, PASS, barème de l'IR...), ou identifier davantage de `seriesKey` Webstat confirmées pour étendre le rafraîchissement live au-delà des trois séries actuelles.

## 🗂️ Structure du projet

```
patrium/
├── api/                        # fonctions serverless Vercel
│   ├── _lib/
│   │   ├── http.js             # CORS, limitation de débit, cache, erreurs
│   │   ├── yahoo.js            # accès Yahoo mutualisé, session, validation
│   │   ├── pdfParsing.js       # extraction des relevés (fonctions pures, testées)
│   │   ├── http.test.js
│   │   └── pdfParsing.test.js
│   ├── calendar.js             # événements (dividendes, résultats)
│   ├── history.js              # historique de cours
│   ├── parse-pdf.js            # import de relevés de courtage
│   ├── profile.js              # fiche entreprise / ETF
│   ├── quote.js                # cours actuels
│   └── search.js               # recherche ticker/ISIN/nom
├── public/                     # manifest PWA, service worker, icônes
├── sql/
│   └── schema.sql              # table kv_store + RLS
├── src/
│   ├── components/             # 24 composants d'interface
│   │   ├── Dashboard.jsx  Livrets.jsx  Bourse.jsx  Simulation.jsx
│   │   ├── Immobilier.jsx  StrategieLogs.jsx  Abonnements.jsx
│   │   ├── Login.jsx  ErrorBoundary.jsx  SyncIndicator.jsx  BackupReminder.jsx
│   │   ├── Marche.jsx  Watchlist.jsx  Timeline.jsx  Operations.jsx  …
│   │   └── ui.jsx              # briques partagées (Card, AddPanel, Skeleton…)
│   ├── lib/
│   │   ├── PatrimoineContext.jsx  # état patrimonial + valeurs dérivées
│   │   ├── AuthContext.jsx        # session Supabase
│   │   ├── ToastContext.jsx       # notifications
│   │   ├── ConfirmContext.jsx     # dialogue de confirmation accessible
│   │   ├── storage.js             # persistance locale + synchro cloud
│   │   ├── syncStatus.js          # état de synchronisation
│   │   ├── finance.js             # formules financières
│   │   ├── finance.test.js
│   │   ├── authErrors.js          # messages d'auth en français, robustesse mdp
│   │   ├── useHashRoute.js        # onglet ↔ URL
│   │   ├── useDailySnapshot.js    # relevé quotidien du patrimoine
│   │   └── api.js                 # appels vers api/*
│   ├── App.jsx                 # coquille de navigation
│   ├── main.jsx                # providers + service worker
│   └── index.css
├── .github/workflows/ci.yml
├── index.html
├── package.json
├── vite.config.js
├── tailwind.config.cjs
└── postcss.config.cjs
```

## 🧱 Modèle de données — limite assumée

Supabase sert de **stockage clé/valeur JSON**, pas de base relationnelle : une seule table `kv_store` avec une ligne par (utilisateur, clé). Conséquences à connaître :

- Aucune validation ni contrainte côté serveur — la forme des données est garantie uniquement par le code client
- Aucune requête ni agrégation possible en SQL
- **Pas de fusion en cas de conflit** : deux appareils modifiant la même clé hors ligne ne fusionnent pas, le dernier à se reconnecter gagne. L'arbitrage se fait sur l'horodatage de dernière modification (`updated_at`), ce qui évite l'écrasement d'une modification locale par une version cloud plus ancienne, mais ne remplace pas un vrai merge.

Passer à un schéma relationnel (tables `positions`, `operations`, `livrets`…) est le prérequis à toute fusion fine, à des statistiques côté serveur et à des migrations propres.

## 🛠️ Pour aller plus loin

- Découper `Bourse.jsx` (~1 500 lignes) et `Marche.jsx` / `StrategieLogs.jsx` en sous-composants, et les faire lire `usePatrimoine()` au lieu de recevoir l'état complet en props
- Passer à un schéma Supabase relationnel (voir ci-dessus)
- Support multi-devises (l'euro est aujourd'hui codé en dur dans le formatage et le parsing PDF)
- Virtualisation des longues listes d'opérations
- Quota de débit partagé entre instances serverless (Vercel KV)
- Rééquilibrage de portefeuille PEA + diversification sectorielle/géographique
- Injection automatique de l'apport immobilier depuis le module Simulation
