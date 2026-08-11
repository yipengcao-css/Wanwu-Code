import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.test.ts"],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      // standalone tsx smoke (run via package script), not a vitest suite
      "packages/wanwu-acp-client/src/client.test.ts",
    ],
  },
});