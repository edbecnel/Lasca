import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts"],
    // You can uncomment these as you grow tests:
    // setupFiles: ["src/test/setup.ts"],
    // globals: true,
  },
});
