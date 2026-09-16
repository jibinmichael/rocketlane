import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

const root = fileURLToPath(new URL(".", import.meta.url))

export default defineConfig({
  resolve: {
    alias: { "@": root },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "core/**/*.test.ts"],
    typecheck: {
      enabled: true,
      include: ["tests/**/*.test-d.ts"],
    },
    coverage: {
      provider: "v8",
      include: ["core/**/*.ts"],
      exclude: ["core/**/*.test.ts"],
    },
  },
})
