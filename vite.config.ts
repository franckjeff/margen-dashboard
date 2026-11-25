import { defineConfig } from "vite";
import { configDefaults } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Relative asset paths, so the built app works from any folder or static host.
  base: "./",
  server: { port: 5173, strictPort: true },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    // The click-through tests in e2e/ run with Playwright (npm run e2e), not Vitest.
    exclude: [...configDefaults.exclude, "e2e/**"],
  },
});
