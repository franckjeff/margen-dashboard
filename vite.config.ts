/// <reference types="vitest/config" />
/// <reference types="node" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { execSync } from "node:child_process";

// The app's version, shown at the bottom of the menu: the build's date and its commit, e.g.
// "v2026.11.18 · a1b2c3d". It changes by itself with every build, so there's nothing to bump.
// Cloudflare gives the commit in WORKERS_CI_COMMIT_SHA; elsewhere it's read from git.
function buildVersion() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, ".");
  let commit = process.env.WORKERS_CI_COMMIT_SHA ?? "";
  if (!commit) {
    try {
      commit = execSync("git rev-parse HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    } catch {
      // No git here: the date alone.
    }
  }
  return commit ? `v${date} · ${commit.slice(0, 7)}` : `v${date}`;
}

export default defineConfig(({ command }) => ({
  plugins: [react()],
  // "dev" while running locally (npm run dev, tests); the real version in builds.
  define: { __APP_VERSION__: JSON.stringify(command === "build" ? buildVersion() : "dev") },
  // Relative asset paths, so the built app works from any folder or static host.
  base: "./",
  server: { port: 5173, strictPort: true },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
  },
}));
