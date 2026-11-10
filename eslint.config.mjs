import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  prettier,
  {
    files: ["components/modals/*.tsx"],
    rules: {
      "react-hooks/set-state-in-effect": "off",
    },
  },
  { files: ["docs/docker/*.cjs"], rules: { "@typescript-eslint/no-require-imports": "off" } },
  globalIgnores([
    "node_modules/**",
    "work/**",
    "test-results/**",
    "playwright-report/**",
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);
