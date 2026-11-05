import { readFileSync } from 'node:fs';
import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { kitPathsBaseFromBuildEnv } from './src/lib/public-base-path.ts';

function productionDotenvText() {
  try {
    return readFileSync('.env.production', 'utf8');
  } catch {
    return '';
  }
}

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      out: 'build',
    }),
    paths: {
      base: kitPathsBaseFromBuildEnv(process.env, productionDotenvText()),
    },
  },
};

export default config;
