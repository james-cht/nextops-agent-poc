import path from 'node:path';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { svelteTesting } from '@testing-library/svelte/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [svelte({ hot: false, configFile: false }), svelteTesting()],
  resolve: {
    alias: { $lib: path.resolve('src/lib') },
    conditions: ['browser'],
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.svelte.test.ts'],
  },
});
