import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const eslintConfig = [...nextCoreWebVitals, ...nextTypescript, {
  rules: {
    // ── AUDIT FIX: the previous config disabled 31 rules, which made
    // "lint passes" meaningless (debug leftovers, dead vars and empty
    // blocks sailed through). Rules are re-enabled in two tiers:
    //   * error  — currently zero-violation rules that catch real rot
    //   * warn   — visibility tier; findings surface but do not block
    // Anything not listed below now runs at its default (mostly "error").

    // TypeScript — errors (verified clean after the dead-code purge)
    "@typescript-eslint/ban-ts-comment": "error",
    "@typescript-eslint/prefer-as-const": "error",

    // TypeScript — visibility tier
    "@typescript-eslint/no-explicit-any": "warn",
    "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    "@typescript-eslint/no-non-null-assertion": "warn",

    // React — visibility tier (flag; fixing is follow-up work)
    "react-hooks/exhaustive-deps": "warn",
    "react/display-name": "warn",

    // Next.js — visibility tier
    "@next/next/no-img-element": "warn",

    // General JavaScript — errors (catch real rot)
    "no-debugger": "error",
    "no-unreachable": "error",
    "no-irregular-whitespace": "error",
    "no-fallthrough": "error",
    "no-redeclare": "error",
    "no-useless-escape": "error",
    "no-case-declarations": "error",
    "no-mixed-spaces-and-tabs": "error",
    "prefer-const": "error",
    // allowEmptyCatch: our fallback chains use intentional `catch {}` —
    // still flags empty `if`/`try` blocks.
    "no-empty": ["error", { allowEmptyCatch: true }],

    // console — visibility tier: console.warn/error are deliberate tagged
    // server logging; bare console.log should migrate to a logger.
    "no-console": ["warn", { allow: ["warn", "error", "info"] }],
  },
}, {
  ignores: ["node_modules/**", ".next/**", "out/**", "build/**", "next-env.d.ts", "examples/**", "skills"]
}];

export default eslintConfig;
