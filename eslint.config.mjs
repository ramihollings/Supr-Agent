import { defineConfig } from "eslint/config";
import next from "eslint-config-next";

export default defineConfig([
{
    ignores: [
        "tsconfig.tsbuildinfo",
        // Temporary harness files written by behavioral tests and
        // removed in their own finally block. ESLint and the test
        // runner can race; tell ESLint to ignore them so a
        // mid-test write doesn't fail the lint step.
        "tests/.ssrf-harness.mjs",
        "tests/.auth-harness.cjs",
        "tests/.db-mock.cjs",
    ],
},
{
    extends: [...next],
    rules: {
        "react-hooks/set-state-in-effect": "off",
        "react-hooks/purity": "off",
        "react-hooks/immutability": "off",
        "react/no-unescaped-entities": "off",
    },
}]);
