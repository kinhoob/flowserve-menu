import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// The Lovable wrapper configures React, TanStack Start, Tailwind and Nitro.
// Keep the custom SSR error handler as the TanStack server entry.
export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
});
