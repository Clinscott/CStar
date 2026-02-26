import js from "@eslint/js";
import jsdoc from "eslint-plugin-jsdoc";

export default [
    js.configs.recommended,
    jsdoc.configs['flat/recommended'],
    {
        files: ["**/*.js", "**/*.ts"],
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
];
