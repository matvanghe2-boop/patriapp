// Configuration ESLint « à plat » (flat config).
//
// Elle remplace `.eslintrc.cjs`, qu'ESLint 10 ne lit plus du tout. Le passage
// n'est pas cosmétique : ESLint 8 est en fin de vie et ne reçoit plus de
// correctifs de sécurité, ce qui en faisait la dernière dépendance non
// maintenue de l'outillage.
//
// Les règles elles-mêmes sont reprises à l'identique de l'ancienne
// configuration, avec leurs justifications. Seule la forme change : plus de
// `extends` ni de `env`, on compose des objets de configuration et on déclare
// les variables globales explicitement.
import js from "@eslint/js";
import globals from "globals";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  {
    // `ignores` seul dans un objet vaut exclusion globale — l'équivalent de
    // l'ancien `ignorePatterns`.
    ignores: ["dist/**", "node_modules/**", "public/sw.js", "public/orbit-*.js"],
  },

  js.configs.recommended,

  {
    // `.mjs` inclus : les scripts de `scripts/` ont toujours échappé au lint,
    // l'ancien `--ext .js,.jsx` ne les voyait pas. Ils manipulent pourtant les
    // univers du screener, dont une erreur silencieuse fait disparaître des
    // titres sans lever la moindre exception.
    files: ["**/*.{js,jsx,mjs}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: { react: { version: "detect" } },
    plugins: { react, "react-hooks": reactHooks },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...react.configs.flat["jsx-runtime"].rules,
      ...reactHooks.configs.recommended.rules,

      // L'app n'utilise pas PropTypes (pas de TypeScript non plus) : on désactive
      // la règle plutôt que de laisser 500 warnings noyer les vrais problèmes.
      "react/prop-types": "off",
      // L'interface est entièrement en français : apostrophes et guillemets
      // typographiques sont partout dans le texte, et les échapper en entités
      // HTML rendrait le JSX illisible pour un gain nul.
      "react/no-unescaped-entities": "off",
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "no-empty": ["error", { allowEmptyCatch: true }],
      eqeqeq: ["warn", "smart"],

      // Ces règles (react-hooks v7 / compilateur React) signalent des tournures
      // à améliorer, pas des bugs avérés. Le projet est aujourd'hui à ZÉRO
      // avertissement : elles restent donc en `warn` pour rester traitables au
      // fil de l'eau, mais toute nouvelle occurrence se voit immédiatement.
      //
      // Les quelques exceptions subsistantes portent chacune, sur place, un
      // `eslint-disable-next-line` accompagné de sa justification — un effet
      // qui LANCE un chargement lève légitimement son témoin avant l'appel
      // réseau. C'est le cas d'usage même d'un effet.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/static-components": "warn",
    },
  },

  {
    // Les scripts de `scripts/` sont des outils en ligne de commande : leur
    // sortie console EST leur interface. La règle `no-console` vise le bundle
    // envoyé au navigateur, pas eux.
    files: ["scripts/**"],
    rules: { "no-console": "off" },
  },

  {
    files: ["**/*.test.{js,jsx}", "src/test/**"],
    languageOptions: {
      globals: { ...globals.node, ...globals.vitest },
    },
  },
];
