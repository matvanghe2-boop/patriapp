module.exports = {
  root: true,
  env: { browser: true, es2022: true, node: true },
  extends: [
    "eslint:recommended",
    "plugin:react/recommended",
    "plugin:react/jsx-runtime",
    "plugin:react-hooks/recommended",
  ],
  parserOptions: { ecmaVersion: "latest", sourceType: "module" },
  settings: { react: { version: "detect" } },
  ignorePatterns: ["dist", "node_modules", "public/sw.js"],
  rules: {
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

    // Les règles ci-dessous (react-hooks v6) signalent des tournures à
    // améliorer dans les gros composants existants, pas des bugs avérés.
    // Elles restent visibles en avertissement — donc traitables au fil de
    // l'eau — sans bloquer la CI sur du code qui fonctionne aujourd'hui.
    "react-hooks/set-state-in-effect": "warn",
    "react-hooks/purity": "warn",
    "react-hooks/immutability": "warn",
    "react-hooks/preserve-manual-memoization": "warn",
    "react-hooks/static-components": "warn",
  },
  overrides: [
    {
      files: ["**/*.test.{js,jsx}", "src/test/**"],
      env: { node: true },
      globals: { vi: "readonly", describe: "readonly", it: "readonly", expect: "readonly", beforeEach: "readonly", afterEach: "readonly" },
    },
  ],
};
