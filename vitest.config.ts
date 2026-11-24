import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@prospectra/shared": path.resolve(__dirname, "./packages/shared/src/index.ts"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: [
      "tests/unit/**/*.{test,spec}.{ts,tsx}",
      "tests/integration/**/*.{test,spec}.{ts,tsx}",
      "packages/shared/src/**/*.{test,spec}.ts",
      "worker/src/**/*.{test,spec}.ts",
      "src/**/*.{test,spec}.{ts,tsx}",
    ],
  },
});
