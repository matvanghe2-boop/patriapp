import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    // Les gros onglets sont chargés à la demande (React.lazy dans App.jsx) ;
    // on isole en plus les dépendances lourdes pour que le bundle initial
    // reste petit — recharts pèse à lui seul plusieurs centaines de Ko.
    rollupOptions: {
      output: {
        // Forme FONCTION et non objet : depuis Vite 8, le bundler est rolldown,
        // qui n'accepte plus la table `{ nom: [paquets] }` (« Invalid type:
        // Expected Function but received Object » — un simple avertissement,
        // mais le découpage était alors purement et simplement ignoré, et tout
        // recharts retombait dans le bundle initial).
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("react-dom")) return "react";
          if (id.includes("node_modules/react/") || id.includes("node_modules\\react\\")) return "react";
          if (id.includes("recharts")) return "charts";
          if (id.includes("@supabase")) return "supabase";
          return undefined;
        },
      },
    },
    chunkSizeWarningLimit: 700,
  },
  test: {
    environment: "jsdom",
    globals: true,
    include: [
      "src/**/*.test.{js,jsx}",
      "api/**/*.test.js",
      "shared/**/*.test.js",
      // La conversion des tickers iShares vit dans `scripts/` et n'est pas
      // moins critique pour autant : une correspondance de place fausse fait
      // disparaître des titres de l'univers sans lever la moindre erreur.
      "scripts/**/*.test.js",
    ],
    setupFiles: ["./src/test/setup.js"],
    // Deux fichiers montent l'application ENTIÈRE et l'exercent écran par
    // écran ; ils sont lents par nature. Sur une machine chargée — un runner
    // CI partagé, ou simplement deux suites lancées en parallèle — ils
    // dépassaient le délai par défaut et échouaient de façon intermittente,
    // ce qui est la pire forme d'échec : on finit par relancer sans lire.
    //
    // Le délai est donc relevé globalement plutôt que fichier par fichier.
    // Il ne masque rien : un test réellement bloqué échoue toujours, juste
    // plus tard.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
