import { defineConfig } from "vitest/config";
import path from "node:path";

// Standalone vitest config — avoids the TanStack Start router plugin
// (which requires a full Vite dev server, not vitest's stub).
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
