import { defineConfig } from "vite";
import path from "node:path";

export default defineConfig({
  // Use relative paths so the site works under any subpath (e.g. GitHub Pages project sites)
  base: "./",
  root: "src",
  server: {
    port: 8080,
    open: "/lasca.html",
  },
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: path.resolve(__dirname, "src/index.html"),
        lasca: path.resolve(__dirname, "src/lasca.html"),
        help: path.resolve(__dirname, "src/help.html"),
      },
    },
  },
});
