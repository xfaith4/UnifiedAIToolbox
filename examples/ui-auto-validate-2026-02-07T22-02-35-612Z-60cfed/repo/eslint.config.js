// eslint.config.js
// Flat config for ESLint v9+
// Lints JS/TS (and basic JSON/MD) used for tooling/config in this primarily Python repo.

import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import jsonc from "eslint-plugin-jsonc";
import markdown from "eslint-plugin-markdown";

export default [
  // Ignore generated/irrelevant folders
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/.venv/**",
      "**/venv/**",
      "**/__pycache__/**",
      "**/.pytest_cache/**",
      "**/.ruff_cache/**",
      "**/.mypy_cache/**",
      "**/.cache/**",
      "**/coverage/**",
    ],
  },

  // Base JS recommended rules
  js.configs.recommended,

  // Common JS/TS settings + repo-wide rules
  {
    files: ["**/*.{js,mjs,cjs,ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
    rules: {
      // Consistency / foot-guns
      "no-console": "off",
      "no-debugger": "warn",
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "prefer-const": "warn",
      eqeqeq: ["error", "always", { null: "ignore" }],
    },
  },

  // TypeScript support (recommended)
  ...tseslint.configs.recommended.map((cfg) => ({
    ...cfg,
    files: ["**/*.{ts,tsx}"],
  })),

  // TypeScript project-aware linting where tsconfig is present
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: ["./tsconfig.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // TS tends to use types instead of runtime checks; allow unused expressions in types? keep defaults
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },

  // JSON (package.json, tsconfig, etc.)
  {
    files: ["**/*.json", "**/*.jsonc", "**/*.json5"],
    plugins: { jsonc },
    languageOptions: {
      parser: jsonc.parsers.jsonc,
    },
    rules: {
      ...jsonc.configs["recommended-with-jsonc"].rules,
      // Keep JSON consistent
      "jsonc/quote-props": ["error", "always"],
      "jsonc/sort-keys": "off",
    },
  },

  // Markdown (lint embedded code blocks lightly)
  {
    files: ["**/*.md"],
    plugins: { markdown },
    processor: "markdown/markdown",
  },
];