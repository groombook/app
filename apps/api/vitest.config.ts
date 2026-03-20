import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@groombook/db": path.resolve(__dirname, "../../packages/db/src/index.ts"),
    },
  },
  test: {
    coverage: {
      provider: "v8",
      include: ["src/lib/**"],
      thresholds: {
        lines: 80,
        functions: 80,
      },
    },
  },
});
