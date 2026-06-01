import { defineConfig } from "eslint/config";
import next from "eslint-config-next";

export default defineConfig([
{
    ignores: [
        "tsconfig.tsbuildinfo",
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
