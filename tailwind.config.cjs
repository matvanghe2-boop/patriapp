/*
 * Les palettes de couleur sont adossées à des VARIABLES CSS, pas à des valeurs
 * figées. C'est ce qui rend le mode clair possible sans toucher une seule des
 * quelque 1 500 classes utilitaires déjà écrites dans les composants.
 *
 * Le principe : la rampe est MIROIR d'un thème à l'autre. En sombre,
 * `slate-950` vaut exactement la valeur Tailwind de slate-950 — au bit près,
 * l'apparence actuelle est donc rigoureusement inchangée. En clair,
 * `slate-950` prend la valeur de slate-50, `slate-900` celle de slate-100, et
 * ainsi de suite jusqu'à `slate-500`, qui reste lui-même.
 *
 * Un `bg-slate-950 text-slate-100` demeure donc contrasté dans les deux sens,
 * sans qu'aucun composant ne sache dans quel thème il est rendu. Même chose
 * pour les accents : `text-amber-300` devient amber-700 en clair, ce qui
 * conserve le rapport de contraste au lieu de l'inverser.
 *
 * Les valeurs vivent dans src/index.css. La forme
 * `rgb(var(--x) / <alpha-value>)` est indispensable : sans elle, les
 * modificateurs d'opacité déjà employés (`bg-slate-950/60`,
 * `border-emerald-500/40`…) cesseraient de fonctionner.
 */


