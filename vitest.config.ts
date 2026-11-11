import { defineConfig } from 'vitest/config';

// Testy jednostkowe czystej logiki walki (bez przeglądarki).
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
