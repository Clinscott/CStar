import js from "@eslint/js";
import jsdoc from "eslint-plugin-jsdoc";
import tseslint from "typescript-eslint";

export default tseslint.config(
    {
        ignores: [".stats/**", ".agent/**", "node_modules/**"]
    },
    js.configs.recommended,
    ...tseslint.configs.strict,
    jsdoc.configs["flat/recommended"],
    {
        files: ["**/*.js", "**/*.ts", "**/*.tsx"],
        plugins: {
            jsdoc,
        },
        languageOptions: {
            ecmaVersion: "latest",
            sourceType: "module",
            globals: {
                process: "readonly",
                console: "readonly",
                __dirname: "readonly",
                __filename: "readonly",
                Buffer: "readonly",
            },
        },
        rules: {
            "no-unused-vars": ["warn", {
                "argsIgnorePattern": "^_",
                "varsIgnorePattern": "^_",
                "caughtErrorsIgnorePattern": "^_"
            }],
            "no-console": "off",
            "semi": ["error", "always"],
            "quotes": ["error", "single"],
            "indent": ["error", 4],
            "jsdoc/require-param-description": "error",
            "jsdoc/require-returns-description": "error",
            "jsdoc/reject-function-type": "off",
        },
    }
);
