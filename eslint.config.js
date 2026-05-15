import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import eslintConfigPrettier from "eslint-config-prettier";
import globals from "globals";
import tseslint from "typescript-eslint";

const TS_FILES = ["**/*.ts", "**/*.mts", "**/*.cts"];

const typedConfigs = [
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked
].map((config) => ({
  ...config,
  files: TS_FILES
}));

export default defineConfig(
  {
    ignores: ["**/dist/**", "**/coverage/**", "**/node_modules/**", "**/*.d.ts"]
  },
  {
    linterOptions: {
      reportUnusedDisableDirectives: "warn"
    }
  },
  js.configs.recommended,
  ...typedConfigs,
  {
    // parserOptions must cover the same set of files as typedConfigs
    files: TS_FILES,
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      },
      globals: {
        ...globals.node
      }
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-import-type-side-effects": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          // allow unused catch binding: catch (_e) {}
          caughtErrorsIgnorePattern: "^_",
          // allow { used, ...rest } even when rest is unused
          ignoreRestSiblings: true
        }
      ],
      "@typescript-eslint/prefer-nullish-coalescing": [
        "error",
        {
          // avoid false positives on empty-string checks: value || "default"
          ignorePrimitives: { string: true }
        }
      ]
    }
  },
  {
    files: ["test/**/*.ts", "vitest.config.ts"],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.vitest
      }
    },
    rules: {
      // unsafe-* are too noisy for test helpers that intentionally use `any`
      "@typescript-eslint/no-unsafe-assignment": "warn",
      "@typescript-eslint/no-unsafe-call": "warn",
      "@typescript-eslint/no-unsafe-member-access": "warn",
      // async test functions without await are common in vitest
      "@typescript-eslint/require-await": "off",
      // expect(fn()).toBeUndefined() patterns trigger this
      "@typescript-eslint/no-confusing-void-expression": "off",
      // ! assertions are acceptable in controlled test data
      "@typescript-eslint/no-non-null-assertion": "off",
      // test helpers often use mixed array literal styles
      "@typescript-eslint/array-type": "off",
      // test fixtures sometimes need explicit casts for clarity
      "@typescript-eslint/no-unnecessary-type-assertion": "off"
      // no-misused-spread: kept ON (real bug detector, even in tests)
    }
  },
  eslintConfigPrettier
);
