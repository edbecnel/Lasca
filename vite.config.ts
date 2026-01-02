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
        lasca8x8: path.resolve(__dirname, "src/lasca8x8.html"),
        dama: path.resolve(__dirname, "src/dama.html"),
        hybrid: path.resolve(__dirname, "src/hybrid.html"),
        help: path.resolve(__dirname, "src/help.html"),
        damaHelp: path.resolve(__dirname, "src/dama-help.html"),
        hybridHelp: path.resolve(__dirname, "src/hybrid-help.html"),
        startHelp: path.resolve(__dirname, "src/start-help.html"),
      },
    },
  },
}));