module.exports = {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  darkMode: ["class", "[data-theme=\"sombre\"]"],
  theme: {
    extend: {
      colors: {
            "slate": {
                  "50": "rgb(var(--c-slate-50) / <alpha-value>)",
                  "100": "rgb(var(--c-slate-100) / <alpha-value>)",
                  "200": "rgb(var(--c-slate-200) / <alpha-value>)",
                  "300": "rgb(var(--c-slate-300) / <alpha-value>)",
                  "400": "rgb(var(--c-slate-400) / <alpha-value>)",
                  "500": "rgb(var(--c-slate-500) / <alpha-value>)",
                  "600": "rgb(var(--c-slate-600) / <alpha-value>)",
                  "700": "rgb(var(--c-slate-700) / <alpha-value>)",
                  "800": "rgb(var(--c-slate-800) / <alpha-value>)",
                  "900": "rgb(var(--c-slate-900) / <alpha-value>)",
                  "950": "rgb(var(--c-slate-950) / <alpha-value>)"
            },
            "amber": {
                  "50": "rgb(var(--c-amber-50) / <alpha-value>)",
                  "100": "rgb(var(--c-amber-100) / <alpha-value>)",
                  "200": "rgb(var(--c-amber-200) / <alpha-value>)",
                  "300": "rgb(var(--c-amber-300) / <alpha-value>)",
                  "400": "rgb(var(--c-amber-400) / <alpha-value>)",
                  "500": "rgb(var(--c-amber-500) / <alpha-value>)",
                  "600": "rgb(var(--c-amber-600) / <alpha-value>)",
                  "700": "rgb(var(--c-amber-700) / <alpha-value>)",
                  "800": "rgb(var(--c-amber-800) / <alpha-value>)",
                  "900": "rgb(var(--c-amber-900) / <alpha-value>)",
                  "950": "rgb(var(--c-amber-950) / <alpha-value>)"
            },
            "emerald": {
                  "50": "rgb(var(--c-emerald-50) / <alpha-value>)",
                  "100": "rgb(var(--c-emerald-100) / <alpha-value>)",
                  "200": "rgb(var(--c-emerald-200) / <alpha-value>)",
                  "300": "rgb(var(--c-emerald-300) / <alpha-value>)",
                  "400": "rgb(var(--c-emerald-400) / <alpha-value>)",
                  "500": "rgb(var(--c-emerald-500) / <alpha-value>)",
                  "600": "rgb(var(--c-emerald-600) / <alpha-value>)",
                  "700": "rgb(var(--c-emerald-700) / <alpha-value>)",
                  "800": "rgb(var(--c-emerald-800) / <alpha-value>)",
                  "900": "rgb(var(--c-emerald-900) / <alpha-value>)",
                  "950": "rgb(var(--c-emerald-950) / <alpha-value>)"
            },
            "violet": {
                  "50": "rgb(var(--c-violet-50) / <alpha-value>)",
                  "100": "rgb(var(--c-violet-100) / <alpha-value>)",
                  "200": "rgb(var(--c-violet-200) / <alpha-value>)",
                  "300": "rgb(var(--c-violet-300) / <alpha-value>)",
                  "400": "rgb(var(--c-violet-400) / <alpha-value>)",
                  "500": "rgb(var(--c-violet-500) / <alpha-value>)",
                  "600": "rgb(var(--c-violet-600) / <alpha-value>)",
                  "700": "rgb(var(--c-violet-700) / <alpha-value>)",
                  "800": "rgb(var(--c-violet-800) / <alpha-value>)",
                  "900": "rgb(var(--c-violet-900) / <alpha-value>)",
                  "950": "rgb(var(--c-violet-950) / <alpha-value>)"
            },
            "rose": {
                  "50": "rgb(var(--c-rose-50) / <alpha-value>)",
                  "100": "rgb(var(--c-rose-100) / <alpha-value>)",
                  "200": "rgb(var(--c-rose-200) / <alpha-value>)",
                  "300": "rgb(var(--c-rose-300) / <alpha-value>)",
                  "400": "rgb(var(--c-rose-400) / <alpha-value>)",
                  "500": "rgb(var(--c-rose-500) / <alpha-value>)",
                  "600": "rgb(var(--c-rose-600) / <alpha-value>)",
                  "700": "rgb(var(--c-rose-700) / <alpha-value>)",
                  "800": "rgb(var(--c-rose-800) / <alpha-value>)",
                  "900": "rgb(var(--c-rose-900) / <alpha-value>)",
                  "950": "rgb(var(--c-rose-950) / <alpha-value>)"
            },
            "cyan": {
                  "50": "rgb(var(--c-cyan-50) / <alpha-value>)",
                  "100": "rgb(var(--c-cyan-100) / <alpha-value>)",
                  "200": "rgb(var(--c-cyan-200) / <alpha-value>)",
                  "300": "rgb(var(--c-cyan-300) / <alpha-value>)",
                  "400": "rgb(var(--c-cyan-400) / <alpha-value>)",
                  "500": "rgb(var(--c-cyan-500) / <alpha-value>)",
                  "600": "rgb(var(--c-cyan-600) / <alpha-value>)",
                  "700": "rgb(var(--c-cyan-700) / <alpha-value>)",
                  "800": "rgb(var(--c-cyan-800) / <alpha-value>)",
                  "900": "rgb(var(--c-cyan-900) / <alpha-value>)",
                  "950": "rgb(var(--c-cyan-950) / <alpha-value>)"
            },
            "indigo": {
                  "50": "rgb(var(--c-indigo-50) / <alpha-value>)",
                  "100": "rgb(var(--c-indigo-100) / <alpha-value>)",
                  "200": "rgb(var(--c-indigo-200) / <alpha-value>)",
                  "300": "rgb(var(--c-indigo-300) / <alpha-value>)",
                  "400": "rgb(var(--c-indigo-400) / <alpha-value>)",
                  "500": "rgb(var(--c-indigo-500) / <alpha-value>)",
                  "600": "rgb(var(--c-indigo-600) / <alpha-value>)",
                  "700": "rgb(var(--c-indigo-700) / <alpha-value>)",
                  "800": "rgb(var(--c-indigo-800) / <alpha-value>)",
                  "900": "rgb(var(--c-indigo-900) / <alpha-value>)",
                  "950": "rgb(var(--c-indigo-950) / <alpha-value>)"
            },
            "teal": {
                  "50": "rgb(var(--c-teal-50) / <alpha-value>)",
                  "100": "rgb(var(--c-teal-100) / <alpha-value>)",
                  "200": "rgb(var(--c-teal-200) / <alpha-value>)",
                  "300": "rgb(var(--c-teal-300) / <alpha-value>)",
                  "400": "rgb(var(--c-teal-400) / <alpha-value>)",
                  "500": "rgb(var(--c-teal-500) / <alpha-value>)",
                  "600": "rgb(var(--c-teal-600) / <alpha-value>)",
                  "700": "rgb(var(--c-teal-700) / <alpha-value>)",
                  "800": "rgb(var(--c-teal-800) / <alpha-value>)",
                  "900": "rgb(var(--c-teal-900) / <alpha-value>)",
                  "950": "rgb(var(--c-teal-950) / <alpha-value>)"
            },
            "fuchsia": {
                  "50": "rgb(var(--c-fuchsia-50) / <alpha-value>)",
                  "100": "rgb(var(--c-fuchsia-100) / <alpha-value>)",
                  "200": "rgb(var(--c-fuchsia-200) / <alpha-value>)",
                  "300": "rgb(var(--c-fuchsia-300) / <alpha-value>)",
                  "400": "rgb(var(--c-fuchsia-400) / <alpha-value>)",
                  "500": "rgb(var(--c-fuchsia-500) / <alpha-value>)",
                  "600": "rgb(var(--c-fuchsia-600) / <alpha-value>)",
                  "700": "rgb(var(--c-fuchsia-700) / <alpha-value>)",
                  "800": "rgb(var(--c-fuchsia-800) / <alpha-value>)",
                  "900": "rgb(var(--c-fuchsia-900) / <alpha-value>)",
                  "950": "rgb(var(--c-fuchsia-950) / <alpha-value>)"
            },
            "orange": {
                  "50": "rgb(var(--c-orange-50) / <alpha-value>)",
                  "100": "rgb(var(--c-orange-100) / <alpha-value>)",
                  "200": "rgb(var(--c-orange-200) / <alpha-value>)",
                  "300": "rgb(var(--c-orange-300) / <alpha-value>)",
                  "400": "rgb(var(--c-orange-400) / <alpha-value>)",
                  "500": "rgb(var(--c-orange-500) / <alpha-value>)",
                  "600": "rgb(var(--c-orange-600) / <alpha-value>)",
                  "700": "rgb(var(--c-orange-700) / <alpha-value>)",
                  "800": "rgb(var(--c-orange-800) / <alpha-value>)",
                  "900": "rgb(var(--c-orange-900) / <alpha-value>)",
                  "950": "rgb(var(--c-orange-950) / <alpha-value>)"
            },
            "blue": {
                  "50": "rgb(var(--c-blue-50) / <alpha-value>)",
                  "100": "rgb(var(--c-blue-100) / <alpha-value>)",
                  "200": "rgb(var(--c-blue-200) / <alpha-value>)",
                  "300": "rgb(var(--c-blue-300) / <alpha-value>)",
                  "400": "rgb(var(--c-blue-400) / <alpha-value>)",
                  "500": "rgb(var(--c-blue-500) / <alpha-value>)",
                  "600": "rgb(var(--c-blue-600) / <alpha-value>)",
                  "700": "rgb(var(--c-blue-700) / <alpha-value>)",
                  "800": "rgb(var(--c-blue-800) / <alpha-value>)",
                  "900": "rgb(var(--c-blue-900) / <alpha-value>)",
                  "950": "rgb(var(--c-blue-950) / <alpha-value>)"
            },
            "sky": {
                  "50": "rgb(var(--c-sky-50) / <alpha-value>)",
                  "100": "rgb(var(--c-sky-100) / <alpha-value>)",
                  "200": "rgb(var(--c-sky-200) / <alpha-value>)",
                  "300": "rgb(var(--c-sky-300) / <alpha-value>)",
                  "400": "rgb(var(--c-sky-400) / <alpha-value>)",
                  "500": "rgb(var(--c-sky-500) / <alpha-value>)",
                  "600": "rgb(var(--c-sky-600) / <alpha-value>)",
                  "700": "rgb(var(--c-sky-700) / <alpha-value>)",
                  "800": "rgb(var(--c-sky-800) / <alpha-value>)",
                  "900": "rgb(var(--c-sky-900) / <alpha-value>)",
                  "950": "rgb(var(--c-sky-950) / <alpha-value>)"
            },
            "lime": {
                  "50": "rgb(var(--c-lime-50) / <alpha-value>)",
                  "100": "rgb(var(--c-lime-100) / <alpha-value>)",
                  "200": "rgb(var(--c-lime-200) / <alpha-value>)",
                  "300": "rgb(var(--c-lime-300) / <alpha-value>)",
                  "400": "rgb(var(--c-lime-400) / <alpha-value>)",
                  "500": "rgb(var(--c-lime-500) / <alpha-value>)",
                  "600": "rgb(var(--c-lime-600) / <alpha-value>)",
                  "700": "rgb(var(--c-lime-700) / <alpha-value>)",
                  "800": "rgb(var(--c-lime-800) / <alpha-value>)",
                  "900": "rgb(var(--c-lime-900) / <alpha-value>)",
                  "950": "rgb(var(--c-lime-950) / <alpha-value>)"
            },
            "pink": {
                  "50": "rgb(var(--c-pink-50) / <alpha-value>)",
                  "100": "rgb(var(--c-pink-100) / <alpha-value>)",
                  "200": "rgb(var(--c-pink-200) / <alpha-value>)",
                  "300": "rgb(var(--c-pink-300) / <alpha-value>)",
                  "400": "rgb(var(--c-pink-400) / <alpha-value>)",
                  "500": "rgb(var(--c-pink-500) / <alpha-value>)",
                  "600": "rgb(var(--c-pink-600) / <alpha-value>)",
                  "700": "rgb(var(--c-pink-700) / <alpha-value>)",
                  "800": "rgb(var(--c-pink-800) / <alpha-value>)",
                  "900": "rgb(var(--c-pink-900) / <alpha-value>)",
                  "950": "rgb(var(--c-pink-950) / <alpha-value>)"
            }
      },
    },
  },
  plugins: [],
};
