import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.test.ts", "scripts/**/*.test.ts"],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      // standalone tsx smokes (run via package script), not vitest suites
      "packages/wanwu-acp-client/src/client.test.ts",
      "packages/wanwu-acp-client/src/launch.test.ts",
    ],
  },
});