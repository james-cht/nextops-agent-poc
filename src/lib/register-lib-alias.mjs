import { register } from 'node:module';

register('./lib-alias-hook.mjs', import.meta.url);
