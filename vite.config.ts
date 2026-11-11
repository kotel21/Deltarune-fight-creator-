import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Tryb "single" (npm run build:single) pakuje całą aplikację do jednego pliku HTML
// (JS, CSS, sprite'y i font wbudowane) — wygodne do szybkiego udostępnienia lub gry offline.
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: mode === 'single' ? [viteSingleFile()] : [],
  build: {
    target: 'es2020',
    outDir: mode === 'single' ? 'dist-single' : 'dist',
    assetsInlineLimit: mode === 'single' ? 100_000_000 : 4096,
  },
}));
