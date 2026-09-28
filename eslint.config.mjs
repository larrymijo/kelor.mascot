import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'
import prettier from 'eslint-config-prettier/flat'

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Keep last: turns off stylistic rules that Prettier owns.
  prettier,
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    // Vendored Basis transcoder, copied verbatim from three (see scripts/assets/transcoder.test.ts).
    'public/basis/**',
    'coverage/**',
    'playwright-report/**',
    'test-results/**',
    'next-env.d.ts',
  ]),
])

export default eslintConfig
