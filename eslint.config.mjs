import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-plugin-prettier';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';

const eslintConfig = [
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        files: ['**/*.{js,jsx,ts,tsx}'],
        plugins: {
            prettier,
            'jsx-a11y': jsxA11y,
            react: reactPlugin,
            'react-hooks': reactHooksPlugin,
        },
        rules: {
            'react/no-unescaped-entities': 'off',
            'react/react-in-jsx-scope': 'off',
            'react-hooks/rules-of-hooks': 'error',
            'react-hooks/exhaustive-deps': 'warn',
            '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
            '@typescript-eslint/no-explicit-any': 'warn',
            'no-case-declarations': 'off',
            'no-prototype-builtins': 'off',
            'no-useless-escape': 'off',
            'prefer-const': 'warn',
            'no-extra-boolean-cast': 'warn',
            'no-constant-binary-expression': 'warn',
        },
        settings: {
            react: {
                version: 'detect',
            },
        },
    },
    {
        files: ['**/*.js'],
        rules: {
            '@typescript-eslint/no-require-imports': 'off',
            'no-undef': 'off',
        },
    },
    {
        files: ['**/__tests__/**/*.[jt]s?(x)', '**/?(*.)+(spec|test).[jt]s?(x)'],
        rules: {
            '@typescript-eslint/no-explicit-any': 'off',
        },
    },
    {
        ignores: ['.next/**', 'node_modules/**', 'out/**', 'build/**', 'dist/**', 'next-env.d.ts'],
    },
];

export default eslintConfig;
