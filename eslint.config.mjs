// Flat config, one file for the whole workspace (server, client, mcp).
// Typed linting via projectService — picks up each package's tsconfig.
// Prettier owns formatting; eslint-config-prettier (last) turns off any
// rule that would fight it.
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import prettier from "eslint-config-prettier";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "client/dist/**",
      "**/*.d.ts",
      "**/*.config.{js,cjs,mjs,ts}",
      "**/vitest.*.ts",
      "eslint.config.mjs",
      "scripts/**", // one-off legacy-data prep helpers, outside every tsconfig
      "docker/**", // deploy-time shell/node helpers, outside every tsconfig
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // Lenient start — rules turned off deliberately, not because they can't
  // be met. `no-floating-promises` stays ON: it's the reason for the
  // type-checked set (the Fastify code is async-heavy). Real floating
  // promises get an explicit `void`; `fireAndForget()` already returns void.
  {
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off", // ~190 deliberate `x!.y`
      "no-console": "off", // deliberate server-side logging
      // Fastify route plugins are conventionally `async (app) => {}` even
      // when the body has no await — the framework accepts both.
      "@typescript-eslint/require-await": "off",
      // `_`-prefixed args/vars are intentional throwaways.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      // `attributes: false` — async JSX event handlers are idiomatic React.
      // `properties: false` — TanStack `mutate(v, { onSuccess: () => navigate(x) })`
      //   passes react-router v7's `navigate` (return type `void | Promise<void>`)
      //   into a `=> void` slot; the returned promise is router-internal.
      // The rest of the rule stays on (catches `setTimeout(asyncFn)`,
      // `if (asyncFn())`, `arr.forEach(asyncFn)` — the real footguns).
      "@typescript-eslint/no-misused-promises": [
        "error",
        { checksVoidReturn: { attributes: false, properties: false } },
      ],
    },
  },

  {
    files: ["server/**/*.ts", "mcp/**/*.ts"],
    languageOptions: { globals: { ...globals.node } },
  },

  {
    files: ["client/**/*.{ts,tsx}"],
    languageOptions: { globals: { ...globals.browser } },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
    },
  },

  {
    files: ["**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "@typescript-eslint/no-floating-promises": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-return": "off",
    },
  },

  prettier,
);
