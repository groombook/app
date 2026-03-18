import { defineConfig } from "vitest/config";

export default defineConfig({
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
