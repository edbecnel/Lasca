import { defineConfig } from "vite";
import path from "node:path";

export default defineConfig(({ mode }) => ({
  // Admin page is intentionally not linked from the UI and not documented publicly.
  // To include it in production builds, set VITE_EMIT_ADMIN=1 at build time.
  // (Useful for self-hosted deployments where operators need online admin tools.)
  // Example: cross-env VITE_EMIT_ADMIN=1 vite build
  // GitHub Pages deployment at https://edbecnel.github.io/Lasca/
  // Only use /Lasca/ base in production, use / for local development
  base: mode === "production" ? "/Lasca/" : "/",
  root: "src",
  server: {
    port: 8080,
    // When running the multiplayer dev stack (server+client), the client dev server may
    // restart (or be restarted) and Vite would re-open the Start Page each time.
    // Allow disabling auto-open via env so `npm run online:dev` doesn't spam tabs.
    open: process.env.VITE_NO_OPEN === "1" ? false : "/index.html",
  },
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: path.resolve(__dirname, "src/index.html"),
        ...(process.env.VITE_EMIT_ADMIN === "1" ? { admin: path.resolve(__dirname, "src/admin.html") } : {}),
        lasca: path.resolve(__dirname, "src/lasca.html"),
        lasca8x8: path.resolve(__dirname, "src/lasca8x8.html"),
        dama: path.resolve(__dirname, "src/dama.html"),
        damasca: path.resolve(__dirname, "src/damasca.html"),
        help: path.resolve(__dirname, "src/help.html"),
        damaHelp: path.resolve(__dirname, "src/dama-help.html"),
        damascaHelp: path.resolve(__dirname, "src/damasca-help.html"),
        startHelp: path.resolve(__dirname, "src/start-help.html"),
      },
    },
  },
}));
