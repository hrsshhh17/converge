import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // This app intentionally uses imperative browser/realtime bridges. These
    // React Compiler rules are not part of the production TypeScript build and
    // currently flag those bridges even though the compiler is not enabled.
    rules: {
      "react-hooks/preserve-manual-memoization": "off",
      "react-hooks/purity": "off",
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
  {
    files: ["scripts/**/*.cjs", "tools/**/*.js"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-this-alias": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".next-verify/**",
    "out/**",
    "build/**",
    ".pnpm-store/**",
    "**/*-backups/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
