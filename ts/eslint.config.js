import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";

export default [
    {
        files: ["src/**/*.ts"],
        languageOptions: {
            parser: tsparser,
            parserOptions: {
                project: "./tsconfig.json",
            },
        },
        plugins: {
            "@typescript-eslint": tseslint,
        },
        rules: {
            ...tseslint.configs.recommended.rules,
            "@typescript-eslint/no-explicit-any": "error",
            "@typescript-eslint/consistent-type-imports": "error",
            "prefer-const": "error",
            "no-var": "error",
            eqeqeq: ["error", "always"],
        },
    },
];
