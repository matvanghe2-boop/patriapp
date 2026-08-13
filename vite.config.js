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
        manualChunks: {
          react: ["react", "react-dom"],
          charts: ["recharts"],
          supabase: ["@supabase/supabase-js"],
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
  },
});
