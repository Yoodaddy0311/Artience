import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import eslintConfigPrettier from 'eslint-config-prettier';

export default tseslint.config(
    // Global ignores
    {
        ignores: [
            'node_modules/**',
            'dist/**',
            'dist-electron/**',
            '.agent/**',
            'coverage/**',
            'apps/api/**',
        ],
    },

    // Base JS recommended rules
    js.configs.recommended,

    // TypeScript recommended rules
    ...tseslint.configs.recommended,

    // TypeScript files configuration
    {
        files: ['**/*.{ts,tsx}'],
        plugins: {
            'react-hooks': reactHooks,
            'react-refresh': reactRefresh,
        },
        rules: {
            // React hooks rules
            ...reactHooks.configs.recommended.rules,

            // Downgrade new strict react-hooks v7 rules to warnings
            // to avoid blocking development during initial setup
            'react-hooks/set-state-in-effect': 'warn',
            'react-hooks/purity': 'warn',
            'react-hooks/immutability': 'warn',

            // React refresh - warn for non-component exports
            'react-refresh/only-export-components': [
                'warn',
                { allowConstantExport: true },
            ],

            // TypeScript rules - lenient to start
            '@typescript-eslint/no-unused-vars': [
                'warn',
                {
                    argsIgnorePattern: '^_',
                    varsIgnorePattern: '^_',
                },
            ],
            '@typescript-eslint/no-explicit-any': 'warn',

            // General rules
            'no-undef': 'off', // TypeScript handles this
        },
    },

    // Disable formatting rules that conflict with Prettier
    eslintConfigPrettier,
);
