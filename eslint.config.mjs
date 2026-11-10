import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Local, untracked scratch and proof-of-concept scripts
    "scratch/**",
    "poc/**",
    "temp_out/**",
  ]),
  {
    rules: {
      // Supabase rows are untyped across the codebase (no generated database types yet), so `any` is reported as a
      // warning instead of drowning real errors. Generating types with `supabase gen types` is the proper fix.
      "@typescript-eslint/no-explicit-any": "warn",
      // React Compiler hints. The compiler is not enabled in next.config.ts, and the flagged effects are intentional
      // (syncing server props after router.refresh(), reading localStorage on mount, resetting a highlighted row).
      // Kept visible as warnings; rewrite them when enabling the compiler.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
    },
  },
]);

export default eslintConfig;
