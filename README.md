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

Ce qui n'est **jamais** envoyé nulle part : tes montants, tes soldes, tes quantités détenues, ton PRU, tes revenus. Les endpoints `/api/*` ne reçoivent que des symboles boursiers (`AI.PA`, `CW8.PA`…), jamais une position.

Sans configuration Supabase, l'app fonctionne en **mode local pur** : rien ne sort du navigateur, à part les tickers ci-dessus.

⚠️ La synchronisation Supabase n'est **pas une sauvegarde** : une suppression se propage sur tous les appareils. L'export JSON (menu latéral) reste la seule vraie copie de secours — l'app te le rappelle si tu n'en as pas fait depuis 30 jours.

## Ce que contient l'app

- **Dashboard** — patrimoine brut/net, plus-value latente, taux d'épargne, allocation d'actifs, historique du patrimoine net (relevé automatique une fois par jour)
- **Livrets & Épargne** — suivi des supports à capital garanti, plafonds, matelas de sécurité, enveloppes de ventilation
- **PEA & Bourse** — positions, plus/moins-values, recherche par **ticker, ISIN ou nom**, actualisation des cours, import PDF de relevés de courtage, watchlist, heatmap sectorielle, calendrier financier
- **Simulation** — intérêts composés sur l'ensemble du patrimoine (poche Livrets + poche Bourse, chacune avec son taux et son versement), scénarios comparables
- **Immobilier & Crédit** — apport, mensualités sur 15/20/25 ans, alerte taux d'endettement (norme HCSF 35 %), suivi des travaux
- **Stratégie & Logs** — journal des thèses d'investissement, timeline des jalons, opérations
- **Abonnements** — dépenses récurrentes, contrats et échéances de résiliation
- **Sauvegarde** — export/import JSON depuis le menu latéral

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
- Toute la couche d'accès est centralisée dans `api/_lib/yahoo.js`. Pour changer de fournisseur (Alpha Vantage, Twelve Data, Finnhub…), c'est le seul fichier à réécrire — le frontend (`src/lib/api.js`) est inchangé.

### Protections des endpoints `api/*`

Les fonctions sont publiques par nature (pas d'authentification, elles ne servent que des données de marché publiques), mais elles ne sont plus un proxy ouvert :

- **Origine** : les requêtes navigateur venant d'un domaine hors `ALLOWED_ORIGINS` sont rejetées (403)
- **Débit** : fenêtre glissante par IP et par endpoint (de 10 req/min pour `parse-pdf` à 120 pour `quote`)
- **Cache** : mémoire + `s-maxage` CDN, pour ne pas retaper Yahoo à chaque rechargement de page
- **Validation** : les symboles sont filtrés par expression régulière stricte avant toute interpolation dans une URL externe
- **Upload** : `parse-pdf` plafonne la taille, vérifie la signature `%PDF-` et refuse tout le reste

Limite connue : le compteur de débit et le cache sont **par instance serverless** (mémoire locale, remise à zéro à froid). C'est suffisant pour couper un abus grossier ; un quota strict demanderait un store partagé (Vercel KV / Upstash Redis).

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
