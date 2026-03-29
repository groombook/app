import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      // Untracked .js files containing JSX (build artifacts)
      "src/**/*.js",
      "src/**/*.jsx",
    ],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  }
);
