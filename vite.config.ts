import { defineConfig } from "vite";
import path from "node:path";

export default defineConfig(({ mode }) => ({
  // GitHub Pages deployment at https://edbecnel.github.io/Lasca/
  // Only use /Lasca/ base in production, use / for local development
  base: mode === "production" ? "/Lasca/" : "/",
  root: "src",
  server: {
    port: 8080,
    open: "/index.html",
  },
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: path.resolve(__dirname, "src/index.html"),
        lasca: path.resolve(__dirname, "src/lasca.html"),
        help: path.resolve(__dirname, "src/help.html"),
        startHelp: path.resolve(__dirname, "src/start-help.html"),
      },
    },
  },
}));
