import { defineConfig } from "vite";

export default defineConfig({
  root: "src",
  server: {
    port: 8080,
    open: "/lasca.html",
  },
  build: {
    outDir: "../dist",
    emptyOutDir: true,
  },
});
