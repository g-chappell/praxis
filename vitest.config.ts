import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['**/*.{test,spec}.{ts,tsx,mjs,js}'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/.next/**', 'roadmap/**'],
    passWithNoTests: true,
  },
});
