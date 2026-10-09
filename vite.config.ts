import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base relativo: funciona igual en usuario.github.io/PP/ y en un dominio propio (DuckDNS)
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    target: "es2020",
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
        },
      },
    },
  },
});
