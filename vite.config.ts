import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    strictPort: true,
    port: 1420,
    watch: {
      ignored: ["**/src-tauri/target/**"]
    }
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    target: "es2022",
    minify: "esbuild",
    sourcemap: false
  },
  test: {
    include: ["tests/frontend/**/*.test.ts", "tests/frontend/**/*.test.tsx"],
    environment: "jsdom",
    setupFiles: ["tests/setup/vitest.setup.ts"],
    coverage: {
      reporter: ["text", "lcov"]
    }
  }
});
