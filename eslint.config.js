import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import eslintConfigPrettier from "eslint-config-prettier";
import globals from "globals";
import jsdoc from "eslint-plugin-jsdoc";
import tseslint from "typescript-eslint";
import unicorn from "eslint-plugin-unicorn";

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
    ignores: [
      "**/dist/**",
      "**/coverage/**",
      "**/node_modules/**",
      "**/*.d.ts",
      "**/.worktrees/**",
      "**/.cursor/**"
    ]
  },
  {
    linterOptions: {
      reportUnusedDisableDirectives: "warn"
    }
  },
  js.configs.recommended,
  ...typedConfigs,
  unicorn.configs["flat/recommended"],
  {
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
      // --- TypeScript ---
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-import-type-side-effects": "error",
      "@typescript-eslint/explicit-module-boundary-types": "warn",
      "@typescript-eslint/no-shadow": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          ignoreRestSiblings: true
        }
      ],
      "@typescript-eslint/prefer-nullish-coalescing": [
        "error",
        { ignorePrimitives: { string: true } }
      ],

      // --- General ---
      "no-console": "warn",
      eqeqeq: ["error", "always", { null: "ignore" }],

      // --- Unicorn (опinionated правила отключены для библиотеки) ---
      "unicorn/prevent-abbreviations": "off",
      "unicorn/no-null": "off",
      "unicorn/prefer-module": "off",
      "unicorn/filename-case": "off",
      "unicorn/no-array-reduce": "off"
    }
  },
  {
    // JSDoc только для публичного src API
    files: ["src/**/*.ts"],
    plugins: { jsdoc },
    rules: {
      "jsdoc/require-jsdoc": [
        "warn",
        {
          publicOnly: true,
          require: {
            FunctionDeclaration: true,
            MethodDefinition: false,
            ClassDeclaration: true
          },
          contexts: [
            "TSInterfaceDeclaration",
            "TSTypeAliasDeclaration",
            "TSEnumDeclaration"
          ]
        }
      ],
      "jsdoc/check-param-names": "error",
      "jsdoc/check-types": "off" // TypeScript сам следит за типами
    }
  },
  {
    files: ["examples/**/*.ts"],
    rules: {
      "no-console": "off"
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
      "@typescript-eslint/no-unsafe-assignment": "warn",
      "@typescript-eslint/no-unsafe-call": "warn",
      "@typescript-eslint/no-unsafe-member-access": "warn",
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/no-confusing-void-expression": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/array-type": "off",
      "@typescript-eslint/no-unnecessary-type-assertion": "off",
      // В тестах unicorn тоже менее строгий
      "unicorn/no-array-callback-reference": "off",
      "unicorn/consistent-function-scoping": "off"
    }
  },
  {
    files: ["test/integration/live/**/*.ts"],
    rules: {
      "no-console": "off",
      "@typescript-eslint/explicit-module-boundary-types": "off",
      "@typescript-eslint/no-unsafe-assignment": "off"
    }
  },
  eslintConfigPrettier
);
