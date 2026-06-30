# 📊 Patrium

Dashboard personnel de gestion de patrimoine et de simulation financière.
**Toutes les données restent dans ton navigateur** (`localStorage`) — aucune base de données externe, aucun compte, aucun envoi de données à un serveur tiers (à l'exception de la recherche de cours de bourse, voir plus bas).

## Ce que contient l'app

- **Dashboard** — patrimoine brut/net, plus-value latente, taux d'épargne, allocation d'actifs, historique du patrimoine net
- **Livrets & Épargne** — suivi des supports à capital garanti, plafonds, matelas de sécurité
- **PEA & Bourse** — positions, plus/moins-values, recherche d'un titre par **ticker, ISIN ou nom**, actualisation automatique des cours
- **Simulation** — moteur d'intérêts composés sur l'ensemble du patrimoine (poche Livrets + poche Bourse, chacune avec son propre taux et versement)
- **Immobilier & Crédit** — apport personnel, mensualités sur 15/20/25 ans, alerte taux d'endettement (norme HCSF 35 %)
- **Sauvegarde** — export/import JSON depuis le menu latéral, en plus de la persistance automatique en local

## Stack technique

- **Frontend** : React 18 + Vite + Tailwind CSS
- **Cours de bourse** : 2 fonctions serverless (`/api/search`, `/api/quote`) qui interrogent Yahoo Finance côté serveur (pour éviter les blocages CORS du navigateur)
- **Stockage** : `localStorage` du navigateur (rien côté serveur)

---

## 🚀 Déploiement sur Vercel (recommandé)

C'est la façon la plus simple d'avoir un vrai site, avec les cours de bourse fonctionnels (les fonctions serverless de `/api` ne tournent que sur Vercel ou via `vercel dev`, pas avec un simple `npm run dev`).

### 1. Pousser le projet sur GitHub

```bash
cd patrium
git init
git add .
git commit -m "Initial commit — Patrium"
```

Crée un nouveau dépôt vide sur [github.com/new](https://github.com/new), puis :

```bash
git remote add origin https://github.com/<ton-pseudo>/<nom-du-repo>.git
git branch -M main
git push -u origin main
```

### 2. Importer le projet sur Vercel

1. Va sur [vercel.com/new](https://vercel.com/new)
2. Connecte ton compte GitHub si nécessaire, puis sélectionne le dépôt que tu viens de créer
3. Vercel détecte automatiquement **Vite** — tu n'as rien à configurer (build command, output directory et fonctions `/api` sont reconnus tout seuls)
4. Clique sur **Deploy**

Après 1-2 minutes, ton site est en ligne sur une URL du type `https://ton-projet.vercel.app`.

À chaque `git push` sur `main`, Vercel redéploie automatiquement.

### 3. (Optionnel) Domaine personnalisé

Dans les réglages du projet sur Vercel → **Domains**, tu peux brancher un nom de domaine que tu possèdes déjà.

⚠️ **Important — confidentialité** : l'URL Vercel est publique par défaut. N'importe qui possédant le lien peut ouvrir l'app — mais chaque visiteur a ses **propres données locales** (stockées dans son navigateur), il n'y a pas de compte ni de données partagées. Si tu veux restreindre l'accès, Vercel propose une protection par mot de passe sur les plans payants ; sinon, garde simplement l'URL privée.

---

## 💻 Utiliser le projet en local

### Frontend seul (sans cours de bourse en direct)

```bash
npm install
npm run dev
```
→ ouvre `http://localhost:5173`. Tout fonctionne sauf la recherche/actualisation de cours (qui nécessite les fonctions `/api`).

### Avec les cours de bourse (recommandé pour tester avant de déployer)

Installe la CLI Vercel une fois :
```bash
npm install -g vercel
```

Puis, dans le dossier du projet :
```bash
npm install
vercel dev
```
→ ouvre l'URL indiquée dans le terminal (en général `http://localhost:3000`). Le frontend **et** les fonctions `/api/search` et `/api/quote` tournent ensemble, exactement comme sur Vercel en production.

---

## 🔎 À savoir sur les cours de bourse en direct

- La recherche (ticker, ISIN ou nom) et l'actualisation des cours passent par l'endpoint **non-officiel** de Yahoo Finance, interrogé depuis les fonctions serverless (`api/search.js` et `api/quote.js`).
- C'est gratuit et ne nécessite aucune clé API, mais c'est un service non documenté/non garanti par Yahoo : il peut occasionnellement être plus lent, indisponible, ou changer de comportement sans préavis.
- En cas d'échec, l'app **ne plante jamais** : un message clair s'affiche et tu peux toujours saisir un cours manuellement via le lien « Saisie manuelle » du formulaire d'ajout.
- Si tu veux changer de fournisseur de données plus tard (ex : Alpha Vantage, Twelve Data, Finnhub — avec clé API), il suffit de modifier la logique interne de `api/search.js` et `api/quote.js` : le frontend (`src/lib/api.js`) n'a pas besoin de changer.

## 🗂️ Structure du projet

```
patrium/
├── api/
│   ├── search.js          # fonction serverless : recherche ticker/ISIN/nom
│   └── quote.js           # fonction serverless : cours actuels
├── src/
│   ├── components/
│   │   ├── Dashboard.jsx
│   │   ├── Livrets.jsx
│   │   ├── Bourse.jsx
│   │   ├── Simulation.jsx
│   │   ├── Immobilier.jsx
│   │   └── ui.jsx         # composants partagés (Card, AddPanel, etc.)
│   ├── lib/
│   │   ├── finance.js     # formules (intérêts composés, amortissement...)
│   │   ├── storage.js     # persistance localStorage + export/import
│   │   └── api.js         # appels vers /api/search et /api/quote
│   ├── App.jsx
│   ├── main.jsx
│   └── index.css
├── index.html
├── package.json
├── vite.config.js
├── tailwind.config.cjs
└── postcss.config.cjs
```

## 🛠️ Pour aller plus loin

- Rééquilibrage de portefeuille PEA + diversification sectorielle/géographique (Module 3 avancé)
- Injection automatique de l'apport immobilier directement depuis le module Simulation
- Historique du patrimoine net calculé automatiquement (et non saisi à la main)
